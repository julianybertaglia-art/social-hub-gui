import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractVitalMarmoreComments,
  MARMORE_REPLY_TEXT,
} from '../app/api/vital-connections/instagram/marmore.mjs';

const VITAL = '17841439121395170';
const GUI = '17841401155694295';
function payload(id, text, extras = {}) {
  return { object: 'instagram', entry: [{
    id, changes: [{
      field: 'comments', value: { id: '1799999000111222', text, from: { username: 'compradora' }, ...extras },
    }],
  }] };
}

test('MARMORE comments on the Vital account become private-reply events', () => {
  assert.deepEqual(extractVitalMarmoreComments(payload(VITAL, 'Quero MÁRMORE!')), [{
    accountId: VITAL, commentId: '1799999000111222',
    username: 'compradora', commentText: 'Quero MÁRMORE!',
  }]);
  assert.equal(extractVitalMarmoreComments(payload(VITAL, 'Gostei do marmore')).length, 1);
});

test('Ignores the Gui and unrelated or partial keywords', () => {
  assert.equal(extractVitalMarmoreComments(payload(GUI, 'MARMORE')).length, 0);
  assert.equal(extractVitalMarmoreComments(payload(VITAL, 'marmoreado')).length, 0);
  assert.equal(extractVitalMarmoreComments(payload(VITAL, 'Qual valor?')).length, 0);
  assert.equal(extractVitalMarmoreComments(payload(VITAL, 'MARMORE', { from: { username: 'vitaldecor_' } })).length, 0);
});

test('Ignores old comments outside the permitted seven days', () => {
  const now = Date.now();
  const old = payload(VITAL, 'MARMORE');
  old.entry[0].time = Math.floor((now - 8 * 24 * 60 * 60 * 1000) / 1000);
  assert.equal(extractVitalMarmoreComments(old, now).length, 0);
});

test('One event per distinct comment even for repeated webhook notifications', () => {
  const dup = payload(VITAL, 'MARMORE');
  dup.entry[0].changes.push({ ...dup.entry[0].changes[0] });
  assert.equal(extractVitalMarmoreComments(dup).length, 1);
});

test('DM contains one verified storefront link for the marble models', () => {
  const urls = MARMORE_REPLY_TEXT.match(/https?:\/\/\S+/g) || [];
  assert.deepEqual(urls, ['https://vitaldecor.com.br/search/?q=m%C3%A1rmore']);
  assert.match(MARMORE_REPLY_TEXT, /adesivos de mármore/i);
});

test('Private reply uses a comment id and never sends WhatsApp messages', () => {
  const code = readFileSync(new URL('../app/api/vital-connections/instagram/marmore.mjs', import.meta.url), 'utf8');
  assert.match(code, /recipient: \{ comment_id: commentId \}/);
  assert.match(code, /\.eq\('workspace_id', 'vital-decor'\)/);
  assert.match(code, /\.eq\('platform', 'instagram'\)/);
  assert.doesNotMatch(code, /wa\.me|send-template|\/api\/whatsapp/i);
});

test('Webhook keeps both automations isolated from Gui account', () => {
  const code = readFileSync(new URL('../app/api/instagram/webhook/route.js', import.meta.url), 'utf8');
  assert.match(code, /processVitalInstagramDirect\(payload, db\)/);
  assert.match(code, /processVitalMarmoreComments\(payload, db\)/);
  assert.match(code, /processFlowComments\(guiPayload\)/);
});

