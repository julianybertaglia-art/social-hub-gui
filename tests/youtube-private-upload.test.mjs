import test from 'node:test';
import assert from 'node:assert/strict';
import {YOUTUBE_UPLOAD_BUCKET,YOUTUBE_UPLOAD_MAX,YOUTUBE_MIME_TYPES,uploadPublicRow} from '../app/lib/youtube-upload.mjs';

test('uploads are restricted to a dedicated private bucket and supported video types',()=>{
  assert.equal(YOUTUBE_UPLOAD_BUCKET,'tide-youtube-videos');
  assert.equal(YOUTUBE_UPLOAD_MAX,50000000);
  assert.deepEqual(YOUTUBE_MIME_TYPES,['video/mp4','video/webm','video/quicktime']);
});

test('upload history omits private storage object path and account credentials',()=>{
  const row={id:'a1',title:'Vídeo privado',description:'Teste',state:'uploaded_private',
    youtube_video_id:'id-123',created_at:'2026-10-27T12:00:00Z',
    storage_path:'private/secret',mime_type:'video/mp4',size_bytes:500,
    owner_user_id:'owner',access_token_ciphertext:'sensitive',error_message:null};
  const publicRow=uploadPublicRow(row);
  assert.deepEqual(publicRow,{id:'a1',title:'Vídeo privado',description:'Teste',state:'uploaded_private',
    videoId:'id-123',createdAt:'2026-10-27T12:00:00Z',error:null});
});
