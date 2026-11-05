// Dedicated Instagram professional login, never Facebook Login.
export async function startVitalInstagramOnlyLogin(supabase, request = fetch) {
  if (!supabase) throw new Error('Entre no TidePlace antes de conectar o Instagram.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sua sessão do TidePlace expirou.');
  const response = await request('/api/vital-connections/instagram/instagram-login/start', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + data.session.access_token,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'O login direto do Instagram não está configurado.');
  let url;
  try { url = new URL(result.loginUrl); }
  catch { throw new Error('O endereço de login do Instagram recebido é inválido.'); }
  if (url.origin !== 'https://www.instagram.com' ||
      url.pathname !== '/oauth/authorize' ||
      !url.searchParams.get('state') ||
      !url.searchParams.get('client_id')) {
    throw new Error('O endereço não corresponde ao login oficial do Instagram.');
  }
  return url.toString();
}
