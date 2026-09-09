import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';
const TARGET_USERNAME = 'branc.1980';
const BACKFILL_KEY = 'anuncio-branc-1980-2026-09-09';

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase não configurado.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function metaGet(path, params = {}) {
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('Instagram não configurado.');
  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== '') url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error(result?.error?.message || `Erro Meta HTTP ${response.status}`);
  return result;
}

async function metaPost(path, body) {
  const token = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('Instagram não configurado.');
  const response = await fetch(`https://graph.instagram.com/${API_VERSION}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error(result?.error?.message || `Erro Meta HTTP ${response.status}`);
  return result;
}

async function findTargetComment() {
  const mediaPayload = await metaGet(`${GUI_ACCOUNT_ID}/media`, { fields: 'id,caption,timestamp', limit: 12 });
  for (const media of mediaPayload?.data || []) {
    const comments = await metaGet(`${media.id}/comments`, { fields: 'id,text,username,timestamp,from', limit: 100 });
    const match = (comments?.data || []).find((comment) => {
      const username = String(comment?.username || comment?.from?.username || '').toLowerCase();
      return username === TARGET_USERNAME && normalizeText(comment?.text).includes('ANUNCIO');
    });
    if (match) return match;
  }
  return null;
}

export async function GET() {
  const db = serverClient();
  const { data: existing } = await db.from('instagram_manual_backfills').select('status').eq('key', BACKFILL_KEY).maybeSingle();
  if (existing?.status === 'sent') return Response.json({ ok: true, alreadySent: true });

  await db.from('instagram_manual_backfills').upsert({
    key: BACKFILL_KEY,
    status: 'running',
    detail: null,
    updated_at: new Date().toISOString(),
  });

  try {
    const comment = await findTargetComment();
    if (!comment) throw new Error('Comentário de branc.1980 não encontrado.');

    const { data: automation, error } = await db.from('instagram_text_automations')
      .select('prompt_message,quick_reply_title,quick_reply_payload,public_reply')
      .eq('ig_account_id', GUI_ACCOUNT_ID)
      .eq('slug', 'anuncio-checklist-imersao')
      .eq('active', true)
      .maybeSingle();
    if (error || !automation) throw new Error('Automação ANÚNCIO não encontrada.');

    const privateResult = await metaPost(`${GUI_ACCOUNT_ID}/messages`, {
      recipient: { comment_id: comment.id },
      message: {
        text: automation.prompt_message,
        quick_replies: [{ content_type: 'text', title: automation.quick_reply_title, payload: automation.quick_reply_payload }],
      },
    });

    let publicReplyId = null;
    if (automation.public_reply) {
      const publicResult = await metaPost(`${comment.id}/replies`, { message: automation.public_reply });
      publicReplyId = publicResult?.id || null;
    }

    await db.from('instagram_manual_backfills').update({
      status: 'sent',
      detail: `comment=${comment.id}`,
      updated_at: new Date().toISOString(),
    }).eq('key', BACKFILL_KEY);

    return Response.json({
      ok: true,
      username: TARGET_USERNAME,
      commentId: comment.id,
      privateMessageId: privateResult?.message_id || null,
      publicReplyId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('instagram_manual_backfills').update({
      status: 'failed', detail: message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('key', BACKFILL_KEY);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
