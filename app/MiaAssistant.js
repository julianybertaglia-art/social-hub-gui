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
  <img src="/brand/mia-logo.webp" alt="" width={small?43:53} height={small?43:53}/>
 </span>;
}
const socialActions=[
 ['Ideias de conteúdo','Organizar ideias e roteiros para o calendário'],
 ['Calendário','Acompanhar o planejamento de publicações'],
 ['Métricas e metas','Identificar oportunidades nas métricas']
];
const crmActions=[
 ['Resumir atendimento','Organize a situação do contato, histórico relevante, pendências e próximos passos.'],
 ['Sugerir resposta','Prepare uma mensagem cordial, objetiva e pronta para revisão antes do envio.'],
 ['Próxima ação','Defina o encaminhamento adequado, responsável e prazo de acompanhamento.']
];
const GUIDES={
 'Resumir atendimento':'Organize este atendimento em: contexto, solicitação, histórico resumido, pendências, responsável e próxima ação. Não invente fatos. Remova nomes, números e outros dados pessoais antes de compartilhar o conteúdo.',
 'Sugerir resposta':'Crie uma resposta de WhatsApp profissional, acolhedora e breve. Use apenas informações confirmadas, sem prometer prazos ou soluções não validados. A mensagem deve ser revisada antes do envio.',
 'Próxima ação':'Com base no estágio do atendimento, recomende uma próxima ação concreta, o setor responsável e quando acompanhar. Aponte qualquer informação faltante sem presumir decisões.',
 'Ideias de conteúdo':'Sugira ideias de conteúdo úteis para a audiência da marca, com tema, gancho, formato e CTA. Evite promessas exageradas e informações não verificadas.',
 'Calendário':'Organize um calendário editorial com publicações por data, canal, objetivo, responsável e status. Não invente datas de campanhas confirmadas.',
 'Métricas e metas':'Analise os indicadores que eu informar, identifique tendências e proponha hipóteses e próximos testes. Diferencie dados observados de estimativas.'
};
export default function MiaAssistant(){
 const pathname=usePathname();
 const [workspace]=useWorkspace();
 const [open,setOpen]=useState(false);
 const [expanded,setExpanded]=useState(false);
 const [position,setPosition]=useState(null);
 const [selected,setSelected]=useState('');
 const [copyFeedback,setCopyFeedback]=useState('');
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
 useEffect(()=>{setSelected('');setCopyFeedback('');},[pathname,workspace?.id]);
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
 async function copyGuide(){
  if(!selected||!GUIDES[selected])return;
  try{await navigator.clipboard.writeText(GUIDES[selected]);setCopyFeedback('Orientação copiada.');}
  catch{setCopyFeedback('Não foi possível copiar automaticamente neste navegador.');}
 }
 const panelStyle=position&&typeof window!=='undefined'&&window.innerWidth>640?
  {left:clamp(position.x>window.innerWidth/2?position.x-(expanded?520:405):position.x+DEFAULT_SIZE+12,8,window.innerWidth-(expanded?505:385)),top:clamp(position.y-230,8,Math.max(8,window.innerHeight-480))}:undefined;
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
      onClick={()=>setExpanded(v=>!v)}><Icon name={expanded?'columns':'external'} size={17}/></button>
    <button type="button" aria-label="Fechar MIA" onClick={()=>setOpen(false)}><Icon name="close" size={17}/></button>
   </header>
   <div className={css.context}><span className={css.statusDot}/> {brand} · {isCrm?'CRM':'Social Studio'} <span className={css.previewLabel}>Modo guia</span></div>
   <div className={css.body}>
    <div className={css.welcome}>
     <span className={css.eyebrow}>SUA ASSISTENTE NO TIDEPLACE</span>
     <h2>{isCrm?'Mais clareza em cada atendimento.':'Ideias mais organizadas, sem complicação.'}</h2>
     <p>{isCrm?'Use os guias da MIA para organizar atendimentos, respostas e próximas ações.':'Explore orientações para planejar conteúdo e acompanhar resultados.'}</p>
    </div>
    <div className={css.sectionHeading}><strong>Por onde começamos?</strong><span>Escolha uma ação</span></div>
    <div className={css.actions}>
     {actions.map(([label,detail],index)=><button type="button" className={selected===label?css.selected:''} key={label}
       aria-pressed={selected===label} onClick={()=>{setSelected(selected===label?'':label);setCopyFeedback('');}}>
       <span className={css.actionIcon}><Icon name={index===0?'sparkle':index===1?'chat':'check'} size={17}/></span>
       <span className={css.actionText}><strong>{label}</strong><small>{detail}</small></span>
       <Icon name="chevronRight" size={16}/>
      </button>)}
    </div>
    {selected&&<div className={css.description}>
      <strong>{selected}</strong>
      <p>{GUIDES[selected]}</p>
      <button type="button" className={css.copyGuide} onClick={copyGuide}><Icon name="copy" size={15}/> Copiar orientação</button>
      {copyFeedback&&<span className={css.copyFeedback} role="status">{copyFeedback}</span>}
     </div>}
   </div>
   <footer className={css.footer}>
    <div className={css.footerStatus}><Icon name="shield" size={17}/>
     <span><strong>Modo guia, sem acesso aos seus dados</strong> A conexão com a IA e o histórico real ainda não estão ativados.</span>
    </div>
   </footer>
  </section>}
 </>;
}
