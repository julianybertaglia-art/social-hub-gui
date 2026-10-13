import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mostRecentInboundAt,
  isWhatsAppServiceWindowOpen,
  isSimpleApprovedWhatsAppTemplate,
  whatsappFailureDescription,
} from '../app/api/whatsapp/service-window.js';

test('only real inbound messages open the 24-hour window', () => {
  const now = Date.UTC(2026, 9, 13, 13);
  const old = new Date(now - 25 * 3600000).toISOString();
  const recent = new Date(now - 60 * 60000).toISOString();
  assert.equal(mostRecentInboundAt([
    { direction: 'outbound', sent_at: new Date(now).toISOString() },
    { direction: 'inbound', sent_at: old },
    { direction: 'inbound', sent_at: recent },
  ]), recent);
  assert.equal(isWhatsAppServiceWindowOpen(recent, now), true);
  assert.equal(isWhatsAppServiceWindowOpen(old, now), false);
  assert.equal(isWhatsAppServiceWindowOpen(null, now), false);
  assert.equal(isWhatsAppServiceWindowOpen(new Date(now + 3600000).toISOString(), now), false);
});

test('only approved simple templates without variables are available for one-click sending', () => {
  const base = { status: 'APPROVED', name: 'retomar_atendimento', language: 'pt_BR',
    components: [{ type: 'BODY', text: 'Olá! Quer retomar seu atendimento?' }] };
  assert.equal(isSimpleApprovedWhatsAppTemplate(base), true);
  assert.equal(isSimpleApprovedWhatsAppTemplate({ ...base, status: 'PENDING' }), false);
  assert.equal(isSimpleApprovedWhatsAppTemplate({ ...base, components: [{ type: 'BODY', text: 'Olá {{1}}' }] }), false);
  assert.equal(isSimpleApprovedWhatsAppTemplate({ ...base, components: [...base.components, { type: 'HEADER', format: 'IMAGE' }] }), false);
});

test('Meta asynchronous 131047 errors give an actionable explanation', () => {
  const msg = { status: 'failed', raw_payload: { meta_status: { errors: [{ code: 131047 }] } } };
  assert.match(whatsappFailureDescription(msg), /24h/);
  assert.equal(whatsappFailureDescription({ status: 'delivered' }), null);
});
