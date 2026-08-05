const WINDSOR_BASE_URL = 'https://connectors.windsor.ai/instagram';
const GUI_ACCOUNT_ID = '17841401155694295';

function rowsFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

async function fetchWindsor(fields, datePreset) {
  const apiKey = process.env.WINDSOR_API_KEY;

  if (!apiKey) {
    throw new Error('WINDSOR_API_KEY não configurada.');
  }

  const url = new URL(WINDSOR_BASE_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('date_preset', datePreset);
  url.searchParams.set('filter', JSON.stringify([['account_id', 'eq', GUI_ACCOUNT_ID]]));
  url.searchParams.set('_max_rows', '500');
  url.searchParams.set('_renderer', 'json');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Windsor/1.0' },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Windsor respondeu ${response.status}: ${body.slice(0, 160)}`);
  }

  return rowsFrom(await response.json());
}

function sum(rows, field) {
  return Math.round(rows.reduce((total, row) => total + Number(row?.[field] || 0), 0));
}

export async function GET() {
  try {
    const [profileRows, performanceRows] = await Promise.all([
      fetchWindsor(['account_id', 'user_name', 'followers_count'], 'last_1dT'),
      fetchWindsor(
        ['date', 'account_id', 'user_name', 'reach', 'views', 'total_interactions'],
        'last_30dT'
      ),
    ]);

    const followers = Math.round(
      Math.max(0, ...profileRows.map((row) => Number(row?.followers_count || 0)))
    );

    return Response.json({
      account: '@gui_nonato',
      period: 'Últimos 30 dias',
      updatedAt: new Date().toISOString(),
      metrics: {
        seguidores: followers,
        alcance: sum(performanceRows, 'reach'),
        visualizacoes: sum(performanceRows, 'views'),
        interacoes: sum(performanceRows, 'total_interactions'),
      },
    });
  } catch (error) {
    console.error('Erro ao buscar métricas do Instagram:', error);
    return Response.json(
      { error: 'Não foi possível atualizar as métricas do Instagram agora.' },
      { status: 502 }
    );
  }
}
