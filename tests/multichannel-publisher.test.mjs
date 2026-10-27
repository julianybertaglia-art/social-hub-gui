import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTargetPlatforms,requireUuid,publicTarget,publicPost,
  PUBLISH_BUCKET,PUBLISH_PLATFORMS,PUBLISH_MAX_BYTES
} from '../app/lib/multichannel-publisher.mjs';

test('multichannel publication selection allows three distinct networks',()=>{
  assert.deepEqual(validateTargetPlatforms(['youtube','instagram','tiktok']),['youtube','instagram','tiktok']);
  assert.throws(()=>validateTargetPlatforms([]));
  assert.throws(()=>validateTargetPlatforms(['youtube','youtube']));
  assert.throws(()=>validateTargetPlatforms(['instagram','whatsapp']));
  assert.deepEqual(PUBLISH_PLATFORMS,['instagram','youtube','tiktok']);
});
test('only correctly formatted job UUIDs are accepted',()=>{
  const id='25e19af0-03cc-44d2-b95d-2d9a1f20e451';
  assert.equal(requireUuid(id),id);
  assert.throws(()=>requireUuid('../delete'));
  assert.throws(()=>requireUuid(''));
});
test('serialized public history excludes storage paths and owner credentials',()=>{
  const row={id:'sample',title:'Shorts test',caption:'Test description',
    created_at:'2026-10-27T12:00:00Z',storage_path:'secret/private/example.mp4',
    owner_user_id:'private',multichannel_post_targets:[
      {platform:'youtube',state:'private',external_id:'short123',
       error_message:null,updated_at:'2026-10-27T12:00:00Z'},
      {platform:'tiktok',state:'pending_approval',external_id:null,
       error_message:'Awaiting review',updated_at:'2026-10-27T12:00:00Z'}]};
  const publicRow=publicPost(row);
  assert.equal(publicRow.targets.length,2);
  assert.equal(publicRow.targets[0].state,'private');
  assert.equal(publicRow.targets[1].state,'pending_approval');
  assert.equal(JSON.stringify(publicRow).includes('storage_path'),false);
  assert.equal(JSON.stringify(publicRow).includes('secret/private'),false);
  assert.equal(PUBLISH_BUCKET,'tide-multichannel-videos');
  assert.equal(PUBLISH_MAX_BYTES,50000000);
});
