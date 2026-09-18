import { getSupabaseAdmin, sendWhatsAppInteractiveList } from '../lib.js';
import { WHATSAPP_MENU_ROWS } from '../automation.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PREVIEW_ID = 'juliany-menu-preview-20260918-v3';
const RECIPIENT = '5511972668922';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'send-juliany-menu-preview-v3') {
    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('id,wa_id,profile_name')
    .eq('wa_id', RECIPIENT)
    .maybeSingle();

  if (contactError) return Response.json({ ok: false, error: contactError.message }, { status: 500 });
  if (!contact) return Response.json({ ok: false, error: 'Contato não encontrado.' }, { status: 404 });

  const { data: previous, error: previousError } = await supabase
    .from('whatsapp_messages')
    .select('meta_message_id,status,sent_at')
    .eq('contact_id', contact.id)
    .contains('raw_payload', { preview_id: PREVIEW_ID })
    .in('status', ['sent','delivered','read'])
    .order('sent_at', { ascending: false })
    .limit(1);

  if (previousError) return Response.json({ ok: false, error: previousError.message }, { status: 500 });
  if (previous?.length) return Response.json({ ok: true, alreadySent: true, message: previous[0] });

  const messageBody = 'Oi! Eu sou a Juliany, da equipe do Gui Nonato e da Vital Decor 👋\n\nPara eu te direcionar mais rápido, toque abaixo e escolha o assunto que você quer falar:';

  const result = await sendWhatsAppInteractiveList({
    to: RECIPIENT,
    body: messageBody,
    button: 'Escolher assunto',
    sections: [{ title: 'Como posso ajudar?', rows: WHATSAPP_MENU_ROWS }],
  });

  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: 'interactive',
    body: messageBody,
    status: 'sent',
    raw_payload: { preview_id: PREVIEW_ID, provider: 'meta', result },
    sent_at: now,
  });

  if (insertError) {
    return Response.json({
      ok: false,
      sent: Boolean(messageId),
      messageId,
      error: 'Mensagem pode ter sido enviada, mas falhou ao registrar: ' + insertError.message,
    }, { status: 500 });
  }

  return Response.json({ ok: true, sent: true, messageId, recipient: RECIPIENT });
}
