from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert
from .models import Asset, Alert, Reading
from .metrics import METRICS, condition

async def record_reading(session, tenant_id, device_id, timestamp, metrics, detector=None):
    asset = await session.scalar(select(Asset).where(Asset.id==device_id).with_for_update())
    if not asset: return False
    inserted = await session.execute(insert(Reading).values(tenant_id=tenant_id, device_id=device_id, timestamp=timestamp, metrics=metrics).on_conflict_do_nothing().returning(Reading.device_id))
    if inserted.scalar_one_or_none() is None: return True
    # Sparse, out-of-order telemetry uses a watermark per sensor, not per device.
    latest = await session.execute(text("""
        SELECT e.key, max(t.timestamp) FROM telemetry t
        CROSS JOIN LATERAL jsonb_each(t.metrics) e
        WHERE t.device_id=:device GROUP BY e.key
    """), {'device':device_id})
    watermarks=dict(latest.all())
    updates={key:value for key,value in metrics.items() if timestamp>=watermarks[key]}
    if updates: asset.reported={**asset.reported,**updates}
    if asset.last_seen is None or timestamp >= asset.last_seen:
        asset.last_seen = timestamp
    config=asset.desired.get('device_settings',{})
    rules=config.get('alert_rules',{})
    anomalies = detector.evaluate(str(tenant_id),str(device_id),metrics,rules,config.get('anomaly_detection',True)) if detector else [{'metric':key,'value':value,'severity':'critical' if condition(key,value,rules)=='error' else 'warning'} for key,value in metrics.items() if condition(key,value,rules)!='good']
    for anomaly in anomalies:
        key, value = anomaly['metric'], anomaly['value']
        existing = await session.scalar(select(Alert).where(Alert.device_id==device_id,Alert.metric==key,Alert.status=='open').limit(1))
        if existing and timestamp >= existing.created_at:
            existing.value = value
            if anomaly['severity'] == 'critical': existing.severity = 'critical'
        if not existing:
            session.add(Alert(tenant_id=tenant_id,device_id=device_id,metric=key,value=value,severity=anomaly['severity'],status='open',created_at=timestamp))
    await session.flush()
    return True

def serialize_asset(asset, alerts):
    desired = asset.desired or {}
    age = (datetime.now(timezone.utc)-asset.last_seen).total_seconds() if asset.last_seen else None
    status = 'Offline' if age is None or age > desired.get("device_settings",{}).get("offline_after_seconds",300) else 'Critical' if any(a.severity=='critical' for a in alerts) else 'Warning' if alerts else 'Healthy'
    return {'id':str(asset.id),'parentId':str(asset.parent_id) if asset.parent_id else None,'kind':asset.kind,'deviceSettings':desired.get('device_settings',{}),'name':asset.name,'type':desired.get('equipment_type',asset.kind),'site':desired.get('site','Unassigned'),'status':status,
            'temperature':asset.reported.get('temperature'),'vibration':asset.reported.get('vibration'),'metrics':asset.reported,
            'uptime':'—','firmware':desired.get('firmware','Unknown'),'lastSeen':asset.last_seen,
            'source':desired.get('data_source','device'),'maintenanceDue':desired.get('maintenance_due'),
            'maintenanceStatus':desired.get('maintenance_status','Not scheduled'),'maintenanceNote':desired.get('maintenance_note','')}
