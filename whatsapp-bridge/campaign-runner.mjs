const PORT = Number(process.env.PORT || 3000);
const BRIDGE_API_TOKEN = String(process.env.BRIDGE_API_TOKEN || '');
const BRIDGE_WEBHOOK_URL = String(process.env.BRIDGE_WEBHOOK_URL || '');
const BRIDGE_WEBHOOK_TOKEN = String(process.env.BRIDGE_WEBHOOK_TOKEN || process.env.BRIDGE_API_TOKEN || '');
const POLL_MS = 5000;

let inFlight = false;
let stopped = false;

function workerUrl() {
  if (!BRIDGE_WEBHOOK_URL) return '';
  try {
    const origin = new URL(BRIDGE_WEBHOOK_URL).origin;
    return origin + '/api/whatsapp/campaign-worker';
  } catch {
    return '';
  }
}

async function hubRequest(body) {
  const url = workerUrl();
  if (!url || !BRIDGE_WEBHOOK_TOKEN) return null;

  const response = await fetch(url, {
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

async function bridgeAudio(job) {
  const response = await fetch('http://127.0.0.1:' + PORT + '/messages/audio', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + BRIDGE_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: job.to,
      audioUrl: job.audioUrl,
      ptt: true,
      mimetype: 'audio/ogg; codecs=opus',
    }),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || 'Ponte respondeu HTTP ' + response.status);
  }
  return payload;
}

async function tick() {
  if (stopped || inFlight || !BRIDGE_API_TOKEN || !workerUrl()) return;
  inFlight = true;

  try {
    const next = await hubRequest({ action: 'next' });
    const job = next?.job;
    if (!job) return;

    try {
      const sent = await bridgeAudio(job);
      await hubRequest({
        action: 'result',
        logId: job.logId,
        success: true,
        messageId: sent?.messageId || null,
      });
    } catch (error) {
      await hubRequest({
        action: 'result',
        logId: job.logId,
        success: false,
        error: error instanceof Error ? error.message : 'Falha no envio',
      }).catch(() => {});
    }
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
