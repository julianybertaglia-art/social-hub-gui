// Dedicated Instagram Login (no Facebook Login / Meta Business 2FA).
// Env values are server-only and must be configured by the operator in Vercel.
export const VITAL_IG_ID = '17841439121395170';
export const VITAL_IG_USERNAME = 'vitaldecor_';
export const IG_LOGIN_CALLBACK = 'https://social-hub-gui.vercel.app/api/vital-connections/instagram/instagram-login/callback';
export const IG_LOGIN_COOKIE = 'tp_vital_ig_direct_oauth';
export const IG_API_VERSION = 'v26.0';

export function directInstagramLoginConfigured(env = process.env) {
  return /^\d{5,40}$/.test(String(env.META_VITAL_IG_APP_ID || '')) &&
    typeof env.META_VITAL_IG_APP_SECRET === 'string' && env.META_VITAL_IG_APP_SECRET.length > 8;
}

export function instagramBusinessLoginUrl(state, appId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(state || ''))) throw new Error('Estado inválido.');
  if (!/^\d{5,40}$/.test(String(appId || ''))) throw new Error('Instagram App ID inválido.');
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', IG_LOGIN_CALLBACK);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments');
  url.searchParams.set('state', state);
  return url.toString();
}

export function exactlyVitalInstagram(profile) {
  return String(profile?.user_id || '') === VITAL_IG_ID &&
    String(profile?.username || '').replace(/^@/, '').toLowerCase() === VITAL_IG_USERNAME;
}

export function allowedInstagramAuthFailure(reason) {
  const allowed = new Set(['cancelled','expired','state','missing_code','not_configured',
    'exchange','wrong_account','subscribe','save','token_invalid']);
  return allowed.has(reason) ? reason : 'exchange';
}
