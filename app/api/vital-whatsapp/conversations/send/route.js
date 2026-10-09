import { authorize } from '../../../vital-connections/service';
import { fail } from '../../../vital-connections/helpers.mjs';
import { WHATSAPP_API_VERSION } from '../../../whatsapp/lib';
import { canReplyWithinWindow } from '../inbox.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

function requireSameOrigin(request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const expected = host ? url.protocol + '//' + host : url.origin;
  if (!origin || (origin !== url.origin && origin !== expected)) throw fail('Origem inválida.', 403);
}

export async function POST(request) {
  try {
    requireSameOrigin(request);
    const { db, ownerId } = await authorize(request);
    const raw = await request.text();
    if (raw.length > 10000) throw fail('Mensagem muito longa.', 400);
    const payload = JSON.parse(raw);
    const to = String(payload?.to || '').trim();
    const message = String(payload?.text || '').trim();
    if (!/^\d{8,15}$/.test(to) || !message || message.length > 4096) {
      throw fail('Escolha um contato da Vital e informe uma mensagem de até 4096 caracteres.', 400);
    }

    const { data: connection, error: connError } = await db.from('workspace_meta_connections')
      .select('id,external_account_id,access_token')
      .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'whatsapp').eq('state', 'connected').maybeSingle();
    if (connError) throw fail('Falha ao verificar o canal da Vital.', 503);
    if (!connection?.access_token || !/^\d{5,40}$/.test(String(connection.external_account_id))) {
      throw fail('Conecte o WhatsApp da Vital antes de enviar mensagens.', 409);
    }

    // Only reply to known Vital contacts with a recent inbound message. Never send through the Gui connection.
    const { data: lastInbound, error: readError } = await db.from('workspace_meta_messages')
      .select('sent_at').eq('owner_user_id', ownerId).eq('connection_id', connection.id)
      .eq('contact_wa_id', to).eq('direction', 'inbound')
      .order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (readError) throw fail('Não foi possível verificar a janela de atendimento.', 503);
    if (!canReplyWithinWindow(lastInbound?.sent_at)) {
      throw fail('A janela de 24h terminou. Para retomar a conversa, é necessário um modelo aprovado pela Meta.', 409);
    }

    const response = await fetch(
      'https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/' + connection.external_account_id + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + connection.access_token,
          'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
    const delivered = await response.json().catch(() => ({}));
    if (!response.ok || delivered.error || !delivered.messages?.[0]?.id) {
      throw fail('A Meta não confirmou o envio (' +
        String(delivered.error?.code || response.status) + '). Confira a conexão e tente novamente.', 502);
    }

    const messageId = String(delivered.messages[0].id);
    const now = new Date().toISOString();
    const { error: saveError } = await db.from('workspace_meta_messages').upsert({
      connection_id: connection.id, owner_user_id: ownerId,
      meta_message_id: messageId, contact_wa_id: to,
      direction: 'outbound', message_type: 'text', body: message,
      status: 'sent', sent_at: now,
      raw_payload: { type: 'text', source: 'vital_tideplace_manual' },
    }, { onConflict: 'connection_id,meta_message_id', ignoreDuplicates: true });

    // Once a human sends a message, pause Vivi on this contact until they request MENU.
    const { error: handoffError } = await db.from('vital_whatsapp_flow_sessions').upsert({
      connection_id: connection.id, owner_user_id: ownerId, contact_wa_id: to,
      stage: 'await_human', human_handoff: true, manual_override: true,
      updated_at: now, last_interaction_at: now,
    }, { onConflict: 'connection_id,contact_wa_id' });
    if (handoffError) console.error('Vivi manual takeover:', handoffError.code);

    // Never suggest retrying a message that Meta already accepted.
    return Response.json({
      ok: true, messageId, logged: !saveError,
      warning: saveError ? 'Mensagem enviada pela Meta, mas ainda não apareceu no histórico.' : null,
    }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Falha ao enviar a resposta pelo WhatsApp da Vital.' },
      { status: error.status || 503, headers });
  }
}
