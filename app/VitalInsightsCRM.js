'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from './operations/useOperations';
import {parseManualReport,manualDiagnosis,EXAMPLE_REPORT} from './lib/vital-marketing-report.mjs';
import {marketingPriorities,marketingCsv} from './lib/vital-marketing-strategy.mjs';
import VitalInsightsSourceDetails from './VitalInsightsSourceDetails';
import VitalMarketingWorkbench from './VitalMarketingWorkbench';
import css from './vital-insights-crm.module.css';

const number=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('pt-BR').format(value):'—';
const money=(value,currency='BRL')=>{
 if(typeof value!=='number'||!Number.isFinite(value))return '—';
 if(!currency)return `${number(value)} (moeda não informada)`;
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value);}catch{return `${number(value)} (moeda não informada)`;}
};
const isNumber=value=>typeof value==='number'&&Number.isFinite(value);
const blank={visits:'',orders:'',spend:'',revenue:''};

function Metric({icon,label,value,source}){
 return <article className={css.metric}>
  <div className={css.metricTop}><span className={css.metricIcon} aria-hidden="true">{icon}</span><span>{label}</span></div>
  <strong>{value}</strong><small>{source}</small>
 </article>;
}

function connectedReport(insights,store){
 const shop=store?.status==='ready'?store.data:null;
 const clarity=insights?.clarity?.status==='ready'?insights.clarity.data:null;
 const ga=insights?.ga4?.status==='ready'?insights.ga4.data:null;
 const meta=insights?.meta?.status==='ready'?insights.meta.data:null;
 if(!ga&&!meta&&!shop&&!clarity)return null;
 if(![shop?.paidOrders,shop?.revenue,clarity?.sessions,ga?.sessions,ga?.purchases,ga?.purchaseRevenue,meta?.spend,meta?.linkClicks,meta?.impressions].some(isNumber))return null;
 const actions=[];
 let headline='Seus números já estão chegando';
 let summary='Veja os dados de cada fonte e confira os períodos antes de compará-los.';
 if(shop){
  headline='Acompanhe as vendas reais da loja';
  summary=`A Nuvemshop retornou ${number(shop.paidOrders)} pedidos pagos, criados no período de ${shop.start} a ${shop.end}. Esses pedidos não estão atribuídos a anúncios.`;
  actions.push('Verifique se os pedidos pagos conferem com o painel da Nuvemshop e examine eventuais reembolsos.');
  actions.push('Confira o frete e o checkout para diferentes quantidades e CEPs antes de ajustar campanhas.');
 }else if(clarity){
  headline='Analise a experiência dos visitantes';
  summary=`O Clarity registrou ${number(clarity.sessions)} sessões nas últimas 72 horas. Isso não informa quantas pessoas compraram.`;
  actions.push('Abra o Clarity e verifique os acessos pelo celular e possíveis dificuldades na página de produto ou no frete.');
 }
 if(!shop&&isNumber(ga?.sessions)&&isNumber(ga?.purchases)){
  summary=`O Analytics registrou ${number(ga.sessions)} visitas e ${number(ga.purchases)} compras no período dele. As compras do Analytics devem ser conferidas na loja.`;
  if(ga.sessions>0&&ga.purchases===0){
   headline='Confira a jornada de compra';
   summary+=' Confira a medição antes de concluir o que causou esse resultado.';
   actions.push('Simule uma compra até a etapa do frete e verifique se preço, prazo e pagamento aparecem corretamente.');
  }
 }
 if(meta&&isNumber(meta.spend)&&meta.spend>0)actions.push('Antes de mudar o orçamento, confirme quais pedidos vieram dos anúncios.');
 if(ga)actions.push('Compare as compras registradas no Analytics com os pedidos pagos da Nuvemshop.');
 if(!actions.length)actions.push('Conecte as outras fontes para complementar o diagnóstico.');
 return {kind:'connected',store:shop,clarity,ga4:ga,meta,headline,summary,actions:actions.slice(0,3)};
}

function ConnectionPill({insights,store,loading,error}){
 const sources=[store,insights?.meta,insights?.ga4,insights?.clarity,insights?.gtm];
 const ready=sources.filter(source=>source?.status==='ready').length;
 return <span className={css.connectionPill}><span aria-hidden="true" className={ready?css.dotReady:css.dotPending}/>
  {loading?'Verificando conexões':error?'Conexões indisponíveis':ready?`${ready} ${ready===1?'fonte conectada':'fontes conectadas'}`:'Sem conexões ativas'}
 </span>;
}

export default function VitalInsightsCRM({revision=0}){
 const [insights,setInsights]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0),[formVisible,setFormVisible]=useState(false);
 const [store,setStore]=useState(null),[storeError,setStoreError]=useState('');
 const [fields,setFields]=useState(blank),[period,setPeriod]=useState('7'),[manual,setManual]=useState(null),[formError,setFormError]=useState('');
 const [ai,setAi]=useState(null),[aiError,setAiError]=useState(''),[aiBusy,setAiBusy]=useState(false);
 const aiRequest=useRef(0);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setLoading(true);setError('');
  api('/api/crm/vital/insights',{signal:controller.signal})
   .then(data=>{if(active){aiRequest.current+=1;setAi(null);setAiError('');setAiBusy(false);setInsights(data);}})
   .catch(e=>{if(active)setError(e.message||'Métricas indisponíveis.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[revision,reload]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();setStoreError('');
  api('/api/crm/vital/store-summary',{signal:controller.signal})
   .then(data=>{if(active)setStore(data);})
   .catch(()=>{if(active){setStore(null);setStoreError('Não foi possível carregar as vendas da Nuvemshop.');}});
  return()=>{active=false;controller.abort();};
 },[revision,reload]);
 const report=manual||connectedReport(insights,store);
 const priorities=marketingPriorities(insights,store);
 const resetAi=()=>{aiRequest.current+=1;setAiBusy(false);setAi(null);setAiError('');};
 function showForm(){setFormVisible(true);setFormError('');resetAi();}
 function showExample(){setManual({kind:'manual',period:'7',values:{...EXAMPLE_REPORT},example:true});setFormVisible(false);resetAi();}
 function showConnections(){setManual(null);setFormVisible(false);resetAi();}
 function submit(event){
  event.preventDefault();const parsed=parseManualReport(fields);
  if(parsed.error){setFormError(parsed.error);return;}
  setManual({kind:'manual',period,values:parsed.values,example:false});setFormVisible(false);setFormError('');resetAi();
 }
 async function askAi(){
  if(!report||aiBusy)return;
  const requestId=++aiRequest.current;
  setAiBusy(true);setAiError('');setAi(null);
  const input=report.kind==='manual'?{kind:'manual',period:report.period,metrics:report.values,example:report.example}:
   {kind:'connected',ga4:report.ga4?{sessions:report.ga4.sessions,purchases:report.ga4.purchases,
    purchaseRevenue:report.ga4.purchaseRevenue,currency:report.ga4.currency,events:report.ga4.events?.slice(0,4),products:report.ga4.products?.slice(0,5)}:null,
    meta:report.meta?{spend:report.meta.spend,linkClicks:report.meta.linkClicks,impressions:report.meta.impressions,
     currency:report.meta.currency,campaigns:report.meta.campaigns?.slice(0,5),range:report.meta.start&&report.meta.end?`${report.meta.start}/${report.meta.end}`:null}:null,
    store:report.store?{orders:report.store.paidOrders,revenue:report.store.revenue,
      start:report.store.start,end:report.store.end,topProducts:report.store.topProducts?.slice(0,5)}:null,
    clarity:report.clarity?{sessions:report.clarity.sessions,botSessions:report.clarity.botSessions,friction:report.clarity.friction?.slice(0,5)}:null};
  try{const response=await api('/api/crm/vital/marketing-report',{method:'POST',body:JSON.stringify(input)});if(requestId===aiRequest.current)setAi(response.report);}
  catch(e){if(requestId===aiRequest.current)setAiError(e.message||'Não foi possível gerar a análise agora.');}
  finally{if(requestId===aiRequest.current)setAiBusy(false);}
 }
 function downloadReport(){
  if(!report)return;
  const csv=marketingCsv(insights,store,priorities,ai,report.kind==='manual'?report:null);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=report.example?'tide-marketing-exemplo.csv':'tide-marketing-vital.csv';
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const diagnosis=report?.kind==='manual'?manualDiagnosis(report.values):report;
 return <section className={css.dashboard} aria-label="Resultados de marketing da Vital Decor">
  <header className={css.hero}>
   <div className={css.heroCopy}><span className={css.kicker}>MARKETING SEM COMPLICAÇÃO</span>
    <h3>Entenda seus resultados</h3><p>Veja o que aconteceu e descubra por onde começar.</p>
    <ConnectionPill insights={insights} store={store} loading={loading} error={error}/>
   </div><div className={css.heroArt} aria-hidden="true"><svg viewBox="0 0 90 65" fill="none"><path d="M12 50L35 32L49 41L76 14"/><path d="M61 14H76V29"/></svg></div>
  </header>

  <div className={css.toolbar}>
   <button type="button" className={css.primaryButton} onClick={showForm}>＋ &nbsp; Criar meu resumo</button>
   <button type="button" className={css.secondaryButton} onClick={showExample}>Ver exemplo</button>
   <button type="button" className={css.secondaryButton} disabled={!report} onClick={downloadReport}>Baixar relatório CSV</button>
   <button type="button" className={css.secondaryButton} disabled={!report} onClick={()=>window.print()}>Imprimir / salvar PDF</button>
   {manual&&<button type="button" className={css.textButton} onClick={showConnections}>Voltar para dados conectados</button>}
  </div>

  <VitalMarketingWorkbench insights={insights} store={store} revision={revision+reload}
   onAskAi={askAi} ai={ai} aiBusy={aiBusy} aiError={aiError} report={report}/>

  {formVisible&&<form onSubmit={submit} className={css.formCard}>
   <div className={css.sectionHeading}><div><span className={css.sectionEyebrow}>SEUS NÚMEROS</span><h4>Vamos montar seu resumo</h4>
    <p>Preencha o que souber. Use o mesmo período para todos os números.</p></div>
    <button type="button" className={css.closeButton} aria-label="Fechar formulário" onClick={()=>setFormVisible(false)}>×</button></div>
   <label className={css.field}><span>Período</span><select value={period} onChange={e=>setPeriod(e.target.value)}>
    <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></label>
   <div className={css.formGrid}>
    <label className={css.field}><span>Visitas ao site</span><input inputMode="numeric" placeholder="Ex.: 1200" value={fields.visits} onChange={e=>setFields({...fields,visits:e.target.value})}/><small>No Google Analytics</small></label>
    <label className={css.field}><span>Pedidos pagos</span><input inputMode="numeric" placeholder="Ex.: 5" value={fields.orders} onChange={e=>setFields({...fields,orders:e.target.value})}/><small>Na Nuvemshop</small></label>
    <label className={css.field}><span>Gasto com anúncios (R$)</span><input inputMode="decimal" placeholder="Ex.: 400,00" value={fields.spend} onChange={e=>setFields({...fields,spend:e.target.value})}/><small>Na conta de anúncios</small></label>
    <label className={css.field}><span>Faturamento dos pedidos pagos (R$)</span><input inputMode="decimal" placeholder="Ex.: 1200,00" value={fields.revenue} onChange={e=>setFields({...fields,revenue:e.target.value})}/><small>Receita, antes dos custos</small></label>
   </div>
   {formError&&<p role="alert" className={css.formError}>{formError}</p>}
   <div className={css.formActions}><button className={css.primaryButton} type="submit">Gerar resumo</button><span>Os números ficam nesta tela até você sair.</span></div>
  </form>}

  {!report&&!formVisible&&<div className={css.emptyCard}>
   <div className={css.emptyIcon} aria-hidden="true">✦</div>
   <div><span className={css.sectionEyebrow}>COMECE POR AQUI</span><h4>Seu painel está esperando os primeiros números</h4>
    <p>Você não precisa conectar nada agora. Crie um resumo com os dados que tiver ou explore um exemplo.</p></div>
  </div>}

  {report&&!formVisible&&<div className={css.report} aria-live="polite">
   {report.example&&<div className={css.exampleBanner}><strong>Exemplo com dados fictícios.</strong> Estes números não são da Vital Decor.</div>}
   <div className={css.reportHeading}><div><span className={css.sectionEyebrow}>O QUE ACONTECEU</span><h4>Seu resumo</h4></div>
    <span className={css.periodBadge}>{report.kind==='manual'?`Últimos ${report.period} dias · ${report.example?'exemplo':'informado por você'}`:'Dados das fontes conectadas'}</span></div>
   {report.kind==='manual'?<div className={css.metrics}>
    <Metric icon="◉" label="Visitas ao site" value={number(report.values.visits)} source="Visitas informadas"/>
    <Metric icon="✓" label="Pedidos pagos" value={number(report.values.orders)} source="Pedidos informados"/>
    <Metric icon="$" label="Gasto com anúncios" value={money(report.values.spend)} source="Investimento informado"/>
    <Metric icon="R$" label="Faturamento" value={money(report.values.revenue)} source="Pedidos pagos informados"/>
   </div>:<>
    {report.store&&<><p className={css.sourceLabel}>NUVEMSHOP · {report.store.start} A {report.store.end}</p>
     <div className={css.metrics}>
      <Metric icon="✓" label="Pedidos pagos" value={number(report.store.paidOrders)} source="Nuvemshop · pedidos criados no período"/>
      <Metric icon="R$" label="Valor dos pedidos pagos" value={money(report.store.revenue,'BRL')} source="Soma dos pedidos, não é lucro"/>
      <Metric icon="◉" label="Ticket médio" value={money(report.store.averageTicket,'BRL')} source="Pedidos pagos"/>
     </div>
     {report.store.topProducts?.length>0&&<div className={css.actionsCard}>
      <span className={css.sectionEyebrow}>PRODUTOS MAIS VENDIDOS · EM UNIDADES</span>
      <ol>{report.store.topProducts.map((p,i)=><li key={i}><span>{i+1}</span><p>{p.name} · {number(p.quantity)} unidades</p></li>)}</ol>
     </div>}
    </>}
    {report.clarity&&<><p className={css.sourceLabel}>MICROSOFT CLARITY · ÚLTIMAS 72 HORAS</p>
     <div className={css.metrics}>
      <Metric icon="◉" label="Sessões registradas" value={number(report.clarity.sessions)} source="Clarity, não são compradores"/>
      <Metric icon="◌" label="Sessões de bots" value={number(report.clarity.botSessions)} source="Identificadas pelo Clarity"/>
     </div>
    </>}
    {report.ga4&&<><p className={css.sourceLabel}>GOOGLE ANALYTICS · ÚLTIMOS 30 DIAS COMPLETOS</p><div className={css.metrics}>
     <Metric icon="◉" label="Visitas ao site" value={number(report.ga4.sessions)} source="Sessões no GA4"/>
     <Metric icon="✓" label="Compras registradas" value={number(report.ga4.purchases)} source="Eventos registrados no GA4"/>
     <Metric icon="R$" label="Receita de compras" value={money(report.ga4.purchaseRevenue,report.ga4.currency)} source="GA4 · conferir na loja"/>
    </div></>}
    {report.meta&&<><p className={css.sourceLabel}>META ADS · {report.meta.start&&report.meta.end?`${report.meta.start.split('-').reverse().join('/')} A ${report.meta.end.split('-').reverse().join('/')}`:'ÚLTIMOS 30 DIAS CONFORME META'}</p><div className={css.metrics}>
     <Metric icon="$" label="Gasto com anúncios" value={money(report.meta.spend,report.meta.currency)} source="Meta Ads"/>
     <Metric icon="+" label="Cliques nos links" value={number(report.meta.linkClicks)} source="Não são visitas confirmadas"/>
     <Metric icon="◉" label="Impressões" value={number(report.meta.impressions)} source="Vezes que anúncios apareceram"/>
    </div></>}
   </>}
   <p className={css.metricNote}>O traço (—) significa que o número não foi informado ou não está disponível.</p>
   <div className={css.diagnosis}>
    <div className={css.diagnosisIcon} aria-hidden="true">✦</div><div>
     <span className={css.sectionEyebrow}>O QUE MERECE ATENÇÃO</span><h4>{diagnosis.headline}</h4><p>{diagnosis.summary}</p>
    </div>
   </div>
   <div className={css.actionsCard}><span className={css.sectionEyebrow}>O QUE FAZER AGORA</span><h4>Próximos passos</h4>
    <ol>{diagnosis.actions.map((action,index)=><li key={action}><span>{String(index+1).padStart(2,'0')}</span><p>{action}</p></li>)}</ol>
    <p className={css.metricNote}>Essas orientações são automáticas e não alteram suas campanhas.</p>
   </div>
  </div>}

  {store?.status!=='ready'&&<p className={css.metricNote} role="status">
   {storeError||((store?.status==='incomplete')?'A Nuvemshop retornou mais pedidos do que o limite de consulta. Totais não exibidos para evitar números incompletos.':
    store?.status==='not_configured'?'A consulta à Nuvemshop ainda não está configurada.':
    store?.status==='unavailable'?({auth_invalid:'A credencial da Nuvemshop não foi aceita pela API. Verifique o token da loja na Vercel.',orders_permission:'A integração precisa de permissão para consultar pedidos na Nuvemshop.',store_not_found:'O identificador da loja não foi encontrado. Confira a configuração da loja na Vercel.',rate_limited:'A Nuvemshop limitou temporariamente as consultas. Tente atualizar depois.',response_format:'A Nuvemshop retornou um formato inesperado.',network_error:'Não foi possível estabelecer conexão com a Nuvemshop.',api_error:'A Nuvemshop respondeu com um erro. Consulte o diagnóstico da integração.'}[store?.issue]||'A consulta de vendas da Nuvemshop está temporariamente indisponível.'):'')}
  </p>}
  <details className={css.connections}><summary><span><strong>Conexões e detalhes</strong><small>Nuvemshop, Clarity, Meta Ads, Analytics e GTM</small></span><span aria-hidden="true">⌄</span></summary>
   <VitalInsightsSourceDetails insights={insights} loading={loading} error={error} onReload={()=>setReload(v=>v+1)}/>
  </details>
  {report&&<div className={css.printDoc} aria-hidden="true">
   <h1>Relatório de marketing · Vital Decor</h1>
   <p>{report.kind==='manual'?`Últimos ${report.period} dias · ${report.example?'exemplo fictício':'dados informados manualmente'}`:'Fontes conectadas · períodos indicados em cada fonte'}</p>
   {report.kind==='manual'?<ul><li>Visitas: {number(report.values.visits)}</li><li>Pedidos: {number(report.values.orders)}</li>
    <li>Gasto: {money(report.values.spend)}</li><li>Faturamento informado: {money(report.values.revenue)}</li></ul>:<>
    {report.store&&<p>Nuvemshop · {report.store.start} a {report.store.end}: {number(report.store.paidOrders)} pedidos pagos · {money(report.store.revenue)} em pedidos.</p>}
    {report.ga4&&<p>GA4 · últimos 30 dias completos: {number(report.ga4.sessions)} sessões · {number(report.ga4.purchases)} compras registradas.</p>}
    {report.meta&&<p>Meta Ads · {report.meta.period}: {money(report.meta.spend,report.meta.currency)} investidos · {number(report.meta.linkClicks)} cliques · {number(report.meta.impressions)} impressões.</p>}
    {report.clarity&&<p>Clarity · últimas 72 horas: {number(report.clarity.sessions)} sessões.</p>}
    {report.meta?.campaigns?.length>0&&<><h2>Campanhas</h2><ul>{report.meta.campaigns.map((c,i)=><li key={i}>{c.name} · {money(c.spend,report.meta.currency)} · {number(c.linkClicks)} cliques</li>)}</ul></>}
    {report.store?.topProducts?.length>0&&<><h2>Produtos mais vendidos</h2><ul>{report.store.topProducts.map((p,i)=><li key={i}>{p.name} · {number(p.quantity)} unidades</li>)}</ul></>}
    {report.ga4?.landingPages?.length>0&&<><h2>Páginas de entrada · GA4</h2><ul>{report.ga4.landingPages.slice(0,5).map((p,i)=><li key={i}>{p.path} · {number(p.sessions)} sessões</li>)}</ul></>}
    {report.ga4?.products?.length>0&&<><h2>Interesse por produto · GA4</h2><ul>{report.ga4.products.slice(0,5).map((p,i)=><li key={i}>{p.name} · {number(p.views)} unidades visualizadas · {number(p.cart)} no carrinho</li>)}</ul></>}
    {report.clarity?.friction?.some(x=>x.percentage!==null)&&<><h2>Sinais de interação · Clarity</h2><ul>{report.clarity.friction.filter(x=>x.percentage!==null).map(x=><li key={x.key}>{x.label} · {number(x.percentage)}% das {number(x.sessions)} sessões consideradas</li>)}</ul></>}
    <h2>O que investigar</h2>{priorities.map(p=><div key={p.kind}><h3>{p.title}</h3><p>{p.evidence} {p.action}</p><small>{p.note}</small></div>)}
   </>}
   {ai&&<><h2>Análise com IA</h2><p>{ai.summary}</p><p>{ai.attention}</p><ul>{ai.actions.map((x,i)=><li key={i}>{x}</li>)}</ul><small>{ai.limit}</small></>}
   <p>Os períodos e critérios de atribuição das fontes podem ser diferentes. Pedidos gerais não são atribuídos automaticamente aos anúncios.</p>
  </div>}
 </section>;
}
