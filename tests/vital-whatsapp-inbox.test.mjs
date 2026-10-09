import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canReplyWithinWindow, summarizeVitalConversations, presentVitalMessage,
  WHATSAPP_REPLY_WINDOW_MS,
} from '../app/api/vital-whatsapp/conversations/inbox.mjs';

const NOW = Date.parse('2026-10-09T15:00:00Z');

test('manual WhatsApp reply must be within 24h after inbound message', () => {
  assert.equal(canReplyWithinWindow(new Date(NOW - 30 * 60_000).toISOString(), NOW), true);
  assert.equal(canReplyWithinWindow(new Date(NOW - WHATSAPP_REPLY_WINDOW_MS).toISOString(), NOW), false);
  assert.equal(canReplyWithinWindow(new Date(NOW - WHATSAPP_REPLY_WINDOW_MS + 5000).toISOString(), NOW), false);
  assert.equal(canReplyWithinWindow(null, NOW), false);
  assert.equal(canReplyWithinWindow('invalid', NOW), false);
});

test('Vital inbox orders conversations, deduplicates contacts, exposes only safe message fields', () => {
  const rows = [
    { id: 'm1', contact_wa_id: '5511900000011', profile_name: 'Pessoa A', direction: 'inbound',
      body: 'Oi', sent_at: '2026-10-09T14:30:00Z', message_type: 'text', status: 'received' },
    { id: 'm2', contact_wa_id: '5511900000011', profile_name: null, direction: 'outbound',
      body: 'Olá', sent_at: '2026-10-09T14:35:00Z', message_type: 'text', status: 'sent' },
    { id: 'm3', contact_wa_id: '5511900000022', profile_name: 'Pessoa B', direction: 'inbound',
      body: 'Tudo bem', sent_at: '2026-10-08T08:00:00Z', message_type: 'text', status: 'received' },
  ];
  const result = summarizeVitalConversations(rows, NOW);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Pessoa A');
  assert.equal(result[0].messageCount, 2);
  assert.equal(result[0].lastMessage, 'Olá');
  assert.equal(result[0].canReply, true);
  assert.equal(result[1].canReply, false);
  assert.deepEqual(presentVitalMessage({ ...rows[0], raw_payload: { secret: 'never return' } }),
    { id: 'm1', phone: '5511900000011', direction: 'inbound', type: 'text',
      body: 'Oi', status: 'received', sentAt: '2026-10-09T14:30:00Z' });
});

test('vital inbox and send route are scoped to owner and workspace, never use Gui sender', () => {
  const getRoute = readFileSync(new URL('../app/api/vital-whatsapp/conversations/route.js', import.meta.url), 'utf8');
  const sendRoute = readFileSync(new URL('../app/api/vital-whatsapp/conversations/send/route.js', import.meta.url), 'utf8');
  const frame = readFileSync(new URL('../app/HubFrame.js', import.meta.url), 'utf8');
  for (const route of [getRoute, sendRoute]) {
    assert.match(route, /authorize\(request\)/);
    assert.match(route, /eq\('owner_user_id', ownerId\)/);
    assert.match(route, /eq\('workspace_id', 'vital-decor'\)/);
    assert.match(route, /eq\('platform', 'whatsapp'\)/);
  }
  assert.match(sendRoute, /canReplyWithinWindow\(lastInbound\?\.sent_at\)/);
  assert.match(sendRoute, /connection\.access_token/);
  assert.doesNotMatch(sendRoute, /sendWhatsAppText\(/);
  assert.match(frame, /pathname === '\/whatsapp'/);
  assert.match(frame, /<VitalWhatsAppInbox \/>/);
});
