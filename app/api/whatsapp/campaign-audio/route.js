import { createHash } from 'crypto';
import { getSupabaseAdmin } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEYS = new Set(['seller', 'iniciante']);
const MAX_BYTES = 2 * 1024 * 1024;

function validKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return KEYS.has(key) ? key : null;
}

function assetUrl(key, sha256) {
  return '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(key)
    + '&raw=1&v=' + encodeURIComponent(sha256 || Date.now());
}

export async function GET(request) {
  const url = new URL(request.url);
  const key = validKey(url.searchParams.get('key'));
  const raw = url.searchParams.get('raw') === '1';
  const supabase = getSupabaseAdmin();

  if (raw) {
    if (!key) return new Response('Áudio inválido.', { status: 400 });
    const { data, error } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .select('mime_type,data_base64,sha256')
      .eq('key', key)
      .maybeSingle();
    if (error) return new Response(error.message, { status: 500 });
    if (!data?.data_base64) return new Response('Áudio não encontrado.', { status: 404 });
    const buffer = Buffer.from(data.data_base64, 'base64');
    return new Response(buffer, {
      headers: {
        'Content-Type': data.mime_type || 'audio/ogg; codecs=opus',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Audio-Version': data.sha256 || '',
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const { data, error } = await supabase
    .from('whatsapp_campaign_audio_assets')
    .select('key,mime_type,sha256,updated_at,data_base64');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const assets = {};
  for (const item of data || []) {
    const ready = Boolean(item.data_base64 && item.data_base64.length > 0);
    assets[item.key] = {
      ready,
      mimeType: item.mime_type,
      sha256: item.sha256,
      updatedAt: item.updated_at,
      url: ready ? assetUrl(item.key, item.sha256) : null,
    };
  }
  return Response.json({ ok: true, assets }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
  });
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const key = validKey(form.get('key'));
    const file = form.get('file');
    if (!key) return Response.json({ ok: false, error: 'Tipo de áudio inválido.' }, { status: 400 });
    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ ok: false, error: 'Selecione um arquivo .ogg.' }, { status: 400 });
    }

    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (!name.endsWith('.ogg') && !type.includes('ogg')) {
      return Response.json({ ok: false, error: 'Use o arquivo .ogg do WhatsApp.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) return Response.json({ ok: false, error: 'O áudio está vazio.' }, { status: 400 });
    if (buffer.length > MAX_BYTES) return Response.json({ ok: false, error: 'O áudio precisa ter até 2 MB.' }, { status: 413 });

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('whatsapp_campaign_audio_assets')
      .upsert({
        key,
        mime_type: 'audio/ogg; codecs=opus',
        data_base64: buffer.toString('base64'),
        sha256,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    if (error) throw error;

    return Response.json({
      ok: true,
      key,
      bytes: buffer.length,
      sha256,
      url: assetUrl(key, sha256),
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao salvar áudio.' }, { status: 500 });
  }
}
