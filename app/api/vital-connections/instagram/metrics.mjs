import { WORKSPACE, GUI_INSTAGRAM_ID, fail, safePhoneId } from '../helpers.mjs';

const INSIGHTS = { alcance: 'reach', visualizacoes: 'views', interacoes: 'total_interactions' };

export function numericMetric(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

export function insightTotal(row) {
  // Daily reach cannot be added: the same person can appear on several days.
  // Request the total for the date range and preserve unavailable data as null.
  return numericMetric(row?.total_value?.value);
}

export function thirtyDayRange(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const until = new Date(today + 'T00:00:00-03:00');
  const since = new Date(until.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    since: Math.floor(since.getTime() / 1000), until: Math.floor(until.getTime() / 1000),
    startDate: since.toISOString().slice(0, 10),
    endDate: new Date(until.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    days: 30, timeZone: 'America/Sao_Paulo',
  };
}

export async function connectedInstagram(db, ownerId) {
  const { data, error } = await db.from('workspace_meta_connections')
    .select('owner_user_id,workspace_id,platform,external_account_id,access_token,username,state')
    .eq('owner_user_id', ownerId).eq('workspace_id', WORKSPACE).eq('platform', 'instagram').maybeSingle();
  if (error) throw fail('Não foi possível consultar a conexão da Vital Decor.', 503);
  if (!data || data.owner_user_id !== ownerId || data.workspace_id !== WORKSPACE
      || data.platform !== 'instagram' || data.state !== 'connected' || !data.access_token
      || String(data.external_account_id) === GUI_INSTAGRAM_ID) {
    throw fail('Conecte o Instagram da Vital Decor para carregar as métricas.', 409);
  }
  safePhoneId(data.external_account_id);
  return data;
}

export async function instagramMetrics(connection, graphRequest, now = new Date()) {
  if (!connection?.access_token || connection.workspace_id !== WORKSPACE
      || connection.platform !== 'instagram' || connection.state !== 'connected'
      || String(connection.external_account_id) === GUI_INSTAGRAM_ID) {
    throw fail('A conta da Vital Decor não está conectada.', 409);
  }
  const accountId = safePhoneId(connection.external_account_id);
  const range = thirtyDayRange(now);
  const query = { period: 'day', metric_type: 'total_value', since: range.since, until: range.until };
  const request = (path, params) => graphRequest(path, connection.access_token, { query: params });
  const totals = Object.fromEntries(Object.keys(INSIGHTS).map(key => [key, null]));

  async function fetchInsights() {
    try {
      const payload = await request(accountId + '/insights', { ...query, metric: Object.values(INSIGHTS).join(',') });
      const rows = new Map((payload.data || []).map(row => [row.name, row]));
      for (const [key, metric] of Object.entries(INSIGHTS)) totals[key] = insightTotal(rows.get(metric));
    } catch {
      // One unsupported metric must not hide the other valid results.
      await Promise.all(Object.entries(INSIGHTS).map(async ([key, metric]) => {
        try {
          const payload = await request(accountId + '/insights', { ...query, metric });
          totals[key] = insightTotal((payload.data || []).find(row => row.name === metric));
        } catch { totals[key] = null; }
      }));
    }
  }

  const [profile] = await Promise.all([
    request(accountId, { fields: 'id,username,name,profile_picture_url,followers_count,media_count' }),
    fetchInsights(),
  ]);
  if (String(profile.id) !== accountId) throw fail('A Meta retornou outro perfil. Atualize a conexão da Vital.', 502);
  const metrics = { seguidores: numericMetric(profile.followers_count), ...totals };
  return {
    workspace: WORKSPACE,
    profile: { id: accountId, username: profile.username || connection.username || '',
      name: profile.name || 'Vital Decor', profilePictureUrl: profile.profile_picture_url || '',
      followersCount: metrics.seguidores, mediaCount: numericMetric(profile.media_count), connected: true },
    metrics, unavailableMetrics: Object.keys(metrics).filter(key => metrics[key] === null),
    range: { startDate: range.startDate, endDate: range.endDate, days: range.days, timeZone: range.timeZone },
    source: 'Meta', updatedAt: now.toISOString(),
  };
}
