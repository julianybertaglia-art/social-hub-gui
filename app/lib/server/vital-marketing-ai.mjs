const finite=(value,{whole=false,negative=false}={})=>{
 if(value===null||value===undefined)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1000000000||(!negative&&value<0)||(whole&&!Number.isInteger(value)))throw Error('invalid_report');
 return value;
};
const count=value=>finite(value,{whole:true});
const amount=value=>finite(value);
const cleanPeriod=value=>typeof value==='string'&&/^[0-9/-]{10,25}$/.test(value)?value:null;

// Construct an allowlisted payload: no supplied names, free text, credentials,
// customer identifiers or unrecognized fields reach the AI provider.
export function sanitizeAiReport(input){
 if(input?.kind==='manual'){
  if(!['7','30'].includes(input.period))throw Error('invalid_report');
  const metrics={visits:count(input.metrics?.visits),orders:count(input.metrics?.orders),
   spend:amount(input.metrics?.spend),revenue:amount(input.metrics?.revenue)};
  if(Object.values(metrics).every(value=>value===null))throw Error('invalid_report');
  return {fonte:'Valores informados manualmente',periodo:`Últimos ${input.period} dias`,
   ...(input.example===true?{aviso:'Exemplo com dados fictícios'}:{}),metricas:{
    visitas:metrics.visits,pedidos_pagos:metrics.orders,investimento_em_anuncios_BRL:metrics.spend,
    faturamento_dos_pedidos_pagos_BRL:metrics.revenue}};
 }
 if(input?.kind==='connected'){
  const ga=input.ga4,meta=input.meta,store=input.store,clarity=input.clarity;
  const result={fonte:'Dados agregados fornecidos pelas integrações, quando disponíveis'};
  if(ga)result.GA4={periodo:'Últimos 30 dias completos',sessoes:count(ga.sessions),
   compras_registradas:count(ga.purchases),receita_de_compras:finite(ga.purchaseRevenue,{negative:true}),
   moeda:typeof ga.currency==='string'&&/^[A-Z]{3}$/.test(ga.currency)?ga.currency:null};
  if(meta)result.Meta_Ads={periodo:'Últimos 30 dias conforme a Meta',intervalo:cleanPeriod(meta.range),
   investimento:amount(meta.spend),cliques_no_link:count(meta.linkClicks),impressoes:count(meta.impressions),
   moeda:typeof meta.currency==='string'&&/^[A-Z]{3}$/.test(meta.currency)?meta.currency:null};
  if(store){
   const start=cleanPeriod(store.start),end=cleanPeriod(store.end);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))throw Error('invalid_report');
   result.Nuvemshop={periodo:`${start}/${end}`,pedidos_pagos:count(store.orders),
    valor_bruto_pedidos_BRL:amount(store.revenue),
    observacao:'Pedidos criados no período e pagos; não são atribuídos a anúncios; não é lucro nem faturamento líquido.'};
  }
  if(clarity)result.Clarity={periodo:'Últimas 72 horas',sessoes:count(clarity.sessions),
   sessoes_identificadas_como_bots:count(clarity.botSessions)};
  if(!ga&&!meta&&!store&&!clarity)throw Error('invalid_report');
  const numbers=[...(ga?[result.GA4.sessoes,result.GA4.compras_registradas,result.GA4.receita_de_compras]:[]),
   ...(meta?[result.Meta_Ads.investimento,result.Meta_Ads.cliques_no_link,result.Meta_Ads.impressoes]:[]),
   ...(store?[result.Nuvemshop.pedidos_pagos,result.Nuvemshop.valor_bruto_pedidos_BRL]:[]),
   ...(clarity?[result.Clarity.sessoes,result.Clarity.sessoes_identificadas_como_bots]:[])];
  if(numbers.every(value=>value===null))throw Error('invalid_report');
  return result;
 }
 throw Error('invalid_report');
}

export async function createAiMarketingReport(input,{apiKey,model='gemini-3.6-flash',fetcher=fetch}={}){
 const report=sanitizeAiReport(input);
 if(!apiKey)throw Error('not_configured');
 const system=`Você é uma analista de marketing de e-commerce ajudando uma pessoa iniciante. Responda em português do Brasil, com frases claras e curtas. Use somente o JSON fornecido. Diga o que é observado, o que é hipótese e quais dados faltam. Sugira até três ações específicas e verificáveis, sem prometer resultados. Nunca invente metas, valores anteriores, tendências, taxas, causas de vendas ou benchmarks. Um valor nulo significa dado não informado, não zero. Não atribua pedidos, receita ou faturamento aos anúncios, nem calcule ROAS, CAC ou lucro com totais gerais. Cliques não são visitas. Sessões do Clarity não são compras e podem incluir bots. Os pedidos pagos e o valor dos pedidos da Nuvemshop não comprovam que vendas vieram de anúncios; não são lucro nem receita líquida. Compras registradas no GA4 não comprovam pedidos pagos; períodos e atribuição das plataformas podem diferir. Não recomende alterar campanhas ou orçamento como decisão automática. Não execute ações. Se for exemplo, trate como fictício. Retorne apenas JSON com resumo (texto), atencao (texto), acoes (lista de textos) e limite (texto curto explicando a principal limitação).`;
 const parse=(text,provider)=>{
  let result;try{result=JSON.parse(text);}catch{throw Error('invalid_response');}
  const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const output={summary:clean(result.resumo,600),attention:clean(result.atencao,600),
   actions:Array.isArray(result.acoes)?result.acoes.map(value=>clean(value,300)).filter(Boolean).slice(0,3):[],
   limit:clean(result.limite,400),provider};
  if(!output.summary||!output.actions.length)throw Error('invalid_response');
  return output;
 };
 const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
  method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({system_instruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:JSON.stringify(report)}]}],
   generationConfig:{responseMimeType:'application/json',maxOutputTokens:1600,thinkingConfig:{thinkingLevel:'low'}}}),
  cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('provider_failure');
 const payload=await response.json();
 const text=(payload?.candidates?.[0]?.content?.parts||[]).filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('');
 return parse(text,'Google Gemini');
}
