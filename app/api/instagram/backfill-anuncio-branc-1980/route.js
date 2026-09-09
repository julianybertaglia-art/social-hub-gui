import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';
const TARGET_USERNAME = 'branc.1980';
const RUN_TOKEN = '9b8f4a2d7c6e51f0';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function metaGet(path, params = {}) {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Instagram não configurado.');

  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error(result?.error?.message || `Erro Meta HTTP ${response.status}`);
  return result;
}

async function metaPost(path, body) {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Instagram não configurado.');

  const response = await fetch(`https://graph.instagram.com/${API_VERSION}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error(result?.error?.message || `Erro Meta HTTP ${response.status}`);
  return result;
}

async function findTargetComment() {
  const mediaPayload = await metaGet(`${GUI_ACCOUNT_ID}/media`, {
    fields: 'id,caption,timestamp,permalink',
    limit: 12,
  });

  for (const media of mediaPayload?.data || []) {
    const commentsPayload = await metaGet(`${media.id}/comments`, {
      fields: 'id,text,username,timestamp',
      limit: 100,
    });

    const match = (commentsPayload?.data || []).find((comment) =>
      String(comment?.username || '').toLowerCase() === TARGET_USERNAME
      && normalizeText(comment?.text).includes('ANUNCIO')
    );

    if (match) return { media, comment: match };
  }

  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== RUN_TOKEN) {
    return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 403 });
  }

  try {
    const found = await findTargetComment();
    if (!found) return Response.json({ ok: false, error: 'Comentário não encontrado.' }, { status: 404 });

    const db = serverClient();
    const { data: automation, error } = await db.from('instagram_text_automations')
      .select('id,prompt_message,quick_reply_title,quick_reply_payload,public_reply,active')
      .eq('ig_account_id', GUI_ACCOUNT_ID)
      .eq('slug', 'anuncio-checklist-imersao')
      .eq('active', true)
      .maybeSingle();

    if (error || !automation) throw new Error('Automação ANÚNCIO não encontrada.');

    const privateResult = await metaPost(`${GUI_ACCOUNT_ID}/messages`, {
      recipient: { comment_id: found.comment.id },
      message: {
        text: automation.prompt_message,
        quick_replies: [{
          content_type: 'text',
          title: automation.quick_reply_title,
          payload: automation.quick_reply_payload,
        }],
      },
    });

    let publicReplyId = null;
    if (automation.public_reply) {
      const publicResult = await metaPost(`${found.comment.id}/replies`, {
        message: automation.public_reply,
      });
      publicReplyId = publicResult?.id || null;
    }

    return Response.json({
      ok: true,
      username: TARGET_USERNAME,
      commentId: found.comment.id,
      text: found.comment.text,
      privateMessageId: privateResult?.message_id || null,
      publicReplyId,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
