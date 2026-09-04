import crypto from 'node:crypto';
import { getSupabaseAdmin, messageBody, normalizeWaId, upsertWhatsAppContact } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function eventValues(payload) {
  if (!Array.isArray(payload?.entry)) return [];
  return payload.entry.flatMap((entry) =>
    Array.isArray(entry?.changes)
      ? entry.changes
          .filter((change) => change?.field === 'messages' && change?.value)
          .map((change) => change.value)
      : []
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    return Response.json({ ok: false, error: 'Token de verificação do WhatsApp não configurado.' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return Response.json({ ok: false, error: 'Verificação recusada.' }, { status: 403 });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!isValidSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    for (const value of eventValues(payload)) {
      const contactsById = new Map(
        (value.contacts || []).map((contact) => [
          normalizeWaId(contact?.wa_id),
          contact?.profile?.name || null,
        ])
      );

      for (const message of value.messages || []) {
        const waId = normalizeWaId(message?.from);
        if (!waId) continue;

        const timestamp = message?.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString();
        const source = message?.referral ? 'Anúncio Meta' : 'WhatsApp';
        const contact = await upsertWhatsAppContact(supabase, {
          waId,
          profileName: contactsById.get(waId),
          source,
          lastMessageAt: timestamp,
        });

        const { error } = await supabase
          .from('whatsapp_messages')
          .upsert({
            meta_message_id: message?.id || null,
            contact_id: contact.id,
            direction: 'inbound',
            message_type: message?.type || 'unknown',
            body: messageBody(message),
            status: 'received',
            raw_payload: message,
            sent_at: timestamp,
          }, {
            onConflict: 'meta_message_id',
            ignoreDuplicates: true,
          });

        if (error) throw error;
      }

      for (const status of value.statuses || []) {
        if (!status?.id) continue;
        const { error } = await supabase
          .from('whatsapp_messages')
          .update({ status: status.status || 'unknown' })
          .eq('meta_message_id', status.id);
        if (error) throw error;
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook:', error);
    return Response.json({ ok: false, error: 'Falha ao processar evento do WhatsApp.' }, { status: 500 });
  }
}
