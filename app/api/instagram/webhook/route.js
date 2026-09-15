import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { after } from 'next/server';
import { processAudioTests, extractTestMessages } from '../audio-test/service';
import {
  extractAudioSelectionEvents,
  processAudioSelections,
} from '../audio-automation/service.js';
import {
  extractTextSelectionEvents,
  processTextSelections,
  processTextCommentEvent,
} from '../text-automation/service.js';
import {
  findMatchingCommentRule,
  loadLatestWebhookRules,
  normalizeCommentText,
} from '../comment-automations/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const API_VERSION = 'v26.0';
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

async function loadAutomationRules() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServerKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseServerKey) {
    console.error('Automações: chave secreta do Supabase não configurada no servidor.');
    return [];
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServerKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return await loadLatestWebhookRules(supabase);
  } catch (error) {
    console.error('Automações: falha ao carregar regras do Hub.', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function findAudioAutomationForComment(text, automations) {
  const normalizedComment = normalizeCommentText(text);
  return (automations || []).find((automation) => {
    const keyword = normalizeCommentText(automation.comment_keyword);
    return keyword && normalizedComment.includes(keyword);
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

async function sendAudioPrompt(igUserId, commentId, automation) {
  return metaPost(`${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: {
      text: automation.prompt_message,
      quick_replies: [{
        content_type: 'text',
        title: automation.quick_reply_title,
        payload: automation.quick_reply_payload,
      }],
    },
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

async function loadAudioAutomationsByAccount(events) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServerKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const byAccount = new Map();
  const accountIds = [...new Set(events.map((event) => String(event.igUserId || '')).filter((id) => /^\d+$/.test(id)))];

  if (!supabaseUrl || !supabaseServerKey || !accountIds.length) return byAccount;

  try {
    const supabase = createClient(supabaseUrl, supabaseServerKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('instagram_audio_automations')
      .select('id,ig_account_id,comment_keyword,public_reply,prompt_message,quick_reply_title,quick_reply_payload,active')
      .in('ig_account_id', accountIds)
      .eq('active', true);

    if (error) throw error;
    for (const accountId of accountIds) {
      byAccount.set(accountId, (data || []).filter((automation) => String(automation.ig_account_id) === accountId));
    }
  } catch (error) {
    console.error('Automação de áudio ARGO: não foi possível carregar a configuração do comentário.', error instanceof Error ? error.message : String(error));
    for (const accountId of accountIds) byAccount.set(accountId, []);
  }

  return byAccount;
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

  if (extractTestMessages(payload).length) {
    after(async () => {
      try { await processAudioTests(payload); }
      catch { console.error('Teste de áudio: não foi possível processar a mensagem.'); }
    });
  }

  if (extractAudioSelectionEvents(payload).length) {
    after(async () => {
      try { await processAudioSelections(payload); }
      catch { console.error('Automação de áudio ARGO: não foi possível processar o Direct.'); }
    });
  }

  if (extractTextSelectionEvents(payload).length) {
    after(async () => {
      try { await processTextSelections(payload); }
      catch { console.error('Automação de texto: não foi possível processar o Direct.'); }
    });
  }

  const commentEvents = extractCommentEvents(payload);
  const rules = commentEvents.length ? await loadAutomationRules() : [];
  const audioAutomationsByAccount = commentEvents.length
    ? await loadAudioAutomationsByAccount(commentEvents)
    : new Map();

  for (const event of commentEvents) {
    try {
      const textAutomationHandled = await processTextCommentEvent(event);
      if (textAutomationHandled) continue;
    } catch (error) {
      console.error('Automação de texto: não foi possível processar o comentário.', {
        commentId: event?.value?.id || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const commentId = event?.value?.id;
    const text = event?.value?.text;
    const username = event?.value?.from?.username;
    const audioAutomation = findAudioAutomationForComment(
      text,
      audioAutomationsByAccount.get(String(event.igUserId)) || []
    );
    const matchingRule = audioAutomation ? null : findMatchingCommentRule(text, rules);

    if (!commentId || !event.igUserId || (!audioAutomation && !matchingRule)) continue;
    if (String(username || '').toLowerCase() === 'gui_nonato') continue;

    const logPrefix = audioAutomation
      ? 'AUDIO:ARGO'
      : `AUTOMACAO:${normalizeCommentText(matchingRule.keyword)}`;
    const ruleId = audioAutomation ? audioAutomation.id : matchingRule.id;
    const publicReply = audioAutomation ? audioAutomation.public_reply : matchingRule.publicReply;

    try {
      const privateResult = audioAutomation
        ? await sendAudioPrompt(event.igUserId, commentId, audioAutomation)
        : await sendPrivateReply(event.igUserId, commentId, matchingRule.privateMessage);

      console.info(`${logPrefix}: Direct enviado`, {
        commentId,
        username,
        ruleId,
        messageId: privateResult?.message_id || null,
      });
    } catch (error) {
      console.error(`${logPrefix}: falha ao enviar Direct`, {
        commentId,
        username,
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const publicResult = await sendPublicReply(commentId, publicReply);

      if (publicReply) {
        console.info(`${logPrefix}: resposta pública enviada`, {
          commentId,
          username,
          ruleId,
          replyId: publicResult?.id || null,
        });
      }
    } catch (error) {
      console.error(`${logPrefix}: falha na resposta pública`, {
        commentId,
        username,
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    ok: true,
    status: 'EVENT_RECEIVED',
    commentEvents: commentEvents.length,
    activeRules: rules.length,
    activeAudioAutomations: [...audioAutomationsByAccount.values()].flat().length,
    audioTrigger: 'direct+comment-button',
    textTrigger: 'direct+comment-button',
  });
}
