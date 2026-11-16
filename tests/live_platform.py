"""Run inside API container: python < tests/live_platform.py.
Creates and removes only test assets. Audit records remain. Never prints tokens."""
import asyncio, json, os, time, uuid, urllib.request, urllib.error, threading
from datetime import datetime, timezone, timedelta
import jwt
from app.auth import account
from app.repository import Session, scope
from app.models import Asset, Alert, Reading
from sqlalchemy import delete
base='http://127.0.0.1:8000'
tenant=account()[2]
def identity(role,tenant_id=tenant):
    return jwt.encode({'sub':'platform-verification','tenant_id':tenant_id,'role':role,'iss':'markup-auth','aud':'markup-api','exp':datetime.now(timezone.utc)+timedelta(minutes=10)},os.environ['JWT_SECRET'],algorithm='HS256')
operator=identity('FleetOperator');auditor=identity('Auditor');tech=identity('MaintenanceTech');foreign=identity('SuperAdmin',str(uuid.uuid4()))
def request(path,body=None,method=None,token=operator):
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as r:return json.loads(r.read() or 'null')
def denied(code,path,body=None,method=None,token=operator):
    try:request(path,body,method,token);raise AssertionError('Expected denial '+path)
    except urllib.error.HTTPError as e:assert e.code==code,(path,e.code)
ids=[]
ready=threading.Event();received=threading.Event();stream_errors=[]
def stream():
    try:
        req=urllib.request.Request(base+'/events',headers={'Authorization':'Bearer '+operator})
        with urllib.request.urlopen(req,timeout=12) as r:
            for raw in r:
                line=raw.decode().strip()
                if line=='event: ready':ready.set()
                if line=='data: {"type":"refresh"}':received.set();break
    except Exception as e:stream_errors.append(str(e));ready.set()
try:
    for kind in ('plant','sensor'):
        a=request('/assets',{'name':'Platform test '+str(uuid.uuid4())[:8],'kind':kind})
        ids.append(a['id'])
    parent,device=ids
    original=request('/assets/'+device+'/platform')['settings']
    config={**original,'parent_id':parent,'latitude':-8.84,'longitude':13.23,'enabled_metrics':['temperature','pressure'],'alert_rules':{'temperature':{'warning_high':80,'error_high':90}},'sample_interval_seconds':5,'offline_after_seconds':20}
    request('/assets/'+device+'/platform',config,'PATCH')
    denied(422,'/assets/'+parent+'/platform',{**original,'parent_id':device},'PATCH')
    denied(403,'/assets/'+device+'/platform',config,'PATCH',auditor)
    denied(403,'/assets/'+device+'/platform',config,'PATCH',tech)
    denied(404,'/assets/'+device+'/platform',token=foreign)
    baseline=request('/analytics?metric=current_a&hours=24')['summary']['samples']
    before=datetime.now(timezone.utc)
    for i,value in enumerate((10.0,20.0,30.0,40.0)):
        request('/assets/'+device+'/readings',{'device_id':device,'timestamp':(before-timedelta(seconds=60+i)).isoformat(),'metrics':{'current_a':value}})
    analysis=request('/analytics?metric=current_a&hours=24')
    assert analysis['summary']['samples']==baseline+4
    assert sum(b['count'] for b in analysis['histogram'])==analysis['summary']['samples']
    assert sum(b['samples'] for b in analysis['trend'])==analysis['summary']['samples']
    assert analysis['summary']['minimum']<=analysis['summary']['p95']<=analysis['summary']['maximum']
    empty=request('/analytics?metric=current_a',token=foreign)
    assert empty['summary']['samples']==0 and empty['histogram']==[]
    denied(422,'/analytics?metric=unknown')
    denied(422,'/analytics?hours=721')
    settings=request('/assets/'+device+'/platform')
    assert settings['settings']['parent_id']==parent and settings['config_version']==1
    token=request('/assets/'+device+'/provision',{'expires_in_hours':1})['token']
    assert request('/device/config',token=token)['version']==1
    denied(403,'/assets',token=token)
    denied(403,'/telemetry',{'device_id':parent,'timestamp':datetime.now(timezone.utc).isoformat(),'metrics':{'temperature':50.0}},token=token)
    denied(422,'/telemetry',{'device_id':device,'timestamp':datetime.now(timezone.utc).isoformat(),'metrics':{'voltage':230.0}},token=token)
    request('/device/state',{'config_version':1,'firmware':'test-v1','battery_pct':85,'signal_dbm':-60},token=token)
    denied(409,'/device/state',{'config_version':0,'firmware':'old'},token=token)
    receiver=threading.Thread(target=stream,daemon=True);receiver.start()
    assert ready.wait(5) and not stream_errors,stream_errors
    now=datetime.now(timezone.utc)
    request('/telemetry',{'device_id':device,'timestamp':now.isoformat(),'metrics':{'temperature':85.0}},token=token)
    assert received.wait(10), 'No real-time event'
    receiver.join(2)
    until=time.monotonic()+10
    while time.monotonic()<until:
        history=request('/telemetry/history?metric=temperature&device_id='+device)
        if history:break
        time.sleep(.2)
    assert history[-1]['condition']=='warning',history
    twin=request('/assets/'+device+'/platform')
    assert twin['reported']['temperature']==85 and twin['reported_config_version']==1
    # Delayed sparse readings must fill/update that sensor without regressing temperature.
    request('/assets/'+device+'/readings',{'device_id':device,'timestamp':(now-timedelta(seconds=10)).isoformat(),'metrics':{'pressure':40.0}})
    request('/assets/'+device+'/readings',{'device_id':device,'timestamp':(now-timedelta(seconds=5)).isoformat(),'metrics':{'pressure':45.0}})
    request('/assets/'+device+'/readings',{'device_id':device,'timestamp':(now-timedelta(seconds=15)).isoformat(),'metrics':{'temperature':50.0}})
    twin=request('/assets/'+device+'/platform')
    assert twin['reported']['pressure']==45 and twin['reported']['temperature']==85
    schedule={'maintenance_due':'2026-12-01','maintenance_status':'Scheduled','maintenance_note':'Platform verification'}
    request('/assets/'+device+'/maintenance',schedule,'PATCH',tech)
    denied(403,'/assets/'+device+'/maintenance',schedule,'PATCH',auditor)
    events=request('/audit',token=auditor)
    assert any(row['after_state'].get('id')==device for row in events['items'] if row['after_state'])
    assert 'device_epoch' not in json.dumps(events)
    assert request('/audit',token=foreign)['items']==[]
    denied(403,'/audit',token=tech)
    rotated=request('/assets/'+device+'/provision',{})['token']
    denied(401,'/device/config',token=token)
    request('/assets/'+device+'/revoke',{})
    denied(401,'/device/config',token=rotated)
    print('PASS: provisioning, rotation/revocation, sensor validation, queue/worker ingestion, SSE, health/twin acknowledgment, sparse history, rules, maintenance, hierarchy cycles, roles, audit redaction and tenant isolation')
finally:
    async def cleanup():
        async with Session.begin() as s:
            await scope(s,tenant,'platform-test-cleanup')
            for id in reversed(ids):
                for model in (Alert,Reading):await s.execute(delete(model).where(model.device_id==uuid.UUID(id)))
                await s.execute(delete(Asset).where(Asset.id==uuid.UUID(id)))
    asyncio.run(cleanup())
