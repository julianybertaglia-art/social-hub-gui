// Shared, workspace-scoped subject taxonomy.
// Subject is independent of deal stage, sector, and Direct folder.
export const TOPIC_GROUPS = {
  'gui-nonato': [
    {id:'mentoria',label:'Mentoria',color:'#8657b4'},
    {id:'iniciantes',label:'Iniciantes',color:'#287db5'},
    {id:'importacao',label:'Importação',color:'#bf7a21'},
    {id:'outros',label:'Outros assuntos',color:'#69747f'},
    {id:'vendas_finalizadas',label:'Vendas finalizadas',color:'#26805a'},
  ],
  'vital-decor': [
    {id:'pos_venda',label:'Pós-venda',color:'#b46a2e'},
    {id:'varejo',label:'Varejo',color:'#317cb3'},
    {id:'atacado',label:'Atacado',color:'#8561a8'},
    {id:'vtx',label:'VTX',color:'#b4436e'},
    {id:'bluetti',label:'Bluetti',color:'#237e92'},
    {id:'outros',label:'Outros assuntos',color:'#69747f'},
    {id:'vendas_finalizadas',label:'Vendas finalizadas',color:'#26805a'},
  ]
};
export const TOPIC_DEFAULT = 'outros';
export function topicsFor(workspace) { return TOPIC_GROUPS[workspace] || []; }
export function validTopic(workspace, topic) { return topicsFor(workspace).some(item => item.id === topic); }
export function topicOption(workspace, topic) {
  return topicsFor(workspace).find(item => item.id === topic) || topicsFor(workspace).find(item => item.id === TOPIC_DEFAULT);
}
function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
// Existing structured fields may suggest an initial subject; the user's saved
// classification always wins. Never infer a confirmed sale from message text.
export function inferredTopic(workspace, contact = {}, channel = 'whatsapp') {
  if (workspace === 'vital-decor') {
    const sector = String(contact.sector || '');
    return ({pos_venda:'pos_venda',comercial_vital:'varejo',atacado:'atacado',vtx:'vtx',bluetti:'bluetti'})[sector] || TOPIC_DEFAULT;
  }
  if (channel === 'whatsapp' && contact.stage === 'Venda') return 'vendas_finalizadas';
  if (channel === 'instagram' && contact.category === 'beginners') return 'iniciantes';
  const terms = normalize([
    ...(Array.isArray(contact.tags) ? contact.tags : []),
    ...(Array.isArray(contact.smart_categories) ? contact.smart_categories : []),
    channel === 'instagram' ? contact.automation_keyword : '',
  ].join(' '));
  if (/mentoria|mentor/.test(terms)) return 'mentoria';
  if (/importacao|importar/.test(terms)) return 'importacao';
  if (/iniciante|comecar|primeira venda/.test(terms)) return 'iniciantes';
  return TOPIC_DEFAULT;
}
export function resolvedTopic(workspace, contact, assignments = {}, channel = 'whatsapp') {
  return assignments[String(contact?.id)] || inferredTopic(workspace, contact, channel);
}
