// Read-only server adapter. Do not import from a client component or expose
// the store token; authenticated routes must separately authorize each user.
if (typeof window !== 'undefined') throw new Error('A integração deve rodar no servidor.');

const RESOURCES = new Set(['products', 'customers', 'orders', 'checkouts']);
const BASE = 'https://api.nuvemshop.com.br/2025-03/';

export class NuvemshopReadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NuvemshopReadError';
    this.code = code;
  }
}

export function createNuvemshopReader({storeId, accessToken, userAgent, fetchImpl = fetch} = {}) {
  const id = String(storeId || '');
  if (!/^[0-9]{1,20}$/.test(id)) throw new NuvemshopReadError('config', 'Loja não configurada.');
  if (typeof accessToken !== 'string' || !accessToken.trim() || /[\r\n]/.test(accessToken))
    throw new NuvemshopReadError('config', 'Conexão com a loja não configurada.');
  if (typeof userAgent !== 'string' || !userAgent.trim() || /[\r\n]/.test(userAgent))
    throw new NuvemshopReadError('config', 'Identificação da integração não configurada.');
  if (typeof fetchImpl !== 'function') throw new NuvemshopReadError('config', 'Serviço indisponível.');

  return Object.freeze({
    async list(resource, {page = 1, perPage = 25} = {}) {
      if (!RESOURCES.has(resource)) throw new NuvemshopReadError('resource', 'Consulta não permitida.');
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000 ||
          !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 50)
        throw new NuvemshopReadError('pagination', 'Página inválida.');
      const url = new URL(BASE + id + '/' + resource);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));
      let response;
      try {
        response = await fetchImpl(url.toString(), {
          method: 'GET', cache: 'no-store', redirect: 'error',
          headers: {'Authorization': 'Bearer ' + accessToken, 'User-Agent': userAgent, 'Accept': 'application/json'},
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new NuvemshopReadError('network', 'Não foi possível consultar a loja.');
      }
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'authorization'
          : response.status === 429 ? 'rate_limit' : response.status === 402 ? 'account' : 'upstream';
        throw new NuvemshopReadError(code, 'A consulta à loja não foi concluída.');
      }
      let data;
      try { data = await response.json(); }
      catch { throw new NuvemshopReadError('response', 'Resposta inválida da loja.'); }
      if (!Array.isArray(data)) throw new NuvemshopReadError('response', 'Resposta inválida da loja.');
      return data;
    },
  });
}
