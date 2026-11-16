import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/api'))
os.environ.update(APP_ENV='development', DEMO_LOGIN_ENABLED='true', JWT_SECRET='x'*40)
from fastapi import Depends, FastAPI
import httpx
from app import auth
from app.security import require
from app.main import validation_error
from fastapi.exceptions import RequestValidationError

class FakeStore:
    def __init__(self): self.data = {}; self.count = 0; self.ttls = {}
    async def get(self,key): return self.data.get(key)
    async def set(self,key,value,ex): self.data[key]=value; self.ttls[key]=ex
    async def delete(self,key): self.data.pop(key,None)
    async def eval(self,*args): self.count+=1; return self.count

class AuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store=FakeStore()
        self.patch=patch.object(auth,'store',self.store); self.patch.start()
        self.app=FastAPI(); self.app.include_router(auth.router)
        self.app.add_exception_handler(RequestValidationError,validation_error)
        @self.app.get('/protected')
        async def protected(p=Depends(require('read'))): return {'tenant':str(p.tenant_id)}
        @self.app.post('/protected')
        async def mutate(p=Depends(require('write'))): return {'ok':True}
        @self.app.post('/ingest')
        async def ingest(p=Depends(require('ingest'))): return {'ok':True}
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url="http://testserver")
        self.origin={'Origin':'http://localhost:3000'}
    async def asyncTearDown(self): self.patch.stop(); await self.client.aclose()
    async def login(self,**overrides):
        return await self.client.post('/auth/login',json={'email':auth.DEMO_EMAIL,'password':auth.DEMO_PASSWORD,**overrides},headers=self.origin)
    async def test_login_cookie_and_guard(self):
        self.assertEqual((await self.client.get('/protected')).status_code,401)
        response=await self.login(); self.assertEqual(response.status_code,200)
        cookie=response.headers['set-cookie']; self.assertIn('HttpOnly',cookie);self.assertIn('SameSite=strict',cookie)
        self.assertEqual((await self.client.get('/protected')).status_code,200)
        self.assertEqual((await self.client.get('/auth/me')).json()['role'],'FleetOperator')
        self.assertEqual((await self.client.post('/ingest',headers=self.origin)).status_code,403)
        self.assertEqual(set(self.store.ttls.values()),{3600})
    async def test_wrong_password_and_unknown_user_match(self):
        a=await self.login(password='wrong'); b=await self.login(email='missing@example.com')
        self.assertEqual(a.status_code,401);self.assertEqual(a.json(),b.json())
    async def test_csrf(self):
        response=await self.client.post('/auth/login',json={'email':auth.DEMO_EMAIL,'password':auth.DEMO_PASSWORD},headers={'Origin':'https://evil.example'})
        self.assertEqual(response.status_code,403)
        await self.login()
        self.assertEqual((await self.client.post('/protected')).status_code,403)
        self.assertEqual((await self.client.post('/protected',headers=self.origin)).status_code,200)
        self.assertEqual((await self.client.post('/auth/logout')).status_code,403)
    async def test_logout_revokes_copied_cookie(self):
        await self.login(); token=self.client.cookies.get(auth.COOKIE)
        self.assertEqual((await self.client.post('/auth/logout',headers=self.origin)).status_code,204)
        self.client.cookies.set(auth.COOKIE,token)
        self.assertEqual((await self.client.get('/protected')).status_code,401)
    async def test_expired_session(self):
        await self.login();self.store.data.clear()
        self.assertEqual((await self.client.get('/auth/me')).status_code,401)
    async def test_session_rotation(self):
        await self.login();old=self.client.cookies.get(auth.COOKIE);await self.login()
        self.assertNotIn(auth.session_key(old),self.store.data)
    async def test_rate_limit(self):
        for _ in range(10): await self.login(password='wrong')
        r=await self.login();self.assertEqual(r.status_code,429);self.assertEqual(r.headers['retry-after'],'900')
    async def test_strict_validation_does_not_echo_password(self):
        r=await self.login(password=12345);self.assertEqual(r.status_code,422);self.assertNotIn('12345',r.text)
        r=await self.login(role='SuperAdmin');self.assertEqual(r.status_code,422)
        self.assertEqual((await self.login(email='not-an-email')).status_code,422)
    async def test_production_rejects_demo_and_hides_hint(self):
        with patch.dict(os.environ,{'APP_ENV':'production'}):
            with self.assertRaises(RuntimeError):auth.validate_auth_config()
            self.assertEqual((await self.client.get('/auth/demo')).json(),{'enabled':False})
    async def test_configuration_change_revokes_sessions(self):
        await self.login()
        with patch.dict(os.environ, {'DEMO_LOGIN_ENABLED':'false','AUTH_EMAIL':'private@example.com','AUTH_PASSWORD_HASH':auth.password_hash('private-long-password'),'AUTH_TENANT_ID':'11111111-1111-4111-8111-111111111111'}):
            self.assertEqual((await self.client.get('/auth/me')).status_code,401)
    async def test_production_cookie_is_secure(self):
        settings={'APP_ENV':'production','DEMO_LOGIN_ENABLED':'false','AUTH_EMAIL':'private@example.com','AUTH_PASSWORD_HASH':auth.password_hash('private-long-password'),'AUTH_TENANT_ID':'11111111-1111-4111-8111-111111111111','WEB_ORIGIN':'https://dashboard.example.com'}
        with patch.dict(os.environ,settings):
            auth.validate_auth_config()
            response=await self.client.post('/auth/login',json={'email':'private@example.com','password':'private-long-password'},headers={'Origin':'https://dashboard.example.com'})
            self.assertEqual(response.status_code,200)
            self.assertIn('Secure',response.headers['set-cookie'])
    async def test_real_api_endpoints_reject_anonymous(self):
        from app.main import app
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://testserver') as client:
            for path in ['/assets','/alerts']:
                self.assertEqual((await client.get(path)).status_code,401)
    async def test_development_demo_startup_accepts_builtin_account(self):
        with patch.dict(os.environ, {'APP_ENV':'development','DEMO_LOGIN_ENABLED':'true'}):
            self.assertTrue(auth.valid_hash(auth.DEMO_HASH))
            auth.validate_auth_config()

    async def test_swagger_origins_and_referer(self):
        credentials={'email':auth.DEMO_EMAIL,'password':auth.DEMO_PASSWORD}
        for headers in [
            {'Origin':'http://localhost:8000'},
            {'Origin':'http://127.0.0.1:8000'},
            {'Origin':'http://[::1]:8000'},
            {'Referer':'http://localhost:8000/docs'},
            {'Referer':'http://127.0.0.1:8000/docs'},
        ]:
            response=await self.client.post('/auth/login',json=credentials,headers=headers)
            self.assertEqual(response.status_code,200,headers)
            self.assertEqual((await self.client.get('/auth/me')).status_code,200)

    async def test_untrusted_origins_cannot_use_referer_fallback(self):
        credentials={'email':auth.DEMO_EMAIL,'password':auth.DEMO_PASSWORD}
        for headers in [
            {},
            {'Origin':'null','Referer':'http://localhost:8000/docs'},
            {'Origin':'https://evil.example','Referer':'http://localhost:8000/docs'},
            {'Referer':'http://localhost:8000.evil.example/docs'},
            {'Referer':'http://localhost:8000@evil.example/docs'},
            {'Referer':'http://localhost:9999/docs'},
            {'Origin':'http://localhost:8000/path'},
            {'Origin':'http://localhost:8000.evil.example'},
        ]:
            response=await self.client.post('/auth/login',json=credentials,headers=headers)
            self.assertEqual(response.status_code,403,headers)

    async def test_production_does_not_expand_loopback_origins(self):
        with patch.dict(os.environ,{'APP_ENV':'production','WEB_ORIGIN':'https://dashboard.example.com','API_ORIGIN':'https://api.example.com'}):
            self.assertEqual(auth.allowed_origins(),{'https://dashboard.example.com:443','https://api.example.com:443'})
            for headers in [{'Origin':'http://127.0.0.1:8000'},{'Referer':'http://localhost:8000/docs'}]:
                response=await self.client.post('/auth/login',json={'email':auth.DEMO_EMAIL,'password':auth.DEMO_PASSWORD},headers=headers)
                self.assertEqual(response.status_code,403)

    async def test_hash_validation(self):
        encoded=auth.password_hash('a-long-private-password')
        self.assertTrue(auth.valid_hash(encoded));self.assertTrue(auth.verify_password('a-long-private-password',encoded))
        self.assertFalse(auth.verify_password('incorrect',encoded));self.assertFalse(auth.valid_hash('scrypt$bad'))

if __name__=='__main__': unittest.main()
