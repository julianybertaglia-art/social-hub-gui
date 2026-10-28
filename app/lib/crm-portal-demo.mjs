// 100% fictional local fixtures for the Visual Preview. No customer data,
// network calls, storage, Meta, or Supabase requests are used by demo mode.
export const DEMO_SCOPES = {
  pos_venda:{label:'Atendente · Pós-venda',sectors:['pos_venda']},
  atacado:{label:'Atendente · Atacado',sectors:['atacado']},
  comercial_vital:{label:'Atendente · Varejo',sectors:['comercial_vital']},
  supervisora:{label:'Supervisora · Comercial e Pós-venda',sectors:['comercial_vital','pos_venda']},
};
export const DEMO_CONTACTS = [
 {id:'exemplo-pv1',name:'Mariana Costa',phone:'(11) 90000-0001',sector:'pos_venda',status:'open',updatedAt:'2026-10-28T13:45:00-03:00',preview:'Meu pedido chegou, mas preciso de ajuda com a instalação.',color:'#b46a2e'},
 {id:'exemplo-pv2',name:'Lucas Almeida',phone:'(11) 90000-0002',sector:'pos_venda',status:'open',updatedAt:'2026-10-28T12:15:00-03:00',preview:'Gostaria de verificar o prazo de entrega.',color:'#b46a2e'},
 {id:'exemplo-at1',name:'Renata Oliveira',phone:'(11) 90000-0003',sector:'atacado',status:'open',updatedAt:'2026-10-28T11:40:00-03:00',preview:'Vocês vendem jardim vertical em caixas fechadas?',color:'#8657b4'},
 {id:'exemplo-at2',name:'Pedro Martins',phone:'(11) 90000-0004',sector:'atacado',status:'open',updatedAt:'2026-10-28T10:10:00-03:00',preview:'Quais são as condições para revenda?',color:'#8657b4'},
 {id:'exemplo-vj1',name:'Fernanda Lima',phone:'(11) 90000-0005',sector:'comercial_vital',status:'open',updatedAt:'2026-10-28T13:10:00-03:00',preview:'Gostei da placa 3D Viena. Quantas preciso para 4 m²?',color:'#317cb3'},
 {id:'exemplo-vj2',name:'Beatriz Ribeiro',phone:'(11) 90000-0006',sector:'comercial_vital',status:'open',updatedAt:'2026-10-28T09:20:00-03:00',preview:'Pode me enviar o link de compra do muro inglês?',color:'#317cb3'},
];
const messages={
 'exemplo-pv1':[
  ['inbound','Oi! Meu pedido chegou e queria entender como instalar as placas.','2026-10-28T13:36:00-03:00'],
  ['outbound','Claro! Você comprou as placas de jardim vertical ou as placas 3D?','2026-10-28T13:39:00-03:00'],
  ['inbound','As de jardim vertical, modelo Samambaia.','2026-10-28T13:45:00-03:00']
 ],
 'exemplo-pv2':[
  ['inbound','Bom dia! Você consegue verificar meu prazo de entrega?','2026-10-28T12:07:00-03:00'],
  ['outbound','Consigo te orientar! Vou conferir as informações disponíveis do pedido.','2026-10-28T12:15:00-03:00']
 ],
 'exemplo-at1':[
  ['inbound','Olá! Vocês vendem jardim vertical em caixas fechadas?','2026-10-28T11:32:00-03:00'],
  ['outbound','Sim, trabalhamos com pedidos de atacado. Qual volume você procura?','2026-10-28T11:37:00-03:00'],
  ['inbound','Estou montando uma loja de decoração.','2026-10-28T11:40:00-03:00']
 ],
 'exemplo-at2':[
  ['inbound','Queria entender as condições para revendedores.','2026-10-28T10:06:00-03:00'],
  ['outbound','Posso te orientar sobre o pedido mínimo e as categorias.','2026-10-28T10:10:00-03:00']
 ],
 'exemplo-vj1':[
  ['inbound','Gostei da placa 3D Viena. Quantas preciso para 4 m²?','2026-10-28T13:05:00-03:00'],
  ['outbound','Vou te ajudar a calcular a quantidade de placas.','2026-10-28T13:10:00-03:00']
 ],
 'exemplo-vj2':[
  ['inbound','Pode me mandar o link do muro inglês?','2026-10-28T09:18:00-03:00'],
  ['outbound','Claro! Vou localizar o tamanho ideal para você.','2026-10-28T09:20:00-03:00']
 ],
};
export function demoConversationsFor(scope){
 const allowed=DEMO_SCOPES[scope]?.sectors||[];
 return DEMO_CONTACTS.filter(contact=>allowed.includes(contact.sector));
}
export function demoConversationDetail(scope,id){
 const row=demoConversationsFor(scope).find(c=>c.id===id);
 if(!row)return null;
 return {contact:{phone:row.phone,name:row.name,sector:row.sector},
  messages:(messages[id]||[]).map(([direction,body,date],i)=>({id:id+'-'+i,direction,body,date,type:'text',status:'sent'})),
  readOnly:true};
}
