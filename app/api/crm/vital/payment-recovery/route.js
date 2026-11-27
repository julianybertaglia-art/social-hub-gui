import { getVitalCrmMember } from '../../../../lib/vital-crm-access.mjs';
import { recoveryUrl } from '../../../../lib/server/vital-payment-recovery.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const responseHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 5;
const PAGE_SIZE = 100;

function maskedEmail(value) {
  const email = String(value || '').trim();
  const at = email.indexOf('@');
  if (at < 1) return '';
  return email.slice(0, 1) + '***' + email.slice(at);
}

function maskedPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length < 7 ? '' : '•••• ' + digits.slice(-4);
}

function paymentMethod(order) {
  const value = order?.payment_details?.method || order?.payment_details?.type ||
    order?.gateway_name || order?.gateway;
  if (typeof value === 'string') return value.slice(0, 80);
  return String(value?.type || value?.name || '').slice(0, 80);
}

function orderKind(order) {
  if (String(order?.status || '') === 'cancelled') return '';
  const status = String(order?.payment_status || '');
  if (status === 'paid') return 'payment_confirmed';
  if (status === 'expired' || order?.payment_details?.status === 'expired') return 'payment_expired';
  if (status === 'pending' && String(order?.status || '') === 'open') return 'payment_pending';
  return '';
}

function safeItem(entity, type, kind, history = []) {
  const email = entity?.contact_email || entity?.customer?.email || '';
  const phone = entity?.contact_phone || entity?.customer?.phone || '';
  const createdAt = entity?.created_at || entity?.completed_at || null;
  const checkout = type === 'checkout';
  return {
    entityType: type,
    entityId: String(entity?.id || ''),
    kind,
    customerName: String(entity?.contact_name || entity?.customer?.name || '').trim().slice(0, 100) || 'Cliente',
    contactHint: maskedEmail(email) || maskedPhone(phone) || 'Contato não informado',
    createdAt,
    orderNumber: checkout ? '' : String(entity?.number || ''),
    orderStatus: String(entity?.status || ''),
    paymentStatus: checkout ? 'não iniciado' : String(entity?.payment_status || 'não informado'),
    total: String(entity?.total || ''),
    currency: String(entity?.currency || 'BRL').slice(0, 3),
    paymentMethod: checkout ? paymentMethod(entity) || 'Ainda não selecionado' : paymentMethod(entity) || 'Não informado pela Nuvemshop',
    recoveryUrl: recoveryUrl(entity, checkout ? 'checkout' : 'payment'),
    history,
  };
}

async function fetchPages(resource, store, headers, since, until) {
  const rows = [];
  let incomplete = false;
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const query = new URLSearchParams({
      created_at_min: since,
      created_at_max: until,
      per_page: String(PAGE_SIZE),
      page: String(page),
    });
    const response = await fetch('https://api.nuvemshop.com.br/2025-03/' + store + '/' + resource + '?' + query, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(resource + '_unavailable');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(resource + '_invalid');
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    if (page === PAGE_LIMIT) incomplete = true;
  }
  return { rows, incomplete };
}

function classifyCheckouts(checkouts, orders) {
  const byToken = new Map();
  for (const order of orders) {
    if (order?.token) byToken.set(String(order.token), order);
  }
  const result = [];
  for (const checkout of checkouts) {
    const linkedOrder = checkout?.token ? byToken.get(String(checkout.token)) : null;
    if (linkedOrder) {
      if (String(linkedOrder.payment_status) === 'paid') {
        result.push({ entity: checkout, type: 'checkout', kind: 'sale_recovered' });
      }
      continue;
    }
    if (checkout?.completed_at) continue;
    result.push({ entity: checkout, type: 'checkout', kind: 'checkout_abandoned' });
  }
  return result;
}

export async function GET(request) {
  try {
    const { access, organization } = await getVitalCrmMember(request);
    if (access.role !== 'owner') {
      return Response.json({ error: 'Acesso restrito à administradora.' }, { status: 403, headers: responseHeaders });
    }

    const store = process.env.NUVEMSHOP_VITAL_STORE_ID;
    const token = process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
    if (!/^\d{3,20}$/.test(store || '') || !token) {
      return Response.json({ error: 'A consulta da loja ainda não está configurada.' }, { status: 503, headers: responseHeaders });
    }

    const now = Date.now();
    const since = new Date(now - WINDOW_MS).toISOString();
    const until = new Date(now).toISOString();
    const headers = {
      Authorization: 'Bearer ' + token,
      'User-Agent': process.env.NUVEMSHOP_VITAL_USER_AGENT || 'TidePlace Vital CRM',
      Accept: 'application/json',
    };
    const [orderResult, checkoutResult] = await Promise.all([
      fetchPages('orders', store, headers, since, until),
      fetchPages('checkouts', store, headers, since, until)
        .catch(() => ({ rows: [], incomplete: false, unavailable: true })),
    ]);

    const { data: historyRows, error: historyError } = await access.db
      .from('crm_vital_payment_recovery')
      .select('entity_type,entity_id,stage,state,created_at,updated_at')
      .eq('organization_id', organization.id).eq('store_id', store)
      .order('created_at', { ascending: false }).limit(500);
    const historyAvailable = !historyError;
    const histories = new Map();
    for (const row of historyRows || []) {
      const key = String(row.entity_type) + ':' + String(row.entity_id);
      if (!histories.has(key)) histories.set(key, []);
      if (histories.get(key).length < 5) {
        histories.get(key).push({
          stage: row.stage, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at,
        });
      }
    }

    const rows = [];
    for (const order of orderResult.rows) {
      const kind = orderKind(order);
      if (kind) rows.push(safeItem(order, 'order', kind, histories.get('order:' + String(order.id)) || []));
    }
    for (const item of classifyCheckouts(checkoutResult.rows, orderResult.rows)) {
      rows.push(safeItem(item.entity, item.type, item.kind,
        histories.get(item.type + ':' + String(item.entity.id)) || []));
    }
    rows.sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''));

    const emailReady = process.env.VITAL_RESEND_DOMAIN_VERIFIED === 'true' &&
      Boolean(process.env.RESEND_API_KEY) &&
      process.env.VITAL_RECOVERY_EMAIL_FROM === 'Vital Decor <atendimento@vitaldecor.com.br>';
    const checks = [
      { id: 'orders', label: 'Pedidos e pagamentos Nuvemshop', ready: true, detail: 'Consulta direta à API da loja.' },
      { id: 'checkouts', label: 'Checkouts abandonados Nuvemshop', ready: !checkoutResult.unavailable,
        detail: checkoutResult.unavailable ? 'Sem acesso ao recurso de checkouts; confira a permissão read_orders.' : 'A API registra checkouts que chegaram à segunda etapa.' },
      { id: 'ledger', label: 'Histórico e bloqueio de duplicidade', ready: historyAvailable,
        detail: historyAvailable ? 'Ledger persistente acessível.' : 'A tabela de recuperação ainda não está disponível.' },
      { id: 'email', label: 'Domínio e serviço de e-mail', ready: emailReady,
        detail: emailReady ? 'Remetente configurado e domínio sinalizado como verificado.' : 'Aguardando domínio verificado e credencial Resend na Vercel.' },
      { id: 'whatsapp', label: 'WhatsApp autorizado', ready: false,
        detail: 'A automação exige consentimento explícito e modelo aprovado na conexão da Vital.' },
      { id: 'scheduler', label: 'Agendamento automático', ready: process.env.VITAL_RECOVERY_SCHEDULER_ENABLED === 'true',
        detail: process.env.VITAL_RECOVERY_SCHEDULER_ENABLED === 'true' ? 'Verificação periódica configurada.' : 'O agendador ainda não foi ativado.' },
    ];

    return Response.json({
      mode: 'monitoring',
      sendingEnabled: process.env.VITAL_PAYMENT_RECOVERY_ENABLED === 'true' && emailReady &&
        historyAvailable && process.env.VITAL_RECOVERY_SCHEDULER_ENABLED === 'true',
      items: rows,
      counts: rows.reduce((all, item) => { all[item.kind] = (all[item.kind] || 0) + 1; return all; }, {}),
      incomplete: orderResult.incomplete || checkoutResult.incomplete,
      checkoutsUnavailable: Boolean(checkoutResult.unavailable),
      cartDataAvailable: false,
      historyAvailable,
      checks,
      updatedAt: new Date(now).toISOString(),
    }, { headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Não foi possível carregar a recuperação de vendas.' },
      { status: error.status || 503, headers: responseHeaders });
  }
}
