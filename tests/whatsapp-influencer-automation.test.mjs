import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInfluencerScore } from '../app/lib/influencer-scoring.js';
import { buildWhatsAppCtaUrlMessage, isMetaRateLimitCode } from '../app/api/whatsapp/lib.js';
import {
  interactiveSelectionId,
  requestsMainMenu,
  shouldSendInitialMenu,
  WHATSAPP_MENU_ROWS,
} from '../app/api/whatsapp/automation.js';
import { influencerFormHtml } from '../app/parcerias/vital-influenciadores/html.js';
import { validateInfluencerApplication } from '../app/parcerias/vital-influenciadores/service.js';

const baseApplication = {
  token: '11111111-1111-4111-8111-111111111111',
  creatorName: 'Criadora Teste',
  email: 'criadora@example.com',
  cityState: 'Guarulhos/SP',
  tiktokUrl: 'https://www.tiktok.com/@criadora',
  instagramUrl: '',
  niche: 'casa_decoracao',
  followers: '10000',
  averageViews: '5000',
  averageLikes: '500',
  averageComments: '30',
  postsPerWeek: '5',
  brazilAudiencePercent: '85',
  affiliateExperience: 'yes',
  liveExperience: 'yes',
  contentCommitment: 'yes',
  topVideo1: 'https://www.tiktok.com/@criadora/video/123456789',
  topVideo2: '',
  topVideo3: '',
  motivation: 'Quero mostrar transformações fáceis e reais usando os produtos da Vital Decor.',
  consent: 'yes',
};

test('the WhatsApp list fits Meta limits and exposes the six requested topics', () => {
  assert.equal(WHATSAPP_MENU_ROWS.length, 6);
  assert.equal(new Set(WHATSAPP_MENU_ROWS.map((row) => row.id)).size, 6);
  for (const row of WHATSAPP_MENU_ROWS) {
    assert.ok(row.title.length <= 24, row.title);
    assert.ok(row.description.length <= 72, row.description);
  }
  assert.ok(WHATSAPP_MENU_ROWS.some((row) => row.id === 'topic_influencer'));
});

test('new conversations and explicit menu requests open the routing menu', () => {
  assert.equal(shouldSendInitialMenu({ message: { text: { body: 'Oi' } }, messageCount: 1 }), true);
  assert.equal(shouldSendInitialMenu({ message: { text: { body: 'MENU' } }, messageCount: 25 }), true);
  assert.equal(shouldSendInitialMenu({ message: { text: { body: 'Já mandei os dados' } }, messageCount: 25 }), false);
  assert.equal(requestsMainMenu({ text: { body: 'começar' } }), true);
  assert.equal(interactiveSelectionId({ interactive: { list_reply: { id: 'topic_influencer' } } }), 'topic_influencer');
});

test('the influencer form is sent behind a clean WhatsApp button', () => {
  const payload = buildWhatsAppCtaUrlMessage({
    to: '+55 (11) 99999-9999',
    body: 'Preencha o formulário abaixo.',
    buttonText: 'Preencher formulário',
    url: 'https://social-hub-gui.vercel.app/parcerias/vital-influenciadores?token=11111111-1111-4111-8111-111111111111',
  });

  assert.equal(payload.type, 'interactive');
  assert.equal(payload.interactive.type, 'cta_url');
  assert.equal(payload.interactive.action.parameters.display_text, 'Preencher formulário');
  assert.match(payload.interactive.action.parameters.url, /^https:\/\/social-hub-gui\.vercel\.app\//);
  assert.doesNotMatch(payload.interactive.body.text, /https?:\/\//);
});

test('a temporary Meta rate limit is not mistaken for an expired credential', () => {
  assert.equal(isMetaRateLimitCode(80008), true);
  assert.equal(isMetaRateLimitCode('80008'), true);
  assert.equal(isMetaRateLimitCode(190), false);
});

test('engaged niche creators rank above large but weak profiles', () => {
  const engaged = calculateInfluencerScore({
    niche: 'casa_decoracao', followers: 8000, averageViews: 6000,
    averageLikes: 600, averageComments: 40, postsPerWeek: 5,
    brazilAudiencePercent: 90, affiliateExperience: 'yes', liveExperience: 'yes', contentCommitment: 'yes',
  });
  const weak = calculateInfluencerScore({
    niche: 'outro', followers: 500000, averageViews: 10000,
    averageLikes: 80, averageComments: 2, postsPerWeek: 1,
    brazilAudiencePercent: 30, affiliateExperience: 'no', liveExperience: 'no', contentCommitment: 'no',
  });
  assert.equal(engaged.classification, 'prequalified');
  assert.ok(engaged.score > weak.score);
  assert.equal(weak.classification, 'low_fit');
});

test('the application validates trusted social links and calculates the score', () => {
  const application = validateInfluencerApplication(baseApplication);
  assert.equal(application.creatorName, 'Criadora Teste');
  assert.equal(application.topVideoUrls.length, 1);
  assert.equal(application.classification, 'prequalified');
  assert.ok(application.score >= 72);

  assert.throws(() => validateInfluencerApplication({
    ...baseApplication,
    tiktokUrl: 'https://evil.example/@criadora',
  }), { status: 400 });
});

test('the public form escapes submitted values and never exposes the score', () => {
  const html = influencerFormHtml({
    token: baseApplication.token,
    error: '<script>alert(1)</script>',
    values: { creatorName: '<img src=x onerror=alert(1)>' },
  });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script|score|qualification/i);
  assert.match(html, /name="consent" value="yes" required/);
});
