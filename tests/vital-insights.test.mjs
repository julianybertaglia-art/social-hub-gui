import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeGa4,summarizeClarity,readGa4,readClarity} from '../app/lib/server/vital-insights.mjs';

test('GA4 maps metrics by header, never invents missing values',()=>{
  const result=summarizeGa4({metricHeaders:[{name:'sessions'},{name:'purchaseRevenue'},{name:'totalUsers'}],
    rows:[{metricValues:[{value:'103'},{value:'1200.50'},{value:'64'}]}]});
  assert.equal(result.sessions,103);
  assert.equal(result.users,64);
  assert.equal(result.purchaseRevenue,1200.5);
  assert.equal(result.purchases,null);
  assert.equal(result.pageViews,null);
});
test('Clarity sums device rows, preserves limited reporting period',()=>{
  const result=summarizeClarity([{metricName:'Traffic',information:[
    {Device:'Mobile',totalSessionCount:'12',totalBotSessionCount:'2'},
    {Device:'PC',totalSessionCount:'8',totalBotSessionCount:'1'}
  ]}]);
  assert.equal(result.sessions,20);assert.equal(result.botSessions,3);
  assert.equal(result.devices.length,2);
  assert.match(result.period,/72 horas/);
});
test('Clarity does not claim data when response is empty',()=>{
  assert.equal(summarizeClarity([]),null);
});
test('missing credentials never invoke either external provider',async()=>{
  const fetcher=()=>{throw Error('Unexpected network call');};
  assert.deepEqual(await readGa4({},fetcher),{status:'not_configured'});
  assert.deepEqual(await readClarity({},fetcher),{status:'not_configured'});
});
