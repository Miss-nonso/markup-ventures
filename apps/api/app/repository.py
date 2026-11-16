import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text, select
from .models import Asset
engine = create_async_engine(os.environ.get('DATABASE_URL', 'postgresql+asyncpg://markup:markup@localhost:5432/markup'), pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)

async def scope(session, tenant_id, actor):
    await session.execute(text("SELECT set_config('app.tenant_id', :tenant, true), set_config('app.actor', :actor, true)"), {'tenant':str(tenant_id),'actor':actor})

class AssetRepository:
    def __init__(self, session): self.session = session
    async def list(self): return (await self.session.scalars(select(Asset).order_by(Asset.name).limit(500))).all()
    async def get(self, id): return await self.session.get(Asset, id)
    async def create(self, tenant_id, data):
        asset = Asset(tenant_id=tenant_id, **data)
        self.session.add(asset)
        await self.session.flush()
        return asset
