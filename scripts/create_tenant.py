"""Administrator-only tenant creation. Run in an environment with API dependencies."""
import argparse,asyncio,os
from uuid import UUID,uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
parser=argparse.ArgumentParser()
parser.add_argument('--name',required=True)
parser.add_argument('--id',type=UUID,default=None)
args=parser.parse_args()
if not args.name.strip() or len(args.name)>120:parser.error('Tenant name must contain 1–120 characters')
async def main():
    engine=create_async_engine(os.environ['ADMIN_DATABASE_URL'])
    tenant_id=args.id or uuid4()
    try:
        async with engine.begin() as connection:
            await connection.execute(text('INSERT INTO tenants(id,name) VALUES(:id,:name)'),{'id':tenant_id,'name':args.name.strip()})
        print('Created tenant',tenant_id)
    finally:await engine.dispose()
asyncio.run(main())
