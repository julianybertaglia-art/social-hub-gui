'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from './ui/Icon';
import {api} from './operations/useOperations';
import {VITAL_TEAM_QUEUE_PLAN} from './lib/vital-crm-queues.mjs';
import styles from './vital-crm-team.module.css';

const PLANNED_TEAM=Object.entries(VITAL_TEAM_QUEUE_PLAN).map(([name,plan])=>({name,...plan}));

export default function VitalCRMTeam(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busy,setBusy]=useState('');
 async function refresh(){
  setError('');setLoading(true);
  try{setData(await api('/api/crm/vital/team'));}
  catch(e){setError(e.message);}
  finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[]);
 async function toggle(email,queue,enabled){
  const key=email+':'+queue;setBusy(key);setError('');setNotice('');
  try{
   await api('/api/crm/vital/team',{method:'PATCH',
     body:JSON.stringify({email,queue,enabled})});
   setData(previous=>({...previous,drafts:previous.drafts.map(d=>d.email===email
     ? {...d,plannedQueues:enabled?[...d.plannedQueues,queue]:
       d.plannedQueues.filter(x=>x!==queue)}:d)}));
   setNotice('Rascunho atualizado. Nenhum funcionário recebeu acesso ainda.');
  }catch(e){setError(e.message);}
  finally{setBusy('')}
 }
 async function toggleTransfer(email,enabled){
  const key=email+':transfer';setBusy(key);setError('');setNotice('');
  try{
   await api('/api/crm/vital/team',{method:'PATCH',body:JSON.stringify({email,canTransfer:enabled})});
   setData(previous=>({...previous,drafts:previous.drafts.map(d=>d.email===email?{...d,canTransfer:enabled}:d)}));
   setNotice('Permissão de transferência salva no rascunho. Nenhum acesso foi concedido.');
  }catch(e){setError(e.message);}
  finally{setBusy('');}
 }
 return <main className={styles.page}>
  <header className={styles.header}>
   <div><span className={styles.eyebrow}>TIDEPLACE / VITAL DECOR / ADMINISTRAÇÃO</span>
    <h1>Equipe e permissões</h1>
    <p>Confira a matriz de permissões e ajuste os rascunhos. Convites, contas e acessos continuam inativos até uma liberação autorizada.</p>
   </div>
   <Link href="/crm/vital" className={styles.back}><Icon name="arrowLeft" size={16}/> Voltar ao CRM</Link>
  </header>
  <section className={styles.warning}>
   <Icon name="shield" size={20}/>
    <div><strong>Acessos ainda não ativados</strong>
    <p>Esta tela altera somente a matriz planejada. Não envia e-mails, não cria logins e não libera conversas.</p>
   </div>
  </section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.success}>{notice}</p>}
  {loading&&<div className={styles.empty}>Consultando configurações protegidas…</div>}
  {data&&<>
   <section className={styles.cards} aria-label="Matriz solicitada de equipe">
    {PLANNED_TEAM.map(person=><article key={person.name} className={styles.employee}>
     <div className={styles.employeeHeading}><span className={styles.avatar}>{person.name.slice(0,1)}</span>
      <div><h2>{person.name}</h2><p>{person.role}</p></div><span className={styles.draftTag}>Planejamento</span></div>
     <h3>Filas previstas</h3><div className={styles.queueList}>
      {data.queues.filter(queue=>person.queues.includes(queue.queue_code)).map(queue=><div key={queue.queue_code} className={styles.queue}>
       <i style={{background:queue.color}} aria-hidden="true"/><span>{queue.display_name}</span>
      </div>)}
     </div>
    </article>)}
   </section>
   <div className={styles.kpis}>
    <div><small>Convites preparados</small><strong>{data.drafts.length}</strong><span>Somente rascunhos</span></div>
    <div><small>Filas organizadas</small><strong>{data.queues.length}</strong><span>Por operação e marketplace</span></div>
    <div><small>Funcionários ativos</small><strong>{data.activeTeam.length}</strong><span>Sem liberação antecipada</span></div>
   </div>
   <section aria-label="Funcionários com acesso ativo">
    <h2>Contas já ativadas</h2>
    {!data.activeTeam.length?<div className={styles.empty}>Nenhuma conta de funcionário está ativa no CRM Vital.</div>:
     <div className={styles.cards}>{data.activeTeam.map((person,index)=><article key={person.displayName+'-'+index} className={styles.employee}>
      <div className={styles.employeeHeading}><span className={styles.avatar}>{person.displayName.slice(0,1)}</span>
       <div><h2>{person.displayName}</h2><p>{person.role==='supervisor'?'Supervisor':'Atendente'} · {person.status==='active'?'Ativo':'Suspenso'}</p></div>
      </div>
      <h3>Filas concedidas</h3>
      <div className={styles.queueList}>{data.queues.filter(queue=>person.assignedQueues.includes(queue.queue_code)).map(queue=><div key={queue.queue_code} className={styles.queue}>
       <i style={{background:queue.color}} aria-hidden="true"/><span>{queue.display_name}</span>
      </div>)}</div>
      <p className={styles.foot}>{person.role==='supervisor'?'Somente leitura':person.canTransfer?'Pode transferir conversas':'Sem permissão de transferência'}</p>
     </article>)}</div>}
   </section>
   <div className={styles.cards}>
    {data.drafts.map(d=><section key={d.email} className={styles.employee}>
     <div className={styles.employeeHeading}>
      <span className={styles.avatar}>{d.display_name.slice(0,1)}</span>
      <div><h2>{d.display_name}</h2><p>{d.email}</p></div>
      <span className={styles.draftTag}>Rascunho</span>
     </div>
     <p className={styles.role}>
      <Icon name={d.requested_role==='supervisor'?'shield':'users'} size={15}/>
      {d.requested_role==='supervisor'?'Supervisão · somente leitura':'Atendimento · responder e transferir'}
     </p>
     <h3>Filas planejadas</h3>
     <div className={styles.queueList}>
      {data.queues.map(q=><label key={q.queue_code} className={styles.queue}>
       <input type="checkbox" checked={d.plannedQueues.includes(q.queue_code)}
        disabled={busy===d.email+':'+q.queue_code}
        onChange={event=>toggle(d.email,q.queue_code,event.target.checked)}/>
       <i style={{background:q.color}} aria-hidden="true"/>
       <span>{q.display_name}</span>
      </label>)}
     </div>
     {d.requested_role==='agent'?<label className={styles.queue}>
      <input type="checkbox" checked={Boolean(d.canTransfer)} disabled={busy===d.email+':transfer'}
       onChange={event=>toggleTransfer(d.email,event.target.checked)}/>
      <Icon name="flow" size={15}/><span>Permitir transferência de conversas</span>
     </label>:<p className={styles.foot}>Supervisão consulta as filas autorizadas, sem responder ou transferir.</p>}
     <div className={styles.foot}><Icon name="info" size={14}/>
      {d.plannedQueues.length} de {data.queues.length} filas · {d.requested_role==='supervisor'?'somente leitura':d.canTransfer?'transferência prevista':'sem transferência prevista'}
     </div>
    </section>)}
   </div>
  </>}
 </main>;
}
