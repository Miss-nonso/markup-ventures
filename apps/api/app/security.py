import os
from dataclasses import dataclass
from uuid import UUID
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer = HTTPBearer(auto_error=False)
PERMISSIONS = {'SuperAdmin': {'read','write','ingest','ack','audit','maintain'}, 'FleetOperator': {'read','write','ack','audit','maintain'}, 'MaintenanceTech': {'read','ack','maintain'}, 'Auditor': {'read','audit'}, 'Device': {'ingest','device'}}
@dataclass
class Principal:
    tenant_id: UUID
    subject: str
    role: str
    device_epoch: str | None = None

def decode(token: str) -> Principal:
    try:
        claims = jwt.decode(token, os.environ['JWT_SECRET'], algorithms=['HS256'], audience='markup-api', issuer='markup-auth', options={'require':['exp','sub','tenant_id','role']})
        p = Principal(UUID(claims['tenant_id']), claims['sub'], claims['role'], claims.get('device_epoch'))
        if p.role not in PERMISSIONS: raise ValueError('Unknown role')
        return p
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise HTTPException(401, 'Invalid credentials') from exc

def require(permission: str):
    async def guard(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
        from .auth import COOKIE, check_origin, session_user
        if credentials:
            p = decode(credentials.credentials)
        else:
            user = await session_user(request.cookies.get(COOKIE))
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                check_origin(request)
            p = Principal(UUID(user['tenant_id']), user['subject'], user['role'])
        if p.role == 'Device':
            from .repository import Session, scope
            from .models import Asset
            try: device_id=UUID(p.subject)
            except ValueError: raise HTTPException(401,'Invalid device identity')
            async with Session.begin() as s:
                await scope(s,p.tenant_id,p.subject)
                asset=await s.get(Asset,device_id)
                if not asset or not p.device_epoch or asset.desired.get('device_epoch')!=p.device_epoch:
                    raise HTTPException(401,'Device credential expired or revoked')
        if permission not in PERMISSIONS.get(p.role, set()):
            raise HTTPException(403, 'Permission denied')
        return p
    return guard
