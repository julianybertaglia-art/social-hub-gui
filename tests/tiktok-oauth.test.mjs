import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIKTOK_WORKSPACE,TIKTOK_REDIRECT_URI,TIKTOK_SCOPE_BASIC,TIKTOK_SCOPE_POSTING,
  newTikTokState,digestTikTokState,equalTikTokState,buildTikTokAuthUrl,
  tiktokPublicStatus,encryptTikTokToken,decryptTikTokToken,tiktokConfigured,
} from '../app/lib/tiktok-oauth.mjs';

test('TikTok OAuth state is high entropy and checked without accepting mismatches',()=>{
  const a=newTikTokState(),b=newTikTokState();
  assert.notEqual(a,b);
  assert.ok(a.length>=40);
  assert.equal(digestTikTokState(a).length,64);
  assert.equal(equalTikTokState(a,a),true);
  assert.equal(equalTikTokState(a,b),false);
  assert.equal(equalTikTokState(a,''),false);
  assert.equal(equalTikTokState('abc','abc'),false);
});
test('TidePlace OAuth uses exact official callback and least scopes by default',()=>{
  const oldKey=process.env.TIKTOK_CLIENT_KEY;
  const oldSecret=process.env.TIKTOK_CLIENT_SECRET;
  const oldEncryption=process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;
  try{
    process.env.TIKTOK_CLIENT_KEY='local-test-only';
    process.env.TIKTOK_CLIENT_SECRET='local-secret-only';
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');
    const u=new URL(buildTikTokAuthUrl('test-state'));
    assert.equal(u.host,'www.tiktok.com');
    assert.equal(u.pathname,'/v2/auth/authorize/');
    assert.equal(u.searchParams.get('redirect_uri'),TIKTOK_REDIRECT_URI);
    assert.equal(u.searchParams.get('scope'),'user.info.basic');
    assert.equal(u.searchParams.get('state'),'test-state');
    assert.equal(TIKTOK_WORKSPACE,'gui-nonato');
    assert.deepEqual(TIKTOK_SCOPE_BASIC,['user.info.basic']);
    assert.deepEqual(TIKTOK_SCOPE_POSTING,['user.info.basic','video.upload','video.publish']);
    assert.equal(tiktokConfigured(),true);
    const token='act.dummy-for-local-test-only';
    assert.equal(decryptTikTokToken(encryptTikTokToken(token)),token);
    assert.notEqual(encryptTikTokToken(token),encryptTikTokToken(token));
  }finally{
    if(oldKey===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=oldKey;
    if(oldSecret===undefined)delete process.env.TIKTOK_CLIENT_SECRET;else process.env.TIKTOK_CLIENT_SECRET=oldSecret;
    if(oldEncryption===undefined)delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;else process.env.TIKTOK_TOKEN_ENCRYPTION_KEY=oldEncryption;
  }
});
test('Public TikTok status never returns access or refresh tokens',()=>{
  const row={open_id:'test_open_id',display_name:'Gui',avatar_url:'https://example.com/avatar',
    oauth_scopes:['user.info.basic'],connected_at:'2026-10-27T12:00:00Z',
    access_expires_at:'2026-10-28T12:00:00Z',access_token_ciphertext:'SECRET',
    refresh_token_ciphertext:'SECRET2'};
  const data=tiktokPublicStatus(row);
  assert.equal(data.connected,true);
  assert.equal(data.displayName,'Gui');
  assert.equal(JSON.stringify(data).includes('SECRET'),false);
});

test('Sandbox authorization selects its own Client Key and never overwrites production credentials',()=>{
  const old={
    key:process.env.TIKTOK_CLIENT_KEY,secret:process.env.TIKTOK_CLIENT_SECRET,
    sandboxKey:process.env.TIKTOK_SANDBOX_CLIENT_KEY,sandboxSecret:process.env.TIKTOK_SANDBOX_CLIENT_SECRET,
    encryption:process.env.TIKTOK_TOKEN_ENCRYPTION_KEY,
  };
  try {
    process.env.TIKTOK_CLIENT_KEY='production-example-only';
    process.env.TIKTOK_CLIENT_SECRET='production-secret-only';
    process.env.TIKTOK_SANDBOX_CLIENT_KEY='sandbox-example-only';
    process.env.TIKTOK_SANDBOX_CLIENT_SECRET='sandbox-secret-only';
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,3).toString('base64url');
    const production=new URL(buildTikTokAuthUrl('production-test'));
    const sandbox=new URL(buildTikTokAuthUrl('sandbox-test',TIKTOK_SCOPE_BASIC,'sandbox'));
    assert.equal(production.searchParams.get('client_key'),'production-example-only');
    assert.equal(sandbox.searchParams.get('client_key'),'sandbox-example-only');
    assert.equal(sandbox.searchParams.get('redirect_uri'),TIKTOK_REDIRECT_URI);
    assert.equal(sandbox.searchParams.get('scope'),'user.info.basic');
    assert.equal(tiktokConfigured('sandbox'),true);
    assert.equal(tiktokConfigured('unknown'),false);
  } finally {
    const keys={key:'TIKTOK_CLIENT_KEY',secret:'TIKTOK_CLIENT_SECRET',
      sandboxKey:'TIKTOK_SANDBOX_CLIENT_KEY',sandboxSecret:'TIKTOK_SANDBOX_CLIENT_SECRET',
      encryption:'TIKTOK_TOKEN_ENCRYPTION_KEY'};
    for(const [k,env] of Object.entries(keys)){
      if(old[k]===undefined) delete process.env[env]; else process.env[env]=old[k];
    }
  }
});
