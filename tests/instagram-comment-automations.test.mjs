import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMatchingCommentRule,
  rulesFromState,
  sanitizeCommentRules,
} from '../app/api/instagram/comment-automations/service.js';

const rules = [
  { id: '1', name: 'Reputação', keyword: 'REPUTAÇÃO', publicReply: 'Direct', privateMessage: 'Prompt', tag: '', active: true },
  { id: '2', name: 'Fornecedor', keyword: 'FORNECEDOR', publicReply: 'Direct', privateMessage: 'Lista', tag: '', active: true },
  { id: '3', name: 'Argo duplicado', keyword: 'ARGO', publicReply: 'Direct', privateMessage: 'Áudio', tag: '', active: true },
];

test('sanitizes three rules and keeps ARGO out of comment text automations', () => {
  const cleaned = sanitizeCommentRules(rules);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[0].keyword, 'REPUTAÇÃO');
  assert.equal(cleaned[2].active, false);
});

test('matches accents, casing and surrounding comment text', () => {
  const cleaned = sanitizeCommentRules(rules);
  assert.equal(findMatchingCommentRule('Quero o prompt de reputacao!', cleaned)?.id, '1');
  assert.equal(findMatchingCommentRule('manda FORNECEDOR por favor', cleaned)?.id, '2');
  assert.equal(findMatchingCommentRule('cargo', cleaned), null);
});

test('reads the server-backed Hub state format', () => {
  const description = JSON.stringify({ data: { 'guihub-automations': JSON.stringify(rules) } });
  const parsed = rulesFromState(description);
  assert.equal(parsed[0].name, 'Reputação');
  assert.equal(parsed[1].active, true);
});

test('keeps every rule paused instead of silently reactivating IMERSÃO', () => {
  const paused = rules.map((rule) => ({ ...rule, active: false }));
  const description = JSON.stringify({ data: { 'guihub-automations': JSON.stringify(paused) } });
  assert.equal(rulesFromState(description).some((rule) => rule.active), false);
});
