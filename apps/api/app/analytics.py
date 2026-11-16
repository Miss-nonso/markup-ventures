"""Bounded analytical aggregates over persisted tenant readings."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from .security import require, Principal
from .repository import Session, scope
from .metrics import METRICS
router=APIRouter(tags=['Analytics'])
BASE="""WITH readings AS (
 SELECT t.device_id,t.timestamp,(t.metrics->>:metric)::double precision AS value,
 COALESCE(a.desired->>'site','Unassigned') AS site
 FROM telemetry t JOIN assets a ON a.id=t.device_id
 WHERE t.timestamp>=:since AND t.timestamp<=:now AND jsonb_exists(t.metrics,:metric)
) """
@router.get('/analytics')
async def analytics(metric:str='temperature',hours:int=Query(default=24,ge=1,le=720),p:Principal=Depends(require('read'))):
    if metric not in METRICS:raise HTTPException(422,'Unknown metric')
    now=datetime.now(timezone.utc)
    params={'metric':metric,'since':now-timedelta(hours=hours),'now':now}
    async with Session.begin() as s:
        await scope(s,p.tenant_id,p.subject)
        row=(await s.execute(text(BASE+"""SELECT count(*) AS samples,count(DISTINCT device_id) AS devices,
          min(value) AS minimum,max(value) AS maximum,avg(value) AS mean,
          stddev_pop(value) AS deviation,percentile_cont(0.95) WITHIN GROUP (ORDER BY value) AS p95
          FROM readings"""),params)).one()
        summary=dict(row._mapping)
        histogram=[]
        if summary['samples']:
            low,high=summary['minimum'],summary['maximum']
            if low==high: histogram=[{'lower':low,'upper':high,'count':summary['samples']}]
            else:
                bins=(await s.execute(text(BASE+"""SELECT least(9,floor((value-:low)/:width))::int AS bin,count(*) AS count
                  FROM readings GROUP BY 1 ORDER BY 1"""),{**params,'low':low,'width':(high-low)/10})).all()
                counts=dict(bins)
                histogram=[{'lower':low+i*(high-low)/10,'upper':low+(i+1)*(high-low)/10,'count':counts.get(i,0)} for i in range(10)]
        sites=(await s.execute(text(BASE+"""SELECT site,avg(value) AS mean,max(value) AS maximum,count(*) AS samples
          FROM readings GROUP BY site ORDER BY mean DESC,site LIMIT 10"""),params)).all()
        trend=(await s.execute(text(BASE+"""SELECT to_timestamp(floor(extract(epoch from timestamp)/:bucket)*:bucket) AS timestamp,
          avg(value) AS mean,min(value) AS minimum,max(value) AS maximum,count(*) AS samples
          FROM readings GROUP BY 1 ORDER BY 1"""),{**params,'bucket':max(60,hours*3600//120)})).all()
    return jsonable_encoder({'metric':metric,'hours':hours,'summary':summary,'histogram':histogram,
                             'sites':[dict(r._mapping) for r in sites],'trend':[dict(r._mapping) for r in trend]})
