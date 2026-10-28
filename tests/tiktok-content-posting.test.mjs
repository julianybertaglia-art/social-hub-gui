import test from 'node:test';
import assert from 'node:assert/strict';
import {tiktokPostingConfigured,safeUploadUrl} from '../app/lib/tiktok-posting.mjs';
import {TIKTOK_SCOPE_POSTING,buildTikTokAuthUrl,tiktokConfigured} from '../app/lib/tiktok-oauth.mjs';

test('Sandbox requests all three scopes independently of production',()=>{
  const names=['TIKTOK_SANDBOX_CLIENT_KEY','TIKTOK_SANDBOX_CLIENT_SECRET','TIKTOK_TOKEN_ENCRYPTION_KEY'];
  const old=names.map(n=>process.env[n]);
  try{
    process.env.TIKTOK_SANDBOX_CLIENT_KEY='fake-sandbox-key';
    process.env.TIKTOK_SANDBOX_CLIENT_SECRET='fake-sandbox-secret';
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,5).toString('base64url');
    assert.equal(tiktokConfigured('sandbox'),true);
    const url=new URL(buildTikTokAuthUrl('test-state',TIKTOK_SCOPE_POSTING,'sandbox'));
    assert.equal(url.searchParams.get('client_key'),'fake-sandbox-key');
    assert.equal(url.searchParams.get('scope'),'user.info.basic,video.upload,video.publish');
    assert.equal(url.searchParams.get('redirect_uri'),'https://social-hub-gui.vercel.app/api/tiktok/callback');
  }finally{names.forEach((n,i)=>old[i]===undefined?delete process.env[n]:process.env[n]=old[i]);}
});
test('TikTok draft capability requires video.upload, not basic or publish-only',()=>{
 assert.equal(tiktokPostingConfigured(['user.info.basic']),false);
 assert.equal(tiktokPostingConfigured(['user.info.basic','video.publish']),false);
 assert.equal(tiktokPostingConfigured(['user.info.basic','video.upload']),true);
});
test('TikTok upload URL must be HTTPS on an official upload host; no SSRF',()=>{
 assert.equal(safeUploadUrl('https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=xyz'),
  'https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=xyz');
 assert.equal(safeUploadUrl('https://upload.us.tiktokapis.com/video/?upload_id=1'),
  'https://upload.us.tiktokapis.com/video/?upload_id=1');
 for(const url of [
  'http://open-upload.tiktokapis.com/video',
  'https://evil.com/video',
  'https://open-upload.tiktokapis.com.evil.net/video',
  'https://127.0.0.1/video',
  'https://username@open-upload.tiktokapis.com/upload',
  'file:///etc/passwd',
 ])assert.throws(()=>safeUploadUrl(url));
});
