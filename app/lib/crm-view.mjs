import { STAGES } from './operations.mjs';

// These are presentation-only selectors. Gui and Vital use distinct storage
// sources; never treat Vital sectors as Gui sales stages or merge their records.
export const VITAL_SECTORS = ['Sem setor', 'comercial_vital', 'bluetti', 'vtx', 'pos_venda', 'atacado', 'afiliados'];

export function crmLane(workspaceId, contact) {
  return workspaceId === 'gui-nonato'
    ? (contact?.stage || 'Sem etapa')
    : (contact?.sector || 'Sem setor');
}

export function crmLanes(workspaceId, contacts = []) {
  const existing = new Set((contacts || []).map(contact => crmLane(workspaceId, contact)));
  const fixed = workspaceId === 'gui-nonato' ? STAGES : VITAL_SECTORS;
  return [...fixed, ...[...existing].filter(value => !fixed.includes(value)).sort((a,b) => a.localeCompare(b, 'pt-BR'))];
}

function searchable(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function crmFilter(contacts = [], workspaceId, {search = '', lane = 'all', sort = 'recent'} = {}) {
  const term = searchable(search).trim();
  const result = (contacts || []).filter(contact => {
    if (lane !== 'all' && crmLane(workspaceId, contact) !== lane) return false;
    const fields = [
      contact.profile_name, contact.phone, contact.notes, contact.sector,
      contact.stage, contact.assigned_to, ...(Array.isArray(contact.tags) ? contact.tags : []),
    ];
    return !term || searchable(fields.join(' ')).includes(term);
  });
  return result.sort((a,b) => {
    if (sort === 'name') return (a.profile_name || a.phone || '').localeCompare(b.profile_name || b.phone || '', 'pt-BR');
    return (Date.parse(b.last_message_at || '') || 0) - (Date.parse(a.last_message_at || '') || 0);
  });
}

export function crmContactKey(workspaceId, contact) {
  return workspaceId + ':' + String(contact?.id ?? '');
}

export function crmLaneLabel(value) {
  const labels = {
    comercial_vital: 'Comercial Vital', bluetti: 'Bluetti', vtx: 'VTX',
    pos_venda: 'Pós-venda', atacado: 'Atacado', afiliados: 'Afiliados',
  };
  return labels[value] || String(value || 'Sem setor').replaceAll('_', ' ');
}
