import { timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '../../whatsapp/lib';
import { checkoutRecoveryPlan, recoveryMessage, recoveryPlan, recoveryUrl } from '../../../lib/server/vital-payment-recovery.mjs';
import { dispatchRecoveryEmail, resendAdapter } from '../../../lib/server/vital-payment-dispatch.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const responseHeaders = { 'Cache-Control': 'no-store' };
const PAGE_SIZE = 100;
const PAGE_LIMIT = 5;
const DAY = 24 * 60 * 60 * 1000;

function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || ''));
}

function apiHeaders() {
  return {
    Authorization: 'Bearer ' + process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN,
    'User-Agent': process.env.NUVEMSHOP_VITAL_USER_AGENT || 'TidePlace Vital CRM',
    Accept: 'application/json',
  };
}

async function getNuvemshop(resource, store, query) {
  const url = 'https://api.nuvemshop.com.br/2025-03/' + store + '/' + resource +
    (query ? '?' + query.toString() : '');
  const response = await fetch(url, {
    headers: apiHeaders(), cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('nuvemshop_unavailable');
  return response.json();
}

async function readOrder(store, id) {
  const data = await getNuvemshop('orders/' + encodeURIComponent(id), store);
  return Array.isArray(data) ? data[0] : data;
}

async function readCheckout(store, id) {
  const data = await getNuvemshop('checkouts/' + encodeURIComponent(id), store);
  return Array.isArray(data) ? data[0] : data;
}

async function listPages(resource, store, since) {
  const rows = [];
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const query = new URLSearchParams({
      created_at_min: since,
      per_page: String(PAGE_SIZE),
      page: String(page),
    });
    const data = await getNuvemshop(resource, store, query);
    if (!Array.isArray(data)) throw new Error('nuvemshop_invalid');
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function hasActiveOrderForCheckout(store, checkout) {
  const email = normalizeEmail(checkout?.contact_email);
  const created = Date.parse(checkout?.created_at || '');
  if (!validEmail(email) || !Number.isFinite(created)) return false;
  const query = new URLSearchParams({
    q: email,
    created_at_min: new Date(Math.max(Date.now() - 30 * DAY, created - DAY)).toISOString(),
    per_page: '100',
    page: '1',
  });
  const orders = await getNuvemshop('orders', store, query);
  if (!Array.isArray(orders)) return true;
  return orders.some(order =>
    normalizeEmail(order?.contact_email) === email &&
    String(order?.status || '') !== 'cancelled' &&
    ['pending', 'authorized', 'partially_paid', 'paid'].includes(String(order?.payment_status || ''))
  );
}

function newestPerEmail(rows, emailOf, createdOf) {
  const byEmail = new Map();
  for (const row of rows) {
    const email = normalizeEmail(emailOf(row));
    if (!validEmail(email)) continue;
    const previous = byEmail.get(email);
    if (!previous || Date.parse(createdOf(row) || '') > Date.parse(createdOf(previous) || '')) byEmail.set(email, row);
  }
  return [...byEmail.values()];
}

export async function POST(request) {
  const cronSecret = process.env.VITAL_RECOVERY_CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secureEquals(supplied, cronSecret)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401, headers: responseHeaders });
  }

  const enabled = process.env.VITAL_PAYMENT_RECOVERY_ENABLED === 'true';
  const emailReady = process.env.VITAL_RESEND_DOMAIN_VERIFIED === 'true' &&
    Boolean(process.env.RESEND_API_KEY) &&
    process.env.VITAL_RECOVERY_EMAIL_FROM === 'Vital Decor <atendimento@vitaldecor.com.br>';
  const store = process.env.NUVEMSHOP_VITAL_STORE_ID;
  if (!enabled || !emailReady) {
    return Response.json({ state: 'disabled', reason: !enabled ? 'feature_flag' : 'email_not_ready' }, { headers: responseHeaders });
  }
  if (!/^\d{3,20}$/.test(store || '') || !process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN) {
    return Response.json({ state: 'unavailable', reason: 'store_not_ready' }, { status: 503, headers: responseHeaders });
  }

  const db = getSupabaseAdmin();
  const { data: organization, error: orgError } = await db.from('crm_organizations')
    .select('id').eq('workspace_code', 'vital-decor').maybeSingle();
  if (orgError || !organization?.id) {
    return Response.json({ state: 'unavailable', reason: 'organization_not_ready' }, { status: 503, headers: responseHeaders });
  }

  try {
    const now = Date.now();
    const orderSince = new Date(now - DAY).toISOString();
    const checkoutSince = new Date(now - 30 * DAY).toISOString();
    const [orders, checkouts] = await Promise.all([
      listPages('orders', store, orderSince),
      listPages('checkouts', store, checkoutSince),
    ]);
    const from = process.env.VITAL_RECOVERY_EMAIL_FROM;
    const sendEmail = resendAdapter({ apiKey: process.env.RESEND_API_KEY, from });
    let sent = 0;
    let duplicate = 0;
    let skipped = 0;
    let uncertain = 0;

    const pending = orders.filter(order => recoveryPlan(order, now).some(stage =>
      stage.channel === 'email' && stage.due));
    for (const order of newestPerEmail(pending, item => item?.contact_email || item?.customer?.email, item => item?.created_at)) {
      const outcome = await dispatchRecoveryEmail({
        db, organizationId: organization.id, storeId: store, entityType: 'order',
        entityId: String(order.id), stage: 'payment_email_30m',
        readEntity: () => readOrder(store, order.id),
        isEligible: (current, at) => recoveryPlan(current, at).some(stage => stage.stage === 'payment_email_30m' && stage.due),
        getEmail: current => current?.contact_email || current?.customer?.email,
        buildMessage: current => recoveryMessage(current, 'payment'),
        sendEmail, now: Date.now, enabled: true,
      });
      if (outcome.state === 'sent') sent++;
      else if (outcome.state === 'duplicate') duplicate++;
      else if (outcome.state === 'uncertain') uncertain++;
      else skipped++;
    }

    const dueCheckouts = checkouts.filter(checkout =>
      checkoutRecoveryPlan(checkout, now).some(stage => stage.stage === 'checkout_email_6h' && stage.due));
    for (const checkout of newestPerEmail(dueCheckouts, item => item?.contact_email, item => item?.created_at)) {
      const eligible = async (current, at) => {
        const plan = checkoutRecoveryPlan(current, at);
        if (!plan.some(stage => stage.stage === 'checkout_email_6h' && stage.due)) return false;
        if (!recoveryUrl(current, 'checkout')) return false;
        return !(await hasActiveOrderForCheckout(store, current));
      };
      const outcome = await dispatchRecoveryEmail({
        db, organizationId: organization.id, storeId: store, entityType: 'checkout',
        entityId: String(checkout.id), stage: 'checkout_email_6h',
        readEntity: () => readCheckout(store, checkout.id),
        isEligible: eligible,
        getEmail: current => current?.contact_email,
        buildMessage: current => recoveryMessage(current, 'checkout'),
        sendEmail, now: Date.now, enabled: true,
      });
      if (outcome.state === 'sent') sent++;
      else if (outcome.state === 'duplicate') duplicate++;
      else if (outcome.state === 'uncertain') uncertain++;
      else skipped++;
    }

    return Response.json({
      state: 'processed', sent, duplicate, skipped, uncertain,
      whatsappReady: false,
    }, { headers: responseHeaders });
  } catch {
    return Response.json({ state: 'unavailable', reason: 'recovery_scan_failed' },
      { status: 503, headers: responseHeaders });
  }
}
