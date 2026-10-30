'use client';

import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useWorkspace} from './WorkspaceSwitcher';
import Icon from './ui/Icon';
import css from './mia-assistant.module.css';

const STORAGE='tideplace:mia:floating-position';
const DEFAULT_SIZE=56;
function clamp(value,minimum,maximum){return Math.max(minimum,Math.min(maximum,value));}
function MiaMark({small=false}){
 return <span className={small?css.markSmall:css.mark}>
  <svg viewBox="0 0 100 57" aria-hidden="true">
   <path d="M9 30 C21 6 40 12 58 21 C74 29 85 23 93 17 C90 32 79 43 65 43 C49 43 35 27 19 27 C15 27 12 28 9 30 Z"
     fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
  <strong>MIA</strong>
 </span>;
}
const socialActions=[
 ['Ideias de conteúdo','Organizar ideias e roteiros para o calendário'],
 ['Calendário','Acompanhar o planejamento de publicações'],
 ['Métricas e metas','Identificar oportunidades nas métricas']
];
const crmActions=[
 ['Resumir atendimento','Sintetizar o histórico da conversa selecionada'],
 ['Sugerir resposta','Preparar uma resposta para aprovação'],
 ['Próxima ação','Sugerir tarefa ou encaminhamento']
];
export default function MiaAssistant(){
 const pathname=usePathname();
 const [workspace]=useWorkspace();
 const [open,setOpen]=useState(false);
 const [expanded,setExpanded]=useState(false);
 const [position,setPosition]=useState(null);
 const [selected,setSelected]=useState('');
 const drag=useRef(null);
 const suppressClick=useRef(false);
 const floating=useRef(null);
 const isCrm=pathname?.startsWith('/crm')||pathname?.startsWith('/whatsapp')||pathname?.startsWith('/instagram/direct');
 const actions=isCrm?crmActions:socialActions;
 const brand=workspace?.name||'TidePlace';
 useEffect(()=>{
  try{
   const v=JSON.parse(window.localStorage.getItem(STORAGE)||'null');
   if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y)){
    setPosition({x:clamp(v.x,8,innerWidth-DEFAULT_SIZE-8),y:clamp(v.y,8,innerHeight-DEFAULT_SIZE-8)});
   }
  }catch{}
 },[]);
 useEffect(()=>{
  function onResize(){
   setPosition(p=>p?{x:clamp(p.x,8,innerWidth-DEFAULT_SIZE-8),y:clamp(p.y,8,innerHeight-DEFAULT_SIZE-8)}:null);
  }
  window.addEventListener('resize',onResize);
  return ()=>window.removeEventListener('resize',onResize);
 },[]);
 useEffect(()=>{setSelected('');},[pathname,workspace?.id]);
 function pointerDown(e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const rect=e.currentTarget.getBoundingClientRect();
  drag.current={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:rect.left,y:rect.top,moved:false};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function pointerMove(e){
  const d=drag.current;
  if(!d||d.pointerId!==e.pointerId)return;
  const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
  if(Math.abs(dx)+Math.abs(dy)>7)d.moved=true;
  if(!d.moved)return;
  setPosition({x:clamp(d.x+dx,8,window.innerWidth-DEFAULT_SIZE-8),y:clamp(d.y+dy,8,window.innerHeight-DEFAULT_SIZE-8)});
 }
 function pointerUp(){
  if(drag.current?.moved){
   suppressClick.current=true;
   const rect=floating.current?.getBoundingClientRect();
   if(rect){
    try{localStorage.setItem(STORAGE,JSON.stringify({x:rect.left,y:rect.top}));}catch{}
   }
  }
  drag.current=null;
 }
 function toggle(){
  if(suppressClick.current){suppressClick.current=false;return;}
  setOpen(v=>!v);
 }
 const panelStyle=position&&typeof window!=='undefined'&&window.innerWidth>640?
  {left:clamp(position.x>window.innerWidth/2?position.x-(expanded?520:385):position.x+DEFAULT_SIZE+12,8,window.innerWidth-(expanded?505:365)),top:clamp(position.y-230,8,Math.max(8,window.innerHeight-480))}:undefined;
 return <>
  <div className={css.floating} ref={floating}
    style={position?{left:position.x,top:position.y,right:'auto',bottom:'auto'}:undefined}>
   <button type="button" aria-label={open?'Fechar MIA':'Abrir MIA'} aria-expanded={open}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
    onPointerCancel={pointerUp} onLostPointerCapture={()=>{drag.current=null;}}
    onClick={toggle} className={css.bubble} title="MIA · arraste para mover">
    <MiaMark/>
   </button>
  </div>
  {open&&<section className={`${css.panel} ${expanded?css.expanded:''}`} style={panelStyle}
    role="dialog" aria-label="MIA, assistente do TidePlace">
   <header className={css.header}>
    <MiaMark small/>
    <div className={css.heading}><strong>MIA</strong><span>Assistente do TidePlace</span></div>
    <button type="button" title={expanded?'Reduzir painel':'Expandir painel'} aria-label={expanded?'Reduzir painel':'Expandir painel'}
      onClick={()=>setExpanded(v=>!v)}><Icon name={expanded?'minimize-2':'maximize-2'} size={17}/></button>
    <button type="button" aria-label="Fechar MIA" onClick={()=>setOpen(false)}><Icon name="x" size={17}/></button>
   </header>
   <div className={css.context}><span className={css.statusDot}/> {brand} · {isCrm?'CRM':'Social Studio'}</div>
   <div className={css.body}>
    <h2>Oi! Eu sou a MIA.</h2>
    <p>Estou sendo preparada para ajudar você diretamente no TidePlace. Por enquanto, conheça o que vou conseguir fazer nesta área.</p>
    <div className={css.actions}>
     {actions.map(([label,detail])=><button type="button" className={selected===label?css.selected:''} key={label}
      onClick={()=>setSelected(selected===label?'':label)}>
      <Icon name={isCrm?'message-circle':'lightbulb'} size={17}/><span>{label}</span>
     </button>)}
    </div>
    {selected&&<div className={css.description}><strong>{selected}</strong>
      <span>{actions.find(x=>x[0]===selected)?.[1]}. Disponível após conectarmos a MIA com as permissões adequadas.</span></div>}
   </div>
   <footer className={css.footer}><span>Em preparação · Nenhuma mensagem é enviada</span>
    <div className={css.compose}><input aria-label="Pergunte à MIA (em breve)" placeholder="Pergunte à MIA..." disabled />
     <button disabled aria-label="Enviar pergunta"><Icon name="arrow-up" size={18}/></button></div>
   </footer>
  </section>}
 </>;
}
