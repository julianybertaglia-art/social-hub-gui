import { getMetaCredentials, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const meta = await getMetaCredentials();
  const accessToken = meta?.accessToken || '';
  const wabaId = meta?.wabaId || '2367783123681402';
  if (!accessToken || !wabaId) {
    return Response.json({ ok: false, error: 'Credenciais Meta indisponíveis.' }, { status: 503 });
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,category,language,components&limit=100`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    return Response.json({ ok: false, error: payload?.error?.message || `Meta HTTP ${response.status}` }, { status: 502 });
  }

  const templates = Array.isArray(payload?.data) ? payload.data.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    components: t.components,
  })) : [];

  return Response.json({ ok: true, templates }, { headers: { 'Cache-Control': 'no-store' } });
}
