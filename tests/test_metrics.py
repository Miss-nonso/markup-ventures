import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from pydantic import ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'apps/api'))
from app.schemas import Telemetry,AssetCreate,AssetUpdate
from app.metrics import METRICS

class MetricTests(unittest.TestCase):
    def payload(self,metrics,**extra):
        return Telemetry(device_id=uuid4(),timestamp=datetime.now(timezone.utc),metrics=metrics,**extra)
    def test_all_metrics_validate(self):
        self.assertEqual(len(self.payload({k:float((v['min']+v['max'])/2) for k,v in METRICS.items()}).metrics),12)
    def test_invalid_metrics_rejected(self):
        for metrics in [{'temperature':float('nan')},{'power_kw':float('inf')},{'humidity':101.0},{'voltage':-1.0},{'unknown':1.0},{'temperature':'25'}]:
            with self.subTest(metrics=metrics),self.assertRaises(ValidationError):self.payload(metrics)
    def test_future_timestamp_rejected(self):
        with self.assertRaises(ValidationError):Telemetry(device_id=uuid4(),timestamp=datetime.now(timezone.utc)+timedelta(days=1),metrics={'temperature':20.0})
    def test_invalid_asset_configuration(self):
        for desired in [{'maintenance_history':[]},{'site':12},{'maintenance_status':'fake'},{'maintenance_due':'not-a-date'},{'maintenance_due':12}]:
            with self.assertRaises((ValidationError,ValueError)):AssetCreate(name='Pump',kind='machine',desired=desired)
        with self.assertRaises(ValidationError):AssetCreate(name='   ',kind='machine')

    def test_blank_update_rejected(self):
        with self.assertRaises(ValidationError):AssetUpdate(name=' ',site='Plant',equipment_type='Pump',firmware='v1')
