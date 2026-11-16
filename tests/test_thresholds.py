import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'apps/api'))
from app.metrics import METRICS, condition
from app.engine import AnomalyEngine

class ThresholdTests(unittest.TestCase):
    def test_every_metric_has_ordered_limits(self):
        for key, metric in METRICS.items():
            limits=metric['limits']
            self.assertTrue(limits)
            if 'error_high' in limits:
                boundary=limits['error_high']
                self.assertLess(limits['warning_high'],boundary)
                self.assertEqual(condition(key,boundary),'warning')
                self.assertEqual(condition(key,boundary+.01),'error')
            if 'error_low' in limits:
                boundary=limits['error_low']
                self.assertGreater(limits['warning_low'],boundary)
                self.assertEqual(condition(key,boundary),'warning')
                self.assertEqual(condition(key,boundary-.01),'error')
    def test_temperature_and_missing_metrics(self):
        self.assertEqual([condition('temperature',v) for v in [60,60.1,70,70.1]],['good','warning','warning','error'])
    def test_low_efficiency_and_voltage_emit_errors(self):
        for metric,value in [('efficiency_pct',74),('voltage',199),('flow_lpm',39)]:
            result=AnomalyEngine().evaluate('tenant','device',{metric:value})
            self.assertEqual(result[0]['severity'],'critical')
