import test from 'node:test';
import assert from 'node:assert/strict';
import { webhookDestination } from '../app/api/vital-connections/helpers.mjs';

const vital = [{
  workspace_id: 'vital-decor',
  platform: 'whatsapp',
  waba_id: 'vital-waba',
  external_account_id: 'vital-phone',
  state: 'connected',
}];
const gui = { phoneNumberId: 'gui-phone', wabaId: 'gui-waba' };

test('Gui inbound events route by phone ID even if WABA changed after Meta reconnect', () => {
  const result = webhookDestination({
    wabaId: 'new-gui-waba',
    value: { metadata: { phone_number_id: 'gui-phone' } },
  }, vital, gui);
  assert.equal(result.target, 'primary');
});

test('Vital inbound events stay with Vital even when the Gui integration is present', () => {
  const result = webhookDestination({
    wabaId: 'vital-waba',
    value: { metadata: { phone_number_id: 'vital-phone' } },
  }, vital, gui);
  assert.equal(result.target, 'vital-decor');
});

test('Unrecognized phone IDs are never mistaken for the Gui number', () => {
  const result = webhookDestination({
    wabaId: 'unknown-waba',
    value: { metadata: { phone_number_id: 'unknown-phone' } },
  }, vital, gui);
  assert.equal(result.target, 'ignore');
});
