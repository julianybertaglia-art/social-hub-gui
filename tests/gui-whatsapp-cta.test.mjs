import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUI_WHATSAPP_LABEL,
  GUI_WHATSAPP_NUMBER,
  GUI_WHATSAPP_URL,
  upgradeGuiWhatsappNode,
  upgradeGuiWhatsappFlows,
} from '../app/lib/gui-whatsapp-cta.mjs';
import {
  buttonTemplate,
  sanitizeFlows,
  sendNodeToRecipient,
} from '../app/api/instagram/flow-automations/service.js';

test('converts phone and wa.me links without losing long prompt, media, or other URLs', () => {
  const node = upgradeGuiWhatsappNode({
    id: 'prompt',
    text: 'Segue o PROMPT 👇\n\nUm texto longo e o link: https://guilhermenonato.com.br\n\n📲 WhatsApp: (11) 92399-0244\nhttps://wa.me/5511923990244',
    audioPath: 'owner/a.m4a', buttons: [], sharedNext: null,
  });
  assert.equal(node.whatsappButton, true);
  assert.doesNotMatch(node.text, /92399|wa\.me/);
  assert.match(node.text, /Segue o PROMPT/);
  assert.match(node.text, /guilhermenonato.com.br/);
  assert.equal(node.audioPath, 'owner/a.m4a');
  assert.ok(GUI_WHATSAPP_URL.includes(GUI_WHATSAPP_NUMBER));
  assert.equal(GUI_WHATSAPP_LABEL, 'Abrir WhatsApp');
});

test('only turns Gui contact numbers into buttons, not a request for the lead phone', () => {
  const flows = upgradeGuiWhatsappFlows([{ id: 'f1', start: {
    text: 'Deixe seu contato do WhatsApp com DDD.',
    buttons: [{ id: 'b1', next: { text: 'Fale com a minha equipe\n📲 WhatsApp: (11) 92399-0244', buttons: [] } }],
    sharedNext: null,
  } }]);
  assert.equal(flows[0].start.whatsappButton, false);
  assert.equal(flows[0].start.buttons[0].next.whatsappButton, true);
  assert.match(flows[0].start.text, /Deixe seu contato/);
});

test('turns older saved flows into clickable action while preserving inactive branches', () => {
  const flows = sanitizeFlows([{ id: 'stored', name: 'Mentoria', keyword: 'MENTORIA',
    active: true, start: { id: 'root', text: 'Mensagem inicial', responseMode: 'personalized',
      buttons: [{ id: 'ask', label: 'Já vendo', next: {
        id: 'whatsapp-step', text: 'Minha equipe: 📲 WhatsApp: (11) 92399-0244', buttons: [],
      } }],
    },
  }]);
  assert.equal(flows[0].active, true);
  assert.equal(flows[0].start.buttons[0].next.whatsappButton, true);
  assert.doesNotMatch(flows[0].start.buttons[0].next.text, /92399/);
  assert.equal(flows[0].start.buttons[0].next.buttons.length, 0);
});

test('Meta web_url button is a real URL action rather than a postback', () => {
  const flow = { id: 'a' };
  const node = { text: 'Pode falar com a equipe 👇', whatsappButton: true, buttons: [] };
  const message = buttonTemplate(flow, node);
  const [button] = message.attachment.payload.buttons;
  assert.deepEqual(button, { type: 'web_url', title: 'Abrir WhatsApp', url: GUI_WHATSAPP_URL });
  assert.equal(message.attachment.payload.text, node.text);
});

test('keeps both existing branch buttons plus the WhatsApp link', () => {
  const message = buttonTemplate({ id: 'flow' }, {
    text: 'O que você deseja?',
    whatsappButton: true,
    buttons: [{ id: 'yes', label: 'Sim' }, { id: 'no', label: 'Não' }],
  });
  assert.equal(message.attachment.payload.buttons.length, 3);
  assert.equal(message.attachment.payload.buttons[0].type, 'postback');
  assert.equal(message.attachment.payload.buttons[2].type, 'web_url');
});

test('long Direct prompt is sent intact before a separate clickable button', async () => {
  const original = globalThis.fetch;
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ message_id: 'ok' }) };
  };
  process.env.META_INSTAGRAM_ACCESS_TOKEN = 'test-not-secret';
  try {
    const text = 'Texto importante '.repeat(55);
    const node = { text, whatsappButton: true, buttons: [] };
    assert.equal(buttonTemplate({ id: 'a' }, node), null);
    await sendNodeToRecipient(null, '17841401155694295', '123456789', { id: 'a' }, node, { includeAudio: false });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.message.text, text);
    assert.equal(calls[1].body.message.attachment.payload.buttons[0].type, 'web_url');
    assert.equal(calls[1].body.message.attachment.payload.buttons[0].url, GUI_WHATSAPP_URL);
  } finally {
    globalThis.fetch = original;
    if (token === undefined) delete process.env.META_INSTAGRAM_ACCESS_TOKEN;
    else process.env.META_INSTAGRAM_ACCESS_TOKEN = token;
  }
});

test('Mentoria fallback keeps opening and routes directly to WhatsApp without a menu', () => {
  const source = readFileSync(new URL('../app/automacoes/page.js', import.meta.url), 'utf8');
  const start = source.indexOf('const MENTORIA_FLOW = {');
  const end = source.indexOf('const FORNECEDORES_FLOW = {');
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /Me chama no WhatsApp pra eu entender melhor o seu momento/);
  assert.match(block, /whatsappButton: true/);
  assert.match(block, /buttons: \[\]/);
  assert.doesNotMatch(block, /Já vendo · Mentoria|btn-mentoria-comecar/);
  const flow = sanitizeFlows([{ id: 'flow-mentoria-20260930-v2', name: 'Mentoria',
    keyword: 'MENTORIA', active: true,
    start: { text: 'Fala! Vi seu comentário no meu post 👊\n\nMe chama no WhatsApp pra eu entender melhor o seu momento.', whatsappButton: true, buttons: [] },
  }])[0];
  assert.equal(flow.active, true);
  assert.equal(flow.start.buttons.length, 0);
  const template = buttonTemplate(flow, flow.start, { includeAudioAction: true });
  assert.equal(template.attachment.payload.buttons.length, 1);
  assert.equal(template.attachment.payload.buttons[0].type, 'web_url');
  assert.equal(template.attachment.payload.buttons[0].url, GUI_WHATSAPP_URL);
});
