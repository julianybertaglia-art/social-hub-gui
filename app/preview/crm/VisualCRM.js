'use client';

import {useEffect,useRef,useState} from 'react';
import Icon from '../../ui/Icon';
import styles from './visual.module.css';
import {canViewDemoConversation,canReplyDemo,canChangeDemoStatus,canTransferDemo,changeDemoStatus,transferDemoConversation,countDemoConversations,DEMO_STATUS,demoMiaReply} from './demo-operations.mjs';

const USERS=[
 {name:'Juliany',role:'Administradora',description:'Acesso a todas as filas',queues:null},
 {name:'Andrey',role:'Atendente',description:'Pós-venda Shopee, TikTok e Mercado Livre',queues:['pos_shopee','pos_tiktok','pos_ml']},
 {name:'Vitor',role:'Atendente',description:'Atacado, Bluetti e VTX',queues:['atacado','bluetti','vtx']},
 {name:'Guilherme',role:'Supervisor',description:'Visão das nove filas',queues:null}
];
const QUEUES=[
 {code:'varejo_nv',name:'Varejo Nuvemshop',owner:'Juliany'},
 {code:'pos_nv',name:'Pós-venda Nuvemshop',owner:'Juliany'},
 {code:'afiliados',name:'Afiliados TikTok Shop',owner:'Juliany'},
 {code:'pos_shopee',name:'Pós-venda Shopee',owner:'Andrey'},
 {code:'pos_tiktok',name:'Pós-venda TikTok Shop',owner:'Andrey'},
 {code:'atacado',name:'Atacado',owner:'Vitor'},
 {code:'vtx',name:'VTX Fitness',owner:'Vitor'},
 {code:'bluetti',name:'Bluetti',owner:'Vitor'},
 {code:'pos_ml',name:'Pós-venda Mercado Livre',owner:'Andrey'}
];
const DEMOS=[
 {id:'a',name:'Cliente exemplo A',queue:'varejo_nv',status:'Aguardando',last:'Gostaria de saber os modelos disponíveis',when:'10:42',
  messages:[['in','Olá! Gostaria de saber os modelos de jardim vertical.','10:39'],['out','Olá! Posso te ajudar com os modelos e medidas.','10:40'],['in','Vocês entregam em São Paulo?','10:42']]},
 {id:'b',name:'Cliente exemplo B',queue:'pos_shopee',status:'Em andamento',last:'Meu pedido já foi enviado?',when:'10:24',
  messages:[['in','Bom dia! Meu pedido já foi enviado?','10:24']]},
 {id:'c',name:'Cliente exemplo C',queue:'bluetti',status:'Aguardando',last:'Gostaria de receber informações sobre a Bluetti',when:'09:57',
  messages:[['in','Olá, gostaria de mais informações sobre a Bluetti.','09:57']]},
 {id:'d',name:'Cliente exemplo D',queue:'pos_tiktok',status:'Concluído',last:'Muito obrigada pelo atendimento!',when:'Ontem',
  messages:[['in','Preciso acompanhar meu envio.','Ontem'],['out','Vou te orientar sobre o rastreamento.','Ontem'],['in','Muito obrigada pelo atendimento!','Ontem']]},
 {id:'e',name:'Cliente exemplo E',queue:'atacado',status:'Aguardando',last:'Vocês trabalham com caixa fechada?',when:'Ontem',
  messages:[['in','Vocês trabalham com caixa fechada?','Ontem']]},
 {id:'f',name:'Cliente exemplo F',queue:'pos_ml',status:'Em andamento',last:'Pode verificar a entrega?',when:'Segunda',
  messages:[['in','Pode verificar a entrega?','Segunda']]}
];
const MIA_INTROS={
 'Resumir atendimento':'Resumo ilustrativo: o cliente perguntou sobre disponibilidade e entrega. A próxima ação é confirmar o modelo e consultar as condições de envio.',
 'Sugerir resposta':'Olá! Obrigada pelo contato com a Vital Decor. Você pode me informar qual produto deseja e seu CEP? Assim conseguimos orientar melhor sua compra.',
 'Próxima ação':'Sugestão: confirmar o produto, registrar a dúvida e definir o responsável pela resposta antes do próximo contato.',
 'Consultar indicadores':'Nesta demonstração, os indicadores são fictícios. No CRM real, a MIA usará somente as informações permitidas para seu perfil.'
};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const qName=id=>QUEUES.find(x=>x.code===id)?.name||'Sem setor';

export default function VisualCRM(){
 const [view,setView]=useState('Atendimentos');
 const [person,setPerson]=useState('Juliany');
 const [dark,setDark]=useState(false);
 const [selected,setSelected]=useState('a');
 const [filter,setFilter]=useState('Todas as filas');
 const [search,setSearch]=useState('');
 const [percent,setPercent]=useState(35);
 const [height,setHeight]=useState(590);
 const [draft,setDraft]=useState('');
 const [sampleMessages,setSampleMessages]=useState({});
 const [demoConversations,setDemoConversations]=useState(DEMOS);
 const [actionNotice,setActionNotice]=useState('');
 const [miaOpen,setMiaOpen]=useState(false);
 const [miaDraft,setMiaDraft]=useState('');
 const [miaMessages,setMiaMessages]=useState([]);
 const [notes,setNotes]=useState([]);
 const [noteText,setNoteText]=useState('');
 const boardRef=useRef(null);
 const frameRef=useRef(null);
 const msgRef=useRef(null);
 const profile=USERS.find(x=>x.name===person)||USERS[0];
 const allowed=demoConversations.filter(c=>canViewDemoConversation(profile,c));
 const counts=countDemoConversations(profile,demoConversations);
 const conversations=allowed.filter(c=>(filter==='Todas as filas'||c.queue===filter) && (c.name+' '+c.last+' '+qName(c.queue)).toLowerCase().includes(search.toLowerCase()));
 const current=conversations.find(x=>x.id===selected)||conversations[0]||null;
 const visibleMsgs=current?[...current.messages,...(sampleMessages[current.id]||[])]:[];
 const isSupervisor=profile.role==='Supervisor';
 function updateStatus(nextStatus){
  if(!current)return;
  try{
   const updated=changeDemoStatus(profile,current,nextStatus);
   setDemoConversations(previous=>previous.map(item=>item.id===updated.id?updated:item));
   setActionNotice('Status atualizado somente na demonstração.');
  }catch(error){setActionNotice(error.message);}
 }
 function transferTo(nextQueue){
  if(!current)return;
  try{
   const updated=transferDemoConversation(profile,current,nextQueue,QUEUES.map(queue=>queue.code));
   setDemoConversations(previous=>previous.map(item=>item.id===updated.id?updated:item));
   setActionNotice('Atendimento encaminhado somente na demonstração.');
  }catch(error){setActionNotice(error.message);}
 }

 useEffect(()=>{if(msgRef.current)msgRef.current.scrollTop=msgRef.current.scrollHeight},[current?.id,visibleMsgs.length]);
 useEffect(()=>{
  try{
   const l=Number(localStorage.getItem('tide-demo-width'));
   const h=Number(localStorage.getItem('tide-demo-height'));
   if(l>=25&&l<=70)setPercent(l);
   if(h>=440&&h<=950)setHeight(h);
  }catch{}
 },[]);
 function changeWidth(v){const n=clamp(Math.round(v),25,70);setPercent(n);try{localStorage.setItem('tide-demo-width',String(n))}catch{}}
 function changeHeight(v){const n=clamp(Math.round(v),440,950);setHeight(n);try{localStorage.setItem('tide-demo-height',String(n))}catch{}}
 function onWidthMove(e){
   if(!e.currentTarget.hasPointerCapture(e.pointerId)||!boardRef.current)return;
   const b=boardRef.current.getBoundingClientRect();
   changeWidth((e.clientX-b.left)/b.width*100);
 }
 function onHeightMove(e){
   if(!e.currentTarget.hasPointerCapture(e.pointerId)||!frameRef.current)return;
   const b=frameRef.current.getBoundingClientRect();
   changeHeight(e.clientY-b.top-26);
 }
 function sendDemo(e){
  e?.preventDefault?.();if(!draft.trim()||!current||!canReplyDemo(profile,current))return;
  setSampleMessages(m=>({...m,[current.id]:[...(m[current.id]||[]),['out',draft.trim(),'Agora']]}));
  setDraft('');
  setActionNotice('Resposta adicionada somente ao histórico fictício.');
  if(current.status==='Aguardando')updateStatus('Em andamento');
 }
 function onEnter(e){if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent?.isComposing){e.preventDefault();sendDemo(e)}}
 function miaReply(action){
  const prompt=action||miaDraft.trim();if(!prompt)return;
  const answer=demoMiaReply({action:Object.hasOwn(MIA_INTROS,prompt)?prompt:'chat',conversation:current,messages:visibleMsgs,counts});
  setMiaMessages(m=>[...m,{from:'user',text:prompt},{from:'mia',text:answer}]);
  setMiaDraft('');
 }
 function insertSuggestion(){
  const last=[...miaMessages].reverse().find(x=>x.from==='mia');
  if(last&&current&&canReplyDemo(profile,current)){setView('Atendimentos');setDraft(last.text);setMiaOpen(false)}
 }
 return <div className={styles.root} data-theme={dark?'dark':'light'}>
  <aside className={styles.sidebar}>
   <div className={styles.brand}>
    <img src="/brand/tideplace-mark.svg" width="41" height="41" alt="TidePlace"/>
    <div><strong>TIDEPLACE</strong><span>Flow with your audience.</span></div>
   </div>
   <div className={styles.areaTitle}>AMBIENTE DEMONSTRATIVO</div>
   <div className={styles.workspace}><span className={styles.storeInitial}>V</span><div><strong>Vital Decor</strong><small>Central de CRM</small></div><Icon name="chevronDown" size={15}/></div>
   <div className={styles.navGroup}>VISÃO GERAL</div>
   {[
    ['Dashboard','chart'],['Atendimentos','inbox'],['Equipe e permissões','users']
   ].map(([name,icon])=><button key={name} className={view===name?styles.navActive:styles.navItem} onClick={()=>setView(name)}><Icon name={icon} size={18}/>{name}</button>)}
   <div className={styles.navGroup}>ASSISTENTE</div>
   <button className={styles.navItem} onClick={()=>setMiaOpen(true)}><Icon name="sparkle" size={18}/> MIA · Assistente IA</button>
   <div className={styles.sideBottom}><div className={styles.personBadge}>{person.charAt(0)}</div><div><strong>{person}</strong><small>{profile.role} · simulação</small></div></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.topbar}>
     <div className={styles.bread}>TidePlace <Icon name="chevronRight" size={15}/> CRM <Icon name="chevronRight" size={15}/><strong>{view}</strong></div>
     <div className={styles.topActions}>
      <button className={styles.themeButton} onClick={()=>setDark(x=>!x)} title="Alternar tema"><Icon name="palette" size={17}/>{dark?'Tema escuro':'Tema claro'}</button>
      <label className={styles.profileSelector}><span>Visualizar como</span><select value={person} onChange={e=>{setPerson(e.target.value);setFilter('Todas as filas');setSelected('');setMiaMessages([]);setMiaDraft('');setDraft('');setActionNotice('')}}>{USERS.map(x=><option key={x.name}>{x.name}</option>)}</select></label>
     </div>
   </header>
   <div className={styles.content}>
    <div className={styles.notice}><Icon name="info" size={17}/><p><strong>Prévia visual interativa.</strong> Dados, conversas e respostas da MIA são exemplos. Nenhum WhatsApp, Supabase ou Gemini é acessado nesta página.</p><span>VERSÃO DE TESTE</span></div>
    <div className={styles.heading}>
      <div><div className={styles.eyebrow}>VITAL DECOR · CENTRAL OPERACIONAL</div><h1>{view}</h1><p>{view==='Atendimentos'?'Uma experiência de atendimento inspirada no WhatsApp Web.':view==='Dashboard'?'Acompanhe a operação de cada setor em um só lugar.':'Cada colaborador vê apenas o que seu perfil permite.'}</p></div>
      <span className={styles.modeTag}><span/> {profile.role}</span>
    </div>
    {view==='Atendimentos'&&<>
     <div className={styles.kpis}>
       <div><span>Conversas na tela</span><strong>{counts.total}</strong></div>
       <div><span>Aguardando resposta</span><strong>{counts.pending}</strong></div>
       <div><span>Em andamento</span><strong>{counts.active}</strong></div>
       <div><span>Concluídas</span><strong>{counts.resolved}</strong></div>
     </div>
     <div className={styles.boardFrame} ref={frameRef}>
      <div ref={boardRef} className={styles.board} style={{'--split':percent+'%','--board-height':height+'px'}}>
       <section className={styles.contactsPanel}>
        <div className={styles.listTitle}><h2>Conversas</h2><span>{conversations.length} resultados</span></div>
        <input className={styles.search} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar contato ou assunto..."/>
        <div className={styles.selectRow}>
         <select aria-label="Filtro de fila" value={filter} onChange={e=>{setFilter(e.target.value);setSelected('')}}><option>Todas as filas</option>{QUEUES.filter(q=>!profile.queues||profile.queues.includes(q.code)).map(q=><option key={q.code} value={q.code}>{q.name}</option>)}</select>
        </div>
        <div className={styles.contactScroll}>{conversations.map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className={current?.id===c.id?styles.contactActive:styles.contact}>
          <div className={styles.avatar}>{c.name.slice(-1)}</div>
          <div className={styles.contactText}><div><strong>{c.name}</strong><time>{c.when}</time></div><small>{qName(c.queue)}</small><p>{c.last}</p></div>
        </button>)}{!conversations.length&&<p className={styles.empty}>Nenhuma conversa nesta seleção.</p>}</div>
       </section>
       <div className={styles.divider} role="separator" tabIndex={0} aria-label="Arraste para ajustar largura" title="Arraste para ajustar a largura das colunas"
         onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={onWidthMove}
         onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();changeWidth(percent+(e.key==='ArrowRight'?2:-2))}}}
         onDoubleClick={()=>changeWidth(35)}><span>↔</span></div>
       <section className={styles.chatPanel}>
        {current?<><div className={styles.chatHeader}><div className={styles.avatar}>{current.name.slice(-1)}</div><div><strong>{current.name}</strong><span>{qName(current.queue)} · {current.status}</span></div><button title="Abrir MIA" onClick={()=>setMiaOpen(true)}><Icon name="sparkle" size={18}/></button></div>
          <div className={styles.demoControls}>
           <label>Status <select aria-label="Status fictício do atendimento" value={current.status} disabled={!canChangeDemoStatus(profile,current)} onChange={event=>updateStatus(event.target.value)}>
             {DEMO_STATUS.map(status=><option key={status}>{status}</option>)}
           </select></label>
           {canTransferDemo(profile,current)&&<label>Encaminhar para <select aria-label="Setor de destino fictício" value={current.queue} onChange={event=>transferTo(event.target.value)}>
             {QUEUES.map(queue=><option key={queue.code} value={queue.code}>{queue.name}</option>)}
           </select></label>}
           <span role="status" aria-live="polite">{actionNotice||'Mudanças apenas nesta demonstração'}</span>
          </div>
          <div className={styles.chatMessages} ref={msgRef}>{visibleMsgs.map((m,i)=><div key={i} className={m[0]==='out'?styles.sent:styles.received}><p>{m[1]}</p><time>{m[2]}</time></div>)}</div>
          <details className={styles.contactDetails}><summary><Icon name="info" size={15}/> Informações do atendimento · Observações internas <span>⌄</span></summary>
           <div className={styles.detailInner}><p><strong>Fila:</strong> {qName(current.queue)} · <strong>Responsável:</strong> {QUEUES.find(x=>x.code===current.queue)?.owner}</p><p><strong>Status:</strong> {current.status}</p>
            <div className={styles.noteList}>{notes.filter(x=>x.id===current.id).map((x,i)=><p key={i}>{x.text}</p>)}</div>
            {!isSupervisor&&<form onSubmit={e=>{e.preventDefault();if(noteText.trim()){setNotes(n=>[...n,{id:current.id,text:noteText}]);setNoteText('')}}}>
              <input placeholder="Adicionar nota interna de exemplo" maxLength={500} value={noteText} onChange={e=>setNoteText(e.target.value)}/><button type="submit">Salvar</button></form>}
           </div>
          </details>
          {isSupervisor?<div className={styles.supervisor}>Perfil supervisor: consulta sem envio de mensagens.</div>:<form className={styles.compose} onSubmit={sendDemo}><textarea rows={2} placeholder="Digite uma mensagem..." value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={onEnter}/><button disabled={!draft.trim()} title="Enviar mensagem de exemplo"><Icon name="send" size={20}/></button><small>Enter envia · Shift + Enter quebra linha · demonstração sem envio real</small></form>}
        </>:<div className={styles.blank}>Selecione uma conversa para visualizar o histórico.</div>}
       </section>
      </div>
      <div className={styles.heightDrag} title="Arraste para ajustar a altura do chat"
       onPointerDown={e=>e.currentTarget.setPointerCapture(e.pointerId)}
       onPointerMove={onHeightMove} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();changeHeight(height+(e.key==='ArrowDown'?30:-30))}}}
       tabIndex={0} role="separator" aria-label="Arraste para ajustar a altura"
       onDoubleClick={()=>changeHeight(590)}><span>↕</span></div>
     </div>
    </>}
    {view==='Dashboard'&&<div className={styles.dashboard}>
       <div className={styles.kpis}><div><span>Conversas da amostra</span><strong>{counts.total}</strong></div><div><span>Filas permitidas</span><strong>{profile.queues?.length||9}</strong></div><div><span>Aguardando</span><strong>{counts.pending}</strong></div><div><span>Resolvidas</span><strong>{counts.resolved}</strong></div></div>
       <div className={styles.dashCards}><div><h2>Atendimentos por setor</h2><p>Indicadores apenas ilustrativos</p>{QUEUES.filter(q=>!profile.queues||profile.queues.includes(q.code)).map((q,i)=><div className={styles.barRow} key={q.code}><span>{q.name}</span><div><i style={{width:(24+(i*17)%69)+'%'}}/></div></div>)}</div><div><h2>Prioridades de hoje</h2><div className={styles.todo}>Responder novas dúvidas de produtos</div><div className={styles.todo}>Acompanhar pedidos pendentes</div><div className={styles.todo}>Revisar atendimentos em andamento</div><button className={styles.askMia} onClick={()=>setMiaOpen(true)}><Icon name="sparkle" size={16}/> Perguntar à MIA</button></div></div>
      </div>}
    {view==='Equipe e permissões'&&<div className={styles.team}>
      <div className={styles.teamHeading}><h2>Setores e permissões</h2><p>Configuração ilustrativa; logins reais continuam sem ativação nesta prévia.</p></div>
      <div className={styles.teamGrid}>{USERS.map((u,i)=><div key={u.name} className={styles.member}><div className={styles.memberTop}><span className={styles.memberAvatar}>{u.name.slice(0,1)}</span><div><strong>{u.name}</strong><small>{u.role}</small></div><span className={styles.demoRole}>Simulado</span></div><p>{u.description}</p><div className={styles.tags}>{(u.queues||QUEUES.map(x=>x.code)).slice(0,u.role==='Supervisor'?9:5).map(code=><span key={code}>{qName(code)}</span>)}</div></div>)}</div>
      </div>}
    <div className={styles.bottomNote}>PR #74 · Prévia visual do CRM Vital Decor + MIA · Nenhuma alteração no site oficial</div>
   </div>
  </div>
  <button className={styles.miaBubble} title="Abrir assistente MIA (demonstração)" onClick={()=>setMiaOpen(x=>!x)}><img src="/brand/mia-logo.webp" alt="MIA" width="53" height="53"/></button>
  {miaOpen&&<div className={styles.miaPanel}>
   <div className={styles.miaHeader}><img src="/brand/mia-logo.webp" width="42" height="42" alt=""/><div><strong>MIA</strong><small>Sua assistente TidePlace · demonstração</small></div><button title="Fechar MIA" onClick={()=>setMiaOpen(false)}><Icon name="close" size={18}/></button></div>
   <div className={styles.miaContext}>Contexto: {person} · {profile.role} · Vital Decor</div>
   <div className={styles.miaBody}>{!miaMessages.length&&<><h3>Como posso te ajudar?</h3><p>Veja como serão os resumos de atendimento, sugestões de respostas e próximos passos.</p><div className={styles.quick}>{Object.keys(MIA_INTROS).map(a=><button key={a} onClick={()=>miaReply(a)}><Icon name="sparkle" size={15}/>{a}</button>)}</div></>}{miaMessages.map((m,i)=><div key={i} className={m.from==='user'?styles.miaUser:styles.miaAnswer}>{m.text}</div>)}</div>
   <div className={styles.miaFooter}><form onSubmit={e=>{e.preventDefault();miaReply()}}><input value={miaDraft} onChange={e=>setMiaDraft(e.target.value)} placeholder="Pergunte algo à MIA (simulação)"/><button title="Simular resposta"><Icon name="send" size={17}/></button></form>{miaMessages.some(x=>x.from==='mia')&&current&&canReplyDemo(profile,current)&&<button className={styles.useSuggestion} onClick={insertSuggestion}>Inserir última sugestão na conversa</button>}<small>Nesta prévia, respostas são ilustrativas — Gemini ainda não está conectado.</small></div>
  </div>}
 </div>;
}
