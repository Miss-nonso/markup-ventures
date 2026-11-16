import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'apps/api'))
from pydantic import ValidationError
from app.platform import DeviceSettings, ReportedState, Maintenance
from app.metrics import condition
from app.engine import AnomalyEngine
class PlatformTests(unittest.TestCase):
    def test_demo_accounts_pass_startup_validation(self):
        import os
        from unittest.mock import patch
        from app.auth import validate_auth_config, accounts, valid_hash
        with patch.dict(os.environ,{'APP_ENV':'development','DEMO_LOGIN_ENABLED':'true','AUTH_USERS_JSON':'','AUTH_ROLE':'FleetOperator'}):
            validate_auth_config()
            self.assertEqual(len(accounts()),3)
            self.assertTrue(all(valid_hash(a['password_hash']) for a in accounts()))

    def test_reject_invalid_sensor_configuration(self):
        for payload in [{'latitude':1},{'latitude':91,'longitude':0},{'sample_interval_seconds':200,'offline_after_seconds':300},{'enabled_metrics':['temperature','temperature']},{'enabled_metrics':['fake']},{'alert_rules':{'temperature':{'warning_high':90}}},{'alert_rules':{'temperature':{'error_high':float('nan')}}}]:
            with self.subTest(payload=payload),self.assertRaises(ValidationError):DeviceSettings(**payload)
    def test_custom_rules_are_shared_by_detection(self):
        rules={'temperature':{'warning_high':80,'error_high':90}}
        self.assertEqual(condition('temperature',75,rules),'good')
        self.assertEqual(AnomalyEngine().evaluate('t','d',{'temperature':85},rules)[0]['severity'],'warning')
    def test_disabling_statistical_detection_keeps_thresholds(self):
        e=AnomalyEngine()
        e.evaluate('t','d',{'pressure':10})
        self.assertEqual(e.evaluate('t','d',{'pressure':50},anomaly_detection=False),[])
        self.assertEqual(e.evaluate('t','d',{'pressure':95},anomaly_detection=False)[0]['severity'],'critical')
    def test_health_and_schedule_validation(self):
        with self.assertRaises(ValidationError):ReportedState(config_version=0,firmware='x',battery_pct=101)
        with self.assertRaises(ValidationError):Maintenance(maintenance_status='invalid')
        with self.assertRaises(ValidationError):Maintenance(maintenance_status='Scheduled',maintenance_due='2026-02-30')
