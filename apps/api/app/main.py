import os, json, asyncio
from contextlib import asynccontextmanager
from uuid import UUID
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import text, select
import structlog
from .auth import router as auth_router, validate_auth_config, store as auth_store, COOKIE, session_user
from .security import require, decode, Principal, PERMISSIONS
from .repository import Session, scope, AssetRepository
from .models import Alert
from .schemas import Telemetry, AssetCreate, Ack
from .dashboard import router as dashboard_router

log = structlog.get_logger()
redis = Redis.from_url(os.environ.get('REDIS_URL','redis://localhost:6379'), decode_responses=True)
@asynccontextmanager
async def lifespan(app):
    validate_auth_config()
    yield
    await auth_store.aclose()
    await redis.aclose()
app = FastAPI(title='Markup Ventures Industrial Intelligence', version='1.0.0', lifespan=lifespan)
app.include_router(auth_router)
app.include_router(dashboard_router)
from .analytics import router as analytics_router
app.include_router(analytics_router)
from .platform import router as platform_router
app.include_router(platform_router)
@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Pydantic's default response includes raw inputs, including passwords.
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(error['loc']), 'msg': error['msg'], 'type': error['type']}
        for error in exc.errors()
    ]})

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=[os.environ.get('WEB_ORIGIN','http://localhost:3000')], allow_methods=['GET','POST','PATCH'], allow_headers=['Authorization','Content-Type'])

@app.get('/healthz')
async def health(): return {'status':'ok'}
@app.get('/readyz')
async def ready():
    try:
        await redis.ping()
        async with Session() as session: await session.execute(text('SELECT 1'))
    except Exception:
        raise HTTPException(503, 'Dependencies unavailable')
    return {'status':'ready'}
@app.get('/assets')
async def list_assets(p: Principal = Depends(require('read'))):
    async with Session.begin() as session:
        await scope(session,p.tenant_id,p.subject)
        return jsonable_encoder(await AssetRepository(session).list())
@app.post('/assets', status_code=201)
async def create_asset(data: AssetCreate, p: Principal = Depends(require('write'))):
    async with Session.begin() as session:
        await scope(session,p.tenant_id,p.subject)
        repo = AssetRepository(session)
        if data.parent_id and not await repo.get(data.parent_id): raise HTTPException(404,'Parent not found')
        return jsonable_encoder(await repo.create(p.tenant_id,data.model_dump()))
@app.post('/telemetry', status_code=202)
async def ingest(data: Telemetry, p: Principal = Depends(require('ingest'))):
    if p.role == 'Device' and p.subject != str(data.device_id): raise HTTPException(403,'Device mismatch')
    async with Session.begin() as session:
        await scope(session,p.tenant_id,p.subject)
        device=await AssetRepository(session).get(data.device_id)
        if not device: raise HTTPException(404,'Device not found')
        enabled=device.desired.get('device_settings',{}).get('enabled_metrics')
        if enabled is not None and set(data.metrics)-set(enabled): raise HTTPException(422,'Telemetry contains a disabled sensor')
    event = {'tenant_id':str(p.tenant_id), **data.model_dump(mode='json')}
    await redis.xadd('telemetry', {'event':json.dumps(event)})
    return {'accepted':True}
@app.get('/alerts')
async def alerts(p: Principal = Depends(require('read'))):
    async with Session.begin() as session:
        await scope(session,p.tenant_id,p.subject)
        return jsonable_encoder((await session.scalars(select(Alert).order_by(Alert.created_at.desc()).limit(200))).all())
@app.post('/alerts/{id}/acknowledge')
async def acknowledge(id: UUID, body: Ack, p: Principal = Depends(require('ack'))):
    async with Session.begin() as session:
        await scope(session,p.tenant_id,p.subject)
        alert = await session.get(Alert,id)
        if not alert: raise HTTPException(404,'Alert not found')
        alert.status = 'acknowledged'
        alert.note = body.note
    return {'status':'acknowledged'}
@app.websocket('/ws')
async def stream(ws: WebSocket):
    if ws.headers.get('origin') != os.getenv('WEB_ORIGIN', 'http://localhost:3000'):
        await ws.close(code=1008); return
    await ws.accept()
    session_token = ws.cookies.get(COOKIE)
    bearer_token = None
    try:
        if session_token:
            user = await session_user(session_token)
            p = Principal(UUID(user['tenant_id']), user['subject'], user['role'])
        else:
            auth = await asyncio.wait_for(ws.receive_json(), timeout=10)
            bearer_token = auth.get('token', '')
            p = decode(bearer_token)
        if 'read' not in PERMISSIONS[p.role]:
            await ws.close(code=1008); return
    except (HTTPException, asyncio.TimeoutError, ValueError, WebSocketDisconnect, AttributeError):
        await ws.close(code=1008); return
    async with redis.pubsub() as pubsub:
        await pubsub.subscribe(f'tenant:{p.tenant_id}')
        try:
            while True:
                # Revalidate on every iteration so logout/expiry also closes streams.
                if session_token: await session_user(session_token)
                else: decode(bearer_token)
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
                if message: await ws.send_text(message['data'])
                else: await ws.send_json({'type':'heartbeat'})
                await asyncio.sleep(0.1)
        except HTTPException:
            await ws.close(code=1008)
        except (WebSocketDisconnect, RuntimeError): pass
