import { getSupabaseAdmin } from '../lib.js';
import { sendWhatsAppReplyButtons } from '../reply-buttons.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN = '6b7f8b50f4d14874a5d34f3b';

const PARTS = [
  {
    key: 'part1',
    body: 'Oi! Eu sou a Juliany, da equipe do Gui Nonato e da Vital Decor 👋\n\nPara eu te direcionar mais rápido, escolha abaixo o assunto que você quer falar:',
    buttons: [
      { id: 'topic_imersao', title: 'Imersão Ecommerce' },
      { id: 'topic_mercado_livre', title: 'Começar no M. Livre' },
      { id: 'topic_mentoria', title: 'Mentoria' },
    ],
  },
  {
    key: 'part2',
    body: 'Outras opções:',
    buttons: [
      { id: 'topic_importacao', title: 'Importação' },
      { id: 'topic_influencer', title: 'Afiliado TikTok' },
      { id: 'topic_other', title: 'Outro assunto' },
    ],
  },
];

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== TOKEN) {
    return Response.json({ ok: false }, { status: 404 });
  }

  const to = String(url.searchParams.get('to') || '').replace(/\D/g, '');
  const previewId = String(url.searchParams.get('preview_id') || '').trim().slice(0, 80);
  if (!/^55\d{10,11}$/.test(to) || !previewId) {
    return Response.json({ ok: false, error: 'Parâmetros inválidos.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id,wa_id')
    .eq('wa_id', to)
    .maybeSingle();

  const sent = [];
  for (const part of PARTS) {
    if (contact?.id) {
      const { data: previous } = await supabase
        .from('whatsapp_messages')
        .select('meta_message_id,status')
        .eq('contact_id', contact.id)
        .contains('raw_payload', {
          source: 'welcome_preview',
          preview_id: previewId,
          preview_part: part.key,
        })
        .limit(1)
        .maybeSingle();

      if (previous?.meta_message_id) {
        sent.push({ part: part.key, skipped: true, messageId: previous.meta_message_id, status: previous.status });
        continue;
      }
    }

    const result = await sendWhatsAppReplyButtons({
      to,
      body: part.body,
      buttons: part.buttons,
    });
    const messageId = result?.messages?.[0]?.id || null;

    if (contact?.id && messageId) {
      await supabase.from('whatsapp_messages').insert({
        meta_message_id: messageId,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'interactive',
        body: part.body,
        status: 'sent',
        raw_payload: {
          source: 'welcome_preview',
          preview_id: previewId,
          preview_part: part.key,
          meta: result,
        },
        sent_at: new Date().toISOString(),
      });
    }

    sent.push({ part: part.key, skipped: false, messageId });
  }

  return Response.json({ ok: true, sent });
}
