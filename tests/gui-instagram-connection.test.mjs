import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUI_INSTAGRAM_ACCOUNT_ID,
  matchesGuiInstagramProfile,
  hasVerifiedGuiConnection,
} from '../app/lib/gui-instagram-connection.mjs';

const verified = { id: GUI_INSTAGRAM_ACCOUNT_ID, username: 'gui_nonato', connected: true };

test('a conta do Gui só aparece conectada após confirmação da identidade pela Meta', () => {
  assert.equal(hasVerifiedGuiConnection(verified), true);
  assert.equal(hasVerifiedGuiConnection({ ...verified, connected: false }), false);
  assert.equal(hasVerifiedGuiConnection({ ...verified, connected: undefined }), false);
  assert.equal(hasVerifiedGuiConnection(null), false);
});

test('um perfil diferente, campos ausentes ou o simples selo visual não confirmam conexão', () => {
  assert.equal(matchesGuiInstagramProfile({ ...verified, id: '123' }), false);
  assert.equal(matchesGuiInstagramProfile({ ...verified, username: 'vitaldecor_' }), false);
  assert.equal(matchesGuiInstagramProfile({ id: GUI_INSTAGRAM_ACCOUNT_ID }), false);
  assert.equal(hasVerifiedGuiConnection({ ...verified, id: '123' }), false);
  assert.equal(matchesGuiInstagramProfile({ ...verified, username: '@GUI_NONATO' }), true);
});
