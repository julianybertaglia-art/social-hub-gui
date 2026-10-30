// TidePlace visual organization only: routes, APIs and stored data remain untouched.
// Studio + CRM are navigation areas inside the same workspace and same application.
export const NAV_GROUPS = [
  { label:'SOCIAL STUDIO', area:'studio', items:[
    {href:'/',label:'Visão geral',icon:'home',section:'dashboard',description:'Resumo e prioridades da marca'},
    {href:'/?section=calendar',label:'Conteúdo',icon:'calendar',section:'calendar',description:'Calendário editorial; as ideias e roteiros serão unificados aqui na próxima fase'},
    {href:'/publicar',label:'Publicar em redes',icon:'send',only:['gui-nonato'],description:'Publicação para Instagram, TikTok e YouTube'},
    {href:'/automacoes',label:'Automações sociais',icon:'flow',description:'Fluxos e respostas do Instagram'},
    {href:'/?section=metrics',label:'Métricas do Instagram',icon:'chart',section:'metrics',description:'Desempenho e tendências'},
    {href:'/?section=goals',label:'Metas',icon:'target',section:'goals',description:'Metas existentes; acompanhamento por IA fica para a próxima fase'},
  ]},
  {label:'TIDE CRM',area:'crm',items:[
    {href:'/crm',label:'Visão geral',icon:'chart',only:['gui-nonato'],description:'Funil e indicadores de relacionamento'},
    {href:'/crm/vital',label:'Dashboard e atendimentos',icon:'inbox',only:['vital-decor'],description:'CRM Vital, nove filas e dashboards'},
    {href:'/whatsapp',label:'WhatsApp',icon:'chat',only:['gui-nonato'],description:'Conversas e contatos do Gui'},
    {href:'/whatsapp',label:'WhatsApp geral',icon:'chat',only:['vital-decor'],description:'Caixa geral do WhatsApp da Vital preservada'},
    {href:'/instagram/direct',label:'Instagram Direct',icon:'instagram',only:['gui-nonato'],description:'Atendimento pelo Instagram'},
    {href:'/crm/consultorias',label:'Consultorias',icon:'users',only:['gui-nonato'],description:'Leads da consultoria e mentoria'},
    {href:'/whatsapp/automacoes',label:'Automações WhatsApp',icon:'flow',description:'Regras e respostas automatizadas do WhatsApp'},
    {href:'/crm/vital/equipe',label:'Equipe e permissões',icon:'shield',only:['vital-decor'],description:'Convites e acessos por filas'},
    {href:'/whatsapp/campanha',label:'Campanhas',icon:'send',only:['gui-nonato'],description:'Envios e reengajamento'},
  ]},
  {label:'CONFIGURAÇÕES',area:'settings',items:[
    {href:'/conexoes/vital-decor',label:'Conexões Vital Decor',icon:'plug',only:['vital-decor'],description:'Autorizações de canais da Vital'},
    {href:'/whatsapp/integracao-argo',label:'Setores e Argo',icon:'layers',only:['vital-decor'],description:'Responsáveis e integração Argo'},
    {href:'/youtube',label:'Conectar YouTube',icon:'play',only:['gui-nonato'],description:'Autorização do canal'},
    {href:'/tiktok/conectar',label:'Conectar TikTok',icon:'tiktok',only:['gui-nonato'],description:'Autorização de canal'},
    {href:'/admin/conexoes',label:'Central de controle',icon:'settings',description:'Saúde das integrações e diagnóstico'},
  ]}
];
export function visibleNavGroups(workspaceId='gui-nonato',area=null){
 return NAV_GROUPS.filter(group=>area===null||group.area===area||(group.area==='settings'&&area==='settings'))
 .map(group=>({...group,items:group.items.filter(item=>!item.only||item.only.includes(workspaceId))}))
 .filter(group=>group.items.length>0);
}
export function matchesNavigation(item,pathname,section='dashboard'){
 if(item.section)return pathname==='/'&&section===item.section;
 if(item.href==='/crm/vital')return pathname==='/crm/vital';
 if(item.href==='/whatsapp')return pathname==='/whatsapp';
 if(item.href==='/automacoes')return pathname==='/automacoes';
 return pathname===item.href||pathname.startsWith(item.href+'/');
}
export function searchNavigation(query,workspaceId='gui-nonato'){
 const normalized=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const results=visibleNavGroups(workspaceId).flatMap(group=>group.items.map(item=>({...item,group:group.label})));
 if(!normalized)return results;
 return results.filter(item=>(item.label+' '+item.description+' '+item.group).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized));
}
