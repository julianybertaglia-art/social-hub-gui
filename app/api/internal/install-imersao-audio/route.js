import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TOKEN = 'qg6A4YF4XyMFienRcBRZdczgiQpwedysHCaH7GLMDzs';
const RAW_BASE = 'https://raw.githubusercontent.com/julianybertaglia-art/social-hub-gui/tmp-imersao-audio/tmp/imersao-audio';
const EXPECTED_BASE64_LENGTH = 103668;
const EXPECTED_BYTE_LENGTH = 77749;
const EXPECTED_SHA256 = 'f7a281d27914d288f3848c79b984d32445ae02656b5dcf0c77cfec62bdfe368b';
const BUCKET = 'instagram-audio-tests';
const PATH = 'd3db0981-1179-459e-9449-9e97232f6632/7f6c8990-b64f-4f06-a67f-f4f88dde2609.m4a';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('token') !== TOKEN) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const parts = [];
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch(`${RAW_BASE}/part${index}.txt`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao buscar a parte ${index}.`);
      parts.push((await response.text()).trim());
    }

    const encoded = parts.join('');
    if (encoded.length !== EXPECTED_BASE64_LENGTH) throw new Error(`Base64 inválido: ${encoded.length}.`);
    const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
    if (bytes.length !== EXPECTED_BYTE_LENGTH) throw new Error(`Áudio inválido: ${bytes.length} bytes.`);
    if (Buffer.from(bytes.slice(4, 8)).toString('ascii') !== 'ftyp') throw new Error('Arquivo M4A inválido.');
    const digest = toHex(await crypto.subtle.digest('SHA-256', bytes));
    if (digest !== EXPECTED_SHA256) throw new Error(`Assinatura inválida: ${digest}.`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Credenciais internas indisponíveis.');
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { error } = await db.storage.from(BUCKET).upload(PATH, bytes, {
      contentType: 'audio/mp4',
      cacheControl: '3600',
      upsert: true,
    });
    if (error) throw error;

    return Response.json({ ok: true, bytes: bytes.length, sha256: digest, path: PATH });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
