import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractChoice, normalizeText, VIVI_WELCOME, VIVI_MAIN, VIVI_IDLE_MS, isWelcomeDue,
  VIVI_PRODUCTS, VIVI_MARKETPLACES, VIVI_WHOLESALE,
  VIVI_BLUETTI, VIVI_BLUETTI_NO_CATALOG, VIVI_VITAL_RETAIL, isVitalChoice,
} from '../app/api/vital-connections/vivi-flow.mjs';
import {buildViviSalesMessage,getViviSalesLink,matchViviSalesIntent,VIVI_SALES_CATEGORIES,VIVI_SALES_OPTIONS,VIVI_SALES_HUMAN_ID} from '../app/lib/vivi-sales.mjs';

test('Vivi offers correct menu, brands, and marketplace options', () => {
  assert.deepEqual(VIVI_MAIN.map(row => row.id),
    ['vivi_buy','vivi_order','vivi_wholesale','vivi_affiliate']);
  assert.equal(VIVI_PRODUCTS.length,3);
  assert.equal(VIVI_MARKETPLACES.length,5);
  assert.match(VIVI_WELCOME,/MENU/);
  assert.match(VIVI_WELCOME,/Vivi/);
});
test('Wholesale greeting explains how to send a catalog order', () => {
  assert.match(VIVI_WHOLESALE,/No nosso catálogo/);
  assert.match(VIVI_WHOLESALE,/preenche seus dados/);
  assert.match(VIVI_WHOLESALE,/pedido pronto/);
  assert.match(VIVI_WHOLESALE,/representante comercial/);
  assert.ok(VIVI_WHOLESALE.length < 400);
});
test('Retail Vital introduces Vivi as an online seller and keeps the customer in guided shopping', () => {
  assert.match(VIVI_VITAL_RETAIL, /vendedora online/);
  assert.match(VIVI_VITAL_RETAIL, /catálogo/);
  assert.match(VIVI_VITAL_RETAIL, /ATENDENTE/);
  assert.ok(VIVI_VITAL_RETAIL.length < 600);
  const code = readFileSync(new URL('../app/api/vital-connections/vivi-flow.mjs',import.meta.url),'utf8');
  assert.match(code, /choice === 'vivi_product_vital'[\s\S]*?sendText\(db, connection, to, VIVI_VITAL_RETAIL\)[\s\S]*?VIVI_SALES_OPTIONS/);
  assert.match(code, /stage: 'vital_sales', selection: product/);
  assert.match(code, /choice === 'vivi_product_bluetti'/);
});

test('Vivi sales links are fixed to safe official catalog searches and do not include customer text', () => {
  assert.equal(VIVI_SALES_CATEGORIES.length, 5);
  assert.equal(VIVI_SALES_OPTIONS.length, 6);
  assert.equal(getViviSalesLink('vivi_sales_grass'), 'https://vitaldecor.com.br/search/?q=grama+sintetica');
  assert.equal(getViviSalesLink('unknown'), null);
  assert.equal(matchViviSalesIntent('quero samambaia com eucalipto'), 'vivi_sales_garden');
  assert.equal(matchViviSalesIntent('grama sintética'), 'vivi_sales_grass');
  assert.equal(matchViviSalesIntent('placa de PVC 3D'), 'vivi_sales_3d');
  assert.equal(matchViviSalesIntent('mármore calacata'), 'vivi_sales_adhesive');
  assert.equal(matchViviSalesIntent('plantas artificiais'), 'vivi_sales_plants');
  assert.equal(matchViviSalesIntent('quero falar com uma pessoa'), VIVI_SALES_HUMAN_ID);
  assert.equal(matchViviSalesIntent('Juliany, meu endereço é...'), null);
  const recommendation = buildViviSalesMessage('vivi_sales_grass');
  assert.match(recommendation, /preços e a disponibilidade/);
  assert.match(recommendation, /ATENDENTE/);
  assert.doesNotMatch(recommendation, /Juliany|endereço/);
});

test('MENU works case-insensitively, with accent normalization', () => {
  assert.equal(extractChoice({text:{body:' MENU '}}),'vivi_menu');
  assert.equal(extractChoice({text:{body:'menu'}}),'vivi_menu');
  assert.equal(normalizeText('CONEXÃO'),'conexao');
  assert.equal(extractChoice({interactive:{list_reply:{id:'vivi_order_tiktok'}}}),'vivi_order_tiktok');
  assert.equal(isVitalChoice('vivi_product_bluetti'),true);
  assert.equal(isVitalChoice('vivi_order_amazon'),true);
  assert.equal(isVitalChoice('vivi_sales_garden'),true);
  assert.equal(isVitalChoice(VIVI_SALES_HUMAN_ID),true);
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
  assert.ok(flow.includes('if (!explicitMenu && session?.manual_override) return;'));
  assert.ok(flow.includes('session?.human_handoff'));
  assert.ok(flow.includes('wantsWelcome = !humanHistory?.length || isWelcomeDue(lastPriorActivity);'));
  assert.match(flow,/stage: 'welcome_pending'/);
  assert.ok(flow.includes('isWelcomeDue(lastPriorActivity)'));
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

test('Vivi restarts only after 24h without activity', () => {
  const now = Date.parse('2026-11-06T20:00:00Z');
  assert.equal(VIVI_IDLE_MS, 86_400_000);
  assert.equal(isWelcomeDue('2026-11-05T20:00:01Z', now), false);
  assert.equal(isWelcomeDue('2026-11-05T20:00:00Z', now), true);
  assert.equal(isWelcomeDue('2026-11-06T19:00:00Z', now), false);
  assert.equal(isWelcomeDue(null, now), true);
});
