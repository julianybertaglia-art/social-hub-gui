import { getMetaCredentials, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEMPLATE_NAME = 'audio_gui_followup_v1';

async function graphJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
    error.code = payload?.error?.code || response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function POST() {
  const meta = await getMetaCredentials();
  const accessToken = meta?.accessToken || '';
  const wabaId = meta?.wabaId || '2367783123681402';
  if (!accessToken || !wabaId) {
    return Response.json({ ok: false, error: 'Credenciais Meta indisponíveis.' }, { status: 503 });
  }

  try {
    const payload = await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: TEMPLATE_NAME,
          language: 'pt_BR',
          category: 'MARKETING',
          components: [
            {
              type: 'BODY',
              text: 'Oi! Aqui é da equipe do Gui Nonato. O Gui separou um áudio com uma orientação para o seu momento no Mercado Livre. Quer que eu te envie por aqui?'
            },
            {
              type: 'BUTTONS',
              buttons: [
                { type: 'QUICK_REPLY', text: 'Sim, pode enviar' }
              ]
            }
          ]
        }),
      }
    );

    return Response.json({ ok: true, created: true, template: TEMPLATE_NAME, meta: payload });
  } catch (error) {
    return Response.json({
      ok: false,
      template: TEMPLATE_NAME,
      error: error instanceof Error ? error.message : 'Falha ao criar template',
      code: error?.code || null,
      meta: error?.payload || null,
    }, { status: 502 });
  }
}

export async function GET() {
  const meta = await getMetaCredentials();
  const accessToken = meta?.accessToken || '';
  const wabaId = meta?.wabaId || '2367783123681402';
  if (!accessToken || !wabaId) {
    return Response.json({ ok: false, error: 'Credenciais Meta indisponíveis.' }, { status: 503 });
  }

  try {
    const payload = await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}&fields=id,name,status,category,language,components&limit=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return Response.json({ ok: true, templates: payload?.data || [] });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar template' }, { status: 502 });
  }
}
