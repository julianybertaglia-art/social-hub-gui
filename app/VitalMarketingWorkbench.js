'use client';
import {useEffect,useMemo,useState} from 'react';
import {api} from './operations/useOperations';
import {campaignRatios,draftForProduct,marketingPriorities} from './lib/vital-marketing-strategy.mjs';
import css from './vital-marketing-workbench.module.css';

const n=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value):'—';
const money=(value,currency='BRL')=>typeof value==='number'&&Number.isFinite(value)&&currency?new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value):'—';
const percent=value=>typeof value==='number'&&Number.isFinite(value)?`${n(value)}%`:'—';
const queueNames={varejo_nv:'Varejo',atacado:'Atacado',vtx:'VTX Fitness',bluetti:'Bluetti'};
const stamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'Sem data';};

export default function VitalMarketingWorkbench({insights,store,revision=0,onAskAi,ai,aiBusy,aiError,report}){
 const [contacts,setContacts]=useState(null),[contactsStatus,setContactsStatus]=useState('loading');
 const [product,setProduct]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState('');
 const [draftNotice,setDraftNotice]=useState('');
 const [done,setDone]=useState({});
 const priorities=useMemo(()=>marketingPriorities(insights,store),[insights,store]);
 const ga=insights?.ga4?.status==='ready'?insights.ga4.data:null;
 const meta=insights?.meta?.status==='ready'?insights.meta.data:null;
 const clarity=insights?.clarity?.status==='ready'?insights.clarity.data:null;
 const products=store?.status==='ready'?store.data?.topProducts||[]:[];
 useEffect(()=>{try{const saved=JSON.parse(window.localStorage.getItem('tideplace:vital:marketing-actions')||'{}');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved))setDone(saved);}catch{}},[]);
 useEffect(()=>{let active=true;const controller=new AbortController();setContactsStatus('loading');
  api('/api/crm/vital/live?page=0',{signal:controller.signal}).then(data=>{if(active){setContacts(data);setContactsStatus('ready');}})
   .catch(()=>{if(active){setContacts(null);setContactsStatus('unavailable');}});
  return()=>{active=false;controller.abort();};
 },[revision]);
 const candidates=(contacts?.conversations||[]).filter(c=>Object.hasOwn(queueNames,c.queue)&&c.status!=='closed')
  .sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)).slice(0,5);
 const openConversation=contact=>{
  if(!/^\d{8,15}$/.test(String(contact.id||'')))return;
  try{window.sessionStorage.setItem('tideplace:marketing:contact',contact.id);}catch{}
  window.location.assign('/crm/vital');
 };
 const useTemplate=()=>{const draft=draftForProduct(product);setSubject(draft.subject);setBody(draft.body);setDraftNotice('Sugestão criada. Edite antes de abrir no seu e-mail.');};
 const mark=(item)=>{const key=`${item.kind}:${item.evidence}`;const next={...done};
  if(next[key])delete next[key];else next[key]=true;
  const bounded=Object.fromEntries(Object.entries(next).slice(-50));setDone(bounded);
  try{window.localStorage.setItem('tideplace:vital:marketing-actions',JSON.stringify(bounded));}catch{}
 };
 const mailto=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 const gmail=`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 return <div className={css.workspace}>
  <div className={css.heading}><div><span>INTELIGÊNCIA DE MARKETING</span><h3>Onde agir agora</h3>
   <p>Prioridades a partir dos dados disponíveis. Cada sinal é um convite para investigar.</p></div></div>
  <div className={css.priorities}>{priorities.map((item,index)=><article className={css.priority} key={item.kind}>
   <div className={css.priorityTop}><span className={css.index}>{String(index+1).padStart(2,'0')}</span><span className={css.tag}>{item.label}</span></div>
   <h4>{item.title}</h4><p>{item.evidence}</p><strong>Próxima ação</strong><p>{item.action}</p><small>{item.note}</small>
   <button type="button" className={css.taskButton} onClick={()=>mark(item)}>{done[`${item.kind}:${item.evidence}`]?'✓ Concluída · desfazer':'Marcar como concluída'}</button>
  </article>)}</div>
  <p className={css.taskNote}>O andamento das ações fica salvo neste navegador.</p>
  <section className={css.aiPanel} aria-label="Diagnóstico com inteligência artificial">
   <div><span className={css.aiEyebrow}>ESTRATÉGIA COM IA</span><h3>Peça uma análise mais profunda</h3>
    <p>A IA compara os indicadores disponíveis e sugere ações para o site, campanhas e produtos. {report?.example?'O resumo selecionado é um exemplo fictício.':''}</p>
    <small>Ao analisar, métricas agregadas e nomes de até cinco produtos e campanhas vão ao Google Gemini. Dados de contatos não são enviados.</small>
   </div>
   <button className={css.aiButton} type="button" disabled={!report||aiBusy} onClick={onAskAi}>{aiBusy?'Analisando…':report?.example?'Analisar exemplo':'Gerar diagnóstico com IA'}</button>
   {aiError&&<p className={css.aiError} role="alert">{aiError}</p>}
   {ai&&<div className={css.aiResult} aria-live="polite"><h4>O que os dados mostram</h4><p>{ai.summary}</p>
    {ai.attention&&<><h4>O que investigar</h4><p>{ai.attention}</p></>}
    <h4>Próximas ações</h4><ol>{ai.actions.map((action,index)=><li key={index}>{action}</li>)}</ol>
    {ai.limit&&<small>{ai.limit}</small>}<small>Revise as sugestões antes de decidir. A IA não altera campanhas.</small>
   </div>}
  </section>

  <div className={css.grid}>
   <section className={css.panel}><div className={css.panelHead}><div><span>ANÚNCIOS</span><h3>Campanhas em detalhe</h3></div></div>
    {meta?.campaigns?.length?<div className={css.tableWrap}><table><thead><tr><th>Campanha</th><th>Gasto</th><th>Cliques</th><th>CPC</th><th>CTR do link</th><th>Compras atribuídas</th><th>Valor atribuído</th></tr></thead><tbody>
     {meta.campaigns.map((c,i)=>{const ratios=campaignRatios(c);return <tr key={`${c.id||'campaign'}-${i}`}><td>{c.name}</td><td>{money(c.spend,meta.currency)}</td><td>{n(c.linkClicks)}</td><td>{money(ratios.cpc,meta.currency)}</td><td>{percent(ratios.ctr)}</td><td>{n(c.purchases)}</td><td>{money(c.purchaseValue,meta.currency)}</td></tr>;})}
    </tbody></table></div>:<p className={css.muted}>{meta?'Nenhuma campanha retornada no período.':'Os dados de campanhas ainda não estão disponíveis.'}</p>}
    {meta&&<p className={css.foot}>A Meta informou {n(meta.landingViews)} visualizações de destino, {n(meta.addToCart)} adições ao carrinho e {n(meta.checkouts)} inícios de checkout atribuídos.</p>}
    <p className={css.foot}>CPC = gasto ÷ cliques no link; CTR = cliques no link ÷ impressões. Compras e valores são atribuídos pela Meta, não lucro nem pedidos pagos confirmados. Esses eventos não acompanham necessariamente as mesmas pessoas.</p>
   </section>
   <section className={css.panel}><div className={css.panelHead}><div><span>SITE · GA4</span><h3>Portas de entrada</h3></div></div>
    {ga?.landingPages?.length?<div className={css.tableWrap}><table><thead><tr><th>Página de entrada</th><th>Sessões</th><th>Engajadas</th></tr></thead><tbody>
     {ga.landingPages.map((p,i)=><tr key={i}><td>{p.path}</td><td>{n(p.sessions)}</td><td>{n(p.engagedSessions)}</td></tr>)}</tbody></table></div>:
     <p className={css.muted}>{ga?'O GA4 não retornou páginas de entrada para este período.':'A leitura de páginas ainda não está disponível.'}</p>}
    {ga?.devices?.length>0&&<p className={css.foot}>Dispositivos: {ga.devices.map(d=>`${d.device}: ${n(d.sessions)}`).join(' · ')} sessões.</p>}
   </section>
   <section className={css.panel}><div className={css.panelHead}><div><span>COMPORTAMENTO · GA4</span><h3>Produtos que despertam interesse</h3></div></div>
    {ga?.products?.length?<div className={css.tableWrap}><table><thead><tr><th>Produto</th><th>Visualizados</th><th>No carrinho</th><th>Comprados</th></tr></thead><tbody>
     {ga.products.map((p,i)=><tr key={i}><td>{p.name}</td><td>{n(p.views)}</td><td>{n(p.cart)}</td><td>{n(p.purchases)}</td></tr>)}</tbody></table></div>:
     <p className={css.muted}>{ga?'Nenhum produto foi retornado nos eventos do GA4.':'Os dados de produtos do GA4 ainda não estão disponíveis.'}</p>}
    <p className={css.foot}>Unidades registradas nos eventos do GA4; não são pessoas nem substituem os pedidos pagos da loja.</p>
   </section>
   <section className={css.panel}><div className={css.panelHead}><div><span>EXPERIÊNCIA · CLARITY</span><h3>Sinais para investigar</h3></div></div>
    {clarity?.friction?.some(x=>x.percentage!==null)?<div className={css.signalList}>
     {clarity.friction.filter(x=>x.percentage!==null).map(x=><div key={x.key}><span>{x.label}</span><strong>{percent(x.percentage)}</strong><small>{n(x.sessions)} sessões na amostra</small></div>)}
    </div>:<p className={css.muted}>{clarity?'Os sinais de interação não foram retornados nesta consulta.':'A leitura do Clarity ainda não está disponível.'}</p>}
    <p className={css.foot}>Percentual de sessões com o sinal nas últimas 72 horas. Consulte as gravações antes de concluir a causa.</p>
   </section>
  </div>

  <div className={css.grid}>
   <section className={css.panel}><div className={css.panelHead}><div><span>RELACIONAMENTO</span><h3>Conversas para acompanhar</h3></div><a href="/crm/vital">Abrir CRM ↗</a></div>
    {contactsStatus==='loading'?<p className={css.muted}>Buscando conversas comerciais…</p>:
     contactsStatus!=='ready'?<p className={css.muted}>As conversas estão disponíveis somente para quem tem acesso ao atendimento da Vital.</p>:
     candidates.length?<div className={css.contacts}>{candidates.map(c=><button type="button" key={c.id} onClick={()=>openConversation(c)}>
      <span><strong>{c.name||'Contato'}</strong><small>{queueNames[c.queue]} · {c.status==='pending'?'Aguardando resposta':'Em andamento'} · {stamp(c.updatedAt)}</small></span><b>Ver conversa ↗</b>
     </button>)}</div>:<p className={css.muted}>Nenhuma conversa comercial aberta na página mais recente do CRM.</p>}
    {contacts?.hasMore&&<p className={css.foot}>Mostrando até cinco contatos da página mais recente. Veja os demais no CRM.</p>}
    <p className={css.foot}>Uma conversa aberta não confirma autorização para receber campanhas de e-mail ou mensagens em massa.</p>
   </section>
   <section className={css.panel}><div className={css.panelHead}><div><span>CONTEÚDO POR E-MAIL</span><h3>Prepare uma campanha</h3></div><span className={css.pending}>Envio não conectado</span></div>
    <p className={css.muted}>Monte um rascunho e abra no aplicativo de e-mail da sua preferência.</p>
    <p className={css.foot}>A loja já tem o Nuvem Marketing instalado. <a href="https://www.nuvemshop.com.br/loja-aplicativos-nuvem/perfit" target="_blank" rel="noopener noreferrer">Ver aplicativo Nuvem Marketing ↗</a> para conferir o remetente e as automações. Ele ainda não está conectado ao Tide.</p>
    <label className={css.field}>Produto para a sugestão<select value={product} onChange={e=>setProduct(e.target.value)}><option value="">Escolha um produto</option>
     {products.map((p,i)=><option key={i} value={p.name}>{p.name}</option>)}</select></label>
    <button type="button" className={css.secondary} onClick={useTemplate}>Criar sugestão de texto</button>
    <label className={css.field}>Assunto<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={150} placeholder="Escreva o assunto"/></label>
    <label className={css.field}>Mensagem<textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={5000} rows={6} placeholder="Escreva ou crie uma sugestão"/></label>
    {draftNotice&&<p className={css.foot} role="status">{draftNotice}</p>}
    {subject.trim()&&body.trim()?<div className={css.emailActions}><a className={css.button} href={gmail} target="_blank" rel="noopener noreferrer">Abrir rascunho no Gmail ↗</a>
     <a className={css.secondary} href={mailto}>Usar outro aplicativo ↗</a></div>:<button className={css.button} type="button" disabled>Preencha para abrir o rascunho</button>}
    <p className={css.foot}>O Tide não enviará mensagens. Para campanhas, confirme destinatários autorizados e use um serviço de e-mail conectado.</p>
   </section>
  </div>
 </div>;
}
