import {NuvemshopReadError} from './nuvemshop-read.mjs';

// Both RPCs must be installed and restricted to service_role. A process-local
// counter is insufficient for serverless instances, so failure is closed.
export async function claimVitalStoreRequest(db,organizationId) {
  let result;
  try { result=await db.rpc('crm_vital_store_request_claim',{p_organization_id:organizationId}); }
  catch { throw new NuvemshopReadError('limiter_unavailable','A consulta está temporariamente indisponível.'); }
  if(result?.error||typeof result?.data!=='boolean')
    throw new NuvemshopReadError('limiter_unavailable','A consulta está temporariamente indisponível.');
  if(!result.data)throw new NuvemshopReadError('rate_limit','Aguarde um instante antes de atualizar novamente.');
}

export async function pauseVitalStoreRequests(db,organizationId) {
  try {
    const result=await db.rpc('crm_vital_store_request_backoff',{p_organization_id:organizationId});
    return !result?.error && result?.data===true;
  } catch { return false; }
}
