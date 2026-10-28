// Exact source classification from the existing Vivi flow; no text-mining
// of private message bodies. Unrecognized pós-venda marketplaces stay unassigned.
export const VITAL_QUEUE_ORDER = [
  'varejo_nv','pos_nv','afiliados','pos_shopee','pos_tiktok',
  'atacado','vtx','bluetti','pos_ml',
];
export const VITAL_QUEUE_SECTORS = Object.freeze({
  varejo_nv:'comercial_vital',pos_nv:'pos_venda',afiliados:'afiliados',
  pos_shopee:'pos_venda',pos_tiktok:'pos_venda',
  atacado:'atacado',vtx:'vtx',bluetti:'bluetti',pos_ml:'pos_venda',
});
export const VITAL_QUEUE_OWNER_LABEL = Object.freeze({
  varejo_nv:'Juliany',pos_nv:'Juliany',afiliados:'Juliany',
  pos_shopee:'Andrey',pos_tiktok:'Andrey',
  atacado:'Vitor',vtx:'Vitor',bluetti:'Vitor',pos_ml:'Vitor',
});
export function normalizeViviSelection(value) {
  return String(value||'').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')
    .replace(/[–—]/g,'-').replace(/\s+/g,' ');
}
export const VIVI_SELECTION_QUEUES = Object.freeze({
  'produtos vital decor':'varejo_nv',
  'revenda':'atacado',
  'pos-venda · mercado livre':'pos_ml',
  'pos-venda - mercado livre':'pos_ml',
  'pos-venda · shopee':'pos_shopee',
  'pos-venda - shopee':'pos_shopee',
  'pos-venda · tiktok shop':'pos_tiktok',
  'pos-venda - tiktok shop':'pos_tiktok',
  'pos-venda · nuvemshop':'pos_nv',
  'pos-venda - nuvemshop':'pos_nv',
  'afiliados tiktok':'afiliados',
  'afiliados tiktok shop':'afiliados',
  'vtx fitness':'vtx',
  'bluetti':'bluetti',
});
export function viviQueue(selection) {
  return VIVI_SELECTION_QUEUES[normalizeViviSelection(selection)] || null;
}
const UNIQUE_SECTOR_QUEUE={atacado:'atacado',bluetti:'bluetti',vtx:'vtx',afiliados:'afiliados',comercial_vital:'varejo_nv'};
export function resolveVitalQueue({override, selection, sector}={}) {
  if (override && VITAL_QUEUE_SECTORS[override]) return override;
  const classified = viviQueue(selection);
  if(classified) return classified;
  // "pos_venda" is NOT unique: Shopee, TikTok, Mercado Livre and Nuvemshop.
  return UNIQUE_SECTOR_QUEUE[sector] || null;
}
export function canAccessVitalQueue(role,granted,queue) {
  if(!VITAL_QUEUE_SECTORS[queue])return false;
  return role==='owner' || (['agent','supervisor'].includes(role)
    && Array.isArray(granted) && granted.includes(queue));
}
export function queueStatus({closed=false,lastDirection}={}) {
  return closed ? 'closed' : lastDirection==='inbound' ? 'pending':'open';
}


export function crmConversationStatus({state=null,legacyClosed=false,lastDirection=null,lastMessageAt=null}={}) {
  if(state?.status==='open') return queueStatus({lastDirection});
  if(state?.status==='resolved') {
    const messageTime=Date.parse(lastMessageAt||'');
    const resolvedTime=Date.parse(state.updated_at||'');
    if(Number.isFinite(messageTime)&&Number.isFinite(resolvedTime)&&messageTime>resolvedTime)
      return queueStatus({lastDirection});
    return 'closed';
  }
  return queueStatus({closed:legacyClosed,lastDirection});
}
