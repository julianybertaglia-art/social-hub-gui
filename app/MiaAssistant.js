'use client';

import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useWorkspace} from './WorkspaceSwitcher';
import {supabase,useAccessScope} from './CloudGate';
import Icon from './ui/Icon';
import css from './mia-assistant.module.css';

const STORAGE='tideplace:mia:floating-position';
const DEFAULT_SIZE=56;
const QUICK_ACTIONS=[
 ['Resumir atendimento','summarize'],
 ['Sugerir resposta','suggest_reply'],
 ['Próxima ação','next_action'],
 ['Consultar indicadores','insights'],
];
function clamp(value,minimum,maximum){return Math.max(minimum,Math.min(maximum,value));}
function MiaMark({small=false}){
 return <span className={small?css.markSmall:css.mark}>
  <img src="/brand/mia-logo.webp" alt="" width={small?43:53} height={small?43:53}/>
 </span>;
}
async function miaRequest(path,{method='GET',body}={}){
 const {data}=await supabase?.auth.getSession()||{};
 const token=data?.session?.access_token;
 if(!token)throw new Error('Entre no TidePlace para conversar com a MIA.');
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+token,
  ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error||'Não foi possível concluir a solicitação.');
 return payload;
}
function messageTime(value){
 const time=Date.parse(value||'');
 return Number.isFinite(time)?new Date(time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
}
export default function MiaAssistant(){
 const pathname=usePathname();
 const [workspace]=useWorkspace();
 const accessScope=useAccessScope();
 const authorized=['admin','staff'].includes(accessScope?.scope);
 const [open,setOpen]=useState(false);
 const [expanded,setExpanded]=useState(false);
 const [position,setPosition]=useState(null);
 const [threads,setThreads]=useState([]),[threadId,setThreadId]=useState(''),[messages,setMessages]=useState([]);
 const [input,setInput]=useState(''),[loadingHistory,setLoadingHistory]=useState(false),[sending,setSending]=useState(false);
 const [error,setError]=useState(''),[suggestion,setSuggestion]=useState(''),[suggestionContact,setSuggestionContact]=useState('');
 const [selectedContact,setSelectedContact]=useState('');
 const [identity,setIdentity]=useState('');
 const drag=useRef(null),suppressClick=useRef(false),floating=useRef(null),messagesEnd=useRef(null),selectedContactRef=useRef('');
 const isCrm=pathname?.startsWith('/crm')||pathname?.startsWith('/whatsapp')||pathname?.startsWith('/instagram/direct');
 const brand=workspace?.name||'TidePlace';
 const showMia=authorized&&Boolean(supabase);

 useEffect(()=>{
  let active=true;
  if(!supabase){setIdentity('');return undefined;}
  supabase.auth.getSession().then(({data})=>{if(active)setIdentity(data?.session?.user?.id||'');});
  const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(!active)return;
   setIdentity(session?.user?.id||'');
   setThreads([]);setThreadId('');setMessages([]);setSuggestion('');setSuggestionContact('');setError('');
  });
  return()=>{active=false;listener.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  try{
   const value=JSON.parse(window.localStorage.getItem(STORAGE)||'null');
   if(value&&Number.isFinite(value.x)&&Number.isFinite(value.y))
    setPosition({x:clamp(value.x,8,innerWidth-DEFAULT_SIZE-8),y:clamp(value.y,8,innerHeight-DEFAULT_SIZE-8)});
  }catch{}
 },[]);
 useEffect(()=>{
  function resize(){setPosition(value=>value?{x:clamp(value.x,8,innerWidth-DEFAULT_SIZE-8),y:clamp(value.y,8,innerHeight-DEFAULT_SIZE-8)}:null);}
  window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
 },[]);
 useEffect(()=>{
  function syncContact(event){
   const contact=String(event?.detail?.contactId||'');
   selectedContactRef.current=contact;setSelectedContact(contact);setSuggestion('');setSuggestionContact('');
  }
  window.addEventListener('tideplace:mia-crm-contact',syncContact);
  return()=>window.removeEventListener('tideplace:mia-crm-contact',syncContact);
 },[]);
 useEffect(()=>{
  setSuggestion('');setSuggestionContact('');
  if(!isCrm){selectedContactRef.current='';setSelectedContact('');}
 },[pathname,workspace?.id,isCrm]);
 useEffect(()=>{
  if(!open||!showMia||!identity)return;
  let active=true;setLoadingHistory(true);setError('');
  miaRequest('/api/crm/vital/mia').then(result=>{
   if(!active)return;
   setThreads(result.threads||[]);setThreadId(result.thread?.id||'');setMessages(result.messages||[]);
  }).catch(reason=>{if(active)setError(reason.message);})
   .finally(()=>{if(active)setLoadingHistory(false);});
  return()=>{active=false;};
 },[open,showMia,identity]);
 useEffect(()=>{messagesEnd.current?.scrollIntoView({block:'end',behavior:'smooth'});},[messages,sending]);
 function pointerDown(event){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const rect=event.currentTarget.getBoundingClientRect();
  drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:rect.left,y:rect.top,moved:false};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function pointerMove(event){
  const state=drag.current;if(!state||state.pointerId!==event.pointerId)return;
  const dx=event.clientX-state.startX,dy=event.clientY-state.startY;
  if(Math.abs(dx)+Math.abs(dy)>7)state.moved=true;
  if(state.moved)setPosition({x:clamp(state.x+dx,8,window.innerWidth-DEFAULT_SIZE-8),y:clamp(state.y+dy,8,window.innerHeight-DEFAULT_SIZE-8)});
 }
 function pointerUp(){
  if(drag.current?.moved){
   suppressClick.current=true;
   const rect=floating.current?.getBoundingClientRect();
   if(rect)try{localStorage.setItem(STORAGE,JSON.stringify({x:rect.left,y:rect.top}));}catch{}
  }
  drag.current=null;
 }
 function toggle(){if(suppressClick.current){suppressClick.current=false;return;}setOpen(value=>!value);}
 async function loadThread(id){
  setLoadingHistory(true);setError('');setSuggestion('');setSuggestionContact('');
  try{
   const result=await miaRequest('/api/crm/vital/mia?thread='+encodeURIComponent(id));
   setThreadId(result.thread?.id||'');setMessages(result.messages||[]);
  }catch(reason){setError(reason.message);}
  finally{setLoadingHistory(false);}
 }
 async function newThread(){
  setError('');setSuggestion('');setSuggestionContact('');
  try{
   const result=await miaRequest('/api/crm/vital/mia',{method:'POST',body:{mode:'new'}});
   setThreadId(result.thread.id);setMessages([]);setThreads(previous=>[result.thread,...previous]);
  }catch(reason){setError(reason.message);}
 }
 async function send(value=input,action='chat'){
  const question=String(value||'').trim();
  if(!question||sending)return;
  const contactAtSend=isCrm?selectedContact:null;
  setSending(true);setError('');
  try{
   const result=await miaRequest('/api/crm/vital/mia',{method:'POST',body:{
    message:question,action,workspace:workspace?.id||'vital-decor',contact:contactAtSend||null,threadId:threadId||null,
   }});
   setThreadId(result.threadId);setInput('');
   const replySuggestion=result.action==='suggest_reply'&&contactAtSend&&selectedContactRef.current===contactAtSend
    ?result.answer:'';
   setSuggestionContact(replySuggestion?contactAtSend:'');setSuggestion(replySuggestion);
   setMessages(previous=>[...previous,
    {id:'local-user-'+Date.now(),role:'user',content:question,created_at:new Date().toISOString()},
    {id:'local-answer-'+Date.now(),role:'assistant',content:result.answer,created_at:new Date().toISOString()},
   ]);
   setThreads(previous=>{
    const found=previous.find(thread=>thread.id===result.threadId);
    return found?[{...found,updated_at:new Date().toISOString()},...previous.filter(thread=>thread.id!==result.threadId)]:
     [{id:result.threadId,title:question.slice(0,80),created_at:new Date().toISOString(),updated_at:new Date().toISOString()},...previous];
   });
  }catch(reason){setError(reason.message);}
  finally{setSending(false);}
 }
 function handleComposeKey(event){
  if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent?.isComposing){event.preventDefault();void send();}
 }
 async function useSuggestion(){
  if(!suggestion)return;
  if(suggestionContact&&suggestionContact===selectedContactRef.current&&accessScope?.role!=='supervisor'){
   window.dispatchEvent(new CustomEvent('tideplace:mia-insert-reply',{
   detail:{text:suggestion,contactId:suggestionContact},
  }));return;}
  try{await navigator.clipboard.writeText(suggestion);}catch{setError('Não foi possível copiar a sugestão.');}
 }
 const panelStyle=position&&typeof window!=='undefined'&&window.innerWidth>640?
  {left:clamp(position.x>window.innerWidth/2?position.x-(expanded?520:385):position.x+DEFAULT_SIZE+12,8,window.innerWidth-(expanded?505:365)),top:clamp(position.y-230,8,Math.max(8,window.innerHeight-480))}:undefined;

 if(!showMia)return null;
 return <>
  <div className={css.floating} ref={floating} style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
   <button type="button" aria-label={open?'Fechar MIA':'Abrir MIA'} aria-expanded={open}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
    onLostPointerCapture={()=>{drag.current=null;}} onClick={toggle} className={css.bubble} title="MIA · arraste para mover">
    <MiaMark/>
   </button>
  </div>
  {open&&<section className={`${css.panel} ${expanded?css.expanded:''}`} style={panelStyle}
    role="dialog" aria-label="MIA, assistente do TidePlace">
   <header className={css.header}>
    <MiaMark small/>
    <div className={css.heading}><strong>MIA</strong><span>Assistente do TidePlace</span></div>
    <button type="button" aria-label="Nova conversa" title="Nova conversa" onClick={newThread}><Icon name="plus" size={17}/></button>
    <button type="button" title={expanded?'Reduzir painel':'Expandir painel'} aria-label={expanded?'Reduzir painel':'Expandir painel'}
      onClick={()=>setExpanded(value=>!value)}><Icon name={expanded?'columns':'external'} size={17}/></button>
    <button type="button" aria-label="Fechar MIA" onClick={()=>setOpen(false)}><Icon name="close" size={17}/></button>
   </header>
   <div className={css.context}><span className={css.statusDot}/> {brand} · {isCrm?'CRM':'TidePlace'}</div>
   {threads.length>1&&<div className={css.historySelect}>
    <label htmlFor="mia-thread">Histórico</label>
    <select id="mia-thread" value={threadId} onChange={event=>loadThread(event.target.value)}>
     {threads.map(thread=><option key={thread.id} value={thread.id}>{thread.title||'Conversa'}</option>)}
    </select>
   </div>}
   <div className={css.body}>
    {!messages.length&&!loadingHistory&&<div className={css.welcome}>
     <h2>Oi! Eu sou a MIA.</h2>
     <p>Posso ajudar a resumir atendimentos, sugerir respostas e organizar pendências.</p>
    </div>}
    {loadingHistory&&<p className={css.stateMessage}>Carregando seu histórico privado…</p>}
    {messages.map(message=><article key={message.id} className={`${css.message} ${message.role==='user'?css.messageUser:css.messageAssistant}`}>
     <p>{message.content}</p><time>{messageTime(message.created_at)}</time>
    </article>)}
    {sending&&<p className={css.stateMessage} role="status">A MIA está pensando…</p>}
    <div ref={messagesEnd}/>
   </div>
   {isCrm&&<div className={css.quickActions} aria-label="Ações da MIA">
    {QUICK_ACTIONS.map(([label,action])=><button type="button" key={action}
     disabled={sending||(['summarize','suggest_reply','next_action'].includes(action)&&!selectedContact)}
     onClick={()=>send(label+' para a conversa selecionada.',action)}>{label}</button>)}
   </div>}
   {suggestion&&<div className={css.answerActions}>
    <span>Revise a resposta antes de usá-la.</span>
    <button type="button" onClick={useSuggestion}>{suggestionContact&&suggestionContact===selectedContact&&accessScope?.role!=='supervisor'?'Inserir no WhatsApp':'Copiar sugestão'}</button>
   </div>}
   <footer className={css.footer}>
    <span className={error?css.error:undefined} role={error?'alert':undefined}>{error||'Quando você pedir análise do CRM, somente contexto autorizado e minimizado segue ao Google Gemini. A MIA não envia mensagens.'}</span>
    <div className={css.compose}>
     <textarea aria-label="Pergunte à MIA" placeholder="Pergunte à MIA…" value={input} maxLength={1400}
      onChange={event=>setInput(event.target.value)} onKeyDown={handleComposeKey} disabled={sending}/>
     <button type="button" disabled={!input.trim()||sending} aria-label="Enviar pergunta" onClick={()=>send()}>
      {sending?'…':<Icon name="send" size={18}/>}
     </button>
    </div>
   </footer>
  </section>}
 </>;
}
