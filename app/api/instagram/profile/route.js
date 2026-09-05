export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const GUI_ACCOUNT_ID = '17841401155694295';

function safeError(payload, text) {
  const raw = payload?.error?.message || payload?.error || payload?.message || text || 'Erro desconhecido';
  return String(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 280);
}

async function fetchProfile(fields) {
  const accessToken = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();

  if (!accessToken) {
    return { ok: false, status: 503, error: 'META_INSTAGRAM_ACCESS_TOKEN não configurado.' };
  }

  const url = new URL(`https://graph.instagram.com/${API_VERSION}/${GUI_ACCOUNT_ID}`);
  url.searchParams.set('fields', fields);

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
    return {
      ok: false,
      status: response.status || 502,
      error: safeError(payload, text),
    };
  }

  return { ok: true, payload: payload || {} };
}

export async function GET() {
  let result = await fetchProfile('id,username,name,profile_picture_url,followers_count,media_count');

  if (!result.ok) {
    result = await fetchProfile('id,username,profile_picture_url,followers_count,media_count');
  }

  if (!result.ok) {
    return Response.json(
      {
        error: 'Não foi possível carregar o perfil profissional do Instagram.',
        detail: result.error,
      },
      { status: result.status || 502 }
    );
  }

  const profile = result.payload;

  return Response.json({
    id: String(profile.id || GUI_ACCOUNT_ID),
    username: profile.username || 'gui_nonato',
    name: profile.name || 'Gui Nonato',
    profilePictureUrl: profile.profile_picture_url || '',
    followersCount: Number(profile.followers_count || 0),
    mediaCount: Number(profile.media_count || 0),
    accountType: 'Instagram Business',
    connected: true,
    source: 'Meta API',
    updatedAt: new Date().toISOString(),
  });
}
