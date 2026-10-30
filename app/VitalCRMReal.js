'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Icon from './ui/Icon';
import {api} from './operations/useOperations';
import css from './vital-crm-real.module.css';
import ThemeCustomizer from './ThemeCustomizer';

const OWNER={
 varejo_nv:'Juliany',pos_nv:'Juliany',afiliados:'Juliany',
 pos_shopee:'Andrey',pos_tiktok:'Andrey',
 atacado:'Vitor',vtx:'Vitor',bluetti:'Vitor',pos_ml:'Vitor',
};
const MINE=['varejo_nv','pos_nv','afiliados'];
const STATUS=[
 {code:'pending',label:'Aguardando resposta',color:'#da8740'},
 {code:'open',label:'Em andamento',color:'#3286c7'},
 {code:'closed',label:'Concluídas',color:'#259878'},
];
function date(value){
 const t=Date.parse(value||'');return Number.isFinite(t)?new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem data';
}
function Donut({title,subtitle,segments,total,compact=false}){
 let offset=0;
 const parts=(segments||[]).filter(x=>x.count>0).map(x=>{
   const start=offset;offset+=x.count/Math.max(1,total)*100;
   return `${x.color} ${start}% ${offset}%`;
 });
 const gradient=parts.length?`conic-gradient(${parts.join(',')})`:'conic-gradient(#e9e4e7 0% 100%)';
 return <div className={css.chart}>
   <h3>{title}</h3><p>{subtitle}</p>
   <div className={compact?css.chartCompact:css.chartContent}>
    <div className={css.donut} style={{background:gradient}} role="img" aria-label={segments.map(x=>x.name+': '+x.count).join(', ')}>
      <div className={css.donutHole}><strong>{total}</strong><span>conversas</span></div>
    </div>
    <div className={css.legend}>{segments.map(x=><div key={x.name} className={css.legendRow}>
      <span className={css.legendLabel}><i style={{background:x.color}}/>{x.name}</span><strong>{x.count}</strong>
    </div>)}</div>
   </div>
 </div>;
}
const emptyCounts={total:0,pending:0,open:0,closed:0,unassigned:0,queues:{}};
const SPLIT_WIDTH_KEY='tideplace:crm-vital:split-width';
const DEFAULT_SPLIT_WIDTH=36;
const clampSplitWidth=value=>Math.max(25,Math.min(70,Math.round(value)));
export default function VitalCRMReal({embedded=false,onLogout}){
 const [page,setPage]=useState('dashboard'),[view,setView]=useState('all');
 const [data,setData]=useState(null),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null);
 const [loading,setLoading]=useState(true),[opening,setOpening]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [revision,setRevision]=useState(0),[pageNumber,setPageNumber]=useState(0);
 const [queueFilter,setQueueFilter]=useState('all'),[statusFilter,setStatusFilter]=useState('all'),[search,setSearch]=useState('');
 const [destination,setDestination]=useState(''),[draft,setDraft]=useState('');
 const [splitWidth,setSplitWidth]=useState(DEFAULT_SPLIT_WIDTH);
 const splitBoard=useRef(null),splitDragging=useRef(false);
 useEffect(()=>{
   try {
     const saved=Number(window.localStorage.getItem(SPLIT_WIDTH_KEY));
     if(Number.isFinite(saved)&&saved>=25&&saved<=70)setSplitWidth(clampSplitWidth(saved));
   }catch{}
 },[]);
 const changeSplitWidth=useCallback(value=>{
   const next=clampSplitWidth(value);
   setSplitWidth(next);
   try{window.localStorage.setItem(SPLIT_WIDTH_KEY,String(next));}catch{}
 },[]);
 const startSplit=event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   splitDragging.current=true;
   event.currentTarget.setPointerCapture(event.pointerId);
   event.preventDefault();
 };
 const moveSplit=event=>{
   if(!splitDragging.current||!splitBoard.current)return;
   const bounds=splitBoard.current.getBoundingClientRect();
   if(bounds.width>0)changeSplitWidth((event.clientX-bounds.left)/bounds.width*100);
 };
 const stopSplit=()=>{splitDragging.current=false;};
 const splitKeyDown=event=>{
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
     event.preventDefault();
     changeSplitWidth(splitWidth+(event.key==='ArrowLeft'?-3:3));
   }else if(event.key==='Home'){event.preventDefault();changeSplitWidth(25);}
   else if(event.key==='End'){event.preventDefault();changeSplitWidth(70);}
 };
 const reload=useCallback(()=>setRevision(v=>v+1),[]);
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  api('/api/crm/vital/live?page='+pageNumber).then(result=>{if(active)setData(result);})
   .catch(e=>{if(active)setError(e.message);})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[revision,pageNumber]);
 useEffect(()=>{
  if(!selected){setDetail(null);return;}
  let active=true;setOpening(true);setDetail(null);setDestination('');setDraft('');
  api('/api/crm/vital/live?contact='+encodeURIComponent(selected))
   .then(result=>{if(active)setDetail(result);})
   .catch(e=>{if(active){setSelected(null);setError(e.message);}})
   .finally(()=>{if(active)setOpening(false)});
  return()=>{active=false};
 },[selected,revision]);
 const role=data?.role||'agent',manager=['owner','supervisor'].includes(role);
 const queues=data?.queues||[],counts=data?.counters||emptyCounts;
 const queueName=code=>(data?.transferDestinations||queues).find(q=>q.queue_code===code)?.display_name||(code===null?'Sem classificação':code);
 const queueColor=code=>queues.find(q=>q.queue_code===code)?.color||'#a5a0a5';
 const source=data?.conversations||[];
 const effective=source.filter(c=>{
  if(view==='mine'&&role==='owner'&&!MINE.includes(c.queue))return false;
  if(queueFilter!=='all' && (queueFilter==='unassigned'?c.queue!==null:c.queue!==queueFilter))return false;
  if(statusFilter!=='all'&&c.status!==statusFilter)return false;
  const term=search.trim().toLowerCase();
  return !term||[c.name,c.phone,c.preview,queueName(c.queue)].join(' ').toLowerCase().includes(term);
 });
 const responsible=Object.entries(OWNER).reduce((acc,[queue,owner])=>{
  if(!queues.some(q=>q.queue_code===queue))return acc;
  if(!acc[owner])acc[owner]=0;
  acc[owner]+=counts.queues?.[queue]||0;
  return acc;
 },{});
 const responsibleColors={Juliany:'#b54880',Andrey:'#e0783b',Vitor:'#009992'};
 const areaMap=[
   {name:'Pós-venda',codes:['pos_nv','pos_shopee','pos_tiktok','pos_ml'],color:'#dd843f'},
   {name:'Varejo',codes:['varejo_nv'],color:'#327fc2'},
   {name:'Atacado',codes:['atacado'],color:'#845bb8'},
   {name:'Produtos',codes:['vtx','bluetti'],color:'#009c96'},
   {name:'Afiliados',codes:['afiliados'],color:'#bb4f84'},
 ];
 const teamSegments=Object.entries(responsible).map(([name,count])=>({name,count,color:responsibleColors[name]||'#a5a0a5'}));
 const areaSegments=areaMap.map(a=>({...a,count:a.codes.reduce((n,q)=>n+(counts.queues?.[q]||0),0)}));
 const statusSegments=STATUS.map(s=>({name:s.label,count:counts[s.code]||0,color:s.color}));
 const canMove=Boolean(detail?.contact?.queue)||role==='owner';

 async function transfer(){
  if(!detail||!destination||busy)return;
  const from=detail.contact.queue, to=destination;
  if(from===to)return;
  if(!window.confirm('Transferir esta conversa de '+queueName(from)+' para '+queueName(to)+'? O acesso do setor anterior será retirado.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   await api('/api/crm/vital/live',{method:'PATCH',body:JSON.stringify({contact:detail.contact.id,toQueue:to})});
   setNotice('Conversa encaminhada para '+queueName(to)+'.');
   setSelected(null);reload();
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function reply(event){
  event.preventDefault();
  if(!detail||!draft.trim()||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await api('/api/crm/vital/reply',{method:'POST',body:JSON.stringify({to:detail.contact.id,text:draft.trim()})});
   setDraft('');setNotice(result.warning||'Mensagem enviada pelo WhatsApp da Vital.');reload();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function setResolution(status){
  if(!detail||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await api('/api/crm/vital/status',{method:'PATCH',
     body:JSON.stringify({contact:detail.contact.id,status})});
   setNotice(status==='resolved'?'Atendimento concluído.':'Atendimento reaberto.');
   reload();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const statusName=c=>STATUS.find(s=>s.code===c)?.label||'—';
 const main=<>
  <header className={css.header}>
   <div>
    <span className={css.eyebrow}>TIDEPLACE / VITAL DECOR / CRM</span>
    <h1>{page==='dashboard'?'Visão geral da operação':'Central de atendimento'}</h1>
    <p>{manager?'Distribuição, acompanhamento e transferências das conversas reais.':'Atendimentos das filas sob sua responsabilidade.'}</p>
   </div>
   <div className={css.topActions}>
    <span className={css.liveIndicator}><i/> DADOS REAIS</span>
    {!embedded&&<ThemeCustomizer />}
    <button type="button" onClick={reload}><Icon name="refresh" size={15}/> Atualizar</button>
   </div>
  </header>
  <nav className={css.tabs} aria-label="Navegação do CRM">
   <button className={page==='dashboard'?css.active:''} onClick={()=>setPage('dashboard')}><Icon name="chart" size={17}/> Dashboard</button>
   <button className={page==='inbox'?css.active:''} onClick={()=>setPage('inbox')}><Icon name="inbox" size={17}/> Atendimentos</button>
  </nav>
  {error&&<div className={css.alert} role="alert">{error}</div>}
  {notice&&<div className={css.notice} role="status">{notice}</div>}
  {data?.sampled&&<p className={css.smallNotice}>Os indicadores consideram as conversas sincronizadas dentro do limite atual de consulta.</p>}
  {loading&&!data?<div className={css.loading}>Consultando conversas e permissões da Vital…</div>:null}
  {data && page==='dashboard' && <div className={css.dashboardLayout}>
   <div className={css.dashboardPrimary}>
    <div className={css.cards}>
     {[
      ['Conversas acompanhadas',counts.total,'#9e4272'],
      ['Aguardando resposta',counts.pending,'#e38b40'],
      ['Em andamento',counts.open,'#3785c5'],
      ['Concluídas',counts.closed,'#259878'],
     ].map(([label,value,color])=><div className={css.stat} key={label} style={{'--accent':color}}>
       <span>{label}</span><strong>{value}</strong><small>Posição das conversas registradas</small>
      </div>)}
    </div>
    <section className={css.panel}>
     <div className={css.sectionTitle}><div><h2>Distribuição dos atendimentos</h2><p>Quem atende e quais áreas recebem mais conversas.</p></div></div>
     <div className={css.analyticsPair}>
      <Donut title={manager?'Conversas por responsável':'Conversas das minhas filas'} subtitle="Volume por responsável" segments={teamSegments} total={counts.total-counts.unassigned}/>
      <Donut title="Conversas por área" subtitle="Origem e assunto do atendimento" segments={areaSegments} total={counts.total-counts.unassigned}/>
     </div>
    </section>
    <section className={css.panel}>
     <div className={css.sectionTitle}><h2>Volume por fila</h2><p>Distribuição dos contatos conforme a Vivi e os encaminhamentos internos.</p></div>
     <div className={css.queueTiles}>{queues.map(q=><button key={q.queue_code} type="button" className={css.queueTile} style={{'--accent':q.color}}
       onClick={()=>{setPage('inbox');setQueueFilter(q.queue_code);}}>
       <div><strong>{q.display_name}</strong><span>{OWNER[q.queue_code]||'Equipe'}</span></div>
       <b>{counts.queues?.[q.queue_code]||0}</b>
      </button>)}</div>
    </section>
   </div>
   <aside className={css.dashboardAside}>
    <section className={css.panel}>
     <Donut title="Situação dos atendimentos" subtitle="Pendentes, em andamento e concluídas" segments={statusSegments} total={counts.total} compact/>
    </section>
    <section className={css.panel}>
     <h2>Prioridades do dia</h2>
     <div className={css.priority}><span style={{color:'#da8740'}}>●</span> {counts.pending} aguardando resposta</div>
     <div className={css.priority}><span style={{color:'#3286c7'}}>●</span> {counts.open} em andamento</div>
     <div className={css.priority}><span style={{color:'#259878'}}>●</span> {counts.closed} concluídas</div>
     {role==='owner'&&counts.unassigned>0&&<button className={css.unassigned} onClick={()=>{setPage('inbox');setQueueFilter('unassigned');}}>
       <Icon name="alert" size={16}/> {counts.unassigned} conversa(s) sem fila definida
     </button>}
    </section>
    <section className={css.panel}>
     <h2>Origem dos encaminhamentos</h2>
     <p className={css.explanation}>A classificação existente da Vivi identifica a fila quando o assunto é conhecido. Atendimentos sem classificação específica ficam para a Juliany distribuir.</p>
    </section>
   </aside>
  </div>}
  {data && page==='inbox' && <>
   <div className={css.inboxSummary}>
    {STATUS.map(item=><button key={item.code} className={css.summaryPill} style={{'--accent':item.color}} onClick={()=>setStatusFilter(statusFilter===item.code?'all':item.code)}>
     <strong>{counts[item.code]||0}</strong><span>{item.label}</span>
    </button>)}
   </div>
   {role==='owner'&&<div className={css.scopeTabs}>
    <button className={view==='all'?css.active:''} onClick={()=>{setView('all');setQueueFilter('all');}}>Todas as filas</button>
    <button className={view==='mine'?css.active:''} onClick={()=>{setView('mine');setQueueFilter('all');}}>Minha operação</button>
   </div>}
   <div ref={splitBoard} className={css.board} style={{'--vital-split-width':splitWidth+'%'}}>
    <section className={css.list}>
     <div className={css.listHeader}><h2>Atendimentos</h2><span>{effective.length} nesta página</span></div>
     <label className={css.search}><span>Buscar conversa</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, número ou assunto…"/></label>
     <div className={css.filters}>
      <label><span>Fila</span><select value={queueFilter} onChange={e=>{setQueueFilter(e.target.value);setSelected(null)}}>
       <option value="all">Todas as filas permitidas</option>
       {role==='owner'&&<option value="unassigned">Sem classificação</option>}
       {queues.filter(q=>view==='all'||role!=='owner'||MINE.includes(q.queue_code)).map(q=><option key={q.queue_code} value={q.queue_code}>{q.display_name}</option>)}
      </select></label>
      <label><span>Status</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
       <option value="all">Todos os status</option>
       {STATUS.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}
      </select></label>
     </div>
     <div className={css.contacts}>
      {effective.map(c=><button className={selected===c.id?css.contactActive:css.contact} key={c.id} onClick={()=>{setSelected(c.id);setError('');}}>
       <span className={css.avatar}>{(c.name||'?')[0]?.toUpperCase()}</span>
       <span className={css.contactText}><strong>{c.name||c.phone}</strong>
        <small><i style={{background:queueColor(c.queue)}}/>{queueName(c.queue)} · {date(c.updatedAt)}</small>
        <span>{c.preview||'Sem mensagem'}</span></span>
       <Icon name="chevronRight" size={17}/>
      </button>)}
      {!effective.length&&<p className={css.noContacts}>Nenhum atendimento nesta seleção.</p>}
     </div>
     <div className={css.pagination}>
      <button disabled={pageNumber===0} onClick={()=>{setPageNumber(n=>Math.max(0,n-1));setSelected(null);}}>Anterior</button>
      <span>Página {pageNumber+1}</span>
      <button disabled={!data.hasMore} onClick={()=>{setPageNumber(n=>n+1);setSelected(null);}}>Próxima</button>
     </div>
    </section>
    <div className={css.splitter} role="separator" tabIndex={0}
      aria-label="Ajustar largura entre atendimentos e conversa"
      aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70}
      aria-valuenow={splitWidth} title="Arraste para redimensionar · setas para ajustar · duplo clique para restaurar"
      onPointerDown={startSplit} onPointerMove={moveSplit} onPointerUp={stopSplit}
      onPointerCancel={stopSplit} onLostPointerCapture={stopSplit}
      onKeyDown={splitKeyDown} onDoubleClick={()=>changeSplitWidth(DEFAULT_SPLIT_WIDTH)}>
      <span className={css.splitterHandle} aria-hidden="true">↔</span>
    </div>
    <section className={css.thread}>
     {!selected?<div className={css.placeholder}><Icon name="chat" size={30}/><h2>Selecione uma conversa</h2><p>Consulte o histórico e encaminhe para a próxima fila quando necessário.</p></div>:<>
      <div className={css.threadHeader}><div><h2>{detail?.contact?.name||'Conversa'}</h2>
       <p>{detail?.contact?.phone||''} · {queueName(detail?.contact?.queue)}</p></div>
       <button aria-label="Fechar conversa" onClick={()=>setSelected(null)}><Icon name="close" size={18}/></button>
      </div>
      {opening&&<p className={css.loading}>Verificando sua permissão de acesso…</p>}
      {detail&&<div className={css.messages}>
       {detail.messages.map(m=><article key={m.id} className={m.direction==='outbound'?css.sent:css.received}>
        <p>{m.body||'['+m.type+']'}</p><time>{date(m.at)}</time>
       </article>)}
       {!detail.messages.length&&<p className={css.noContacts}>Sem mensagens registradas.</p>}
      </div>}
      {detail&&role!=='supervisor'&&detail.contact.queue&&<div className={css.resolution}>
       <div><strong>Situação do atendimento</strong><small>{statusName(detail.contact.status)}</small></div>
       <button type="button" disabled={busy} onClick={()=>setResolution(detail.contact.status==='closed'?'open':'resolved')}>
        <Icon name={detail.contact.status==='closed'?'refresh':'check'} size={15}/>
        {detail.contact.status==='closed'?'Reabrir atendimento':'Marcar como resolvido'}
       </button>
      </div>}
      {detail&&role!=='supervisor'&&<form className={css.reply} onSubmit={reply}>
        <label htmlFor="vital-reply-text">Responder pelo WhatsApp da Vital</label>
        <textarea id="vital-reply-text" value={draft} maxLength={4096} rows={3}
          placeholder="Digite sua resposta…" onChange={e=>setDraft(e.target.value)} disabled={busy}/>
        <div><small>O envio respeita a janela de 24h da Meta e pausa a Vivi neste atendimento.</small>
        <button type="submit" disabled={!draft.trim()||busy}>{busy?'Enviando…':'Enviar mensagem'}</button></div>
       </form>}
      {detail&&<div className={css.transfer}>
       <div><strong><Icon name="flow" size={15} inline/> Encaminhar conversa</strong><p>Escolha a fila que dará continuidade ao atendimento.</p></div>
       <div className={css.transferControls}>
        <select aria-label="Fila de destino" value={destination} onChange={e=>setDestination(e.target.value)} disabled={!canMove||busy}>
         <option value="">Escolha a fila de destino…</option>
         {(data.transferDestinations||[]).filter(q=>q.queue_code!==detail.contact.queue).map(q=><option key={q.queue_code} value={q.queue_code}>{q.display_name} · {OWNER[q.queue_code]||'Equipe'}</option>)}
        </select>
        <button type="button" disabled={!destination||busy||!canMove} onClick={transfer}>{busy?'Transferindo…':'Transferir'}</button>
       </div>
       <span>As respostas ficam disponíveis apenas dentro da janela de 24h e para conversas das suas filas. A transferência altera a fila do CRM, não configura o Argo.</span>
      </div>}
     </>}
    </section>
   </div>
  </>}
 </>;
 if(embedded)return <main className={css.embedded}>{main}</main>;
 return <div className={css.shell}>
  <aside className={css.sidebar}>
   <div className={css.brand}><img src="/brand/tideplace-mark.svg" alt=""/><div><strong>TIDEPLACE</strong><span>Vital Decor · CRM</span></div></div>
   <div className={css.sidebarLabel}>CENTRAL DE ATENDIMENTO</div>
   <button className={page==='dashboard'?css.sidebarActive:css.sidebarButton} onClick={()=>setPage('dashboard')}><Icon name="chart" size={17}/> Dashboard</button>
   <button className={page==='inbox'?css.sidebarActive:css.sidebarButton} onClick={()=>setPage('inbox')}><Icon name="inbox" size={17}/> Atendimentos</button>
   <div className={css.sidebarBottom}><span>Acesso individual · Vital Decor</span>
    {onLogout&&<button onClick={onLogout} type="button"><Icon name="logout" size={16}/> Sair</button>}
   </div>
  </aside>
  <main className={css.main}>{main}</main>
 </div>;
}
