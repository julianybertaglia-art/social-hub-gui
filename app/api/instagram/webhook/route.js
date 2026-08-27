import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const AUTOMATIONS_STORAGE_KEY = 'guihub-automations';
const FALLBACK_RULES = [
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

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function sanitizeRules(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 3)
    .map((rule, index) => ({
      id: String(rule?.id || `automation-${index + 1}`),
      name: String(rule?.name || `Automação ${index + 1}`),
      keyword: String(rule?.keyword || '').trim(),
      publicReply: String(rule?.publicReply || '').trim(),
      privateMessage: String(rule?.privateMessage || '').trim(),
      tag: String(rule?.tag || '').trim(),
      active: Boolean(rule?.active),
    }))
    .filter((rule) => rule.active && rule.keyword && rule.privateMessage);
}

async function loadAutomationRules() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) return FALLBACK_RULES;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from('content_items')
      .select('description')
      .eq('title', '__SOCIAL_HUB_STATE__')
      .maybeSingle();

    if (error || !data?.description) {
      console.warn('Automações: não foi possível ler a configuração no Supabase.', error?.message || 'Estado vazio');
      return FALLBACK_RULES;
    }

    const state = JSON.parse(data.description || '{}');
    const serializedRules = state?.data?.[AUTOMATIONS_STORAGE_KEY];
    const parsedRules = typeof serializedRules === 'string'
      ? JSON.parse(serializedRules)
      : serializedRules;
    const rules = sanitizeRules(parsedRules);

    return rules.length ? rules : FALLBACK_RULES;
  } catch (error) {
    console.warn('Automações: falha ao carregar regras; usando regra segura de IMERSÃO.', error instanceof Error ? error.message : String(error));
    return FALLBACK_RULES;
  }
}

function findMatchingRule(text, rules) {
  const normalizedComment = normalizeText(text);

  return rules.find((rule) => {
    const normalizedKeyword = normalizeText(rule.keyword);
    return normalizedKeyword && normalizedComment.includes(normalizedKeyword);
  }) || null;
}

async function metaPost(path, body) {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('META_INSTAGRAM_ACCESS_TOKEN não configurado.');
  }

  const response = await fetch(
    `https://graph.instagram.com/${API_VERSION}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result?.error?.message || `Erro Meta HTTP ${response.status}`;
    throw new Error(message);
  }

  return result;
}

async function sendPrivateReply(igUserId, commentId, message) {
  return metaPost(`${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text: message },
  });
}

async function sendPublicReply(commentId, message) {
  if (!message) return null;

  return metaPost(`${commentId}/replies`, {
    message,
  });
}

function extractCommentEvents(payload) {
  if (!Array.isArray(payload?.entry)) return [];

  return payload.entry.flatMap((entry) => {
    if (entry?.field === 'comments' && entry?.value) {
      return [{ igUserId: entry.id, value: entry.value }];
    }

    if (Array.isArray(entry?.changes)) {
      return entry.changes
        .filter((change) => change?.field === 'comments' && change?.value)
        .map((change) => ({ igUserId: entry.id, value: change.value }));
    }

    return [];
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    return Response.json(
      { ok: false, error: 'META_WEBHOOK_VERIFY_TOKEN ainda não configurado.' },
      { status: 503 }
    );
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return Response.json({ ok: false, error: 'Verificação recusada.' }, { status: 403 });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!isValidSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
  }

  const commentEvents = extractCommentEvents(payload);
  const rules = commentEvents.length ? await loadAutomationRules() : [];

  for (const event of commentEvents) {
    const commentId = event?.value?.id;
    const text = event?.value?.text;
    const username = event?.value?.from?.username;
    const matchingRule = findMatchingRule(text, rules);

    if (!commentId || !event.igUserId || !matchingRule) continue;
    if (String(username || '').toLowerCase() === 'gui_nonato') continue;

    const logPrefix = `AUTOMACAO:${normalizeText(matchingRule.keyword)}`;

    try {
      const privateResult = await sendPrivateReply(
        event.igUserId,
        commentId,
        matchingRule.privateMessage
      );

      console.info(`${logPrefix}: Direct enviado`, {
        commentId,
        username,
        ruleId: matchingRule.id,
        messageId: privateResult?.message_id || null,
      });
    } catch (error) {
      console.error(`${logPrefix}: falha ao enviar Direct`, {
        commentId,
        username,
        ruleId: matchingRule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const publicResult = await sendPublicReply(commentId, matchingRule.publicReply);

      if (matchingRule.publicReply) {
        console.info(`${logPrefix}: resposta pública enviada`, {
          commentId,
          username,
          ruleId: matchingRule.id,
          replyId: publicResult?.id || null,
        });
      }
    } catch (error) {
      console.error(`${logPrefix}: falha na resposta pública`, {
        commentId,
        username,
        ruleId: matchingRule.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    ok: true,
    status: 'EVENT_RECEIVED',
    commentEvents: commentEvents.length,
    activeRules: rules.length,
  });
}
