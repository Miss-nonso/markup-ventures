"""Single Redis Streams consumer. Replays pending entries after a restart."""
import asyncio, json, os
from datetime import datetime
from uuid import UUID
from redis.asyncio import Redis
from redis.exceptions import ResponseError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import text
import structlog
from .models import Reading, Alert
from .repository import Session, scope, AssetRepository
from .engine import AnomalyEngine
from .operations import record_reading
from .schemas import Telemetry

async def main():
    redis = Redis.from_url(os.environ.get('REDIS_URL','redis://localhost:6379'), decode_responses=True)
    log = structlog.get_logger()
    detector = AnomalyEngine()
    try: await redis.xgroup_create('telemetry','processors',id='0',mkstream=True)
    except ResponseError as exc:
        if 'BUSYGROUP' not in str(exc): raise
    cursor = '0'
    while True:
        batches = await redis.xreadgroup('processors','primary',{'telemetry':cursor},count=100,block=1000)
        if not batches or not batches[0][1]: cursor = '>'; continue
        for _, entries in batches:
            for entry_id, payload in entries:
                try:
                    event = json.loads(payload['event'])
                    tenant, device = UUID(event['tenant_id']), UUID(event['device_id'])
                    timestamp = datetime.fromisoformat(event['timestamp'].replace('Z','+00:00'))
                    async with Session.begin() as session:
                        await scope(session,tenant,'telemetry-worker')
                        validated = Telemetry.model_validate({k:v for k,v in event.items() if k!='tenant_id'})
                        if not await record_reading(session,tenant,device,validated.timestamp,validated.metrics,detector):
                            raise ValueError('Unknown asset')
                    await redis.publish(f'tenant:{tenant}',json.dumps(event))
                    await redis.xack('telemetry','processors',entry_id)
                except (ValueError,KeyError) as exc:
                    await redis.xadd('telemetry:dead-letter',{'event':payload.get('event',''),'error':str(exc)})
                    await redis.xack('telemetry','processors',entry_id)
                    log.warning('invalid_event',event_id=entry_id,error=str(exc))
                except Exception as exc:
                    log.error('processing_failed',event_id=entry_id,error=str(exc))
                    cursor='0'
                    await asyncio.sleep(2)
if __name__ == '__main__': asyncio.run(main())
