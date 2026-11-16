import test from 'node:test';
import assert from 'node:assert/strict';
import {condition,worst,limitLabel} from '../apps/web/lib/metric-condition.ts';
test('strict boundaries, missing data and worst severity',()=>{
 const limits={warning_high:60,error_high:70};
 assert.deepEqual([60,60.1,70,70.1].map(v=>condition(v,limits)),['good','warning','warning','error']);
 for (const v of [undefined,null,NaN]) assert.equal(condition(v,limits),'unknown');
 assert.equal(worst(['good','error','warning']),'error');
 assert.equal(worst([]),'unknown');
 assert.match(limitLabel(limits),/Critical: > 70/);
});
test('low and two-sided thresholds',()=>{
 const limits={warning_low:210,error_low:200,warning_high:250,error_high:260};
 assert.deepEqual([199,200,210,230,250,260,261].map(v=>condition(v,limits)),['error','warning','good','good','good','warning','error']);
});
