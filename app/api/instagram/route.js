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

  return value.trim();
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

async function requestWindsor(connector, fields, datePreset) {
  const apiKey = normalizeApiKey(process.env.WINDSOR_API_KEY);

  if (!apiKey || apiKey.length < 16) {
    const error = new Error('A chave do Windsor está ausente ou incompleta.');
    error.code = 'INVALID_KEY';
    throw error;
  }

  const url = new URL(`https://connectors.windsor.ai/${connector}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('fields', fields.join(','));
  if (datePreset) url.searchParams.set('date_preset', datePreset);
  url.searchParams.set('filter', JSON.stringify([['account_id', 'eq', GUI_ACCOUNT_ID]]));
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

  if (!response.ok) {
    const error = new Error(`O Windsor respondeu com status ${response.status}.`);
    error.code = response.status === 401 || response.status === 403 ? 'INVALID_KEY' : 'WINDSOR_ERROR';
    throw error;
  }

  if (payload?.error || payload?.errors) {
    const error = new Error('O Windsor recusou a consulta.');
    error.code = 'WINDSOR_ERROR';
    throw error;
  }

  const rows = rowsFrom(payload);
  const guiRows = rows.filter(belongsToGui);
  return guiRows.length ? guiRows : rows;
}

async function fetchWindsor(fields, datePreset) {
  try {
    return await requestWindsor('instagram', fields, datePreset);
  } catch (firstError) {
    if (firstError?.code === 'INVALID_KEY') throw firstError;
    return requestWindsor('all', fields, datePreset);
  }
}

function highest(rows, field) {
  return Math.round(Math.max(0, ...rows.map((row) => Number(row?.[field] || 0))));
}

export async function GET() {
  try {
    const [profileRows, performanceRows] = await Promise.all([
      fetchWindsor(['account_id', 'user_name', 'followers_count']),
      fetchWindsor(
        ['account_id', 'user_name', 'reach', 'views', 'total_interactions'],
        'last_30dT'
      ),
    ]);

    const metrics = {
      seguidores: highest(profileRows, 'followers_count'),
      alcance: highest(performanceRows, 'reach'),
      visualizacoes: highest(performanceRows, 'views'),
      interacoes: highest(performanceRows, 'total_interactions'),
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
        : 'O Windsor não respondeu corretamente agora.';

    return Response.json({ error: message, code }, { status: 502 });
  }
}
