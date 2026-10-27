import test from 'node:test';
import assert from 'node:assert/strict';
import {
  YOUTUBE_REDIRECT_URI, YOUTUBE_SCOPES, buildYoutubeAuthUrl,
  digestOauthState, newOauthState, encryptYoutubeToken, decryptYoutubeToken,
  youtubePublicStatus,
} from '../app/lib/youtube-oauth.mjs';

const original = {
  id: process.env.YOUTUBE_CLIENT_ID,
  secret: process.env.YOUTUBE_CLIENT_SECRET,
  key: process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY,
};
test('Google OAuth URL requests publishing, comments and offline consent', () => {
  process.env.YOUTUBE_CLIENT_ID = 'fake-id.apps.googleusercontent.com';
  process.env.YOUTUBE_CLIENT_SECRET = 'fake-secret';
  process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64url');
  try {
    const state = newOauthState();
    const u = new URL(buildYoutubeAuthUrl(state));
    assert.equal(u.origin, 'https://accounts.google.com');
    assert.equal(u.searchParams.get('state'), state);
    assert.equal(u.searchParams.get('redirect_uri'), YOUTUBE_REDIRECT_URI);
    assert.equal(u.searchParams.get('access_type'), 'offline');
    assert.equal(u.searchParams.get('prompt'), 'consent');
    YOUTUBE_SCOPES.forEach((scope) => assert.ok(u.searchParams.get('scope').includes(scope)));
    assert.match(digestOauthState(state), /^[0-9a-f]{64}$/);
    assert.notEqual(digestOauthState(newOauthState()), digestOauthState(state));
  } finally { Object.assign(process.env, {
    YOUTUBE_CLIENT_ID: original.id || '', YOUTUBE_CLIENT_SECRET: original.secret || '',
    YOUTUBE_TOKEN_ENCRYPTION_KEY: original.key || '',
  }); }
});

test('credentials are encrypted with authenticated AES-256-GCM', () => {
  process.env.YOUTUBE_CLIENT_ID = 'test';
  process.env.YOUTUBE_CLIENT_SECRET = 'test';
  process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64url');
  try {
    const token = 'sensitive-access-token';
    const ciphertext = encryptYoutubeToken(token);
    assert.ok(!ciphertext.includes(token));
    assert.equal(decryptYoutubeToken(ciphertext), token);
    assert.throws(() => decryptYoutubeToken(ciphertext.slice(0, -2) + 'xQ'));
  } finally { Object.assign(process.env, {
    YOUTUBE_CLIENT_ID: original.id || '', YOUTUBE_CLIENT_SECRET: original.secret || '',
    YOUTUBE_TOKEN_ENCRYPTION_KEY: original.key || '',
  }); }
});

test('public status excludes tokens and internal database fields', () => {
  assert.deepEqual(youtubePublicStatus(null), { connected: false });
  const row = { channel_id: 'UCabc', channel_title: 'Gui Nonato', channel_thumbnail: null,
    connected_at: '2026-10-27T12:00:00Z', access_expires_at: '2026-10-27T13:00:00Z',
    refresh_token_ciphertext: 'secret-value' };
  const status = youtubePublicStatus(row);
  assert.equal(status.channelId, 'UCabc');
  assert.equal(status.connected, true);
  assert.ok(!JSON.stringify(status).includes('secret-value'));
});
