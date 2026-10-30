import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSULTORIA_DIRECT, CONSULTORIA_URL, validateConsultoria } from '../app/lib/consultoria.mjs';
import { formTicket, verifyTicket } from '../app/consultoria/security.mjs';
import { consultoriaHtml } from '../app/consultoria/html.mjs';
import { saveConsultoria } from '../app/consultoria/service.mjs';
import { GET as publicGet, POST as publicPost } from '../app/consultoria/route.js';
import { GET as privateGet, PATCH as privatePatch } from '../app/api/consultoria/route.js';
import { extractConsultoriaDirectMessages, processConsultoriaDirectKeywords } from '../app/api/instagram/flow-automations/direct.mjs';
import { buttonTemplate, processFlowComments } from '../app/api/instagram/flow-automations/service.js';

const values = () => ({ name: 'Pessoa de teste', phone: '(11) 99999-0000', instagram: '@teste.seller',
  experience: 'seller', revenue: '50k_100k', product: 'Casa e decoração', challenge: 'Vendo, mas tenho dificuldade para calcular a margem dos anúncios.',
  recording: 'discuss', consent: 'yes', storeUrl: 'https://www.mercadolivre.com.br/pagina/lojateste' });
const gui = '17841401155694295', sender = '1200000011112222';
const payload = (text, account = gui, props = {}) => ({ object: 'instagram', entry: [{ id: account, messaging: [{ sender: { id: sender }, recipient: { id: account }, timestamp: Date.now(), message: { mid: 'mid.consultoria', text, ...props } }] }] });
const flow = { id: 'flow-consultoria-20261022', name: 'Consultoria gratuita', keyword: 'CONSULTORIA', active: true,
  publicReplies: [], start: { id: 'start', text: CONSULTORIA_DIRECT, buttons: [], responseMode: 'same' } };

test('normalizes contacts, preserves candidacy context and keeps marketing optional', () => {
  const a = validateConsultoria(values());
  assert.equal(a.phone, '5511999990000'); assert.equal(a.instagram, 'teste.seller');
  assert.equal(a.segment, 'seller'); assert.equal(a.marketing_opt_in, false); assert.equal(a.recording, 'discuss');
  assert.equal(validateConsultoria({ ...values(), experience: 'zero', revenue: 'none' }).segment, 'beginner');
  assert.equal(validateConsultoria({ ...values(), marketing: 'yes' }).marketing_opt_in, true);
});
test('rejects invalid contacts, invented answers, missing consent and unsafe shop links', () => {
  for (const change of [{ phone: '00000000000' }, { instagram: '<script>' }, { experience: 'admin' },
    { revenue: 'million' }, { consent: 'no' }, { recording: 'maybe' }, { challenge: 'oi' },
    { experience: 'zero', revenue: '500k_plus' }, { storeUrl: 'javascript:alert(1)' },
    { storeUrl: 'https://mercadolivre.com.br.evil.example' }]) {
    assert.throws(() => validateConsultoria({ ...values(), ...change }));
  }
});
test('signed form tickets reject tampering, a different secret, expiry and future timestamps', () => {
  const now = Date.now(), ticket = formTicket('test-secret', now);
  assert.match(verifyTicket(ticket, 'test-secret', now), /^[0-9a-f-]{36}$/);
  assert.throws(() => verifyTicket(ticket, 'another-secret', now));
  assert.throws(() => verifyTicket(ticket.replace(/.$/, ticket.endsWith('0') ? '1' : '0'), 'test-secret', now));
  assert.throws(() => verifyTicket(ticket, 'test-secret', now + 3 * 3600000));
  assert.throws(() => verifyTicket(ticket, 'test-secret', now - 1));
});
test('form escapes retained answers and errors and consistently discloses the selection and 30 minutes', () => {
  const html = consultoriaHtml({ ticket: 'ticket', values: { name: '"><script>alert(1)</script>', challenge: '</textarea><script>bad</script>' }, error: '<img src=x onerror=bad>' });
  assert.doesNotMatch(html, /<script>|<img src=x|name="challenge"[^]*?<\/textarea><script>/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /30 minutos/); assert.match(html, /não garante a vaga/);
  assert.doesNotMatch(html, /1 hora|60 minutos/);
  assert.match(consultoriaHtml({ success: true }), /Candidatura recebida/);
  assert.doesNotMatch(consultoriaHtml({ success: true }), /<form/);
  assert.match(CONSULTORIA_DIRECT, /vagas são limitadas/); assert.match(CONSULTORIA_DIRECT, /não garante a vaga/);
  assert.ok(CONSULTORIA_DIRECT.includes(CONSULTORIA_URL)); assert.ok(CONSULTORIA_DIRECT.length < 1000);
});
test('duplicate submissions never overwrite the previous application or its review', async () => {
  let inserts = 0;
  const db = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count: 1 }) }) }),
    insert: async row => { inserts++; assert.equal(row.owner_id, 'd3db0981-1179-459e-9449-9e97232f6632'); return { error: { code: '23505' } }; },
  }) };
  assert.deepEqual(await saveConsultoria(db, validateConsultoria(values()), { id: 'id', fingerprint: 'hash' }), { ok: true });
  assert.equal(inserts, 1);
});
test('rate-limited form submissions cannot write another candidacy', async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ count: 5 }) }) }),
    insert: () => { throw new Error('must not insert'); } }) };
  await assert.rejects(() => saveConsultoria(db, validateConsultoria(values()), { id: 'id', fingerprint: 'hash' }), error => error.status === 429);
});
test('public form is unauthenticated but rejects cross-origin, unsigned, overlarge and non-form writes', async () => {
  const url = 'https://social-hub-gui.vercel.app/consultoria';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.SUPABASE_SERVICE_ROLE_KEY = 'form-test-secret';
  try {
    const page = await publicGet(); assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await page.text(), /name="ticket"/);
    assert.equal((await publicPost(new Request(url, { method: 'POST', headers: { origin: 'https://evil.example' }, body: new URLSearchParams({ ticket: 'invalid' }) }))).status, 403);
    assert.equal((await publicPost(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 415);
    assert.equal((await publicPost(new Request(url, { method: 'POST', body: new URLSearchParams({ ticket: 'invalid' }) }))).status, 403);
    assert.equal((await publicPost(new Request(url, { method: 'POST', body: new URLSearchParams({ name: 'x'.repeat(18000) }) }))).status, 413);
    assert.equal((await publicPost(new Request(url, { method: 'POST', body: new URLSearchParams({ company_site: 'spam' }) }))).status, 200);
  } finally { if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = key; }
});
test('listing and reviewing applicants require authentication before any data is queried', async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    const get = await privateGet(new Request('https://example.test/api/consultoria'));
    assert.equal(get.status, 401); assert.equal((await get.json()).applications, undefined);
    assert.equal((await privatePatch(new Request('https://example.test/api/consultoria', { method: 'PATCH', body: '{}' }))).status, 401);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
test('CONSULTORIA keyword is bounded, inbound-only and exclusive to Gui', () => {
  assert.equal(extractConsultoriaDirectMessages(payload('quero consultoria!')).length, 1);
  assert.equal(extractConsultoriaDirectMessages(payload('consultorias')).length, 0);
  assert.equal(extractConsultoriaDirectMessages(payload('CONSULTORIA', '17841439121395170')).length, 0);
  assert.equal(extractConsultoriaDirectMessages(payload('CONSULTORIA', gui, { is_echo: true })).length, 0);
  assert.equal(extractConsultoriaDirectMessages(payload('CONSULTORIA', gui, { quick_reply: { payload: 'button' } })).length, 0);
});
function flowDb() {
  const claims = new Set();
  return { from(table) {
    if (table === 'instagram_flow_automations') return { select: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { flows: [flow] } }) }) }) }) };
    if (table === 'instagram_direct_keyword_deliveries') return {
      insert: row => ({ select: () => ({ maybeSingle: async () => {
        if (claims.has(row.message_id)) return { error: { code: '23505' } }; claims.add(row.message_id); return { data: { message_id: row.message_id } };
      } }) }), update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
    };
    if (table === 'instagram_automation_events') return {
      insert: row => ({ select: () => ({ maybeSingle: async () => {
        if (claims.has(row.comment_id)) return { error: { code: '23505' } }; claims.add(row.comment_id); return { data: { id: 1 } };
      } }) }), update: () => ({ eq: async () => ({}) }),
    };
    throw new Error('Unexpected table ' + table);
  } };
}
test('comments and private keyword send one form URL button and disclaimer without displaying the long URL', async () => {
  const originalFetch = globalThis.fetch, token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const sent = []; process.env.META_INSTAGRAM_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ message_id: 'mid.sent' }) }; };
  try {
    const db = flowDb();
    assert.equal(await processConsultoriaDirectKeywords(payload('CONSULTORIA'), db), 1);
    assert.equal(await processConsultoriaDirectKeywords(payload('CONSULTORIA'), db), 0);
    assert.equal(sent.length, 1);
    const template = sent[0].message.attachment.payload;
    assert.equal(template.template_type, 'button');
    assert.match(template.text, /30 minutos/);
    assert.match(template.text, /vagas são limitadas/);
    assert.match(template.text, /não garante a vaga/);
    assert.ok(!template.text.includes(CONSULTORIA_URL));
    assert.deepEqual(template.buttons, [{ type: 'web_url', title: 'Preencher formulário', url: CONSULTORIA_URL }]);
    assert.ok(template.buttons[0].title.length <= 20);
    const comment = { object: 'instagram', entry: [{ id: gui, changes: [{ field: 'comments', value: { id: 'comment.1', text: 'CONSULTORIA', from: { username: 'teste' } } }] }] };
    assert.equal(await processFlowComments(comment, db), 1); assert.equal(await processFlowComments(comment, db), 0);
    assert.equal(sent.length, 2); assert.equal(sent[1].recipient.comment_id, 'comment.1');
    assert.deepEqual(sent[1].message.attachment.payload, template);
  } finally {
    globalThis.fetch = originalFetch;
    if (token === undefined) delete process.env.META_INSTAGRAM_ACCESS_TOKEN; else process.env.META_INSTAGRAM_ACCESS_TOKEN = token;
  }
});

test('form URL conversion is scoped to CONSULTORIA and never mutates the saved text', () => {
  const original = JSON.stringify(flow);
  assert.equal(buttonTemplate({ ...flow, keyword: 'OUTRO' }, flow.start), null);
  assert.ok(buttonTemplate(flow, flow.start));
  assert.equal(JSON.stringify(flow), original);
});
