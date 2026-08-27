export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';
const GUI_USERNAME = 'gui_nonato';

function normalizeApiKey(rawValue) {
  let value = String(rawValue || '').trim().replace(/^['"]|['"]$/g, '');

  if (value.startsWith('WINDSOR_API_KEY=')) {
    value = value.slice('WINDSOR_API_KEY='.length).trim();
  }

  if (value.includes('api_key=')) {
    try {
      const parsed = new URL(value);
      value = parsed.searchParams.get('api_key') || value;
    } catch {
      const match = value.match(/[?&]api_key=([^&\s]+)/);
      if (match?.[1]) value = decodeURIComponent(match[1]);
    }
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // Mantém o valor original quando não estiver codificado.
  }

  value = value.split('&')[0].split(/\s/)[0].trim();
  return value;
}

function rowsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function belongsToGui(row) {
  const accountId = String(row?.account_id || row?.user_id || '');
  const username = String(row?.user_name || row?.username || row?.account_name || '')
    .replace(/^@/, '')
    .toLowerCase();

  return accountId === GUI_ACCOUNT_ID || username === GUI_USERNAME;
}

function providerMessage(payload, text) {
  const raw = payload?.error?.message || payload?.error || payload?.message || payload?.detail || payload?.errors || text;
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
  return message
    .slice(0, 300)
    .replace(/api_key=[^&\s]+/gi, 'api_key=[oculta]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[oculto]');
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function lastDaysRange(days = 30) {
  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(1, days - 1));
  return { since: isoDate(since), until: isoDate(until) };
}

async function metaGet(path, params = {}) {
  const accessToken = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();

  if (!accessToken) {
    const error = new Error('META_INSTAGRAM_ACCESS_TOKEN não configurado.');
    error.code = 'META_TOKEN_MISSING';
    throw error;
  }

  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Gui-Social-Hub/1.0',
    },
    cache: 'no-store',
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    const detail = providerMessage(payload, text);
    const error = new Error(detail || `A Meta respondeu com status ${response.status}.`);
    error.code = 'META_ERROR';
    error.providerDetail = detail;
    throw error;
  }

  return payload || {};
}

function metricValue(metric, mode = 'sum') {
  const totalValue = Number(metric?.total_value?.value);
  if (Number.isFinite(totalValue)) return Math.round(totalValue);

  const values = Array.isArray(metric?.values)
    ? metric.values
      .map((item) => Number(item?.value))
      .filter((value) => Number.isFinite(value))
    : [];

  if (!values.length) return 0;
  if (mode === 'latest') return Math.round(values[values.length - 1]);
  return Math.round(values.reduce((total, value) => total + value, 0));
}

async function requestMetaInsights() {
  const { since, until } = lastDaysRange(30);
  const params = {
    metric: 'reach,views,total_interactions,profile_views',
    since,
    until,
  };

  // A Meta oferece total_over_range para métricas agregadas. Caso alguma conta/versão
  // não aceite a combinação, fazemos fallback para dados diários e somamos o período.
  try {
    return await metaGet(`${GUI_ACCOUNT_ID}/insights`, {
      ...params,
      period: 'total_over_range',
    });
  } catch (error) {
    console.warn('Meta total_over_range indisponível; usando período diário.', {
      error: error instanceof Error ? error.message : String(error),
    });

    return metaGet(`${GUI_ACCOUNT_ID}/insights`, {
      ...params,
      period: 'day',
    });
  }
}

async function requestMetaMetrics() {
  const [profileResult, insightsResult] = await Promise.allSettled([
    metaGet(GUI_ACCOUNT_ID, { fields: 'username,followers_count,media_count' }),
    requestMetaInsights(),
  ]);

  if (insightsResult.status !== 'fulfilled') {
    throw insightsResult.reason;
  }

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : {};
  const insightRows = Array.isArray(insightsResult.value?.data) ? insightsResult.value.data : [];
  const byName = Object.fromEntries(insightRows.map((metric) => [metric?.name, metric]));

  let seguidores = Math.round(Number(profile?.followers_count || 0));

  if (!seguidores) {
    try {
      const followerPayload = await metaGet(`${GUI_ACCOUNT_ID}/insights`, {
        metric: 'follower_count',
        period: 'day',
      });
      const followerMetric = Array.isArray(followerPayload?.data) ? followerPayload.data[0] : null;
      seguidores = metricValue(followerMetric, 'latest');
    } catch (error) {
      console.warn('Meta não retornou seguidores atuais.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const metrics = {
    seguidores,
    alcance: metricValue(byName.reach),
    visualizacoes: metricValue(byName.views),
    interacoes: metricValue(byName.total_interactions),
    visitasPerfil: metricValue(byName.profile_views),
  };

  if (!metrics.seguidores && !metrics.alcance && !metrics.visualizacoes && !metrics.interacoes) {
    const error = new Error('A Meta não retornou métricas utilizáveis da conta.');
    error.code = 'META_NO_DATA';
    throw error;
  }

  return metrics;
}

async function requestWindsor(fields, datePreset) {
  const apiKey = normalizeApiKey(process.env.WINDSOR_API_KEY);

  if (!apiKey || apiKey.length < 16) {
    const error = new Error('A chave do Windsor está ausente ou incompleta.');
    error.code = 'INVALID_KEY';
    throw error;
  }

  const url = new URL('https://connectors.windsor.ai/all');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('fields', fields.join(','));
  if (datePreset) url.searchParams.set('date_preset', datePreset);
  url.searchParams.set('_max_rows', '500');
  url.searchParams.set('_renderer', 'json');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Windsor/1.0' },
    cache: 'no-store',
  });

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  const detail = providerMessage(payload, text);

  if (!response.ok || payload?.error || payload?.errors) {
    const looksLikeKeyError = /api.?key|unauthor|forbidden|invalid key|authentication/i.test(detail);
    const error = new Error(detail || `O Windsor respondeu com status ${response.status}.`);
    error.code = looksLikeKeyError ? 'INVALID_KEY' : 'WINDSOR_ERROR';
    error.providerDetail = detail;
    throw error;
  }

  const rows = rowsFrom(payload);
  const guiRows = rows.filter(belongsToGui);
  return guiRows.length ? guiRows : rows;
}

function highest(rows, field) {
  return Math.round(Math.max(0, ...rows.map((row) => Number(row?.[field] || 0))));
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row?.[field] || 0), 0));
}

async function requestWindsorMetrics() {
  const [profileRows, performanceRows] = await Promise.all([
    requestWindsor(
      ['date', 'datasource', 'account_name', 'source', 'account_id', 'user_name', 'followers_count'],
      'last_7dT'
    ),
    requestWindsor(
      ['date', 'datasource', 'account_name', 'source', 'account_id', 'user_name', 'reach', 'views', 'total_interactions'],
      'last_30dT'
    ),
  ]);

  const metrics = {
    seguidores: highest(profileRows, 'followers_count'),
    alcance: sum(performanceRows, 'reach'),
    visualizacoes: sum(performanceRows, 'views'),
    interacoes: sum(performanceRows, 'total_interactions'),
  };

  if (!metrics.seguidores && !metrics.alcance && !metrics.visualizacoes) {
    const error = new Error('O Windsor não retornou métricas da conta do Gui.');
    error.code = 'NO_DATA';
    throw error;
  }

  return metrics;
}

export async function GET() {
  const updatedAt = new Date().toISOString();

  try {
    const metrics = await requestMetaMetrics();

    return Response.json({
      account: '@gui_nonato',
      period: 'Últimos 30 dias',
      updatedAt,
      source: 'Meta',
      metrics,
    });
  } catch (metaError) {
    console.error('Falha ao buscar métricas direto da Meta; tentando Windsor.', {
      error: metaError instanceof Error ? metaError.message : String(metaError),
    });

    try {
      const metrics = await requestWindsorMetrics();

      return Response.json({
        account: '@gui_nonato',
        period: 'Últimos 30 dias',
        updatedAt,
        source: 'Windsor (fallback)',
        warning: 'A Meta não respondeu; os dados foram carregados temporariamente pelo Windsor.',
        metrics,
      });
    } catch (windsorError) {
      console.error('Erro ao buscar métricas do Instagram:', windsorError);

      return Response.json(
        {
          error: 'Não foi possível atualizar as métricas pela Meta nem pelo Windsor.',
          code: 'INSTAGRAM_METRICS_UNAVAILABLE',
          metaDetail: metaError?.providerDetail || metaError?.message || undefined,
          windsorDetail: windsorError?.providerDetail || windsorError?.message || undefined,
        },
        { status: 502 }
      );
    }
  }
}
