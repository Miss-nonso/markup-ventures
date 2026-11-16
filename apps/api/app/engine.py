from collections import defaultdict, deque
from statistics import mean, pstdev
from .metrics import condition

class AnomalyEngine:
    """Bounded rolling detector. State is local to the single stream consumer."""
    def __init__(self):
        self.windows = {}
        from .metrics import METRICS
        self.thresholds = {k:v['threshold'] for k,v in METRICS.items() if 'threshold' in v}
    def evaluate(self, tenant, device, metrics, rules=None, anomaly_detection=True):
        alerts = []
        for metric, value in metrics.items():
            key = (tenant,device,metric)
            if key not in self.windows:
                if len(self.windows) >= 10000: self.windows.pop(next(iter(self.windows)))
                self.windows[key] = deque(maxlen=30)
            window = self.windows[key]
            state = condition(metric, value, rules)
            threshold = state != 'good'
            outlier = anomaly_detection and len(window) >= 10 and abs(value-mean(window)) > max(3*pstdev(window), 5)
            spike = anomaly_detection and bool(window) and abs(value-window[-1]) > 20
            if threshold or outlier or spike: alerts.append({'metric':metric,'value':value,'severity':'critical' if state == 'error' else 'warning'})
            window.append(value)
        return alerts
