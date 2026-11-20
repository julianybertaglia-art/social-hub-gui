const count=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const fmt=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value);
const eventNames={view_item:'visualizações de produto',add_to_cart:'adições ao carrinho',begin_checkout:'inícios de checkout',purchase:'compras registradas'};

// Signals are a starting point for investigation, not a cohort funnel or proof of causality.
export function marketingPriorities(insights,store){
 const ga=insights?.ga4?.status==='ready'?insights.ga4.data:null;
 const clarity=insights?.clarity?.status==='ready'?insights.clarity.data:null;
 const meta=insights?.meta?.status==='ready'?insights.meta.data:null;
 const shop=store?.status==='ready'?store.data:null;
 const out=[];
 const events=new Map((ga?.events||[]).map(e=>[e.event,count(e.count)]));
 if(shop?.paidOrders>0&&events.has('purchase')&&events.get('purchase')===null){
  out.push({kind:'medicao',label:'Medição',title:'Confira o registro das compras',
   evidence:`A loja registrou ${fmt(shop.paidOrders)} pedidos pagos; o GA4 não retornou o evento de compra no período dele.`,
   action:'Confira a tag de compra e compare os períodos e fusos das duas fontes.',
   note:'A ausência no relatório não prova que houve falha de configuração.'});
 }
 const pairs=[['view_item','add_to_cart'],['add_to_cart','begin_checkout'],['begin_checkout','purchase']];
 const candidates=pairs.map(([from,to])=>({from,to,a:events.get(from),b:events.get(to)}))
  .filter(x=>x.a!==null&&x.a!==undefined&&x.b!==null&&x.b!==undefined&&x.a>=10&&x.b<x.a)
  .sort((x,y)=>(y.a-y.b)/y.a-(x.a-x.b)/x.a);
 if(candidates.length){
  const x=candidates[0];
  const action=x.to==='add_to_cart'?'Revise fotos, preço, benefícios, disponibilidade e a visibilidade do botão de compra.':
   x.to==='begin_checkout'?'Simule o carrinho e o frete em diferentes quantidades e CEPs.':
   'Simule o checkout até a confirmação e confira frete, pagamento e registro da compra.';
  out.push({kind:'jornada',label:'Jornada de compra',title:'Uma etapa para investigar',
   evidence:`O GA4 registrou ${fmt(x.a)} ${eventNames[x.from]} e ${fmt(x.b)} ${eventNames[x.to]}.`,action,
   note:'São eventos agregados, não as mesmas pessoas acompanhadas em um funil; a diferença não mede abandono.'});
 }
 const friction=(clarity?.friction||[]).filter(x=>count(x.percentage)!==null&&count(x.sessions)>=20&&x.percentage>0)
  .sort((a,b)=>b.percentage-a.percentage)[0];
 if(friction)out.push({kind:'experiencia',label:'Experiência no site',title:`Investigue: ${friction.label.toLocaleLowerCase('pt-BR')}`,
  evidence:`O Clarity indicou esse sinal em ${fmt(friction.percentage)}% das ${fmt(friction.sessions)} sessões consideradas nas últimas 72 horas.`,
  action:'No Clarity, examine gravações e mapas de calor, principalmente no celular.',
  note:'O sinal aponta uma hipótese; não confirma sozinho um problema.'});
 const best=shop?.topProducts?.find(x=>x?.name&&count(x.quantity)>0);
 if(best)out.push({kind:'produto',label:'Oportunidade de produto',title:`Teste um criativo de ${best.name}`,
  evidence:`O produto aparece entre os mais vendidos, com ${fmt(best.quantity)} unidades nos pedidos pagos do período.`,
  action:'Confira estoque e margem; teste um criativo mostrando aplicação, resultado e condições reais.',
  note:'Mais vendido não significa maior margem ou venda causada por anúncios.'});
 if(!out.length&&meta&&count(meta.linkClicks)>0)out.push({kind:'trafego',label:'Tráfego',title:'Acompanhe o caminho dos anúncios',
  evidence:`A Meta registrou ${fmt(meta.linkClicks)} cliques em links no período dela.`,
  action:'Compare os destinos dos anúncios com as páginas de entrada do GA4 e teste a compra no celular.',
  note:'Cliques da Meta não são visitas confirmadas nem vendas atribuídas.'});
 if(!out.length)out.push({kind:'dados',label:'Dados',title:'Complete a leitura antes de decidir',
  evidence:'Ainda não há sinais suficientes nas fontes disponíveis para apontar uma prioridade confiável.',
  action:'Atualize as fontes conectadas e confira se o GA4 recebe os eventos da jornada de compra.',
  note:'Uma fonte indisponível não significa resultado zero.'});
 return out.slice(0,4);
}

export function campaignRatios(c){
 const spend=count(c?.spend),clicks=count(c?.linkClicks),impressions=count(c?.impressions);
 return {cpc:spend!==null&&clicks>0?spend/clicks:null,
  ctr:clicks!==null&&impressions>0?100*clicks/impressions:null};
}

// CSV is a snapshot, without contact details; neutralize spreadsheet formulas.
function csvCell(value){
 if(value===null||value===undefined)return '';
 let text=String(value);
 if(typeof value!=='number'&&/^[\s]*[=+\-@\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export function marketingCsv(insights,store,priorities,ai,manual=null){
 const rows=[['Fonte','Período','Indicador','Valor','Observação']];
 const add=(source,period,key,value,note='')=>{if(value!==null&&value!==undefined)rows.push([source,period,key,value,note]);};
 if(manual?.kind==='manual'){
  const period=`Últimos ${manual.period} dias`,note=manual.example?'Exemplo fictício':'Informado manualmente';
  add('Manual',period,'Visitas',manual.values?.visits,note);add('Manual',period,'Pedidos',manual.values?.orders,note);
  add('Manual',period,'Gasto',manual.values?.spend,note);add('Manual',period,'Faturamento informado',manual.values?.revenue,note);
  if(ai?.summary)rows.push(['IA','','Resumo',ai.summary,ai.limit||'']);
  for(const x of ai?.actions||[])rows.push(['IA','','Ação sugerida',x,'']);
  return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
 }
 const m=insights?.meta?.status==='ready'?insights.meta.data:null;
 const g=insights?.ga4?.status==='ready'?insights.ga4.data:null;
 const c=insights?.clarity?.status==='ready'?insights.clarity.data:null;
 const s=store?.status==='ready'?store.data:null;
 if(m){add('Meta Ads',m.period,'Investimento',m.spend,m.currency);add('Meta Ads',m.period,'Cliques no link',m.linkClicks);
  add('Meta Ads',m.period,'Visualizações de destino atribuídas',m.landingViews);
  add('Meta Ads',m.period,'Adições ao carrinho atribuídas',m.addToCart);
  add('Meta Ads',m.period,'Checkouts atribuídos',m.checkouts);
  add('Meta Ads',m.period,'Compras atribuídas',m.purchases,'Estimativa da Meta; não confirma pedidos pagos');
  add('Meta Ads',m.period,'Valor de compras atribuído',m.purchaseValue,'Estimativa da Meta; não é lucro');
  add('Meta Ads',m.period,'Impressões',m.impressions);for(const x of m.campaigns||[]){
   add('Meta Ads',m.period,`Campanha: ${x.name}`,x.spend,'Investimento');add('Meta Ads',m.period,`Campanha: ${x.name}`,x.linkClicks,'Cliques no link');
   add('Meta Ads',m.period,`Campanha: ${x.name}`,x.purchases,'Compras atribuídas pela Meta');
   add('Meta Ads',m.period,`Campanha: ${x.name}`,x.purchaseValue,'Valor atribuído pela Meta');
   add('Meta Ads',m.period,`Campanha: ${x.name}`,x.impressions,'Impressões');}}
 if(g){add('GA4',g.period,'Sessões',g.sessions);add('GA4',g.period,'Compras registradas',g.purchases,'Eventos, não pedidos pagos');
  for(const x of g.events||[])add('GA4',g.period,eventNames[x.event]||x.event,x.count,'Eventos agregados');
  for(const x of g.devices||[])add('GA4',g.period,`Dispositivo: ${x.device}`,x.sessions,'Sessões');
  for(const x of g.landingPages||[])add('GA4',g.period,`Página de entrada: ${x.path}`,x.sessions,'Sessões');
  for(const x of g.products||[]){add('GA4',g.period,`Produto: ${x.name}`,x.views,'Unidades visualizadas');
   add('GA4',g.period,`Produto: ${x.name}`,x.cart,'Unidades adicionadas ao carrinho');
   add('GA4',g.period,`Produto: ${x.name}`,x.purchases,'Unidades em compras registradas no GA4');}}
 if(s){const period=`${s.start} a ${s.end}`;add('Nuvemshop',period,'Pedidos pagos',s.paidOrders);
  add('Nuvemshop',period,'Valor bruto de pedidos',s.revenue,'Não é lucro nem receita atribuída a anúncios');
  for(const x of s.topProducts||[])add('Nuvemshop',period,`Produto: ${x.name}`,x.quantity,'Unidades em pedidos pagos');}
 if(c){add('Clarity',c.period,'Sessões',c.sessions);for(const x of c.friction||[])add('Clarity',c.period,x.label,x.percentage,'Percentual de sessões observadas');}
 for(const x of priorities||[])rows.push(['Prioridade','',x.title,x.evidence,x.action]);
 if(ai?.summary)rows.push(['IA','','Resumo',ai.summary,ai.limit||'']);
 for(const x of ai?.actions||[])rows.push(['IA','','Ação sugerida',x,'']);
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}

export function draftForProduct(name){
 const product=typeof name==='string'&&name.trim()?name.trim().slice(0,80):'nossos produtos';
 return {subject:`Uma ideia para transformar seu espaço com ${product}`,
  body:`Olá!\n\nQuer renovar seu ambiente de um jeito prático? Conheça ${product} na Vital Decor.\n\nVeja as opções, medidas e condições na loja: https://vitaldecor.com.br/\n\nSe precisar de ajuda para escolher, responda este e-mail.\n\nEquipe Vital Decor`};
}
