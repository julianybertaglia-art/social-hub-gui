const PORT = Number(process.env.PORT || 3000);
const BRIDGE_API_TOKEN = String(process.env.BRIDGE_API_TOKEN || '');
const BRIDGE_WEBHOOK_URL = String(process.env.BRIDGE_WEBHOOK_URL || '');
const BRIDGE_WEBHOOK_TOKEN = String(process.env.BRIDGE_WEBHOOK_TOKEN || process.env.BRIDGE_API_TOKEN || '');
const POLL_MS = 5000;

let inFlight = false;
let stopped = false;

function workerOrigin() {
  if (!BRIDGE_WEBHOOK_URL) return '';
  try {
    return new URL(BRIDGE_WEBHOOK_URL).origin;
  } catch {
    return '';
  }
}

async function hubRequest(path, body) {
  const origin = workerOrigin();
  if (!origin || !BRIDGE_WEBHOOK_TOKEN) return null;

  const response = await fetch(origin + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + BRIDGE_WEBHOOK_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Hub respondeu HTTP ' + response.status);
  }
  return payload;
}

async function bridgeSend(job) {
  const isText = job?.type === 'text';
  const route = isText ? '/messages/text' : '/messages/audio';
  const body = isText
    ? { to: job.to, text: job.text }
    : {
        to: job.to,
        audioUrl: job.audioUrl,
        ptt: true,
        mimetype: 'audio/ogg; codecs=opus',
      };

  const response = await fetch('http://127.0.0.1:' + PORT + route, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + BRIDGE_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Ponte respondeu HTTP ' + response.status);
  }
  return payload;
}

async function processOutboundQueue() {
  const next = await hubRequest('/api/whatsapp/outbound-worker', { action: 'next' });
  const job = next?.job;
  if (!job) return false;

  try {
    const sent = await bridgeSend(job);
    await hubRequest('/api/whatsapp/outbound-worker', {
      action: 'result',
      id: job.id,
      success: true,
      messageId: sent?.messageId || null,
    });
  } catch (error) {
    await hubRequest('/api/whatsapp/outbound-worker', {
      action: 'result',
      id: job.id,
      success: false,
      error: error instanceof Error ? error.message : 'Falha no envio',
    }).catch(() => {});
  }
  return true;
}

async function processCampaign() {
  const next = await hubRequest('/api/whatsapp/campaign-worker', { action: 'next' });
  const job = next?.job;
  if (!job) return false;

  try {
    const sent = await bridgeSend({ ...job, type: 'audio' });
    await hubRequest('/api/whatsapp/campaign-worker', {
      action: 'result',
      logId: job.logId,
      success: true,
      messageId: sent?.messageId || null,
    });
  } catch (error) {
    await hubRequest('/api/whatsapp/campaign-worker', {
      action: 'result',
      logId: job.logId,
      success: false,
      error: error instanceof Error ? error.message : 'Falha no envio',
    }).catch(() => {});
  }
  return true;
}

async function tick() {
  if (stopped || inFlight || !BRIDGE_API_TOKEN || !workerOrigin()) return;
  inFlight = true;

  try {
    const handled = await processOutboundQueue();
    if (!handled) await processCampaign();
  } catch (error) {
    console.error('[campaign-runner]', error instanceof Error ? error.message : error);
  } finally {
    inFlight = false;
  }
}

const timer = setInterval(tick, POLL_MS);
timer.unref?.();
setTimeout(tick, 3000).unref?.();

function shutdown() {
  stopped = true;
  clearInterval(timer);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
