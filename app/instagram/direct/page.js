'use client';
import {useEffect,useMemo,useCallback,useState} from 'react';
import {useWorkspace} from '../../WorkspaceSwitcher';
import {api} from '../../operations/useOperations';
import styles from './direct.module.css';

const CATEGORIES=[
  {value:'unclassified',label:'A classificar',symbol:'◌'},
  {value:'beginners',label:'Iniciantes',symbol:'✳'},
  {value:'sellers',label:'Vendedores',symbol:'▣'},
  {value:'partnership',label:'Convites de parceria',symbol:'◇'}
];
const FOLDERS=[
  {value:'spontaneous',label:'Mensagens espontâneas'},
  {value:'automation',label:'Respostas de automações'},
  {value:'personal',label:'Conversas pessoais'}
];
const hours=(date)=>{if(!date)return '';const value=new Date(date);if(Number.isNaN(value.getTime()))return '';return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(value);};
function label(thread){return thread?.display_name|| (thread?.username?'@'+thread.username:'Instagram · '+String(thread?.sender_id||'').slice(-6));}
function Tag({children}){return <span className={styles.tag}>{children}</span>;}
export default function InstagramDirectPage(){
 const [workspace]=useWorkspace();
 const [threads,setThreads]=useState([]),[selectedId,setSelectedId]=useState(null),[messages,setMessages]=useState([]);
 const [view,setView]=useState('spontaneous'),[category,setCategory]=useState('all'),[keyword,setKeyword]=useState('all');
 const [personalOpen,setPersonalOpen]=useState(false),[search,setSearch]=useState('');
 const [loading,setLoading]=useState(true),[loadingMessages,setLoadingMessages]=useState(false),[busy,setBusy]=useState('');
 const [draft,setDraft]=useState(''),[notice,setNotice]=useState(''),[hasMore,setHasMore]=useState(false);
 const [syncProgress,setSyncProgress]=useState(''),[pendingCursor,setPendingCursor]=useState(null);
 const selected=threads.find(t=>t.id===selectedId)||null;
 const allowed=workspace.id==='gui-nonato';

 const loadThreads=useCallback(async({silent=false}={})=>{
  if(!allowed)return;
  if(!silent)setLoading(true);
  try{
   const result=await api('/api/instagram/direct');
   setThreads(result.threads||[]);setHasMore(Boolean(result.hasMore));
  }catch(err){if(!silent)setNotice(err.message);}
  finally{if(!silent)setLoading(false);}
 },[allowed]);
 const loadMessages=useCallback(async(id,{silent=false}={})=>{
  if(!id||!allowed){setMessages([]);return;}
  if(!silent)setLoadingMessages(true);
  try{const data=await api('/api/instagram/direct?thread='+encodeURIComponent(id));setMessages(data.messages||[]);}
  catch(err){if(!silent)setNotice(err.message);}
  finally{if(!silent)setLoadingMessages(false);}
 },[allowed]);

 useEffect(()=>{setSelectedId(null);setMessages([]);setView('spontaneous');setPersonalOpen(false);if(allowed)void loadThreads();},[allowed,loadThreads]);
 useEffect(()=>{void loadMessages(selectedId);},[selectedId,loadMessages]);
 useEffect(()=>{if(!allowed)return;const timer=setInterval(()=>{if(document.visibilityState==='visible'){void loadThreads({silent:true});if(selectedId)void loadMessages(selectedId,{silent:true});}},12000);return()=>clearInterval(timer);},[allowed,selectedId,loadThreads,loadMessages]);

 const keywords=useMemo(()=>[...new Set(threads.filter(t=>t.automation_keyword).map(t=>t.automation_keyword))].sort(),[threads]);
 const shown=useMemo(()=>threads.filter(t=>{
  if(t.folder!==view)return false;
  if(view==='spontaneous'&&category!=='all'&&t.category!==category)return false;
  if(view==='automation'&&keyword!=='all'&&t.automation_keyword!==keyword)return false;
  const hay=[t.username,t.display_name,t.sender_id,t.last_excerpt,t.automation_keyword].join(' ').toLowerCase();
  return hay.includes(search.toLowerCase().trim());
 }),[threads,view,category,keyword,search]);
 const count=(folder,segment)=>threads.filter(t=>t.folder===folder&&(!segment||(folder==='automation'?t.automation_keyword===segment:t.category===segment))).length;
 const canReply=selected?.last_inbound_at&&Date.now()-new Date(selected.last_inbound_at).getTime()<24*3600000&&Date.now()>=new Date(selected.last_inbound_at).getTime();
 async function patch(change){
  if(!selected)return;
  setBusy('patch');setNotice('');
  try{
   const result=await api('/api/instagram/direct',{method:'PATCH',body:JSON.stringify({id:selected.id,...change})});
   setThreads(current=>current.map(t=>t.id===selected.id?{...t,...result.thread}:t));
  }catch(e){setNotice(e.message);}finally{setBusy('');}
 }
 async function send(event){
  event.preventDefault();if(!selected||!draft.trim()||!canReply)return;
  setBusy('send');setNotice('');
  try{
   await api('/api/instagram/direct',{method:'POST',body:JSON.stringify({id:selected.id,text:draft.trim()})});
   setDraft('');await Promise.all([loadMessages(selected.id),loadThreads({silent:true})]);
  }catch(e){setNotice(e.message);}finally{setBusy('');}
 }
 async function sync(){
  setBusy('sync');setNotice('');
  let cursor=pendingCursor;
  const sum={reviewed:0,saved:0,checked:0,unavailable:0,failures:0};
  let finished=false;
  try{
   // Each request imports a bounded Meta page. Repeat until all accessible
   // conversations active in the last 24 hours have been inspected.
   for(let index=0;index<20;index++){
    setSyncProgress('Consultando página '+(index+1)+' · '+sum.reviewed+' conversas verificadas');
    const result=await api('/api/instagram/direct/sync',{
      method:'POST',body:JSON.stringify(cursor?{cursor}:{})
    });
    for(const key of Object.keys(sum))sum[key]+=Number(result[key]||0);
    cursor=result.nextCursor||null;
    setPendingCursor(cursor);
    await loadThreads({silent:true});
    if(result.done||!cursor){finished=true;break;}
   }
   if(selectedId)await loadMessages(selectedId,{silent:true});
   const detail=sum.unavailable?' '+sum.unavailable+' mensagens sem conteúdo disponível pela Meta.':'';
   const warning=sum.failures?' '+sum.failures+' itens não puderam ser consultados.':'';
   setNotice((finished?'Últimas 24 horas verificadas':'Verificação parcial, há mais páginas para consultar')+
    ': '+sum.reviewed+' conversas e '+sum.saved+' mensagens processadas.'+detail+warning+
    (finished?'':' Clique novamente para continuar.'));
  }catch(e){
   setNotice(e.message+' Foram verificadas '+sum.reviewed+' conversas. Clique novamente para continuar.');
  }finally{setSyncProgress('');setBusy('');}
 }
 function chooseFolder(folder){setView(folder);setSelectedId(null);setSearch('');setCategory('all');setKeyword('all');if(folder==='personal')setPersonalOpen(true);}
 if(!allowed)return <section className={styles.unavailable}><h1>Direct · Gui Nonato</h1><p>O Direct do Gui fica disponível apenas no workspace Gui Nonato. As mensagens da Vital Decor permanecem separadas.</p></section>;
 return <main className={styles.page}>
  <header className={styles.header}>
   <div><span className={styles.eyebrow}>INSTAGRAM / @GUI_NONATO</span><h1>Direct</h1><p>Uma caixa exclusiva para conversas do Instagram. O WhatsApp não aparece aqui.</p></div>
   <div className={styles.headerActions}>
    <span className={styles.status}><span/> Integração Meta</span>
    <button className={styles.sync} onClick={sync} disabled={Boolean(busy)}>{busy==='sync'?(syncProgress||'Sincronizando…'):(pendingCursor?'↻ Continuar sincronização':'↻ Sincronizar últimas 24h')}</button>
   </div>
  </header>
  {notice&&<div className={styles.notice} role="status">{notice}<button aria-label="Fechar aviso" onClick={()=>setNotice('')}>×</button></div>}
  <section className={styles.stats}>
   <div><strong>{threads.length}</strong><span>Conversas registradas</span></div>
   <div><strong>{threads.filter(t=>t.needs_reply&&t.folder!=='personal').length}</strong><span>A responder · comercial</span></div>
   <div><strong>{count('automation')}</strong><span>Respostas de automações</span></div>
   <div><strong>{count('personal')}</strong><span>Pessoais · reservadas</span></div>
  </section>
  <section className={styles.inbox}>
   <aside className={styles.folders}>
    <p className={styles.asideTitle}>ATENDIMENTO</p>
    <button className={view==='spontaneous'?styles.activeFolder:styles.folder} onClick={()=>chooseFolder('spontaneous')}>
     <span>◉ Mensagens espontâneas</span><small>{count('spontaneous')}</small>
    </button>
    {CATEGORIES.map(c=><button key={c.value} className={view==='spontaneous'&&category===c.value?styles.activeSub:styles.sub} onClick={()=>{setView('spontaneous');setCategory(c.value);setSelectedId(null);}}>
     <span>{c.symbol} {c.label}</span><small>{count('spontaneous',c.value)}</small>
    </button>)}
    <button className={view==='automation'?styles.activeFolder:styles.folder} onClick={()=>chooseFolder('automation')}><span>⌘ Respostas de automações</span><small>{count('automation')}</small></button>
    <button className={view==='automation'&&keyword==='all'?styles.activeSub:styles.sub} onClick={()=>{setView('automation');setKeyword('all');setSelectedId(null);}}><span>↳ Todas as palavras</span></button>
    {keywords.map(key=><button key={key} className={view==='automation'&&keyword===key?styles.activeSub:styles.sub} onClick={()=>{setView('automation');setKeyword(key);setSelectedId(null);}}><span># {key}</span><small>{count('automation',key)}</small></button>)}
    <div className={styles.asideDivider}/>
    <button className={styles.personalToggle} onClick={()=>setPersonalOpen(v=>!v)} aria-expanded={personalOpen}><span>♢ Conversas pessoais</span><span>{personalOpen?'−':'+'}</span></button>
    {personalOpen&&<button className={view==='personal'?styles.activeSub:styles.sub} onClick={()=>chooseFolder('personal')}>Área reservada <small>{count('personal')}</small></button>}
    <p className={styles.asideNote}>Pastas do TidePlace. A pasta pessoal pode ser ajustada manualmente; a Meta não replica todas as pastas nativas.</p>
   </aside>
   <div className={styles.list}>
    <div className={styles.listHeader}>
     <div><strong>{FOLDERS.find(f=>f.value===view)?.label}</strong><small>{shown.length} conversas</small></div>
     <input type="search" placeholder="Buscar conversa..." aria-label="Buscar conversa no Direct" value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>
    {loading?<div className={styles.empty}>Carregando conversas reais…</div>:shown.length===0?<div className={styles.empty}><strong>Nenhuma conversa nesta pasta.</strong><span>Novos directs aparecem pelos eventos da Meta. Use a sincronização para consultar o histórico disponível.</span></div>:
     <div className={styles.threadList}>{shown.map(t=><button key={t.id} className={selectedId===t.id?styles.selectedThread:styles.thread} onClick={()=>setSelectedId(t.id)}>
      <span className={styles.avatar}>{(t.username||t.display_name||'IG').slice(0,2).toUpperCase()}</span>
      <span className={styles.threadContent}><span className={styles.threadTop}><strong>{label(t)}</strong><small>{hours(t.last_message_at)}</small></span>
       <span className={styles.preview}>{t.last_excerpt||'Sem prévia disponível'}</span><span className={styles.tags}>{t.automation_keyword&&<Tag>#{t.automation_keyword}</Tag>}{t.needs_reply&&<Tag>A responder</Tag>}{t.automation_paused&&<Tag>Humano</Tag>}</span></span>
     </button>)}</div>}
    {hasMore&&<p className={styles.listFoot}>Exibindo as 350 conversas mais recentes.</p>}
   </div>
   <section className={styles.conversation}>
    {!selected?<div className={styles.noSelection}><div className={styles.splashIcon}>✉</div><h2>Selecione uma conversa</h2><p>Visualize o histórico e responda pelo Direct oficial da Meta, sem misturar com o WhatsApp.</p></div>:
    <>
     <header className={styles.contactHeader}><div className={styles.contactId}><span className={styles.avatar}>{(selected.username||selected.display_name||'IG').slice(0,2).toUpperCase()}</span><div><strong>{label(selected)}</strong><span>{selected.folder==='personal'?'Conversa pessoal':selected.automation_keyword?'Origem: '+selected.automation_keyword:'Direct espontâneo'}</span></div></div><span className={styles.igPill}>Instagram</span></header>
     <div className={styles.settings}>
      <label>Pasta<select value={selected.folder} disabled={Boolean(busy)} onChange={e=>patch({folder:e.target.value})}>{FOLDERS.map(f=><option value={f.value} key={f.value}>{f.label}</option>)}</select></label>
      <label>Perfil<select value={selected.category} disabled={Boolean(busy)} onChange={e=>patch({category:e.target.value})}>{CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
     </div>
     <div className={styles.settingsBottom}><label className={styles.switch}><input type="checkbox" checked={selected.automation_paused} disabled={Boolean(busy)} onChange={e=>patch({automationPaused:e.target.checked})}/> Atendimento humano · pausar automações</label><button className={styles.mark} disabled={Boolean(busy)} onClick={()=>patch({needsReply:!selected.needs_reply})}>{selected.needs_reply?'✓ Marcar como respondida':'Marcar para responder'}</button></div>
     <div className={styles.messages}>{loadingMessages?<p>Carregando histórico…</p>:messages.length===0?<p>Nenhuma mensagem registrada nesta conversa.</p>:messages.map(m=><div key={m.id} className={m.direction==='outbound'?styles.outbound:styles.inbound}><p>{m.body || (m.message_type==='text'?'Texto não disponibilizado pela Meta':'Mídia não disponibilizada pela Meta')}</p><small>{hours(m.sent_at)}{m.source==='manual'?' · Enviada pelo TidePlace':''}</small></div>)}</div>
     <form className={styles.composer} onSubmit={send}><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder={canReply?'Escreva sua resposta ao Direct…':'Aguardando nova mensagem para abrir a janela de atendimento…'} aria-label="Mensagem para o Direct" rows={2} maxLength={1000} disabled={!canReply||busy==='send'}/><div><span>{canReply?'Janela de atendimento aberta · Meta':'A Meta permite resposta livre na janela de 24 horas após a última mensagem recebida.'}</span><button type="submit" disabled={!canReply||!draft.trim()||Boolean(busy)}>{busy==='send'?'Enviando…':'Enviar ↗'}</button></div></form>
    </>}
   </section>
  </section>
 </main>;
}
