import test from 'node:test';
import assert from 'node:assert/strict';
import {chartRows} from '../apps/web/lib/telemetry-chart.ts';
test('aligns multiple metric series and retains original tooltip values',()=>{
 const rows=chartRows({temperature:[{timestamp:'2026-10-13T01:00:00Z',value:50},{timestamp:'2026-10-13T02:00:00Z',value:100}],rpm:[{timestamp:'2026-10-13T01:00:00Z',value:1000},{timestamp:'2026-10-13T02:00:00Z',value:2000}]},true);
 assert.equal(rows.length,2);assert.equal(rows[0].temperature,0);assert.equal(rows[1].rpm,100);assert.equal(rows[1].raw.rpm,2000);
});
test('does not invent zero readings for gaps and handles constants',()=>{
 const rows=chartRows({voltage:[{timestamp:'b',value:230}],temperature:[{timestamp:'a',value:12},{timestamp:'b',value:NaN}]},true);
 assert.equal(rows[0].timestamp,'a');assert.equal(rows[0].voltage,undefined);assert.equal(rows[1].voltage,50);assert.equal(rows[1].temperature,undefined);
});
test('single metric uses its original engineering values',()=>{
 assert.equal(chartRows({power_kw:[{timestamp:'a',value:1450}]},false)[0].power_kw,1450);
 assert.deepEqual(chartRows({},true),[]);
});
