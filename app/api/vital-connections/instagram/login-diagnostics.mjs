// The connection status endpoint must not mutate an expired OAuth session.
// Only allowlisted reasons and numeric Meta codes can leave the server.
export function summarizeInstagramAttempt(latest, now = Date.now()) {
  const validFailureReasons = new Set([
    'cancelled', 'expired', 'state', 'missing_code', 'secret_missing',
    'exchange', 'app_credentials', 'wrong_business', 'account_not_shared',
    'token_invalid', 'permissions', 'subscribe', 'save',
    'wrong_account', 'wrong_username', 'not_configured',
  ]);
  const failureTypes = new Set(['unified_oauth_failure', 'instagram_oauth_failure']);
  const expiry = Date.parse(String(latest?.expires_at || ''));
  const timedOut = ['prepared', 'consuming'].includes(latest?.status)
    && Number.isFinite(expiry) && expiry <= now;
  const diagnostic = latest?.status === 'expired' && Array.isArray(latest.candidates)
    ? latest.candidates.find((candidate) => failureTypes.has(candidate?.type))
    : null;
  const rawReason = diagnostic?.reason;
  const safeNumericCode = (value, maximum) =>
    Number.isInteger(value) && value > 0 && value < maximum ? value : null;
  return {
    status: latest?.status === 'consumed' ? 'confirmed'
      : latest?.status === 'expired' || timedOut ? 'failed' : 'pending',
    reason: timedOut ? 'expired' : validFailureReasons.has(rawReason) ? rawReason : null,
    metaCode: safeNumericCode(diagnostic?.metaCode, 1000000),
    metaSubcode: safeNumericCode(diagnostic?.metaSubcode, 1000000000),
    checkedAt: latest?.created_at || null,
  };
}
