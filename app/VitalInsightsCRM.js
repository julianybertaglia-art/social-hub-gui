'use client';
import {useEffect,useState} from 'react';
import {api} from './operations/useOperations';
import css from './vital-insights-crm.module.css';

const n=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-BR').format(v):'—';
const eventLabels={view_item:'Visualizações de produto',add_to_cart:'Adições ao carrinho',
 begin_checkout:'Inícios de checkout',purchase:'Eventos de compra'};
function money(v,currency){
 if(typeof v!=='number'||!Number.isFinite(v)||!currency)return '—';
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(v);}catch{return '—';}
}
function day(value){if(!value)return null;const parts=value.split('-');return parts.length===3?parts.reverse().join('/'):null;}
function Tile({label,value,help}){return <article className={css.tile}><span>{label}</span><strong>{value}</strong><small>{help}</small></article>;}
function State({source,name,period}){
 const status=source?.status;
 return <div className={css.source}><strong>{name}</strong>
  <span>{status==='ready'?(period||'Conectado para leitura'):
     status==='not_configured'?'Aguardando conexão de leitura':'Não foi possível consultar agora'}</span></div>;
}
function NoConnection({source,children}){
 if(source?.status==='ready')return null;
 return <p className={css.message}>{source?.status==='not_configured'?children:'Não foi possível consultar essa fonte. Verifique o acesso e tente novamente.'}</p>;
}
export default function VitalInsightsCRM({revision=0}){
 const [insights,setInsights]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;const controller=new AbortController();setLoading(true);setError('');
  api('/api/crm/vital/insights',{signal:controller.signal})
   .then(data=>{if(active)setInsights(data);})
   .catch(e=>{if(active)setError(e.message||'Métricas indisponíveis.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[revision]);
 const ga=insights?.ga4,cl=insights?.clarity,meta=insights?.meta,gtm=insights?.gtm;
 return <section className={css.insights} aria-label="Marketing e anúncios da Vital Decor">
  <div className={css.head}>
   <div><span className={css.eyebrow}>VISÃO DE MARKETING</span>
    <h3>Campanhas e resultados da loja</h3>
    <p>Acompanhe anúncios, visitas e experiência em um só lugar.</p></div>
  </div>
  {loading&&<p role="status" className={css.message}>Carregando indicadores…</p>}
  {!loading&&error&&<p role="alert" className={css.message}>{error}</p>}
  {!loading&&!error&&<>
   <State name="Meta Ads · Campanhas" source={meta} period={meta?.data?.start&&meta?.data?.end?`${day(meta.data.start)} a ${day(meta.data.end)}`:meta?.data?.period}/>
   {meta?.status==='ready'&&<>
    <div className={css.tiles}>
     <Tile label="Investimento" value={money(meta.data.spend,meta.data.currency)} help="Total da conta de anúncios no período"/>
     <Tile label="Impressões" value={n(meta.data.impressions)} help="Vezes que os anúncios apareceram"/>
     <Tile label="Cliques no link" value={n(meta.data.linkClicks)} help="Conforme Meta Ads; não são visitas confirmadas"/>
    </div>
    {meta.data.campaigns===null?<p className={css.message}>O detalhamento por campanha está indisponível no momento.</p>:
     meta.data.campaigns.length?<div className={css.tableWrap}><table className={css.table}>
      <caption>Campanhas com atividade no período{meta.data.campaignsMore?' · primeiras 25':''}</caption>
      <thead><tr><th>Campanha</th><th>Investimento</th><th>Cliques no link</th><th>Impressões</th></tr></thead>
      <tbody>{meta.data.campaigns.map((c,i)=><tr key={`${c.id||'campaign'}-${i}`}><td>{c.name}</td><td>{money(c.spend,meta.data.currency)}</td><td>{n(c.linkClicks)}</td><td>{n(c.impressions)}</td></tr>)}</tbody>
     </table></div>:<p className={css.message}>A Meta não retornou campanhas para este período.</p>}
   </>}
   <NoConnection source={meta}>A leitura da Meta mostrará investimento, impressões e cliques por campanha depois de autorizada.</NoConnection>

   <State name="Google Analytics 4 · Loja" source={ga} period={ga?.data?.period}/>
   {ga?.status==='ready'&&<>
    <div className={css.tiles}>
     <Tile label="Sessões" value={n(ga.data.sessions)} help="Visitas registradas no site"/>
     <Tile label="Usuários" value={n(ga.data.users)} help="Usuários medidos pelo GA4"/>
     <Tile label="Visualizações de páginas" value={n(ga.data.pageViews)} help="Navegação no site"/>
     <Tile label="Compras registradas" value={n(ga.data.purchases)} help="Eventos de compra captados pelo GA4"/>
     <Tile label="Receita de compras" value={money(ga.data.purchaseRevenue,ga.data.currency)} help="GA4 · não substitui os pedidos da loja"/>
    </div>
    <h4 className={css.subhead}>Etapas registradas no site</h4>
    {ga.data.events===null?<p className={css.message}>Não foi possível consultar os eventos de compra agora.</p>:
     <>
      <div className={css.tiles}>{ga.data.events?.map(item=><Tile key={item.event}
       label={eventLabels[item.event]||item.event} value={n(item.count)}
       help={item.count===null?'Evento não retornado pelo GA4':'Número de registros do evento'}/>)}</div>
      <p className={css.foot}>São quantidades de eventos, que podem se repetir para uma pessoa. Um traço indica que o evento não foi retornado; verifique a configuração antes de concluir que não ocorreu.</p>
     </>}
    {ga.data.sources===null?<p className={css.message}>O detalhamento de origem está indisponível no momento.</p>:
     ga.data.sources?.length?<div className={css.tableWrap}><table className={css.table}>
      <caption>Origens e campanhas das visitas · até 10 resultados</caption>
      <thead><tr><th>Origem / mídia</th><th>Campanha informada</th><th>Sessões</th></tr></thead>
      <tbody>{ga.data.sources.map((s,i)=><tr key={`${s.source}-${s.campaign}-${i}`}><td>{s.source}</td><td>{s.campaign}</td><td>{n(s.sessions)}</td></tr>)}</tbody>
     </table></div>:<p className={css.message}>O GA4 não retornou origens para este período.</p>}
   </>}
   <NoConnection source={ga}>O GA4 mostrará visitas, origens e compras registradas após a conta de leitura receber acesso à propriedade.</NoConnection>

   <State name="Microsoft Clarity · Experiência" source={cl} period={cl?.data?.period}/>
   {cl?.status==='ready'&&<div className={css.tiles}>
    <Tile label="Sessões registradas" value={n(cl.data.sessions)} help="Clarity · últimas 72 horas"/>
    <Tile label="Sessões identificadas como bots" value={n(cl.data.botSessions)} help="Não confundir com compradores"/>
    {cl.data.devices?.slice(0,3).map(x=><Tile key={x.device} label={'Dispositivo: '+x.device} value={n(x.sessions)} help="Sessões por dispositivo"/>)}
   </div>}
   <NoConnection source={cl}>O Clarity mostrará dados de sessões e dispositivos após a exportação ser ativada. Os mapas de calor e gravações permanecem no Clarity.</NoConnection>

   <State name="Google Tag Manager · Configuração" source={gtm}/>
   {gtm?.status==='ready'?<p className={css.message}>Contêiner {gtm.data.publicId||'identificado no GTM'} · versão publicada {gtm.data.version}. Uma versão publicada não confirma se uma tag disparou corretamente no site.</p>:
    <NoConnection source={gtm}>A conexão poderá consultar qual versão do contêiner está publicada. A criação, alteração e publicação de tags continuam no GTM.</NoConnection>}

   <div className={css.guide}>
    <strong>Como usar esses dados</strong>
    <p>Compare o investimento e os cliques da Meta com as sessões por origem do GA4. Se houver interesse e poucas compras, examine as páginas e o checkout no Clarity e confira os pedidos da Nuvemshop.</p>
    <p>Os períodos e modelos de atribuição podem ser diferentes. Para calcular CAC ou ROAS por campanha, primeiro é preciso validar os eventos e como cada venda foi atribuída; o painel não faz essa associação automaticamente.</p>
   </div>
  </>}
  <div className={css.links}>
   <a href="https://business.facebook.com/adsmanager/manage/campaigns" target="_blank" rel="noopener noreferrer">Abrir Meta Ads</a>
   <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Abrir GA4</a>
   <a href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer">Abrir Clarity</a>
   <a href="https://tagmanager.google.com/" target="_blank" rel="noopener noreferrer">Abrir GTM</a>
  </div>
  <p className={css.foot}>Os relatórios agregados não identificam automaticamente os contatos do WhatsApp nem são associados a fichas de clientes.</p>
 </section>;
}
