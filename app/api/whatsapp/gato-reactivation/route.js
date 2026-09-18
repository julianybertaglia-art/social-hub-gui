import { getSupabaseAdmin, normalizeWaId } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_KEY = 'lp-imersao-reativacao-20260918-v3';
const ALLOWED_CONTACTS = new Set([
  'd5b69623-b5c2-4054-8a58-e09f443aac1e',
  '34abe776-6b20-4819-94ba-d3026122e445',
  'b55646f5-121d-4f5f-8623-360bbc7d85aa',
]);

function bridgeCredentials() {
  const baseUrl = String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/+$/, '');
  const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '');
  if (!baseUrl || !token) throw new Error('Gato não configurado.');
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
    const error = new Error(data?.error || 'Gato não respondeu corretamente.');
    error.code = data?.code || response.status;
    throw error;
  }
  return data;
}

function followupText(name) {
  const greeting = name ? `Oi, ${name}! 😊` : 'Oi! 😊';
  return `${greeting} Passando porque lembrei que você tinha demonstrado interesse na Imersão. Como agora estamos bem próximos do evento, vou deixar a página aqui caso ainda faça sentido pra você. Lá estão todas as informações e você consegue garantir o ingresso direto:

https://imersao.guinonato.com/

Se tiver alguma dúvida, me chama por aqui.`;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();

  try {
    if (action === 'status') {
      const status = await bridgeRequest('/status');
      return Response.json({ ok: true, provider: 'gato', ...status });
    }

    if (action !== 'send') {
      return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
    }

    const contactId = String(body?.contactId || '').trim();
    if (!ALLOWED_CONTACTS.has(contactId)) {
      return Response.json({ ok: false, error: 'Contato não autorizado.' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,tags,stage')
      .eq('id', contactId)
      .single();
    if (contactError) throw contactError;

    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    if (['Venda', 'Perdido'].includes(contact.stage)) {
      return Response.json({ ok: true, skipped: true, reason: 'Lead não elegível.' });
    }
    if (tags.includes('LP Imersão enviada')) {
      return Response.json({ ok: true, skipped: true, alreadySent: true, reason: 'LP já enviada.' });
    }

    const text = followupText(contact.profile_name || '');
    const now = new Date().toISOString();

    const { data: lock, error: lockError } = await supabase
      .from('whatsapp_outbound_queue')
      .insert({
        batch_key: BATCH_KEY,
        contact_id: contact.id,
        message_type: 'text',
        segment: null,
        text_body: text,
        status: 'sending',
        not_before: now,
        reason: 'Trava idempotente para recuperação da LP',
      })
      .select('id')
      .single();

    if (lockError) {
      if (lockError.code === '23505') {
        const { data: existing } = await supabase
          .from('whatsapp_outbound_queue')
          .select('id,status,message_id,sent_at,reason')
          .eq('batch_key', BATCH_KEY)
          .eq('contact_id', contact.id)
          .maybeSingle();
        return Response.json({ ok: true, duplicateBlocked: true, existing });
      }
      throw lockError;
    }

    const to = normalizeWaId(contact.phone || contact.wa_id);
    if (!to) throw new Error('Número inválido.');

    try {
      const result = await bridgeRequest('/messages/text', {
        method: 'POST',
        body: JSON.stringify({ to, text }),
      });

      const messageId = result?.messageId || null;
      const sentAt = new Date().toISOString();

      if (messageId) {
        const { error: msgError } = await supabase.from('whatsapp_messages').upsert({
          meta_message_id: messageId,
          contact_id: contact.id,
          direction: 'outbound',
          message_type: 'text',
          body: text,
          status: 'sent',
          raw_payload: {
            provider: 'gato',
            source: 'lp_imersao_reactivation',
            batch_key: BATCH_KEY,
            bridge: result,
          },
          sent_at: sentAt,
        }, { onConflict: 'meta_message_id', ignoreDuplicates: true });
        if (msgError) throw msgError;
      }

      const nextTags = Array.from(new Set([
        ...tags,
        'LP Imersão enviada',
        'Reativação LP Imersão · 18/09',
      ]));

      await supabase.from('whatsapp_contacts').update({
        tags: nextTags,
        last_message_at: sentAt,
        updated_at: sentAt,
      }).eq('id', contact.id);

      await supabase.from('whatsapp_outbound_queue').update({
        status: 'sent',
        message_id: messageId,
        sent_at: sentAt,
        reason: null,
        updated_at: sentAt,
      }).eq('id', lock.id);

      return Response.json({
        ok: true,
        sent: true,
        provider: 'gato',
        contactId: contact.id,
        name: contact.profile_name || to,
        messageId,
      });
    } catch (error) {
      await supabase.from('whatsapp_outbound_queue').update({
        status: 'failed',
        reason: String(error?.message || 'Falha no envio').slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', lock.id);
      throw error;
    }
  } catch (error) {
    const status = error?.code === 'BRIDGE_NOT_CONNECTED' ? 409 : 500;
    return Response.json({
      ok: false,
      code: error?.code || null,
      error: error instanceof Error ? error.message : 'Falha na recuperação da LP.',
    }, { status });
  }
}
