export const dynamic = 'force-dynamic';

const API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';

function safeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !businessAccountId) {
    return Response.json({
      ok: false,
      error: 'Configure META_WHATSAPP_ACCESS_TOKEN e META_WHATSAPP_BUSINESS_ACCOUNT_ID na Vercel.'
    }, { status: 503 });
  }

  const fallbackName = `social_hub_review_${Date.now()}`;
  const name = safeName(body?.name) || fallbackName;
  const text = String(body?.text || 'Olá! Esta é uma mensagem de teste do Social Hub para a análise da Meta.').trim();

  if (!text) {
    return Response.json({ ok: false, error: 'O texto do modelo é obrigatório.' }, { status: 400 });
  }

  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${businessAccountId}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        language: 'pt_BR',
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text,
          },
        ],
      }),
      cache: 'no-store',
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return Response.json({
      ok: false,
      error: payload?.error?.message || `Erro Meta HTTP ${response.status}`,
      meta: payload,
    }, { status: response.status });
  }

  return Response.json({ ok: true, name, result: payload });
}
