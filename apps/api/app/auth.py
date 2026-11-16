"""Configured tenant-scoped human accounts; no database migration required."""
import asyncio
import hashlib
import hmac
import json
import os
import secrets
from uuid import UUID
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from redis.asyncio import Redis

COOKIE = 'markup_session'
SESSION_SECONDS = 3600
DEMO_EMAIL = 'operator@markupventures.com'
DEMO_PASSWORD = 'Markup-Demo-2026!'
store = Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'), decode_responses=True)
router = APIRouter(prefix='/auth', tags=['Authentication'])

def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f'scrypt${salt}${digest}'

def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt, digest = encoded.split('$')
        return algorithm == 'scrypt' and hmac.compare_digest(password_hash(password, salt), encoded)
    except (ValueError, TypeError):
        return False

def valid_hash(encoded: str) -> bool:
    try:
        algorithm, salt, digest = encoded.split('$')
        return algorithm == 'scrypt' and len(bytes.fromhex(salt)) == 16 and len(bytes.fromhex(digest)) == 64
    except (ValueError, TypeError):
        return False

def demo_enabled() -> bool:
    return os.getenv('APP_ENV', 'production') == 'development' and os.getenv('DEMO_LOGIN_ENABLED') == 'true'

def account():
    if demo_enabled():
        return DEMO_EMAIL, DEMO_HASH, '11111111-1111-4111-8111-111111111111'
    return os.getenv('AUTH_EMAIL', ''), os.getenv('AUTH_PASSWORD_HASH', ''), os.getenv('AUTH_TENANT_ID', '')

# Stable hash salt for the public demo account across worker processes/restarts.
DEMO_HASH = password_hash(DEMO_PASSWORD, b'MarkupDemoSaltV1'.hex())

def accounts():
    configured=os.getenv('AUTH_USERS_JSON','').strip()
    if configured:
        rows=json.loads(configured)
        if not isinstance(rows,list) or not 1<=len(rows)<=100: raise ValueError('AUTH_USERS_JSON must contain 1 to 100 accounts')
        return rows
    email,encoded,tenant=account()
    rows=[{'email':email,'password_hash':encoded,'tenant_id':tenant,'role':os.getenv('AUTH_ROLE','FleetOperator')}]
    if demo_enabled():
        rows += [{'email':email,'password_hash':DEMO_HASH,'tenant_id':tenant,'role':role} for email,role in [
            ('auditor@markupventures.com','Auditor'),('technician@markupventures.com','MaintenanceTech')]]
    return rows

def account_version():
    return hashlib.sha256(json.dumps(accounts(),sort_keys=True).encode()).hexdigest()

def validate_auth_config():
    if os.getenv('DEMO_LOGIN_ENABLED') == 'true' and not demo_enabled():
        raise RuntimeError('Demo login is allowed only in development')
    seen=set()
    for row in accounts():
        email,encoded,tenant=row.get('email',''),row.get('password_hash',''),row.get('tenant_id','')
        if not email or '@' not in email or not valid_hash(encoded):
            raise RuntimeError('Configure AUTH_EMAIL, AUTH_PASSWORD_HASH and AUTH_TENANT_ID, or enable local demo login')
        if email.lower() in seen or row.get('role') not in ('SuperAdmin','FleetOperator','MaintenanceTech','Auditor'):
            raise RuntimeError('Duplicate account or invalid human role')
        seen.add(email.lower()); UUID(tenant)
        if not demo_enabled() and verify_password(DEMO_PASSWORD,encoded):
            raise RuntimeError('The public demo password is forbidden outside demo mode')
    if os.getenv('APP_ENV', 'production') != 'development':
        if not os.getenv('WEB_ORIGIN', '').startswith('https://'):
            raise RuntimeError('Production WEB_ORIGIN must use HTTPS')
        if len(os.getenv('JWT_SECRET', '')) < 32:
            raise RuntimeError('Production JWT_SECRET must contain at least 32 characters')

def normalized_origin(value: str, *, referer: bool = False) -> str | None:
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            return None
        if parsed.username is not None or parsed.password is not None:
            return None
        if not referer and (parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            return None
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        return f'{parsed.scheme}://{parsed.hostname.lower()}:{port}'
    except ValueError:
        return None


def allowed_origins() -> set[str]:
    result = set()
    for configured in (os.getenv('WEB_ORIGIN', 'http://localhost:3000'), os.getenv('API_ORIGIN', 'http://localhost:8000')):
        origin = normalized_origin(configured)
        if origin is None:
            continue
        result.add(origin)
        parsed = urlsplit(configured)
        # Local development browsers may use either loopback spelling. Never
        # derive trusted origins from Host or forwarded headers.
        if os.getenv('APP_ENV') == 'development' and parsed.hostname in ('localhost', '127.0.0.1', '::1'):
            port = parsed.port or (443 if parsed.scheme == 'https' else 80)
            result.update(f'{parsed.scheme}://{host}:{port}' for host in ('localhost', '127.0.0.1', '::1'))
    return result


def check_origin(request: Request):
    origin = request.headers.get('origin')
    if origin is not None:
        # An explicit invalid/null Origin must never fall back to Referer.
        source = normalized_origin(origin)
    else:
        source = normalized_origin(request.headers.get('referer', ''), referer=True)
    if source is None or source not in allowed_origins():
        raise HTTPException(403, 'Untrusted request origin')

def session_key(token: str) -> str:
    return 'session:' + hashlib.sha256(token.encode()).hexdigest()

async def session_user(token: str | None):
    if not token or len(token) != 64:
        raise HTTPException(401, 'Authentication required')
    raw = await store.get(session_key(token))
    if not raw:
        raise HTTPException(401, 'Session expired or invalid')
    user = json.loads(raw)
    version = user.pop('_version', '')
    if not hmac.compare_digest(version, account_version()):
        raise HTTPException(401, 'Session expired or invalid')
    return user

class Login(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    email: str = Field(min_length=3, max_length=254, pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    password: str = Field(min_length=1, max_length=128)

@router.get('/demo')
async def demo(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return {'enabled': demo_enabled(), **({'email': DEMO_EMAIL, 'password': DEMO_PASSWORD} if demo_enabled() else {})}

@router.post('/login')
async def login(body: Login, request: Request, response: Response):
    check_origin(request)
    # Do not trust client-supplied forwarded IPs. The proxy shares a conservative limit.
    key = 'login-limit:' + (request.client.host if request.client else 'unknown')
    count = await store.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", 1, key)
    if count > 10:
        raise HTTPException(429, 'Too many sign-in attempts. Try again in 15 minutes.', headers={'Retry-After': '900'})
    selected=next((row for row in accounts() if row['email'].lower()==body.email.lower()),None)
    email,encoded,tenant=(selected['email'],selected['password_hash'],selected['tenant_id']) if selected else ('',DEMO_HASH,'')
    valid_password = await asyncio.to_thread(verify_password, body.password, encoded)
    if not (hmac.compare_digest(body.email.lower().encode(), email.lower().encode()) and valid_password):
        raise HTTPException(401, 'Incorrect email or password')
    previous = request.cookies.get(COOKIE)
    if previous:
        await store.delete(session_key(previous))
    token = secrets.token_hex(32)
    user = {'subject': email, 'email': email, 'tenant_id': tenant, 'role': selected['role']}
    await store.set(session_key(token), json.dumps({**user, '_version': account_version()}), ex=SESSION_SECONDS)
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=os.getenv('APP_ENV', 'production') != 'development', samesite='strict', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return user

@router.get('/me')
async def me(request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return await session_user(request.cookies.get(COOKIE))

@router.post('/logout', status_code=204)
async def logout(request: Request):
    check_origin(request)
    token = request.cookies.get(COOKIE)
    if token:
        await store.delete(session_key(token))
    response = Response(status_code=204, headers={'Cache-Control': 'no-store'})
    response.delete_cookie(COOKIE, path='/', httponly=True, secure=os.getenv('APP_ENV', 'production') != 'development', samesite='strict')
    return response
