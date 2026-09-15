import { isArgoKeyword } from '../../../lib/argo-flow.js';

export const AUTOMATIONS_STORAGE_KEY = 'guihub-automations';
export const STATE_TITLE = '__SOCIAL_HUB_STATE__';

export const FALLBACK_RULES = [
  {
    id: 'imersao-reel',
    name: 'Leads — Imersão',
    keyword: 'IMERSÃO',
    publicReply: 'Te chamei no Direct 👊',
    privateMessage: 'Fala! Vi que você comentou IMERSÃO no vídeo 👊\n\nA Imersão Ecommerce Mercado Livre Pro é um evento presencial para quem quer escalar sua operação nos marketplaces, com conteúdo prático sobre Mercado Livre, anúncios, operação, IA, importação e estratégias de crescimento.\n\n📅 26 de setembro de 2026\n⏰ 09h30 às 20h30\n📍 R. Airi, 227 — Tatuapé, São Paulo/SP\n\nPara compra de ingressos ou mais informações, fale com a equipe pelo WhatsApp: (11) 92399-0244',
    tag: 'Interesse — Imersão',
    active: true,
  },
];

export function normalizeCommentText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function sanitizeCommentRules(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 3)
    .map((rule, index) => ({
      id: String(rule?.id || `automation-${index + 1}`).slice(0, 80),
      name: String(rule?.name || `Automação ${index + 1}`).trim().slice(0, 100),
      keyword: String(rule?.keyword || '').trim().toUpperCase().slice(0, 40),
      publicReply: String(rule?.publicReply || '').trim().slice(0, 300),
      privateMessage: String(rule?.privateMessage || '').trim().slice(0, 1000),
      tag: String(rule?.tag || '').trim().slice(0, 100),
      active: Boolean(rule?.active),
    }))
    .map((rule) => ({
      ...rule,
      active: Boolean(rule.active && rule.keyword && rule.privateMessage && !isArgoKeyword(rule.keyword)),
    }));
}

export function rulesFromState(description, { fallback = true } = {}) {
  try {
    const state = JSON.parse(description || '{}');
    const serialized = state?.data?.[AUTOMATIONS_STORAGE_KEY];
    const parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (Array.isArray(parsed)) return sanitizeCommentRules(parsed);
  } catch {
    // The caller decides whether a safe fallback should be used.
  }
  return fallback ? FALLBACK_RULES : [];
}

export function findMatchingCommentRule(text, rules) {
  const normalizedComment = normalizeCommentText(text);
  return (rules || []).find((rule) => {
    if (!rule.active) return false;
    const keyword = normalizeCommentText(rule.keyword);
    return keyword && normalizedComment.includes(keyword);
  }) || null;
}

export async function loadOwnerRules(db, userId) {
  const { data, error } = await db.from('content_items')
    .select('id,description,updated_at')
    .eq('title', STATE_TITLE)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.id) throw error || new Error('Estado do Hub não encontrado.');
  return { row: data, rules: rulesFromState(data.description) };
}

export async function saveOwnerRules(db, userId, value) {
  const rules = sanitizeCommentRules(value);
  if (!rules.length) throw new Error('Envie pelo menos uma regra de automação.');

  const { row } = await loadOwnerRules(db, userId);
  let state;
  try {
    state = JSON.parse(row.description || '{}');
  } catch {
    state = {};
  }

  const updatedAt = Date.now();
  const description = JSON.stringify({
    ...state,
    updatedAt,
    data: {
      ...(state?.data && typeof state.data === 'object' ? state.data : {}),
      [AUTOMATIONS_STORAGE_KEY]: JSON.stringify(rules),
    },
  });

  const { error } = await db.from('content_items')
    .update({ description, status: 'Ativo' })
    .eq('id', row.id)
    .eq('user_id', userId);
  if (error) throw error;

  return { rules, updatedAt };
}

export async function loadLatestWebhookRules(db) {
  const { data, error } = await db.from('content_items')
    .select('description')
    .eq('title', STATE_TITLE)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.description) throw error || new Error('Estado do Hub não encontrado.');
  return rulesFromState(data.description);
}
