from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid5, NAMESPACE_URL
import math
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, text, func
from .security import require, Principal
from .repository import Session, scope
from .models import Asset, Alert, Reading
from .schemas import AssetUpdate, Telemetry
from .metrics import METRICS, condition
from .operations import serialize_asset, record_reading
from .auth import demo_enabled

router=APIRouter(tags=['Operations'])

@router.get('/metrics')
async def metrics(p: Principal=Depends(require('read'))): return METRICS

@router.get('/dashboard')
async def dashboard(hours: int=Query(default=24,ge=1,le=720), include_history: bool=False, p: Principal=Depends(require('read'))):
    now=datetime.now(timezone.utc)
    since=now-timedelta(hours=hours)
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        assets=(await s.scalars(select(Asset).order_by(Asset.name).limit(500))).all()
        alert_query=select(Alert).where(Alert.created_at>=since,Alert.created_at<=now)
        if not include_history: alert_query=alert_query.where(Alert.status=='open')
        alerts=(await s.scalars(alert_query.order_by(Alert.created_at.desc()).limit(500))).all()
        open_alerts=(await s.scalars(select(Alert).where(Alert.status=='open'))).all()
        rows=[serialize_asset(a,[x for x in open_alerts if x.device_id==a.id]) for a in assets]
        names={a.id:a for a in assets}
        result_alerts=[{'id':str(a.id),'title':f'{METRICS.get(a.metric,{}).get("label",a.metric)} threshold exceeded','asset':names[a.device_id].name if a.device_id in names else str(a.device_id),'deviceId':str(a.device_id),'site':names[a.device_id].desired.get('site','Unassigned') if a.device_id in names else 'Unassigned','severity':a.severity.title(),'time':a.created_at.isoformat(),'metric':a.metric,'value':a.value,'status':a.status} for a in alerts]
        count=await s.scalar(select(func.count()).select_from(Reading).where(Reading.timestamp>=since, Reading.timestamp<=now))
        total=await s.scalar(select(func.count()).select_from(Asset))
        total_alerts=await s.scalar(select(func.count()).select_from(Alert).where(Alert.status=='open',Alert.created_at>=since,Alert.created_at<=now))
        # One bounded aggregate per metric, with extremes so fleet means cannot hide breaches.
        stats=await s.execute(text("""SELECT e.key, a.desired->'device_settings'->'alert_rules' AS rules, avg(e.value::double precision) AS mean,
            min(e.value::double precision) AS minimum, max(e.value::double precision) AS maximum,
            count(*) AS samples FROM telemetry t JOIN assets a ON a.id=t.device_id CROSS JOIN LATERAL jsonb_each_text(t.metrics) e
            WHERE t.timestamp>=:since AND t.timestamp<=:now GROUP BY e.key,a.id"""), {'since':since,'now':now})
        summary={}
        for key,rules,mean,minimum,maximum,samples in stats:
            states=[condition(key,minimum,rules),condition(key,maximum,rules)]
            old=summary.get(key)
            state='error' if 'error' in states else 'warning' if 'warning' in states else 'good'
            if old:
                state='error' if 'error' in (state,old['condition']) else 'warning' if 'warning' in (state,old['condition']) else 'good'
                sample_total=old['samples']+samples
                mean=(old['value']*old['samples']+mean*samples)/sample_total
                minimum=min(minimum,old['minimum']); maximum=max(maximum,old['maximum']); samples=sample_total
            summary[key]={'value':mean,'minimum':minimum,'maximum':maximum,'samples':samples,'condition':state}
        # Latest value of each metric within the selected window (supports sparse readings).
        latest=await s.execute(text("""SELECT DISTINCT ON(t.device_id,e.key) t.device_id,e.key,
            e.value::double precision AS value,t.timestamp,a.desired->'device_settings'->'alert_rules' AS rules FROM telemetry t JOIN assets a ON a.id=t.device_id
            CROSS JOIN LATERAL jsonb_each_text(t.metrics) e
            WHERE t.timestamp>=:since AND t.timestamp<=:now
            ORDER BY t.device_id,e.key,t.timestamp DESC"""), {'since':since,'now':now})
        window_metrics={}; live_errors=[]
        for device,key,value,timestamp,rules in latest:
            window_metrics.setdefault(str(device),{})[key]=value
            if timestamp>=now-timedelta(minutes=5) and condition(key,value,rules)=='error':
                live_errors.append(str(device)+':'+key)
        for row in rows:
            row['metrics']=window_metrics.get(row['id'],{})
            row['temperature']=row['metrics'].get('temperature')
            row['vibration']=row['metrics'].get('vibration')
        maintenance=[]
        for a in assets:
            for entry in (a.desired or {}).get('maintenance_history',[]):
                if since.isoformat()<=entry['time']<=now.isoformat():
                    maintenance.append({**entry,'deviceId':str(a.id),'asset':a.name})
        maintenance.sort(key=lambda entry:entry['time'],reverse=True)
        return jsonable_encoder({'summary':summary,'liveErrors':live_errors,'maintenanceHistory':maintenance[:500],'hours':hours,'assets':rows,'alerts':result_alerts,'readings24h':count,'totalAssets':total,'totalAlerts':total_alerts,'limit':500,'updatedAt':datetime.now(timezone.utc)})

@router.get('/telemetry/history')
async def history(metric: str='temperature', hours: int=Query(default=24,ge=1,le=720), device_id: UUID | None=None, p: Principal=Depends(require('read'))):
    if metric not in METRICS: raise HTTPException(422,'Unknown metric')
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        # Bound results to 120 buckets; omit missing metrics instead of plotting zeros.
        result=await s.execute(text("""SELECT to_timestamp(floor(extract(epoch from t.timestamp)/:bucket)*:bucket) AS timestamp,
        avg((t.metrics ->> :metric)::double precision) AS value,
        min((t.metrics ->> :metric)::double precision) AS minimum,
        max((t.metrics ->> :metric)::double precision) AS maximum, count(*) AS samples,
        a.desired->'device_settings'->'alert_rules' AS rules
        FROM telemetry t JOIN assets a ON a.id=t.device_id
        WHERE t.timestamp >= :since AND t.timestamp <= now() AND jsonb_exists(t.metrics,:metric)
        AND (CAST(:device AS uuid) IS NULL OR t.device_id=CAST(:device AS uuid))
        GROUP BY 1,a.id ORDER BY 1"""),{'bucket':max(60,hours*3600//120),'metric':metric,'since':datetime.now(timezone.utc)-timedelta(hours=hours),'device':str(device_id) if device_id else None})
        buckets={}
        for row in result:
            point=dict(row._mapping); rules=point.pop('rules')
            states=[condition(metric,point['minimum'],rules),condition(metric,point['maximum'],rules)]
            state='error' if 'error' in states else 'warning' if 'warning' in states else 'good'
            old=buckets.get(point['timestamp'])
            if old:
                states=[state,old['condition']]
                total=point['samples']+old['samples']
                point['value']=(point['value']*point['samples']+old['value']*old['samples'])/total
                point['minimum']=min(point['minimum'],old['minimum']);point['maximum']=max(point['maximum'],old['maximum']);point['samples']=total
            point['condition']='error' if 'error' in states else 'warning' if 'warning' in states else 'good'
            buckets[point['timestamp']]=point
        return jsonable_encoder(list(buckets.values()))

@router.patch('/assets/{id}')
async def update_asset(id:UUID, body:AssetUpdate,p:Principal=Depends(require('write'))):
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        asset=await s.scalar(select(Asset).where(Asset.id==id).with_for_update())
        if not asset:raise HTTPException(404,'Asset not found')
        values=body.model_dump(mode='json');asset.name=values.pop('name')
        desired=asset.desired or {}
        fields=('maintenance_due','maintenance_status','maintenance_note')
        if any(desired.get(k)!=values.get(k) for k in fields):
            event={'time':datetime.now(timezone.utc).isoformat(),**{k:values.get(k) for k in fields}}
            values['maintenance_history']=[*desired.get('maintenance_history',[]),event]
        asset.desired={**desired,**values}
        return {'saved':True}

@router.post('/assets/{id}/readings',status_code=201)
async def manual_reading(id:UUID,body:Telemetry,p:Principal=Depends(require('write'))):
    if id!=body.device_id:raise HTTPException(422,'Device ID does not match asset')
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        if not await record_reading(s,p.tenant_id,id,body.timestamp,body.metrics):raise HTTPException(404,'Asset not found')
    from .platform import publish
    await publish(p.tenant_id)
    return {'saved':True}

@router.post('/demo/seed')
async def seed(p:Principal=Depends(require('write'))):
    if not demo_enabled():raise HTTPException(403,'Sample fleet is available only in local demo mode')
    now=datetime.now(timezone.utc)
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        await s.execute(text('SELECT pg_advisory_xact_lock(hashtext(:key))'),{'key':str(p.tenant_id)+':sample'})
        created=0
        for i,(name,site,kind) in enumerate([('Hydraulic Pump A1','Houston Plant','Pump'),('Air Compressor B2','Berlin Facility','Compressor'),('Wind Turbine T8','Rotterdam Hub','Turbine'),('Conveyor Motor C3','Singapore Plant','Motor'),('Backup Generator G6','Houston Plant','Generator')]):
            id=uuid5(NAMESPACE_URL,f'markup:{p.tenant_id}:sample:{i}')
            if await s.get(Asset,id):continue
            s.add(Asset(id=id,tenant_id=p.tenant_id,name=name,kind='machine',desired={'site':site,'equipment_type':kind,'firmware':'v2.8.1','data_source':'sample','maintenance_due':(now+timedelta(days=i+1)).date().isoformat(),'maintenance_status':'Scheduled','maintenance_note':'Inspect and service equipment'},reported={}))
            await s.flush();created+=1
            for j in range(49):
                values={'temperature':round(62+i*4+math.sin(j*.4)*5,2),'pressure':round(42+i*3+math.sin(j*.3)*4,2),'vibration':round(2+i*.7+math.sin(j*.5)*.6,2),'humidity':round(45+math.sin(j*.2)*10,2),'power_kw':round(12+i*8+math.sin(j*.3)*2,2),'energy_kwh':round(1200+i*400+j*6,2),'voltage':round(230+math.sin(j*.5)*3,2),'current_a':round(30+i*5+math.sin(j*.4)*2,2),'rpm':round(1400+i*60+math.sin(j*.3)*40,2),'flow_lpm':round(80+i*12+math.sin(j*.2)*5,2),'runtime_hours':round(2500+i*100+j*.5,2),'efficiency_pct':round(91-i+math.sin(j*.2)*2,2)}
                if i==3 and j==48:values.update(temperature=92.4,vibration=9.2)
                await record_reading(s,p.tenant_id,id,now-timedelta(minutes=(48-j)*30),values)
        return {'created':created}
