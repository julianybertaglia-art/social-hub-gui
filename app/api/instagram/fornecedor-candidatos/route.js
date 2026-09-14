export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';
const TARGET_SHORTCODE = 'DdPtMv7Djom';
const CUTOFF = Date.parse('2026-09-14T13:47:33.840Z');

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function token() {
  const value = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  if (!value) throw new Error('Instagram não configurado.');
  return value;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Erro Meta HTTP ${response.status}`);
  return data;
}

async function metaGet(path, params = {}) {
  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return getJson(url);
}

export async function GET() {
  try {
    const mediaPayload = await metaGet(`${GUI_ACCOUNT_ID}/media`, {
      fields: 'id,permalink,timestamp',
      limit: 50,
    });
    const media = (mediaPayload?.data || []).find((item) => String(item?.permalink || '').includes(TARGET_SHORTCODE));
    if (!media) return Response.json({ ok: false, error: 'Post não encontrado.' }, { status: 404 });

    const commentsPayload = await metaGet(`${media.id}/comments`, {
      fields: 'id,text,username,timestamp,from',
      limit: 100,
    });

    const comments = (commentsPayload?.data || []).filter((comment) => {
      const when = Date.parse(comment?.timestamp || '');
      const username = String(comment?.username || comment?.from?.username || '').toLowerCase();
      return username !== 'gui_nonato'
        && Number.isFinite(when)
        && when <= CUTOFF
        && normalizeText(comment?.text).includes('FORNECEDOR');
    }).map((comment) => ({
      id: comment.id,
      username: comment.username || comment?.from?.username || null,
      text: comment.text,
      timestamp: comment.timestamp,
    }));

    return Response.json({ ok: true, mediaId: media.id, matched: comments.length, comments });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
