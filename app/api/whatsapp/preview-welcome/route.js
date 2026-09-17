import { sendWhatsAppReplyButtons } from '../reply-buttons.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TOKEN = '6b7f8b50f4d14874a5d34f3b';

const PARTS = [
  {
    body: 'Oi! Eu sou a Juliany, da equipe do Gui Nonato e da Vital Decor 👋\n\nPara eu te direcionar mais rápido, escolha abaixo o assunto que você quer falar:',
    buttons: [
      { id: 'topic_imersao', title: 'Imersão Ecommerce' },
      { id: 'topic_mercado_livre', title: 'Começar no M. Livre' },
      { id: 'topic_mentoria', title: 'Mentoria' },
    ],
  },
  {
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
  if (!/^55\d{10,11}$/.test(to)) {
    return Response.json({ ok: false, error: 'Número inválido.' }, { status: 400 });
  }

  const sent = [];
  for (const part of PARTS) {
    const result = await sendWhatsAppReplyButtons({
      to,
      body: part.body,
      buttons: part.buttons,
    });
    sent.push(result?.messages?.[0]?.id || null);
  }

  return Response.json({ ok: true, sent });
}
