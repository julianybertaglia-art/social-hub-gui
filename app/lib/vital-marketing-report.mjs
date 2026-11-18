// Only explicitly supplied values belong in a report. A blank is not zero.
const definitions={visits:{whole:true,max:100000000},orders:{whole:true,max:10000000},spend:{max:1000000000},revenue:{max:1000000000}};
const formatCount=value=>new Intl.NumberFormat('pt-BR').format(value);

function parseField(value,{whole,max}){
 const text=String(value??'').trim();
 if(!text)return null;
 if(whole&&!/^\d+$/.test(text))return undefined;
 if(!whole&&!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$|^\d+\.\d{1,2}$/.test(text))return undefined;
 const normalized=whole?text:text.includes(',')?text.replace(/\./g,'').replace(',','.'):
  /^\d{1,3}(?:\.\d{3})+$/.test(text)?text.replace(/\./g,''):text;
 const parsed=Number(normalized);
 return Number.isFinite(parsed)&&parsed>=0&&parsed<=max?parsed:undefined;
}

export function parseManualReport(fields){
 const values=Object.fromEntries(Object.entries(definitions).map(([key,definition])=>[key,parseField(fields?.[key],definition)]));
 if(Object.values(values).some(value=>value===undefined))return {error:'Confira os números: use valores positivos e, para dinheiro, até duas casas decimais.'};
 if(Object.values(values).every(value=>value===null))return {error:'Preencha pelo menos um número para gerar o resumo.'};
 return {values};
}

export function manualDiagnosis(values){
 const {visits,orders,spend,revenue}=values;
 let headline='Seu resumo está pronto';
 let summary='Comece pelos dados que você já tem. Quanto mais informações do mesmo período, mais completo será o resumo.';
 const actions=[];
 if(visits!==null&&orders!==null){
  if(visits>0&&orders===0){
   headline='Vale conferir a jornada de compra';
   summary=`Você informou ${formatCount(visits)} visitas e nenhum pedido pago no período. Isso indica uma oportunidade de investigar, mas não mostra a causa.`;
   actions.push('Simule uma compra até a etapa do frete e confira se preço, prazo e formas de pagamento aparecem corretamente.');
  }else if(orders>0){
   headline='Acompanhe o que trouxe pedidos';
   summary=`Você informou ${formatCount(orders)} ${orders===1?'pedido pago':'pedidos pagos'} no período. Confira a origem das vendas antes de decidir onde investir mais.`;
   actions.push('Confira os pedidos na Nuvemshop e anote quais vieram de anúncios, se essa informação estiver disponível.');
  }else{
   headline='Confira a medição do site';
   summary='Você informou zero visitas e zero pedidos. Verifique os números e se o acompanhamento do site está funcionando.';
   actions.push('No Analytics, confira se há registros de visitas no mesmo período.');
  }
 }else if(orders!==null&&orders>0){
  headline='Veja de onde vieram as vendas';
  summary=`Você informou ${formatCount(orders)} ${orders===1?'pedido pago':'pedidos pagos'} no período.`;
  actions.push('Confira na Nuvemshop os pedidos pagos e, quando possível, a origem de cada venda.');
 }else if(orders===0){
  headline='Comece investigando as vendas';
  summary='Você informou que não houve pedidos pagos no período. Outros dados ajudarão a entender o que aconteceu.';
  actions.push('Simule uma compra até a etapa do frete e confira as condições apresentadas.');
 }else if(visits!==null){
  headline='Falta comparar com as vendas';
  summary=`Você informou ${formatCount(visits)} visitas no período. Adicione os pedidos pagos para completar a leitura.`;
  actions.push('Confira quantos pedidos foram pagos na Nuvemshop durante o mesmo período.');
 }
 if(spend!==null&&spend>0)actions.push('Na plataforma de anúncios, confira o gasto e os cliques de cada campanha para entender o que investigar.');
 if(revenue!==null&&orders!==null&&orders>0)actions.push('Compare o faturamento informado com os custos dos produtos e do frete para avaliar a margem.');
 if(actions.length===0)actions.push('Adicione visitas e pedidos do mesmo período para receber orientações mais específicas.');
 return {headline,summary,actions:actions.slice(0,3)};
}

export const EXAMPLE_REPORT={visits:1200,orders:0,spend:400,revenue:0};
