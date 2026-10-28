// Identical destination rules to the existing Vital WhatsApp inbox.
// Routing a conversation never changes its subject/topic automatically.
export const VITAL_SECTOR_NAMES = {
  comercial_vital: 'Comercial Vital',
  bluetti: 'Bluetti',
  vtx: 'VTX Fitness',
  pos_venda: 'Pós-venda e pedidos',
  atacado: 'Atacado / revendedores',
  afiliados: 'Afiliados TikTok',
};
export const VITAL_ASSIGNEE_NAMES = { tide: 'TidePlace', andrey: 'Andrey · Argo', vitor: 'Vitor · Argo' };
export function routingDestination(rule) {
  if (!rule) return { active: false, assignee: null, title: 'Não configurado' };
  if (rule.assignee === 'tide') return { active: true, assignee: 'tide', title: VITAL_ASSIGNEE_NAMES.tide };
  return rule.enabled && ['andrey','vitor'].includes(rule.assignee)
    ? { active: true, assignee: rule.assignee, title: VITAL_ASSIGNEE_NAMES[rule.assignee] }
    : { active: false, assignee: null, title: 'Argo não habilitado' };
}
export function sameVitalAssignment(assignment, sector, destination) {
  return Boolean(assignment && sector && assignment.status !== 'closed'
    && assignment.sector === sector && assignment.assigned_to === destination?.assignee);
}
