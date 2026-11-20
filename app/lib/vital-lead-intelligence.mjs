// Pure, conservative rules: never infer a site visit or a purchase from a WhatsApp URL.
const SITE_URL=/https?:\/\/(?:www\.)?vitaldecor\.com\.br(?:\b|\/)/i;
export const digitsOnly=value=>String(value||'').replace(/\D/g,'');
export function canonicalPhone(value){
  const digits=digitsOnly(value);
  if(digits.length===10||digits.length===11)return '55'+digits;
  return digits.length>=11&&digits.length<=15?digits:null;
}
export function samePhone(left,right){
  const a=canonicalPhone(left),b=canonicalPhone(right);
  return Boolean(a&&b&&a===b);
}
export function isSiteLinkNoReturn(message,queue){
  const source=message?.raw_payload?.source;
  return queue==='varejo_nv'&&message?.direction==='outbound'
    &&source==='vivi_automation'&&SITE_URL.test(message?.body||'');
}
export const safeMoney=value=>{
 const n=Number(value);
 return (value===null||value===undefined||value===''||!Number.isFinite(n))?null:Math.round(n*100)/100;
};
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const productSummary=products=>Array.isArray(products)?products.slice(0,12).map(item=>({
 name:String(item?.name||'Produto').slice(0,110),quantity:Number(item?.quantity)||1
})):[];
export function mapLeadOrder(order){
 return {
  id:String(order?.id||''),number:String(order?.number||order?.id||''),
  at:iso(order?.created_at),total:safeMoney(order?.total),
  paymentStatus:String(order?.payment_status||'unknown'),shippingStatus:String(order?.shipping_status||'unknown'),
  status:String(order?.status||'unknown'),trackingCode:String(order?.shipping_tracking_number||'').slice(0,100),
  trackingUrl:typeof order?.shipping_tracking_url==='string'&&order.shipping_tracking_url.startsWith('https://')?order.shipping_tracking_url:null,
  products:productSummary(order?.products),
 };
}
export function mapLeadCheckout(checkout){
 return {
  id:String(checkout?.id||''),at:iso(checkout?.created_at),total:safeMoney(checkout?.total),
  products:productSummary(checkout?.products),
  url:typeof checkout?.abandoned_checkout_url==='string'&&checkout.abandoned_checkout_url.startsWith('https://')
    ?checkout.abandoned_checkout_url:null,
 };
}
export function classifyLead({orders=[],checkouts=[],siteLinkNoReturn=false,sourcesReady=false}={}){
 if(orders.some(o=>o.paymentStatus==='paid'&&o.status!=='cancelled'))
   return {id:'cliente',label:'Cliente com compra confirmada',confidence:'confirmado'};
 if(orders.length)return {id:'pedido',label:'Pedido identificado na loja',confidence:'confirmado'};
 if(checkouts.length)return {id:'checkout',label:'Checkout iniciado',confidence:'confirmado'};
 if(siteLinkNoReturn)return {id:'link',label:'Link enviado · sem retorno',confidence:'WhatsApp'};
 return {id:'contato',label:sourcesReady?'Contato sem compra encontrada no período':'Contato em avaliação',confidence:sourcesReady?'janela consultada':'pendente'};
}
export function recommendationForLead({orders=[],checkouts=[],siteLinkNoReturn=false,replyWindowOpen=false,sourcesReady=false}={}){
 if(orders.some(o=>o.paymentStatus==='paid'&&o.shippingStatus==='shipped'))
  return {kind:'service',title:'Acompanhar entrega',description:'Pedido enviado. Confira o rastreio e confirme se há alguma dúvida.'};
 if(orders.some(o=>o.paymentStatus==='paid'&&o.shippingStatus==='delivered'))
  return {kind:'service',title:'Pós-venda',description:'Entrega registrada. Priorize suporte e satisfação, sem ofertas automáticas.'};
 if(orders.some(o=>o.paymentStatus==='paid'))
  return {kind:'service',title:'Atualização de pedido',description:'Já comprou: priorize informações do pedido, não recuperação de carrinho.'};
 if(orders.length)return {kind:'service',title:'Acompanhar pagamento',description:'Há pedido registrado; confira seu status real antes de entrar em contato.'};
 if(checkouts.length&&sourcesReady)return {kind:'marketing',title:'Checkout não concluído',description:'Revise o checkout e confirme que não houve compra antes de oferecer ajuda. Exige consentimento e política de envio.'};
 if(siteLinkNoReturn)return {kind:'marketing',title:replyWindowOpen?'Oferecer ajuda na escolha':'Aguardar contato ou modelo aprovado',
  description:replyWindowOpen?'A pessoa recebeu o link, mas não respondeu. Não sabemos se visitou a loja.':'Não há janela de atendimento aberta. Recontato comercial exige consentimento e modelo de marketing aprovado.'};
 return {kind:'support',title:'Entender a necessidade',description:'Converse para descobrir o interesse. Não há sinal suficiente para estimar a intenção de compra.'};
}
export function orderUpdateDraft(order){
 const name='Olá! 💜',number=order.number?' #'+order.number:'';
 if(order.paymentStatus==='paid'&&order.shippingStatus==='delivered')
  return name+' A entrega do seu pedido'+number+' consta como concluída na loja. Chegou tudo certinho? Estamos aqui se precisar.';
 if(order.paymentStatus==='paid'&&order.shippingStatus==='shipped')
  return name+' Seu pedido'+number+' foi enviado!'+(order.trackingCode?' Código de rastreio: '+order.trackingCode+'.':'')+' Se precisar de ajuda, estamos por aqui.';
 if(order.paymentStatus==='paid')
  return name+' O pagamento do pedido'+number+' está confirmado. Você pode acompanhar as próximas atualizações pelo nosso atendimento. 😊';
 return null;
}
