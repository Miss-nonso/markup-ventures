"""Device lifecycle, settings, audit access and authenticated event delivery."""
import asyncio, json, os, secrets
from datetime import datetime, timezone, timedelta
from uuid import UUID
import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder
from pydantic import Field, model_validator
from sqlalchemy import select, text
from .models import Asset
from .repository import Session, scope
from .security import require, Principal, decode
from .schemas import StrictSchema
from .metrics import METRICS
from .auth import store, COOKIE, session_user

router=APIRouter(tags=['Device platform'])

class DeviceSettings(StrictSchema):
    parent_id: UUID | None = None
    latitude: float | None = Field(default=None,ge=-90,le=90)
    longitude: float | None = Field(default=None,ge=-180,le=180)
    sample_interval_seconds: int = Field(default=30,ge=1,le=3600)
    offline_after_seconds: int = Field(default=300,ge=10,le=86400)
    enabled_metrics: list[str] = Field(default_factory=lambda:list(METRICS),min_length=1,max_length=12)
    alert_rules: dict[str,dict[str,float]] = Field(default_factory=dict,max_length=12)
    anomaly_detection: bool = True

    @model_validator(mode='after')
    def valid(self):
        if (self.latitude is None)!=(self.longitude is None): raise ValueError('Provide both coordinates or neither')
        if self.offline_after_seconds < self.sample_interval_seconds*2: raise ValueError('Offline timeout must allow at least two sampling intervals')
        if len(set(self.enabled_metrics))!=len(self.enabled_metrics) or any(k not in METRICS for k in self.enabled_metrics): raise ValueError('Unknown or duplicate enabled metric')
        for key,limits in self.alert_rules.items():
            if key not in METRICS: raise ValueError('Unknown rule metric')
            if not limits or set(limits)-{'warning_low','warning_high','error_low','error_high'}: raise ValueError('Use warning/error low/high rule boundaries')
            for value in limits.values():
                if not METRICS[key]['min']<=value<=METRICS[key]['max']: raise ValueError('Rule outside supported metric range')
            merged={**METRICS[key]['limits'],**limits}
            ordered=[merged[k] for k in ('error_low','warning_low','warning_high','error_high') if k in merged]
            if any(a>=b for a,b in zip(ordered,ordered[1:])): raise ValueError('Rule limits must be strictly ordered: critical low, warning low, warning high, critical high')
        return self

def settings(asset):
    desired=asset.desired or {}
    return {'parent_id':str(asset.parent_id) if asset.parent_id else None,**DeviceSettings().model_dump(exclude={'parent_id'}),**desired.get('device_settings',{})}

async def publish(tenant):
    await store.publish(f'tenant:{tenant}',json.dumps({'type':'refresh'}))

@router.get('/assets/{id}/platform')
async def platform(id:UUID,p:Principal=Depends(require('read'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.get(Asset,id)
        if not a: raise HTTPException(404,'Asset not found')
        d=a.desired or {}
        return {'settings':settings(a),'provisioned':bool(d.get('device_epoch')),
                'config_version':d.get('config_version',0),'reported_config_version':d.get('reported_config_version',0),
                'reported_state':d.get('device_reported_state',{}),'last_seen':a.last_seen,
                'desired':{k:v for k,v in d.items() if k not in ('device_epoch','maintenance_history')},
                'reported':a.reported,'kind':a.kind}

@router.patch('/assets/{id}/platform')
async def configure(id:UUID,body:DeviceSettings,p:Principal=Depends(require('write'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        # Serialize tree edits for this tenant so concurrent reparenting cannot form a cycle.
        await s.execute(text('SELECT pg_advisory_xact_lock(hashtext(:key))'),{'key':str(p.tenant_id)+':hierarchy'})
        a=await s.scalar(select(Asset).where(Asset.id==id).with_for_update())
        if not a: raise HTTPException(404,'Asset not found')
        parent=body.parent_id; visited={id}
        while parent:
            if parent in visited: raise HTTPException(422,'Asset hierarchy cannot contain a cycle')
            visited.add(parent); node=await s.get(Asset,parent)
            if not node: raise HTTPException(404,'Parent not found')
            parent=node.parent_id
        a.parent_id=body.parent_id
        a.desired={**a.desired,'device_settings':body.model_dump(mode='json',exclude={'parent_id'}),'config_version':a.desired.get('config_version',0)+1}
    await publish(p.tenant_id)
    return {'saved':True}

class Provision(StrictSchema):
    expires_in_hours:int=Field(default=24,ge=1,le=720)

@router.post('/assets/{id}/provision')
async def provision(id:UUID,body:Provision,p:Principal=Depends(require('write'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.scalar(select(Asset).where(Asset.id==id).with_for_update())
        if not a: raise HTTPException(404,'Asset not found')
        epoch=secrets.token_hex(16)
        a.desired={**a.desired,'device_epoch':epoch}
        expires=datetime.now(timezone.utc)+timedelta(hours=body.expires_in_hours)
        token=jwt.encode({'sub':str(id),'tenant_id':str(p.tenant_id),'role':'Device','device_epoch':epoch,
                          'iss':'markup-auth','aud':'markup-api','exp':expires},os.environ['JWT_SECRET'],algorithm='HS256')
    return {'device_id':str(id),'token':token,'expires_at':expires,'token_type':'Bearer'}

@router.post('/assets/{id}/revoke')
async def revoke(id:UUID,p:Principal=Depends(require('write'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.scalar(select(Asset).where(Asset.id==id).with_for_update())
        if not a: raise HTTPException(404,'Asset not found')
        a.desired={**a.desired,'device_epoch':None}
    return {'revoked':True}

@router.get('/device/config')
async def device_config(p:Principal=Depends(require('device'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.get(Asset,UUID(p.subject))
        return {'device_id':p.subject,'version':a.desired.get('config_version',0),'settings':settings(a)}

class ReportedState(StrictSchema):
    config_version:int=Field(ge=0)
    firmware:str=Field(max_length=60)
    battery_pct:float|None=Field(default=None,ge=0,le=100)
    signal_dbm:float|None=Field(default=None,ge=-150,le=0)

@router.post('/device/state')
async def device_state(body:ReportedState,p:Principal=Depends(require('device'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.scalar(select(Asset).where(Asset.id==UUID(p.subject)).with_for_update())
        if body.config_version>a.desired.get('config_version',0): raise HTTPException(422,'Unknown configuration version')
        if body.config_version<a.desired.get('reported_config_version',0): raise HTTPException(409,'Configuration acknowledgment cannot move backwards')
        a.last_seen=datetime.now(timezone.utc)
        a.desired={**a.desired,'reported_config_version':body.config_version,'device_reported_state':body.model_dump(),'device_state_at':a.last_seen.isoformat()}
    await publish(p.tenant_id)
    return {'saved':True}

@router.get('/audit')
async def audit(hours:int=Query(default=24,ge=1,le=720),before:int|None=Query(default=None,ge=1),p:Principal=Depends(require('audit'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        result=await s.execute(text("""SELECT id,actor,action,entity,created_at,
          before_state - 'desired' AS before_state, after_state - 'desired' AS after_state,
          (after_state->'desired') - 'device_epoch' AS desired
          FROM audit_logs WHERE created_at>=:since AND (CAST(:before AS bigint) IS NULL OR id<CAST(:before AS bigint))
          ORDER BY id DESC LIMIT 101"""),{'since':datetime.now(timezone.utc)-timedelta(hours=hours),'before':before})
        rows=[dict(r._mapping) for r in result]
        return jsonable_encoder({'items':rows[:100],'next_cursor':rows[99]['id'] if len(rows)>100 else None})

@router.get('/events')
async def events(request:Request,p:Principal=Depends(require('read'))):
    async def messages():
        async with store.pubsub() as pubsub:
            await pubsub.subscribe(f'tenant:{p.tenant_id}')
            yield 'event: ready\ndata: {}\n\n'
            while not await request.is_disconnected():
                try:
                    if request.cookies.get(COOKIE): await session_user(request.cookies.get(COOKIE))
                    else: decode(request.headers.get('authorization','').removeprefix('Bearer '))
                except HTTPException: return
                message=await pubsub.get_message(ignore_subscribe_messages=True,timeout=1)
                if message: yield 'data: {"type":"refresh"}\n\n'
                else: yield ': heartbeat\n\n'
                await asyncio.sleep(.2)
    return StreamingResponse(messages(),media_type='text/event-stream',headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})

class Maintenance(StrictSchema):
    maintenance_due: str | None = None
    maintenance_status: str
    maintenance_note: str = Field(default='',max_length=1000)
    @model_validator(mode='after')
    def valid(self):
        from datetime import date
        if self.maintenance_status not in ('Not scheduled','Scheduled','In progress','Completed'): raise ValueError('Invalid maintenance state')
        if self.maintenance_due: date.fromisoformat(self.maintenance_due)
        return self

@router.patch('/assets/{id}/maintenance')
async def maintenance(id:UUID,body:Maintenance,p:Principal=Depends(require('maintain'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        a=await s.scalar(select(Asset).where(Asset.id==id).with_for_update())
        if not a: raise HTTPException(404,'Asset not found')
        values=body.model_dump()
        if any(a.desired.get(k)!=v for k,v in values.items()):
            history=[*a.desired.get('maintenance_history',[]),{'time':datetime.now(timezone.utc).isoformat(),**values}]
            a.desired={**a.desired,**values,'maintenance_history':history}
    await publish(p.tenant_id)
    return {'saved':True}
