import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACTS_TABLE, CONSENT_TEXT, listOwnerContacts, saveContact, validateContact } from '../app/argo/novidades/service.js';
import { GET, POST } from '../app/argo/novidades/route.js';
import { GET as contactsGET } from '../app/api/instagram/argo-updates/route.js';

const OWNER_ID = 'owner-a';
const values = { name: '  Pessoa   de Teste ', whatsapp: '(11) 91234-5678', consent: 'yes' };

function fakeDb() {
  const db = {
    contacts: [],
    from(table) {
      if (table === 'instagram_audio_automations') {
        const query = {
          select() { return query; },
          eq(key, value) { assert.equal(key, 'slug'); assert.equal(value, 'argo-audio'); return query; },
          async maybeSingle() { return { data: { id: 'automation-a', user_id: OWNER_ID } }; },
        };
        return query;
      }
      assert.equal(table, CONTACTS_TABLE);
      const filters = [];
      const query = {
        async insert(contact) {
          if (db.contacts.some((row) => row.automation_id === contact.automation_id && row.whatsapp === contact.whatsapp)) {
            return { error: { code: '23505' } };
          }
          db.contacts.push({ id: `contact-${db.contacts.length}`, ...contact });
          return { error: null };
        },
        select() { return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        order() { return query; },
        async limit() {
          const rows = db.contacts.filter((row) => filters.every((filter) => filter(row)));
          return { data: rows, count: rows.length };
        },
      };
      return query;
    },
  };
  return db;
}

function request(body, headers = {}) {
  return new Request('https://social-hub-gui.vercel.app/argo/novidades', {
    method: 'POST', body: typeof body === 'string' ? body : new URLSearchParams(body),
    headers: { origin: 'https://social-hub-gui.vercel.app', 'content-type': 'application/x-www-form-urlencoded', ...headers },
  });
}

test('registration needs an explicit opt-in and normalizes a Brazilian WhatsApp', () => {
  assert.deepEqual(validateContact(values), { name: 'Pessoa de Teste', whatsapp: '5511912345678' });
  assert.equal(validateContact({ ...values, whatsapp: '+55 (11) 91234-5678' }).whatsapp, '5511912345678');
  for (const invalid of [
    { ...values, consent: '' }, { ...values, consent: true }, { ...values, name: 'A' },
    { ...values, whatsapp: '12345' }, { ...values, whatsapp: '+1 2125550100' },
    { ...values, whatsapp: 'not-a-phone11912345678' },
  ]) assert.throws(() => validateContact(invalid), { status: 400 });
});

test('repeat signups do not overwrite contacts and private lists are owner-scoped', async () => {
  const db = fakeDb();
  const contact = validateContact(values);
  await saveContact(db, contact);
  await saveContact(db, { ...contact, name: 'Changed name' });
  assert.equal(db.contacts.length, 1);
  assert.equal(db.contacts[0].name, 'Pessoa de Teste');
  assert.equal(db.contacts[0].user_id, OWNER_ID);
  assert.equal(db.contacts[0].consent_text, CONSENT_TEXT);
  assert.equal(db.contacts[0].source, 'argo_updates_form');
  assert.equal((await listOwnerContacts(db, OWNER_ID)).total, 1);
  assert.equal((await listOwnerContacts(db, 'other-owner')).total, 0);
});

test('the signup is public, contains the correct destinations, and does not preselect consent', async () => {
  const response = await GET();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<form method="post" action="\/argo\/novidades"/);
  assert.match(html, /name="consent" value="yes" required/);
  assert.match(html, /https:\/\/imersao\.guinonato\.com\//);
  assert.match(html, /https:\/\/wa\.me\/5511923990244/);
  assert.doesNotMatch(html, /Conectando|password|access_token|<script/i);
});

test('malformed, cross-origin, oversized and bot submissions do not reach the database', async () => {
  const bad = await POST(request({ ...values, consent: '', name: '<script>alert(1)</script>' }));
  assert.equal(bad.status, 400);
  const html = await bad.text();
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.equal((await POST(request(values, { origin: 'https://another.example' }))).status, 403);
  assert.equal((await POST(request('name=' + 'x'.repeat(9000)))).status, 413);
  assert.equal((await POST(request({ ...values, company_site: 'bot.example' }))).status, 200);
});

test('an unauthenticated visitor cannot list the registered contacts', async (t) => {
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key' })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No network expected'); });
  const response = await contactsGET(new Request('https://social-hub-gui.vercel.app/api/instagram/argo-updates'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(await response.json()), ['error']);
});
