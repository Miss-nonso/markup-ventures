"""Metric names and engineering units shared with the UI through /metrics."""
METRICS = {
    'temperature': {'label':'Temperature','unit':'°C','min':-100,'max':1000,'threshold':70},
    'pressure': {'label':'Pressure','unit':'bar','min':0,'max':1000,'threshold':90},
    'vibration': {'label':'Vibration','unit':'mm/s','min':0,'max':100,'threshold':8.5},
    'humidity': {'label':'Humidity','unit':'%','min':0,'max':100,'threshold':70},
    'power_kw': {'label':'Power demand','unit':'kW','min':0,'max':1000000},
    'energy_kwh': {'label':'Energy meter','unit':'kWh','min':0,'max':1e12},
    'voltage': {'label':'Voltage','unit':'V','min':0,'max':100000,'threshold':260},
    'current_a': {'label':'Current','unit':'A','min':0,'max':100000},
    'rpm': {'label':'Rotational speed','unit':'rpm','min':0,'max':100000},
    'flow_lpm': {'label':'Flow rate','unit':'L/min','min':0,'max':1000000},
    'runtime_hours': {'label':'Operating hours','unit':'h','min':0,'max':1000000},
    'efficiency_pct': {'label':'Efficiency','unit':'%','min':0,'max':100},
}

# Example operating envelopes, not equipment manufacturer limits. Strict comparisons:
# a reading exactly on a boundary remains in the less severe band.
LIMITS = {
    'temperature': {'warning_high':60, 'error_high':70},
    'pressure': {'warning_high':75, 'error_high':90},
    'vibration': {'warning_high':5, 'error_high':8.5},
    'humidity': {'warning_low':25, 'error_low':15, 'warning_high':70, 'error_high':85},
    'power_kw': {'warning_high':50, 'error_high':75},
    'energy_kwh': {'warning_high':10000, 'error_high':15000},
    'voltage': {'warning_low':210, 'error_low':200, 'warning_high':250, 'error_high':260},
    'current_a': {'warning_high':60, 'error_high':80},
    'rpm': {'warning_high':1800, 'error_high':2200},
    'flow_lpm': {'warning_low':60, 'error_low':40, 'warning_high':160, 'error_high':200},
    'runtime_hours': {'warning_high':4000, 'error_high':5000},
    'efficiency_pct': {'warning_low':85, 'error_low':75},
}
for key, limits in LIMITS.items():
    METRICS[key]['limits'] = limits

def condition(metric, value, overrides=None):
    limits = {**METRICS.get(metric, {}).get('limits', {}),**(overrides or {}).get(metric,{})}
    for state in ('error', 'warning'):
        if (state+'_low' in limits and value < limits[state+'_low']) or (state+'_high' in limits and value > limits[state+'_high']):
            return state
    return 'good'
