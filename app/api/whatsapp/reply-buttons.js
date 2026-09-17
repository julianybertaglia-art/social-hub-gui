import {
  getMetaCredentials,
  normalizeWaId,
  WHATSAPP_API_VERSION,
} from './lib.js';

export function buildWhatsAppReplyButtonsMessage({ to, body, buttons }) {
  const safeBody = String(body || '').trim();
  const safeButtons = Array.isArray(buttons)
    ? buttons
        .map((button) => ({
          id: String(button?.id || '').trim().slice(0, 256),
          title: String(button?.title || '').trim().slice(0, 20),
        }))
        .filter((button) => button.id && button.title)
        .slice(0, 3)
    : [];

  if (!safeBody || safeBody.length > 1024) {
    throw new Error('O texto da mensagem com botões é inválido.');
  }
  if (!safeButtons.length) {
    throw new Error('A mensagem precisa ter pelo menos um botão.');
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizeWaId(to),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: safeBody },
      action: {
        buttons: safeButtons.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };
}

export async function sendWhatsAppReplyButtons(options) {
  const credentials = await getMetaCredentials();
  if (!credentials?.accessToken || !credentials?.phoneNumberId) {
    throw new Error('Conclua a conexão oficial do WhatsApp pela Meta antes de enviar.');
  }

  const response = await fetch(
    'https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/' + credentials.phoneNumberId + '/messages',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + credentials.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildWhatsAppReplyButtonsMessage(options)),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || 'Erro Meta HTTP ' + response.status);
    error.code = payload?.error?.code || response.status;
    throw error;
  }
  return payload;
}
