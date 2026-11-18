'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from './operations/useOperations';
import {parseManualReport,manualDiagnosis,EXAMPLE_REPORT} from './lib/vital-marketing-report.mjs';
import VitalInsightsSourceDetails from './VitalInsightsSourceDetails';
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

function connectedReport(insights){
 const ga=insights?.ga4?.status==='ready'?insights.ga4.data:null;
 const meta=insights?.meta?.status==='ready'?insights.meta.data:null;
 if(!ga&&!meta)return null;
 if(![ga?.sessions,ga?.purchases,ga?.purchaseRevenue,meta?.spend,meta?.linkClicks,meta?.impressions].some(isNumber))return null;
 const actions=[];
 let headline='Seus números já estão chegando';
 let summary='Veja os dados de cada fonte e confira os períodos antes de compará-los.';
 if(isNumber(ga?.sessions)&&isNumber(ga?.purchases)){
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
 return {kind:'connected',ga4:ga,meta,headline,summary,actions:actions.slice(0,3)};
}

function ConnectionPill({insights,loading,error}){
 const sources=[insights?.meta,insights?.ga4,insights?.clarity,insights?.gtm];
 const ready=sources.filter(source=>source?.status==='ready').length;
 return <span className={css.connectionPill}><span aria-hidden="true" className={ready?css.dotReady:css.dotPending}/>
  {loading?'Verificando conexões':error?'Conexões indisponíveis':ready?`${ready} ${ready===1?'fonte conectada':'fontes conectadas'}`:'Sem conexões ativas'}
 </span>;
}

export default function VitalInsightsCRM({revision=0}){
 const [insights,setInsights]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [reload,setReload]=useState(0),[formVisible,setFormVisible]=useState(false);
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
 const report=manual||connectedReport(insights);
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
    purchaseRevenue:report.ga4.purchaseRevenue,currency:report.ga4.currency}:null,
    meta:report.meta?{spend:report.meta.spend,linkClicks:report.meta.linkClicks,impressions:report.meta.impressions,
     currency:report.meta.currency,range:report.meta.start&&report.meta.end?`${report.meta.start}/${report.meta.end}`:null}:null};
  try{const response=await api('/api/crm/vital/marketing-report',{method:'POST',body:JSON.stringify(input)});if(requestId===aiRequest.current)setAi(response.report);}
  catch(e){if(requestId===aiRequest.current)setAiError(e.message||'Não foi possível gerar a análise agora.');}
  finally{if(requestId===aiRequest.current)setAiBusy(false);}
 }
 const diagnosis=report?.kind==='manual'?manualDiagnosis(report.values):report;
 return <section className={css.dashboard} aria-label="Resultados de marketing da Vital Decor">
  <header className={css.hero}>
   <div className={css.heroCopy}><span className={css.kicker}>MARKETING SEM COMPLICAÇÃO</span>
    <h3>Entenda seus resultados</h3><p>Veja o que aconteceu e descubra por onde começar.</p>
    <ConnectionPill insights={insights} loading={loading} error={error}/>
   </div><div className={css.heroArt} aria-hidden="true"><svg viewBox="0 0 90 65" fill="none"><path d="M12 50L35 32L49 41L76 14"/><path d="M61 14H76V29"/></svg></div>
  </header>

  <div className={css.toolbar}>
   <button type="button" className={css.primaryButton} onClick={showForm}>＋ &nbsp; Criar meu resumo</button>
   <button type="button" className={css.secondaryButton} onClick={showExample}>Ver exemplo</button>
   {manual&&<button type="button" className={css.textButton} onClick={showConnections}>Voltar para dados conectados</button>}
  </div>

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
   <div className={css.aiCard}>
    <div className={css.aiTitle}><span className={css.aiIcon} aria-hidden="true">✦</span><div><span className={css.sectionEyebrow}>UMA LEITURA A MAIS</span><h4>Quer uma análise com IA?</h4></div></div>
    <p>Peça um diagnóstico em linguagem simples e sugestões para investigar seus resultados.</p>
    <button type="button" className={css.primaryButton} disabled={aiBusy} onClick={askAi}>{aiBusy?'Analisando…':report.example?'Analisar exemplo com IA':'Gerar análise com IA'}</button>
    <small>Ao pedir a análise, os números acima e o período, incluindo gastos e faturamento, são enviados ao Google Gemini e, se necessário, à OpenAI pela Vercel. Não enviamos dados de clientes.</small>
    {aiError&&<p className={css.formError} role="alert">{aiError}</p>}
    {ai&&<div className={css.aiResult}><span className={css.sectionEyebrow}>ANÁLISE DA IA</span>
     <h5>O que os dados mostram</h5><p>{ai.summary}</p>
     {ai.attention&&<><h5>Vale investigar</h5><p>{ai.attention}</p></>}
     <h5>O que fazer</h5><ul>{ai.actions.map((action,index)=><li key={index}>{action}</li>)}</ul>
     {ai.limit&&<p className={css.aiLimit}>{ai.limit}</p>}
     {ai.provider&&<p className={css.aiLimit}>Análise gerada por {ai.provider}.</p>}
     <p className={css.aiLimit}>Sugestões de IA podem conter erros. Confira os dados antes de tomar decisões.</p>
    </div>}
   </div>
  </div>}

  <details className={css.connections}><summary><span><strong>Conexões e detalhes</strong><small>Meta Ads, Analytics, Clarity e GTM</small></span><span aria-hidden="true">⌄</span></summary>
   <VitalInsightsSourceDetails insights={insights} loading={loading} error={error} onReload={()=>setReload(v=>v+1)}/>
  </details>
 </section>;
}
