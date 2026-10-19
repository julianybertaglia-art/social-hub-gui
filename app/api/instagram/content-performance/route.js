export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';
const MAX_MEDIA = 100;
const MAX_DAYS = 90;

function providerMessage(payload, text) {
  const raw = payload?.error?.message || payload?.error || payload?.message || text;
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
  return message
    .slice(0, 300)
    .replace(/access_token=[^&\s]+/gi, 'access_token=[oculto]');
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

function metricValue(metric) {
  const total = Number(metric?.total_value?.value);
  if (metric?.total_value?.value !== undefined && metric?.total_value?.value !== null && Number.isFinite(total)) return total;

  const values = Array.isArray(metric?.values) ? metric.values : [];
  if (!values.length) return null;

  const last = values[values.length - 1]?.value;

  if (typeof last === 'number') return last;
  if (typeof last === 'string' && Number.isFinite(Number(last))) return Number(last);

  return null;
}

async function requestMetric(mediaId, metric) {
  try {
    const payload = await metaGet(`${mediaId}/insights`, { metric });
    const row = Array.isArray(payload?.data) ? payload.data[0] : null;
    return metricValue(row);
  } catch (error) {
    console.warn('Métrica de mídia indisponível.', {
      mediaId,
      metric,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function requestMetricsGroup(mediaId, metrics) {
  try {
    const payload = await metaGet(`${mediaId}/insights`, {
      metric: metrics.join(','),
    });

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const result = {};

    rows.forEach((row) => {
      if (row?.name && metricValue(row) !== null) result[row.name] = metricValue(row);
    });

    return result;
  } catch {
    const values = await Promise.all(
      metrics.map(async (metric) => [metric, await requestMetric(mediaId, metric)])
    );

    return Object.fromEntries(values.filter(([, value]) => value !== null));
  }
}

function rate(value, denominator) {
  const total = Number(denominator || 0);
  if (!total || value == null || denominator == null) return null;
  return Number(((Number(value || 0) / total) * 100).toFixed(2));
}

async function enrichMedia(media) {
  const baseMetrics = ['reach', 'views', 'saved', 'shares', 'total_interactions'];
  const reelMetrics = [
    'ig_reels_video_view_total_time',
    'ig_reels_avg_watch_time',
    'reels_skip_rate',
    'clips_replays_count',
  ];

  const isReel = String(media?.media_product_type || '').toUpperCase() === 'REELS';
  const baseInsights = await requestMetricsGroup(media.id, baseMetrics);
  const reelInsights = isReel
    ? await requestMetricsGroup(media.id, reelMetrics)
    : {};
  const insights = { ...baseInsights, ...reelInsights };

  const reach = insights.reach == null ? null : Math.round(Number(insights.reach));
  const views = insights.views == null ? null : Math.round(Number(insights.views));
  const saved = insights.saved == null ? null : Math.round(Number(insights.saved));
  const shares = insights.shares == null ? null : Math.round(Number(insights.shares));
  const totalInteractions = insights.total_interactions == null ? null : Math.round(Number(insights.total_interactions));
  const likes = Math.round(Number(media?.like_count || 0));
  const comments = Math.round(Number(media?.comments_count || 0));

  return {
    id: String(media.id),
    caption: String(media?.caption || '').slice(0, 1200),
    mediaType: media?.media_type || null,
    mediaProductType: media?.media_product_type || null,
    permalink: media?.permalink || null,
    timestamp: media?.timestamp || null,
    thumbnailUrl: media?.thumbnail_url || null,
    likes,
    comments,
    reach,
    views,
    saved,
    shares,
    totalInteractions,
    engagementRate: rate(totalInteractions, reach),
    saveRate: rate(saved, reach),
    shareRate: rate(shares, reach),
    reel: isReel
      ? {
          totalWatchTimeMs: insights.ig_reels_video_view_total_time == null ? null : Number(insights.ig_reels_video_view_total_time),
          avgWatchTimeMs: insights.ig_reels_avg_watch_time == null ? null : Number(insights.ig_reels_avg_watch_time),
          skipRate: insights.reels_skip_rate == null ? null : Number(insights.reels_skip_rate),
          replays: insights.clips_replays_count == null ? null : Math.round(Number(insights.clips_replays_count)),
        }
      : null,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get('days') || 30);
  const days = Number.isFinite(requestedDays) ? Math.min(MAX_DAYS, Math.max(1, Math.floor(requestedDays))) : 30;
  const since = Date.now() - days * 86400000;
  try {
    let next = null;
    const media = [];
    const visited = new Set();
    for (let page = 0; page < 15 && media.length < MAX_MEDIA; page++) {
      let payload;
      if (next) {
        const parsed = new URL(next);
        if (parsed.hostname !== 'graph.instagram.com' || parsed.protocol !== 'https:') break;
        const response = await fetch(next, { cache: 'no-store', headers: { Authorization: `Bearer ${String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim()}` } });
        if (!response.ok) throw new Error('Erro ao consultar próxima página da Meta.');
        payload = await response.json();
      } else {
        payload = await metaGet(`${GUI_ACCOUNT_ID}/media`, {
          fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,like_count,comments_count',
          limit: 50,
        });
      }
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      if (!rows.length) break;
      for (const item of rows) {
        if (visited.has(item.id)) continue;
        visited.add(item.id);
        if (Date.parse(item.timestamp || '') >= since) media.push(item);
      }
      if (rows.some(item => Date.parse(item.timestamp || '') < since)) break;
      next = payload?.paging?.next || null;
      if (!next) break;
    }
    const items = [];
    for (let index = 0; index < media.length; index += 3) {
      const batch = media.slice(index, index + 3);
      items.push(...await Promise.all(batch.map(enrichMedia)));
    }
    return Response.json({
      account: '@gui_nonato',
      source: 'Meta',
      updatedAt: new Date().toISOString(),
      days,
      count: items.length,
      items,
      note: 'Métricas representam totais acumulados por publicação, não snapshots históricos diários.',
    });
  } catch (error) {
    console.error('Erro ao buscar performance dos conteúdos na Meta:', error);
    return Response.json({ error: 'Não foi possível carregar a performance dos conteúdos do Instagram.', detail: error?.providerDetail || error?.message || undefined }, { status: 502 });
  }
}
