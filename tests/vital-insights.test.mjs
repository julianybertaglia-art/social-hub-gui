import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {summarizeGa4,summarizeClarity,readGa4,readClarity,readGtm,normalizeGooglePrivateKey} from '../app/lib/server/vital-insights.mjs';

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

test('GA4 service account signs a valid RSA JWT with exactly three segments',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const env={
    VITAL_GA4_PROPERTY_ID:'123456789',
    VITAL_GA4_SERVICE_EMAIL:'marketing-readonly@example.test',
    VITAL_GA4_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})
  };
  let oauthCalls=0,reportCalls=0;
  const fetcher=async(url,options)=>{
    if(url==='https://oauth2.googleapis.com/token'){
      oauthCalls+=1;
      const assertion=options.body.get('assertion');
      const segments=assertion.split('.');
      assert.equal(segments.length,3,'JWT must be header.payload.signature');
      const payload=JSON.parse(Buffer.from(segments[1],'base64url').toString('utf8'));
      assert.equal(payload.iss,env.VITAL_GA4_SERVICE_EMAIL);
      assert.equal(payload.scope,'https://www.googleapis.com/auth/analytics.readonly');
      assert.equal(verify('RSA-SHA256',Buffer.from(segments[0]+'.'+segments[1]),publicKey,
        Buffer.from(segments[2],'base64url')),true);
      return {ok:true,json:async()=>({access_token:'test-only-token'})};
    }
    assert.match(url,/analyticsdata\.googleapis\.com\/v1beta\/properties\/123456789:runReport/);
    assert.equal(options.headers.Authorization,'Bearer test-only-token');
    reportCalls+=1;
    return {ok:true,json:async()=>({
      metricHeaders:[{name:'sessions'},{name:'totalUsers'},{name:'screenPageViews'},
        {name:'ecommercePurchases'},{name:'purchaseRevenue'}],
      rows:[{metricValues:[{value:'12'},{value:'10'},{value:'19'},{value:'2'},{value:'199.9'}]}]
    })};
  };
  const result=await readGa4(env,fetcher);
  assert.equal(result.status,'ready');
  assert.equal(result.data.sessions,12);
  assert.equal(result.data.purchases,2);
  assert.equal(oauthCalls,1);
  assert.equal(reportCalls,3);
});


test('Google private key normalization supports PEM, escaped PEM and downloaded service-account JSON',()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const pem=privateKey.export({type:'pkcs8',format:'pem'}).trim();
  const email='vital-readonly@example.test';
  const variants=[
    pem,
    pem.replace(/\n/g,'\\n'),
    JSON.stringify(pem),
    JSON.stringify({type:'service_account',client_email:email,private_key:pem})
  ];
  for(const input of variants)assert.equal(normalizeGooglePrivateKey(input,email),pem);
  assert.throws(()=>normalizeGooglePrivateKey('not a key',email),/google_key_format/);
  assert.throws(()=>normalizeGooglePrivateKey(
    JSON.stringify({client_email:'other@example.test',private_key:pem}),email),
    /google_key_email_mismatch/);
});

test('Invalid Google key returns safe, actionable source statuses without contacting Google',async()=>{
  const env={
    VITAL_GA4_PROPERTY_ID:'123456789',
    VITAL_GA4_SERVICE_EMAIL:'vital-readonly@example.test',
    VITAL_GA4_PRIVATE_KEY:'wrong-key',
    VITAL_GTM_ACCOUNT_ID:'123456789',
    VITAL_GTM_CONTAINER_ID:'123456'
  };
  const noNetwork=()=>{throw Error('must not contact Google');};
  assert.deepEqual(await readGa4(env,noNetwork),{status:'unavailable',issue:'google_key_invalid'});
  assert.deepEqual(await readGtm(env,noNetwork),{status:'unavailable',issue:'google_key_invalid'});
});
