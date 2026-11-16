"""Run inside the API container. Creates and removes only its own test asset.
Audit records intentionally remain. Never prints credentials or cookie values.
"""
import asyncio,json,os,uuid,urllib.request,urllib.error,http.cookiejar
from datetime import datetime,timezone,timedelta
import jwt
base='http://127.0.0.1:8000'
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,body=None,method=None,token=None):
    headers={'Content-Type':'application/json','Origin':os.getenv('API_ORIGIN','http://localhost:8000')}
    if token:headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers=headers)
    with client.open(req,timeout=20) as r:return json.loads(r.read() or 'null')
user=request('/auth/login',{'email':'operator@markupventures.com','password':'Markup-Demo-2026!'})
asset_id=None
try:
    asset=request('/assets',{'name':'Persistence verification '+str(uuid.uuid4())[:8],'kind':'machine','desired':{'site':'Verification site','equipment_type':'Pump','firmware':'test'}})
    asset_id=asset['id'];now=datetime.now(timezone.utc).isoformat()
    request('/assets/'+asset_id+'/readings',{'device_id':asset_id,'timestamp':now,'metrics':{'temperature':92.0,'humidity':48.0,'power_kw':15.5,'voltage':230.0,'rpm':1500.0,'efficiency_pct':93.0}})
    config={'name':'Verified persisted asset','site':'Verification site','equipment_type':'Pump','firmware':'test-v2','maintenance_due':'2026-12-01','maintenance_status':'Scheduled','maintenance_note':'Persistence regression test'}
    request('/assets/'+asset_id,config,'PATCH')
    # A new login/client proves data survives loss of client state.
    request('/auth/logout',{})
    client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    request('/auth/login',{'email':'operator@markupventures.com','password':'Markup-Demo-2026!'})
    snapshot=request('/dashboard');saved=next(a for a in snapshot['assets'] if a['id']==asset_id)
    assert saved['firmware']=='test-v2' and saved['maintenanceStatus']=='Scheduled'
    assert saved['metrics']['power_kw']==15.5
    old=(datetime.now(timezone.utc)-timedelta(hours=48)).isoformat()
    request('/assets/'+asset_id+'/readings',{'device_id':asset_id,'timestamp':old,'metrics':{'pressure':95.0}})
    assert request('/telemetry/history?metric=pressure&hours=24&device_id='+asset_id)==[]
    assert request('/telemetry/history?metric=pressure&hours=168&device_id='+asset_id)[0]['condition']=='error'
    short=request('/dashboard?hours=24')
    long=request('/dashboard?hours=168')
    assert 'pressure' not in next(a for a in short['assets'] if a['id']==asset_id)['metrics']
    assert next(a for a in long['assets'] if a['id']==asset_id)['metrics']['pressure']==95
    assert any(a['deviceId']==asset_id and a['metric']=='pressure' for a in long['alerts'])
    assert not any(a['deviceId']==asset_id and a['metric']=='pressure' for a in short['alerts'])
    assert any(e['deviceId']==asset_id for e in short['maintenanceHistory'])
    assert asset_id+':temperature' in short['liveErrors']
    assert asset_id+':pressure' not in short['liveErrors']
    assert short['summary']['temperature']['condition']=='error'
    for value in (65.0,81.0):
        request('/assets/'+asset_id+'/readings',{'device_id':asset_id,'timestamp':datetime.now(timezone.utc).isoformat(),'metrics':{'current_a':value}})
    promoted=[a for a in request('/dashboard')['alerts'] if a['deviceId']==asset_id and a['metric']=='current_a']
    assert len(promoted)==1 and promoted[0]['severity']=='Critical'
    history=request('/telemetry/history?metric=power_kw&hours=24&device_id='+asset_id)
    assert history and history[-1]['value']==15.5
    alert=next(a for a in snapshot['alerts'] if a['deviceId']==asset_id)
    request('/alerts/'+alert['id']+'/acknowledge',{'note':'Verified persistent acknowledgment'})
    assert not any(a['id']==alert['id'] for a in request('/dashboard')['alerts'])
    assert any(a['id']==alert['id'] and a['status']!='open' for a in request('/dashboard?include_history=true')['alerts'])
    foreign=jwt.encode({'sub':'isolation-test','tenant_id':str(uuid.uuid4()),'role':'FleetOperator','iss':'markup-auth','aud':'markup-api','exp':datetime.now(timezone.utc)+timedelta(minutes=1)},os.environ['JWT_SECRET'],algorithm='HS256')
    assert request('/telemetry/history?device_id='+asset_id,token=foreign)==[]
    try:request('/assets/'+asset_id,config,'PATCH',foreign);raise AssertionError('Cross-tenant update allowed')
    except urllib.error.HTTPError as e:assert e.code==404
    print('PASS: persistence, lookback inclusion/exclusion, maintenance history, threshold extremes, fresh alarms, warning escalation, acknowledged history, tenant isolation')
finally:
    if asset_id:
        async def cleanup():
            from sqlalchemy import delete
            from app.repository import Session,scope
            from app.models import Asset,Reading,Alert
            async with Session.begin() as s:
                await scope(s,uuid.UUID(user['tenant_id']),'persistence-test-cleanup')
                for model in [Alert,Reading]:await s.execute(delete(model).where(model.device_id==uuid.UUID(asset_id)))
                await s.execute(delete(Asset).where(Asset.id==uuid.UUID(asset_id)))
        asyncio.run(cleanup())
    request('/auth/logout',{})
