"""Provision a device first; set DEVICE_TOKEN and API_URL. Never prints credentials."""
import argparse, json, math, os, time, urllib.request
from datetime import datetime, timezone
parser=argparse.ArgumentParser()
parser.add_argument('--once',action='store_true')
args=parser.parse_args()
base=os.getenv('API_URL','http://localhost:8000').rstrip('/')
token=os.environ['DEVICE_TOKEN']
def request(path,body=None):
    req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as r:return json.loads(r.read())
index=0
while True:
    config=request('/device/config')
    request('/device/state',{'config_version':config['version'],'firmware':'simulator-1.0','battery_pct':95,'signal_dbm':-65})
    metrics={'temperature':55,'pressure':45,'vibration':2,'humidity':45,'power_kw':20,'energy_kwh':1000+index,
             'voltage':230,'current_a':40,'rpm':1500,'flow_lpm':100,'runtime_hours':100+index/120,'efficiency_pct':92}
    metrics['temperature']+=round(math.sin(index/3)*3,2)
    metrics={k:v for k,v in metrics.items() if k in config['settings']['enabled_metrics']}
    request('/telemetry',{'device_id':config['device_id'],'timestamp':datetime.now(timezone.utc).isoformat(),'metrics':metrics})
    print('Telemetry accepted; applied configuration version',config['version'],flush=True)
    if args.once:break
    index+=1
    time.sleep(config['settings']['sample_interval_seconds'])
