// Pure eligibility and scheduling rules. No network calls or message dispatch.
export function recoveryPlan(order, now = Date.now()) {
  const id = String(order?.id || '');
  const status = String(order?.status || '');
  const payment = String(order?.payment_status || '');
  const created = Date.parse(order?.completed_at || order?.created_at || '');
  if (!/^\d{1,20}$/.test(id) || status !== 'open' || payment !== 'pending' ||
      !Number.isFinite(created) || !Number.isFinite(now) || created > now)
    return [];
  // Do not retroactively contact old orders.
  if (now - created > 24 * 60 * 60 * 1000) return [];
  return [
    {stage:'pending_email',channel:'email',dueAt:new Date(created+30*60*1000).toISOString()},
    {stage:'pending_whatsapp',channel:'whatsapp',dueAt:new Date(created+210*60*1000).toISOString()},
  ].map(s=>({...s,due:Date.parse(s.dueAt)<=now}));
}
export function recoveryMessage(order) {
  const number=String(order?.number || '').replace(/[^0-9]/g,'').slice(0,20);
  const reference=number ? ' #'+number : '';
  return {
    subject:'Podemos ajudar você a finalizar seu pedido?',
    text:'Olá! Seu pedido'+reference+' na Vital Decor está aguardando a confirmação do pagamento. Encontrou alguma dificuldade para finalizar sua compra? Nossa equipe está à disposição. Caso já tenha pago, desconsidere esta mensagem. Equipe Vital Decor.'
  };
}
