// Server-only secret resolution for the exact Meta app used by Vital Instagram.
// Never return a secret to the browser, store it in a database or log its value.
import { UNIFIED_APP_ID, META_API_VERSION } from './lib.mjs';

function sanitizedFailure(error) {
  const code = Number(error?.code);
  const subcode = Number(error?.error_subcode);
  return Object.assign(new Error('app_credentials'), {
    reason: 'app_credentials',
    metaCode: Number.isInteger(code) && code > 0 && code < 1000000 ? code : null,
    metaSubcode: Number.isInteger(subcode) && subcode > 0 && subcode < 1000000000 ? subcode : null,
  });
}

export async function resolveAppSecret() {
  const configured = [
    { value: process.env.META_APP_SECRET, source: 'meta' },
    // This legacy variable is only usable when verified as belonging to
    // UNIFIED_APP_ID. Do not use its WhatsApp token or change WhatsApp settings.
    { value: process.env.META_WHATSAPP_APP_SECRET, source: 'compatibility' },
  ];
  const candidates = configured
    .map((candidate) => ({
      ...candidate,
      value: typeof candidate.value === 'string' ? candidate.value.trim() : '',
    }))
    .filter((candidate, index, all) =>
      candidate.value.length > 8 &&
      all.findIndex((entry) => entry.value === candidate.value) === index);
  if (!candidates.length) throw Object.assign(new Error('secret_missing'), { reason: 'secret_missing' });

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch('https://graph.facebook.com/' + META_API_VERSION + '/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: UNIFIED_APP_ID,
          client_secret: candidate.value,
          grant_type: 'client_credentials',
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.access_token === 'string' && result.access_token.length > 20) {
        return candidate;
      }
      lastError = result?.error || null;
    } catch {
      // No raw network error or URL with an app secret goes into logs.
    }
  }
  throw sanitizedFailure(lastError);
}
