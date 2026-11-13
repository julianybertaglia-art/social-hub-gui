import test from 'node:test';
import assert from 'node:assert/strict';
import {tikTokUploadPlan,safeUploadUrl} from '../app/lib/tiktok-posting.mjs';

for(const size of [1,4_000_000,5_000_000,5_500_000,9_999_999,10_000_000,10_000_001,31_036_859,50_000_000]){
 test('TikTok upload plan covers each byte exactly for '+size,()=>{
   const plan=tikTokUploadPlan(size);
   assert.equal(plan.videoSize,size);
   assert.equal(plan.parts.length,plan.totalChunkCount);
   assert.equal(plan.totalChunkCount,Math.floor(size/plan.chunkSize));
   let next=0,sum=0;
   plan.parts.forEach((part,i)=>{
     assert.equal(part.index,i);
     assert.equal(part.start,next);
     assert.equal(part.end-part.start,part.size);
     assert.ok(part.size>=5_000_000||size<5_000_000);
     assert.ok(part.size<=128_000_000);
     assert.equal(part.last,i===plan.parts.length-1);
     next=part.end;sum+=part.size;
   });
   assert.equal(next,size);assert.equal(sum,size);
 });
}
test('31MB file uses exactly three 10MB-based parts, not 5MB boundary chunks',()=>{
 const plan=tikTokUploadPlan(31_036_859);
 assert.equal(plan.totalChunkCount,3);
 assert.equal(plan.chunkSize,10_000_000);
 assert.equal(plan.parts[0].start,0);
 assert.equal(plan.parts[0].end,10_000_000);
 assert.equal(plan.parts[1].start,10_000_000);
 assert.equal(plan.parts[1].end,20_000_000);
 assert.equal(plan.parts[2].start,20_000_000);
 assert.equal(plan.parts[2].end,31_036_859);
 assert.equal(plan.parts[2].size,11_036_859);
});
test('TikTok upload plan rejects oversized and invalid files',()=>{
 for(const size of [0,-1,50_000_001,Infinity,NaN,1.5])
  assert.throws(()=>tikTokUploadPlan(size));
});
test('TikTok signed upload URL only targets documented HTTPS hosts',()=>{
 const valid=[
  'https://open-upload.tiktokapis.com/video/?upload_id=10&upload_token=private',
  'https://upload.us.tiktokapis.com/video/?upload_id=12&upload_token=private',
  'https://open-upload-va.tiktokapis.com/video/?upload_id=13&upload_token=private',
  'https://upload.eu.tiktokapis.com/video/?upload_id=14&upload_token=private',
  'https://open-upload-us.tiktokapis.com/video/?upload_id=15&upload_token=private'
 ];
 valid.forEach(url=>assert.equal(safeUploadUrl(url),url));
 for(const url of [
  'https://open-upload.tiktokapis.com.evil.org/video/?token=secret',
  'http://open-upload.tiktokapis.com/video',
  'https://internal.example.org/',
  'https://x@open-upload.tiktokapis.com/video',
  'https://notupload.tiktokapis.com/video/?upload_token=private',
  'https://upload.evil.tiktokapis.com.evil.org/video',
  'https://upload.tiktokcdn.com/video/?upload_token=private',
  'https://upload.tiktokapis.com:8443/video/?upload_token=private',
  'https://upload.tiktokapis.com/video/#redirect',
  'https://upload.tiktokapis.com.evil.org/video'
 ])assert.throws(()=>safeUploadUrl(url));
 const refusal='https://upload.evil.example/video/?upload_token=SECRET_UPLOAD_TOKEN';
 assert.throws(()=>safeUploadUrl(refusal),error=>{
   assert.equal(error.status,502);
   assert.ok(error.message.includes('upload.evil.example'));
   assert.ok(!error.message.includes('SECRET_UPLOAD_TOKEN'));
   return true;
 });
});
