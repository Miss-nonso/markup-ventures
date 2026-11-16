import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps/api'))
from app.engine import AnomalyEngine

class AnomalyTests(unittest.TestCase):
    def test_threshold(self):
        engine = AnomalyEngine()
        self.assertEqual(engine.evaluate('t','d',{'temperature':60}), [])
        self.assertEqual(engine.evaluate('t','d',{'temperature':71})[0]['severity'], 'critical')
    def test_tenant_windows_are_isolated(self):
        engine = AnomalyEngine()
        engine.evaluate('one','device',{'pressure':10})
        self.assertEqual(engine.evaluate('two','device',{'pressure':50}), [])
        self.assertEqual(engine.evaluate('one','device',{'pressure':50})[0]['severity'], 'warning')
    def test_outlier(self):
        engine = AnomalyEngine()
        for _ in range(10): engine.evaluate('t','d',{'temperature':50})
        self.assertEqual(engine.evaluate('t','d',{'temperature':56})[0]['severity'], 'warning')
    def test_bounded_history(self):
        engine = AnomalyEngine()
        for _ in range(100): engine.evaluate('t','d',{'vibration':2})
        self.assertEqual(len(engine.windows[('t','d','vibration')]), 30)
if __name__ == '__main__': unittest.main()
