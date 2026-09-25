import { getSupabaseAdmin, normalizeWhatsAppRecipient } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_KEY = 'confirmacao-imersao-2609-gato-20260925';
const SENT_TAG = 'Confirmação Imersão enviada · 25/09';

function bridgeCredentials() {
  const baseUrl = String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/+$/, '');
  const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '');
  if (!baseUrl || !token) throw new Error('WhatsApp Gato não configurado.');
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error || 'Falha na ponte do WhatsApp Gato.');
    error.code = payload?.code || response.status;
    throw error;
  }
  return payload;
}

async function counts(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('status')
    .eq('batch_key', BATCH_KEY);
  if (error) throw error;
  const result = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const row of data || []) {
    result.total += 1;
    if (Object.prototype.hasOwnProperty.call(result, row.status)) result[row.status] += 1;
  }
  return result;
}

export async function POST() {
  const supabase = getSupabaseAdmin();

  try {
    const status = await bridgeRequest('/status');
    if (!status?.connected) {
      return Response.json({ ok: false, error: 'WhatsApp Gato não está conectado.', state: status?.state || null }, { status: 409 });
    }

    const { data: rows, error } = await supabase
      .from('whatsapp_outbound_queue')
      .select('id,contact_id,text_body,status,created_at')
      .eq('batch_key', BATCH_KEY)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(8);
    if (error) throw error;

    if (!rows?.length) {
      const current = await counts(supabase);
      return Response.json({ ok: true, done: current.pending === 0 && current.sending === 0, counts: current });
    }

    const results = [];

    for (const row of rows) {
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from('whatsapp_outbound_queue')
        .update({ status: 'sending', reason: null, updated_at: now })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      try {
        const { data: contact, error: contactError } = await supabase
          .from('whatsapp_contacts')
          .select('id,phone,wa_id,tags')
          .eq('id', row.contact_id)
          .single();
        if (contactError) throw contactError;

        const to = normalizeWhatsAppRecipient(contact.phone || contact.wa_id);
        if (!to) throw new Error('Número inválido');

        const sent = await bridgeRequest('/messages/text', {
          method: 'POST',
          body: JSON.stringify({ to, text: row.text_body }),
        });

        const sentAt = new Date().toISOString();
        const messageId = sent?.messageId || null;

        if (messageId) {
          await supabase.from('whatsapp_messages').upsert({
            meta_message_id: messageId,
            contact_id: contact.id,
            direction: 'outbound',
            message_type: 'text',
            body: row.text_body,
            status: 'sent',
            raw_payload: { provider: 'gato', batch_key: BATCH_KEY, bridge: sent },
            sent_at: sentAt,
          }, { onConflict: 'meta_message_id', ignoreDuplicates: true });
        }

        const tags = Array.isArray(contact.tags) ? contact.tags : [];
        const nextTags = tags.includes(SENT_TAG) ? tags : [...tags, SENT_TAG];

        await supabase.from('whatsapp_contacts')
          .update({ tags: nextTags, last_message_at: sentAt, updated_at: sentAt })
          .eq('id', contact.id);

        await supabase.from('whatsapp_outbound_queue')
          .update({ status: 'sent', message_id: messageId, sent_at: sentAt, reason: null, updated_at: sentAt })
          .eq('id', row.id);

        results.push({ id: row.id, status: 'sent' });
      } catch (err) {
        await supabase.from('whatsapp_outbound_queue')
          .update({
            status: 'failed',
            reason: err instanceof Error ? err.message.slice(0, 500) : 'Falha no envio',
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        results.push({ id: row.id, status: 'failed', error: err instanceof Error ? err.message : 'Falha no envio' });
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const current = await counts(supabase);
    return Response.json({
      ok: true,
      done: current.pending === 0 && current.sending === 0,
      processed: results.length,
      counts: current,
      failedThisRun: results.filter((x) => x.status === 'failed').length,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no disparo pelo WhatsApp Gato.',
    }, { status: 500 });
  }
}
