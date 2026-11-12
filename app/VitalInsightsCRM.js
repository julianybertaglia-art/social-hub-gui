'use client';
import {useEffect,useState} from 'react';
import {api} from './operations/useOperations';
import css from './vital-insights-crm.module.css';

const n=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-BR').format(v):'—';
const money=v=>typeof v==='number'&&Number.isFinite(v)?
 new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v):'—';
function Tile({label,value,help}){return <article className={css.tile}><span>{label}</span><strong>{value}</strong><small>{help}</small></article>;}
function State({source,name,period}){
 return <div className={css.source}><strong>{name}</strong>
  <span>{source?.status==='ready'?period:
     source?.status==='not_configured'?'Aguardando conexão de leitura':
     'Não foi possível consultar agora'}</span></div>;
}
export default function VitalInsightsCRM(){
 const [insights,setInsights]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  api('/api/crm/vital/insights',{signal:controller.signal})
   .then(data=>{if(active)setInsights(data);})
   .catch(e=>{if(active)setError(e.message||'Métricas indisponíveis.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[]);
 const ga=insights?.ga4,cl=insights?.clarity;
 return <section className={css.insights} aria-label="Tráfego e experiência da loja">
  <div className={css.head}>
   <div><span className={css.eyebrow}>VISÃO DE MARKETING</span>
    <h3>Tráfego e comportamento</h3>
    <p>Indicadores de leitura para compreender a loja — sem alterar pedidos, conversas ou automações.</p></div>
  </div>
  {loading&&<p role="status" className={css.message}>Carregando indicadores…</p>}
  {!loading&&error&&<p role="alert" className={css.message}>{error}</p>}
  {!loading&&!error&&<>
   <State name="Google Analytics 4" source={ga} period={ga?.data?.period}/>
   {ga?.status==='ready'&&<div className={css.tiles}>
    <Tile label="Sessões" value={n(ga.data.sessions)} help="Tráfego ao site"/>
    <Tile label="Usuários" value={n(ga.data.users)} help="Pessoas medidas pelo GA4"/>
    <Tile label="Visualizações de páginas" value={n(ga.data.pageViews)} help="Navegação no site"/>
    <Tile label="Compras registradas" value={n(ga.data.purchases)} help="Eventos ecommerce_purchase"/>
    <Tile label="Receita atribuída a compras" value={money(ga.data.purchaseRevenue)} help="Dados do GA4, não substituem pedidos da loja"/>
   </div>}
   {ga?.status!=='ready'&&<p className={css.message}>O GA4 poderá mostrar sessões, usuários, páginas e compras quando a conta de serviço for autorizada na propriedade.</p>}
   <State name="Microsoft Clarity" source={cl} period={cl?.data?.period}/>
   {cl?.status==='ready'&&<div className={css.tiles}>
    <Tile label="Sessões registradas" value={n(cl.data.sessions)} help="Clarity · últimas 72 horas"/>
    <Tile label="Sessões identificadas como bots" value={n(cl.data.botSessions)} help="Não confundir com compradores"/>
    {cl.data.devices?.slice(0,3).map(x=><Tile key={x.device} label={'Dispositivo: '+x.device} value={n(x.sessions)} help="Sessões por dispositivo"/>)}
   </div>}
   {cl?.status!=='ready'&&<p className={css.message}>O Clarity poderá mostrar sessões e dispositivos quando a exportação segura for ativada. A API é limitada a 10 consultas por dia.</p>}
  </>}
  <div className={css.links}>
   <a href="https://analytics.google.com/analytics/web/#/p563675653/reports/intelligenthome" target="_blank" rel="noopener noreferrer">Abrir GA4</a>
   <a href="https://clarity.microsoft.com/projects/view/zbz6wxna0q" target="_blank" rel="noopener noreferrer">Abrir Clarity</a>
  </div>
  <p className={css.foot}>Relatórios de comportamento não identificam individualmente contatos do WhatsApp. Dados agregados não são unidos a fichas de clientes sem consentimento e uma integração de identidade apropriada.</p>
 </section>;
}
