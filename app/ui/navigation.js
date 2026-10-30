// TidePlace: navigation metadata only. Existing routes, APIs, data and channel integrations stay intact.
export const NAV_GROUPS = [
 {label:'SOCIAL STUDIO',area:'studio',items:[
  {href:'/',label:'Visão geral',icon:'grid',section:'dashboard',description:'Resumo da marca'},
  {href:'/?section=calendar',label:'Calendário e conteúdo',icon:'calendar',section:'calendar',description:'Planejamento editorial'},
  {href:'/?section=ideas',label:'Ideias',icon:'sparkle',section:'ideas',description:'Banco de ideias existente; integração com o calendário virá depois'},
  {href:'/publicar',label:'Publicar em redes',icon:'upload',only:['gui-nonato'],description:'Publicação multicanal'},
  {href:'/automacoes',label:'Automações do Instagram',icon:'instagram',description:'Fluxos de Instagram existentes'},
  {href:'/?section=metrics',label:'Métricas',icon:'chart',section:'metrics',description:'Métricas do Instagram'},
  {href:'/?section=goals',label:'Metas',icon:'target',section:'goals',description:'Metas atuais'},
  {href:'/?section=tasks',label:'Tarefas',icon:'check',section:'tasks',description:'Tarefas atuais'},
 ]},
 {label:'TIDE CRM',area:'crm',items:[
  {href:'/crm',label:'Funil e indicadores',icon:'chart',only:['gui-nonato'],description:'CRM atual do Gui'},
  {href:'/crm/consultorias',label:'Consultorias',icon:'users',only:['gui-nonato'],description:'Leads da consultoria do Gui'},
  {href:'/whatsapp',label:'Atendimentos WhatsApp',icon:'chat',description:'Caixa de entrada atual da marca'},
  {href:'/whatsapp/setores',label:'Meus setores',icon:'users',only:['vital-decor'],description:'Setores de atendimento da Vital'},
  {href:'/instagram/direct',label:'Instagram Direct',icon:'instagram',only:['gui-nonato'],description:'Direct do Gui'},
  {href:'/whatsapp/automacoes',label:'Automações WhatsApp',icon:'flow',description:'Fluxos atuais do WhatsApp'},
  {href:'/whatsapp/campanha',label:'Campanhas',icon:'send',only:['gui-nonato'],description:'Campanhas do Gui'},
 ]},
 {label:'CONFIGURAÇÕES',area:'settings',items:[
  {href:'/conexoes/vital-decor',label:'Conexões Vital Decor',icon:'plug',only:['vital-decor'],description:'Conexões autorizadas da Vital'},
  {href:'/whatsapp/integracao-argo',label:'Setores e Argo',icon:'layers',only:['vital-decor'],description:'Configuração atual do Argo'},
  {href:'/tiktok/conectar',label:'Conectar TikTok',icon:'tiktok',only:['gui-nonato'],description:'Configurações TikTok'},
  {href:'/youtube',label:'Conectar YouTube',icon:'play',only:['gui-nonato'],description:'Configurações YouTube'},
  {href:'/admin/conexoes',label:'Central de controle',icon:'settings',description:'Diagnóstico das conexões'},
 ]}
];
export function visibleNavGroups(workspaceId='gui-nonato',area=null){
 return NAV_GROUPS.filter(g=>area===null||g.area===area)
  .map(g=>({...g,items:g.items.filter(i=>!i.only||i.only.includes(workspaceId))}))
  .filter(g=>g.items.length);
}
export function matchesNavigation(item,pathname,section='dashboard'){
 if(!item)return false;
 if(item.section)return pathname==='/'&&section===item.section;
 if(item.href==='/whatsapp')return pathname==='/whatsapp';
 if(item.href==='/crm')return pathname==='/crm';
 if(item.href==='/automacoes')return pathname==='/automacoes';
 return pathname===item.href||pathname.startsWith(item.href+'/');
}
export function searchNavigation(query,workspaceId='gui-nonato'){
 const normalize=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
 const all=visibleNavGroups(workspaceId).flatMap(g=>g.items.map(i=>({...i,group:g.label})));
 if(!normalize(query))return all;
 return all.filter(i=>normalize(i.label+' '+i.description+' '+i.group).includes(normalize(query)));
}
