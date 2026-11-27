const DAY = 24 * 60 * 60 * 1000;
const STORE_URL = 'https://www.vitaldecor.com.br';

function validId(value) {
  return /^\d{1,20}$/.test(String(value || ''));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeOfficialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const officialHost = host === 'vitaldecor.com.br' || host.endsWith('.vitaldecor.com.br') ||
      host.endsWith('.lojavirtualnuvem.com.br') || host.endsWith('.nuvemshop.com.br') ||
      host.endsWith('.tiendanube.com');
    if (url.protocol !== 'https:' || !officialHost || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function recoveryUrl(entity, kind = 'payment') {
  const candidates = kind === 'checkout'
    ? [entity?.abandoned_checkout_url, entity?.checkout_url]
    : [entity?.checkout_url, entity?.order_url];
  for (const candidate of candidates) {
    const url = safeOfficialUrl(candidate);
    if (url) return url;
  }
  return kind === 'checkout' ? '' : STORE_URL;
}

export function recoveryPlan(order, now = Date.now()) {
  const id = String(order?.id || '');
  const created = Date.parse(order?.created_at || order?.completed_at || '');
  if (!validId(id) || String(order?.status || '') !== 'open' ||
      String(order?.payment_status || '') !== 'pending' ||
      !Number.isFinite(created) || !Number.isFinite(now) || created > now ||
      now - created > DAY) return [];

  return [
    { stage: 'payment_email_30m', channel: 'email', dueAt: new Date(created + 30 * 60 * 1000).toISOString() },
    { stage: 'payment_whatsapp_210m', channel: 'whatsapp', dueAt: new Date(created + 210 * 60 * 1000).toISOString() },
  ].map(stage => ({ ...stage, due: Date.parse(stage.dueAt) <= now }));
}

// Nuvemshop does not expose an explicit abandoned_at value. Waiting six hours
// from recorded creation is conservative because its API says a checkout may
// appear up to six hours after abandonment.
export function checkoutRecoveryPlan(checkout, now = Date.now()) {
  const id = String(checkout?.id || '');
  const created = Date.parse(checkout?.created_at || '');
  if (!validId(id) || checkout?.completed_at || !Number.isFinite(created) ||
      !Number.isFinite(now) || created > now || now - created > 30 * DAY) return [];
  const dueAt = new Date(created + 6 * 60 * 60 * 1000).toISOString();
  return [{ stage: 'checkout_email_6h', channel: 'email', dueAt, due: Date.parse(dueAt) <= now }];
}

export function recoveryMessage(entity, kind = 'payment') {
  const name = String(entity?.contact_name || entity?.customer?.name || '').trim().slice(0, 80);
  const orderNumber = String(entity?.number || '').replace(/[^0-9]/g, '').slice(0, 20);
  const greeting = name ? 'Olá, ' + name + '!' : 'Olá!';
  const number = orderNumber ? ' #' + orderNumber : '';
  const url = recoveryUrl(entity, kind);
  const checkout = kind === 'checkout';
  const subject = checkout
    ? 'Sua compra na Vital Decor pode continuar 💛'
    : 'Podemos ajudar você a finalizar seu pedido? 💛';
  const introduction = checkout
    ? 'Percebemos que você iniciou um checkout na Vital Decor e não concluiu a compra.'
    : 'Seu pedido' + number + ' na Vital Decor está aguardando a confirmação do pagamento.';
  const help = checkout
    ? 'Se quiser, você pode retomar sua compra com segurança pelo botão abaixo.'
    : 'Encontrou alguma dificuldade para finalizar sua compra? Nossa equipe está à disposição para ajudar você.';
  const button = checkout ? 'Retomar minha compra' : (url === STORE_URL ? 'Visitar a loja' : 'Consultar meu pedido');
  const safeName = escapeHtml(greeting);
  const safeIntro = escapeHtml(introduction);
  const safeHelp = escapeHtml(help);
  const safeButton = escapeHtml(button);
  const safeUrl = escapeHtml(url);
  const text = greeting + '\n\n' + introduction + '\n\n' + help + '\n\n' + button + ': ' + url +
    '\n\nCaso já tenha realizado o pagamento, desconsidere esta mensagem.\n\nEquipe Vital Decor';
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#f7f4f2;font-family:Arial,Helvetica,sans-serif;color:#332a2d">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f4f2;padding:28px 12px">' +
    '<tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #eadfe2;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:#53283b;padding:22px 28px;color:#fff;font-size:22px;font-weight:700">Vital Decor <span style="color:#f0c66b">♥</span></td></tr>' +
    '<tr><td style="padding:30px 28px 12px;font-size:16px;line-height:1.65"><p style="margin:0 0 16px">' + safeName + '</p>' +
    '<p style="margin:0 0 16px">' + safeIntro + '</p><p style="margin:0">' + safeHelp + '</p></td></tr>' +
    '<tr><td align="center" style="padding:22px 28px 26px"><a href="' + safeUrl + '" style="display:inline-block;background:#8f2945;color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:14px 22px">' + safeButton + '</a></td></tr>' +
    '<tr><td style="padding:0 28px 28px;color:#6e6266;font-size:13px;line-height:1.6">Caso já tenha realizado o pagamento, desconsidere esta mensagem.<br><br>Equipe Vital Decor</td></tr>' +
    '</table><p style="max-width:600px;color:#857b7f;font-size:11px;line-height:1.5;padding:0 12px">Você recebeu este aviso porque iniciou uma compra na loja Vital Decor.</p></td></tr>' +
    '</table></body></html>';
  return { subject, text, html };
}
