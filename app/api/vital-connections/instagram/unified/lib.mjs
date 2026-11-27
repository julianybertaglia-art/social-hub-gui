// Instagram Unified Login for Vital Decor only. No WhatsApp configuration is used.
export const VITAL_INSTAGRAM_ID = '17841439121395170';
export const VITAL_BUSINESS_ID = '1055955574784532';
export const UNIFIED_CONFIG_ID = '1510934544177267';
export const UNIFIED_APP_ID = '1975149819862842';
export const CALLBACK_URL = 'https://social-hub-gui.vercel.app/api/vital-connections/instagram/unified/callback';
export const CALLBACK_COOKIE = 'tp_vital_ig_unified_state';
export const META_API_VERSION = 'v26.0';

export function unifiedLoginUrl(state) {
  if (!/^[0-9a-f-]{36}$/i.test(String(state || ''))) throw new Error('Estado de autenticação inválido.');
  const url = new URL('https://www.facebook.com/' + META_API_VERSION + '/dialog/oauth');
  url.searchParams.set('client_id', UNIFIED_APP_ID);
  url.searchParams.set('config_id', UNIFIED_CONFIG_ID);
  url.searchParams.set('redirect_uri', CALLBACK_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('override_default_response_type', 'true');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'login');
  // Do not set scope: this is Unified Login, not the legacy Facebook SDK login.
  return url.toString();
}

export function selectVitalInstagram(accounts) {
  const list = Array.isArray(accounts?.data) ? accounts.data : [];
  const vital = list.find((item) =>
    String(item?.id || '') === VITAL_INSTAGRAM_ID &&
    String(item?.username || '').replace(/^@/, '').toLowerCase() === 'vitaldecor_');
  return vital ? { id: VITAL_INSTAGRAM_ID, username: 'vitaldecor_' } : null;
}

// The OAuth code alone is not evidence of Instagram account access.
// Only a live Graph API profile with BOTH exact identifiers can verify Vital.
export function isVerifiedVitalProfile(profile) {
  return String(profile?.id || '') === VITAL_INSTAGRAM_ID &&
    String(profile?.username || '').replace(/^@/, '').toLowerCase() === 'vitaldecor_';
}

export function safeAuthError(code) {
  const known = new Set([
    'cancelled', 'expired', 'state', 'missing_code', 'secret_missing',
    'exchange', 'app_credentials', 'wrong_business', 'account_not_shared', 'token_invalid',
    'permissions', 'subscribe', 'save',
  ]);
  return known.has(code) ? code : 'exchange';
}
