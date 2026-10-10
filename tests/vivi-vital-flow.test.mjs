import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractChoice, normalizeText, VIVI_WELCOME, VIVI_MAIN,
  VIVI_PRODUCTS, VIVI_MARKETPLACES, VIVI_WHOLESALE,
  VIVI_BLUETTI, VIVI_BLUETTI_NO_CATALOG, isVitalChoice,
} from '../app/api/vital-connections/vivi-flow.mjs';

test('Vivi offers correct menu, brands, and marketplace options', () => {
  assert.deepEqual(VIVI_MAIN.map(row => row.id),
    ['vivi_buy','vivi_order','vivi_wholesale','vivi_affiliate']);
  assert.equal(VIVI_PRODUCTS.length,3);
  assert.equal(VIVI_MARKETPLACES.length,5);
  assert.match(VIVI_WELCOME,/MENU/);
  assert.match(VIVI_WELCOME,/Vivi/);
});
test('Wholesale minimums exactly reflect current Vital conditions', () => {
  assert.match(VIVI_WHOLESALE,/R\$ 25\.000/);
  assert.match(VIVI_WHOLESALE,/1\.000 m²/);
  assert.match(VIVI_WHOLESALE,/R\$ 3\.000/);
  assert.doesNotMatch(VIVI_WHOLESALE,/25 caixas/);
  assert.match(VIVI_WHOLESALE,/combinar produtos/);
  assert.match(VIVI_WHOLESALE,/R\$ 25\.000 no total/);
});
test('MENU works case-insensitively, with accent normalization', () => {
  assert.equal(extractChoice({text:{body:' MENU '}}),'vivi_menu');
  assert.equal(extractChoice({text:{body:'menu'}}),'vivi_menu');
  assert.equal(normalizeText('CONEXÃO'),'conexao');
  assert.equal(extractChoice({interactive:{list_reply:{id:'vivi_order_tiktok'}}}),'vivi_order_tiktok');
  assert.equal(isVitalChoice('vivi_product_bluetti'),true);
  assert.equal(isVitalChoice('vivi_order_amazon'),true);
  assert.equal(isVitalChoice('vivi_bad_value'),false);
});
test('BLUETTI flow includes human handoff and catalog when file exists', () => {
  assert.match(VIVI_BLUETTI,/catálogo BLUETTI/);
  assert.match(VIVI_BLUETTI,/nome/);
  assert.match(VIVI_BLUETTI_NO_CATALOG,/equipe/);
  assert.doesNotMatch(VIVI_BLUETTI_NO_CATALOG,/Enquanto isso, você pode conhecer/);
});
test('Vivi code only touches Vital workspace, supports handoff and silent existing chats', () => {
  const flow = readFileSync(new URL('../app/api/vital-connections/vivi-flow.mjs',import.meta.url),'utf8');
  const hook = readFileSync(new URL('../app/api/vital-connections/webhook.mjs',import.meta.url),'utf8');
  const manual = readFileSync(new URL('../app/api/vital-whatsapp/conversations/send/route.js',import.meta.url),'utf8');
  const upload = readFileSync(new URL('../app/api/vital-whatsapp/automacoes/route.js',import.meta.url),'utf8');
  assert.match(flow,/if \(configError \|\| !config\?\.enabled\) return/);
  assert.match(flow,/session\?\.human_handoff \|\| session\?\.manual_override/);
  assert.match(flow,/if \(previous\?\.length\) return/);
  assert.match(flow,/vital_whatsapp_flow_events/);
  assert.match(flow,/vital_whatsapp_affiliate_applications/);
  // Atacado envia URL do catálogo por texto, nunca como documento PDF.
  assert.match(flow,/if \(config\.wholesale_catalog_url\) await sendText\(/);
  assert.doesNotMatch(flow,/sendDocument\(db, connection, to, config\.wholesale_catalog_url/);
  // O PDF da BLUETTI segue em seu próprio fluxo.
  assert.match(flow,/sendDocument\(db, connection, to, config\.bluetti_catalog_url/);
  assert.match(hook,/handleViviMessage\(db, connection/);
  assert.match(manual,/manual_override: true/);
  assert.match(upload,/createSignedUploadUrl/);
  assert.match(upload,/enabled: true, bluetti_catalog_url: url/);
  assert.doesNotMatch(flow,/whatsapp_contacts|sendWhatsAppText/);
});

test('TikTok applicant view never mixes Vital candidates with Gui records', () => {
  const frame = readFileSync(new URL('../app/HubFrame.js', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../app/api/vital-whatsapp/afiliados/route.js', import.meta.url), 'utf8');
  assert.match(frame, /<VitalAffiliatePanel \/>/);
  assert.match(api, /vital_whatsapp_affiliate_applications/);
  assert.match(api, /eq\('owner_user_id', ownerId\)/);
  assert.match(api, /eq\('workspace_id', 'vital-decor'\)/);
  assert.doesNotMatch(api, /whatsapp_contacts|influencer_applications'\)/);
});
