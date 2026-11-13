// Read-only diagnosis for the Vital Instagram connection. Never return tokens,
// Graph response bodies, account identifiers, or customer data to the client.
const GUI_INSTAGRAM_ID = '17841401155694295';
const VERSION = 'v26.0';
const KNOWN_PERMISSIONS = [
  'pages_manage_metadata', 'pages_read_engagement', 'pages_show_list',
  'instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments',
  'instagram_business_basic', 'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];
const num = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n < 1000000000 ? n : null;
};
const numericId = (value) => /^\d{5,40}$/.test(String(value || ''));

async function safeGet(base, version, path, query, token, fetchImpl) {
  const url = new URL(`${base}/${version}/${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      // A raw Meta message may contain private details. Keep only names from
      // this allowlist; a mentioned permission is a hint, not proof of cause.
      const message = [data?.error?.message, data?.error?.error_user_msg]
        .filter((value) => typeof value === 'string').join(' ').toLowerCase();
      const permissions = KNOWN_PERMISSIONS.filter((permission) =>
        new RegExp(`(^|[^a-z0-9_])${permission}([^a-z0-9_]|$)`).test(message));
      return { ok: false, code: num(data?.error?.code), subcode: num(data?.error?.error_subcode), permissions };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, code: null, subcode: null, permissions: [] };
  }
}

export async function diagnoseVitalInstagram(connection, {
  fetchImpl = fetch, facebookAppId = '', instagramAppId = '', facebookApiVersion = VERSION,
} = {}) {
  const profile = { status: 'not_checked', code: null, subcode: null, permissions: [] };
  const subscription = { status: 'not_checked', code: null, subcode: null,
    permissions: [], messages: null, comments: null };
  const result = { profile, subscription, automaticReplies: false };
  if (!connection || connection.workspace_id !== 'vital-decor'
      || connection.platform !== 'instagram' || connection.state !== 'connected'
      || String(connection.username || '').replace(/^@/, '').toLowerCase() !== 'vitaldecor_'
      || !numericId(connection.external_account_id)
      || String(connection.external_account_id) === GUI_INSTAGRAM_ID
      || (connection.page_id && !numericId(connection.page_id))
      || typeof connection.access_token !== 'string' || !connection.access_token
      || !['facebook', 'instagram_login'].includes(connection.auth_provider)) {
    profile.status = 'connection_invalid';
    return result;
  }
  result.automaticReplies = connection.automatic_replies_enabled === true;
  const viaInstagram = connection.auth_provider === 'instagram_login';
  const base = viaInstagram ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  const version = !viaInstagram && /^v\d{1,3}\.\d{1,3}$/.test(String(facebookApiVersion))
    ? String(facebookApiVersion) : VERSION;
  const accountId = String(connection.external_account_id);
  const account = await safeGet(base, version, viaInstagram ? 'me' : accountId,
    { fields: viaInstagram ? 'user_id,username' : 'id,username' }, connection.access_token, fetchImpl);
  if (!account.ok) {
    Object.assign(profile, { status: 'error', code: account.code, subcode: account.subcode, permissions: account.permissions });
    return result;
  }
  const returnedId = String((viaInstagram ? account.data?.user_id : account.data?.id) || '');
  if (returnedId !== accountId || String(account.data?.username || '').replace(/^@/, '').toLowerCase() !== 'vitaldecor_') {
    profile.status = 'identity_mismatch';
    return result;
  }
  profile.status = 'ok';
  const target = viaInstagram ? 'me' : String(connection.page_id || accountId);
  const apps = await safeGet(base, version, `${target}/subscribed_apps`,
    { fields: 'id,subscribed_fields' }, connection.access_token, fetchImpl);
  if (!apps.ok) {
    Object.assign(subscription, { status: 'error', code: apps.code, subcode: apps.subcode, permissions: apps.permissions });
    return result;
  }
  if (!Array.isArray(apps.data?.data)) {
    subscription.status = 'unconfirmed';
    return result;
  }
  const expected = String(viaInstagram ? instagramAppId : facebookAppId);
  if (!numericId(expected)) {
    subscription.status = 'unconfirmed';
    return result;
  }
  const app = apps.data.data.find((entry) => String(entry?.id || '') === expected);
  if (!app) {
    // An unidentifiable or later-page app does not prove it is unsubscribed.
    subscription.status = !apps.data.paging?.next && apps.data.data.every((entry) => numericId(entry?.id))
      ? 'app_not_listed' : 'unconfirmed';
    return result;
  }
  if (!Array.isArray(app.subscribed_fields)) {
    subscription.status = 'unconfirmed';
    return result;
  }
  subscription.status = 'ok';
  subscription.messages = app.subscribed_fields.includes('messages');
  subscription.comments = app.subscribed_fields.includes('comments');
  return result;
}
