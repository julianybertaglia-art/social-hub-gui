export const dynamic = 'force-dynamic';

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
  const raw = payload?.error || payload?.message || payload?.detail || payload?.errors || text;
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
  return message.slice(0, 220).replace(/api_key=[^&\s]+/gi, 'api_key=[oculta]');
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

export async function GET() {
  try {
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
      const error = new Error('A consulta não retornou métricas da conta do Gui.');
      error.code = 'NO_DATA';
      throw error;
    }

    return Response.json({
      account: '@gui_nonato',
      period: 'Últimos 30 dias',
      updatedAt: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    console.error('Erro ao buscar métricas do Instagram:', error);

    const code = error?.code || 'UNKNOWN';
    const message = code === 'INVALID_KEY'
      ? 'A chave do Windsor está ausente, incompleta ou inválida.'
      : code === 'NO_DATA'
        ? 'O Windsor não retornou dados da conta do Gui.'
        : 'O Windsor recusou a consulta.';

    return Response.json(
      {
        error: message,
        code,
        detail: error?.providerDetail || undefined,
      },
      { status: 502 }
    );
  }
}
