// Client-side wrapper for the dedicated Vital Decor Unified Login endpoint.
export async function startVitalInstagramUnifiedLogin(supabase, request = fetch) {
  if (!supabase) throw new Error('Entre no TidePlace para autorizar o Instagram.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no TidePlace.');
  const response = await request('/api/vital-connections/instagram/unified/start', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + data.session.access_token,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o login seguro.');
  let link;
  try { link = new URL(payload.loginUrl); } catch {
    throw new Error('A Meta não retornou um link de autorização válido.');
  }
  if (link.origin !== 'https://www.facebook.com' ||
      !link.pathname.endsWith('/dialog/oauth') ||
      !link.searchParams.get('config_id') ||
      link.searchParams.has('scope')) {
    throw new Error('O endereço de autorização recebido não corresponde ao Login Unificado.');
  }
  return link.toString();
}
