import { getSupabaseAdmin, normalizeWaId } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bridgeCredentials() {
  const baseUrl = String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/+$/, '');
  const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '');

  if (!baseUrl || !token) {
    const error = new Error('WhatsApp Gato ainda não está configurado no Lynna.');
    error.code = 'GATO_NOT_CONFIGURED';
    throw error;
  }

  return { baseUrl, token };
}

async function bridgeRequest(path, options = {}) {
  const { baseUrl, token } = bridgeCredentials();
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const error = new Error(data?.error || 'O WhatsApp Gato não respondeu corretamente.');
    error.code = data?.code || response.status;
    throw error;
  }
  return data;
}

function audioKeyFromTags(tags = []) {
  if (tags.includes('Já vende')) return 'seller';
  if (tags.includes('Iniciante')) return 'iniciante';
  return null;
}

function audioLabel(key) {
  if (key === 'seller') return 'Já vende';
  if (key === 'iniciante') return 'Iniciante';
  return 'Áudio do Gui';
}

export async function GET() {
  try {
    const status = await bridgeRequest('/status');
    return Response.json({ ok: true, provider: 'gato', ...status });
  } catch (error) {
    const notConfigured = error?.code === 'GATO_NOT_CONFIGURED';
    return Response.json({
      ok: false,
      provider: 'gato',
      state: notConfigured ? 'not_configured' : 'unavailable',
      connected: false,
      error: error instanceof Error ? error.message : 'WhatsApp Gato indisponível.',
    }, { status: notConfigured ? 503 : 502 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim().toLowerCase();

  try {
    if (['connect', 'disconnect', 'relink'].includes(action)) {
      const status = await bridgeRequest('/' + action, {
        method: 'POST',
        body: '{}',
      });
      return Response.json({ ok: true, provider: 'gato', action, ...status });
    }

    if (action !== 'send_audio') {
      return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
    }

    const contactId = String(body?.contactId || '').trim();
    if (!contactId) {
      return Response.json({ ok: false, error: 'Contato obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,tags,notes')
      .eq('id', contactId)
      .single();
    if (contactError) throw contactError;

    const key = audioKeyFromTags(contact.tags || []);
    if (!key) {
      return Response.json({ ok: false, error: 'Esse lead ainda não tem áudio classificado.' }, { status: 409 });
    }

    const to = normalizeWaId(contact.phone || contact.wa_id);
    if (!to) {
      return Response.json({ ok: false, error: 'Esse contato não tem um número válido.' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const audioUrl = origin + '/api/whatsapp/campaign-audio?key=' + encodeURIComponent(key) + '&raw=1';
    const result = await bridgeRequest('/messages/audio', {
      method: 'POST',
      body: JSON.stringify({
        to,
        audioUrl,
        ptt: true,
        mimetype: 'audio/ogg; codecs=opus',
      }),
    });

    const messageId = result?.messageId || result?.messages?.[0]?.id || null;
    const now = new Date().toISOString();

    const { error: messageError } = await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: 'audio',
      body: '🎙️ Áudio do Gui · Gato · ' + audioLabel(key),
      status: 'sent',
      raw_payload: { provider: 'gato', bridge: result, audio_key: key },
      sent_at: now,
    });
    if (messageError) throw messageError;

    const nextTags = Array.from(new Set([
      ...(contact.tags || []).filter((tag) => tag !== 'Aguardando resposta para áudio'),
      'Áudio Gui enviado · Gato',
    ]));

    await supabase
      .from('whatsapp_contacts')
      .update({
        tags: nextTags,
        last_message_at: now,
        updated_at: now,
      })
      .eq('id', contact.id);

    return Response.json({
      ok: true,
      provider: 'gato',
      contactId: contact.id,
      name: contact.profile_name || to,
      audio: key,
      messageId,
      status: 'sent',
    });
  } catch (error) {
    const code = error?.code;
    const status = code === 'GATO_NOT_CONFIGURED'
      ? 503
      : code === 'BRIDGE_NOT_CONNECTED'
        ? 409
        : 502;
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no WhatsApp Gato.',
      code: code || null,
    }, { status });
  }
}
