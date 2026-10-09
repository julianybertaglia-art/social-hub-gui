import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VITAL_WELCOME_TEXT, VITAL_WHATSAPP, VITAL_WHATSAPP_LINK,
} from '../app/lib/vital-direct-copy.mjs';
import {
  VITAL_WHATSAPP_LINK as SENT_LINK,
  VITAL_WELCOME_TEXT as SENT_COPY,
  extractVitalDirectMessages,
} from '../app/api/vital-connections/instagram/direct.mjs';

test('Instagram Direct preview exactly matches what backend sends', () => {
  assert.equal(VITAL_WELCOME_TEXT, SENT_COPY);
  assert.equal(VITAL_WHATSAPP_LINK, SENT_LINK);
  assert.equal(VITAL_WHATSAPP, '5511965765247');
  assert.match(VITAL_WELCOME_TEXT, /Vital Decor/);
  assert.match(VITAL_WHATSAPP_LINK, /^https:\/\/wa\.me\/5511965765247\?text=/);
});

test('Vital workspace Instagram automations route opens the real panel', () => {
  const source = readFileSync(new URL('../app/HubFrame.js', import.meta.url), 'utf8');
  assert.match(source, /workspace\.id === 'gui-nonato' \? children/);
  assert.match(source, /pathname === '\/automacoes' \? \(\s*<VitalInstagramAutomationPanel\s*\/>/);
  assert.match(source, /pathname === '\/whatsapp\/automacoes' \? \(\s*<ViviAutomationPanel\s*\/>/);
});

test('Direct does not intercept other Instagram account messages', () => {
  const gui = '17841401155694295';
  const vital = '17841439121395170';
  const entry = (account) => ({ id: account, messaging: [{
    sender: { id: '111222333444555' },
    message: { mid: 'mid-test', text: 'Olá' },
  }] });
  const events = extractVitalDirectMessages({ object: 'instagram', entry: [entry(gui), entry(vital)] });
  assert.equal(events.length, 1);
  assert.equal(events[0].accountId, vital);
});
