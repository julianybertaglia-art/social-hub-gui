import { VITAL_QUEUE_SECTORS, VITAL_ARGO_POSTSALE_QUEUES } from './vital-crm-queues.mjs';

const MARKETPLACE_POSTSALE = new Set(VITAL_ARGO_POSTSALE_QUEUES);
const EXTERNAL_ASSIGNEES = new Set(['andrey', 'vitor']);

export function manualBridgePlan({ enabled, toQueue, currentQueue, assignment }) {
  if (!Object.hasOwn(VITAL_QUEUE_SECTORS, toQueue)) throw new Error('Fila de destino inválida.');
  const desiredAssignee = MARKETPLACE_POSTSALE.has(toQueue) ? 'andrey' : 'tide';
  const existingAssignee = assignment?.assigned_to || null;
  const externalOpen = EXTERNAL_ASSIGNEES.has(existingAssignee) && assignment?.status !== 'closed';
  const usesBridge = enabled && (desiredAssignee === 'andrey' || externalOpen);
  const blocked = !enabled && externalOpen && currentQueue !== toQueue;
  return { desiredAssignee, usesBridge, blocked,
    // Even when already assigned to Andrey, the RPC must revalidate the
    // credential and connection before reporting the handoff as confirmed.
    unchanged: currentQueue === toQueue && !usesBridge };
}

// The database operation must validate permissions and active credentials and
// update both assignments and the audit in one transaction. The new RPC is a
// future migration: until it exists, calls fail closed without a fallback.
export async function transferManually({ db, plan, organizationId, connectionId, ownerId,
  phone, toQueue, current, actorId }) {
  if (plan.blocked) return { confirmed:false, error:{ code:'BRIDGE_DISABLED' } };
  const base = {
    p_org: organizationId, p_conn: connectionId, p_owner: ownerId,
    p_phone: phone, p_to_queue: toQueue, p_expected_from: current.queue,
    p_expected_override_at: current.manual?.updated_at || null, p_actor: actorId,
  };
  if (!plan.usesBridge) {
    const result = await db.rpc('crm_vital_transfer_atomic', base);
    return { ...result, confirmed: !result.error && result.data === toQueue };
  }
  const result = await db.rpc('crm_vital_transfer_argo_atomic', {
    ...base, p_assignee: plan.desiredAssignee,
    p_expected_bridge_updated_at: current.assignment?.updated_at || null,
    p_expected_bridge_assignee: current.assignment?.assigned_to || null,
    p_expected_bridge_status: current.assignment?.status || null,
  });
  return { ...result, confirmed: !result.error && result.data?.to_queue === toQueue &&
    result.data?.assigned_to === plan.desiredAssignee && result.data?.audit_recorded === true };
}
