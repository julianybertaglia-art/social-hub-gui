'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Icon from './ui/Icon';
import {api} from './operations/useOperations';
import styles from './vital-crm-team.module.css';

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
 return <main className={styles.page}>
  <header className={styles.header}>
   <div><span className={styles.eyebrow}>TIDEPLACE / VITAL DECOR / ADMINISTRAÇÃO</span>
    <h1>Equipe e permissões</h1>
    <p>Confira a organização dos setores e convites planejados. A edição e ativação de funcionários só serão liberadas após os testes reais.</p>
   </div>
   <Link href="/crm/vital" className={styles.back}><Icon name="arrowLeft" size={16}/> Voltar ao CRM</Link>
  </header>
  <section className={styles.warning}>
   <Icon name="shield" size={20}/>
   <div><strong>Acessos ainda não ativados</strong>
    <p>Esta tela salva somente os rascunhos de convite. Não envia e-mails, não cria novos logins e não libera conversas.</p>
   </div>
  </section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.success}>{notice}</p>}
  {loading&&<div className={styles.empty}>Consultando configurações protegidas…</div>}
  {data&&<>
   <div className={styles.kpis}>
    <div><small>Convites preparados</small><strong>{data.drafts.length}</strong><span>Somente rascunhos</span></div>
    <div><small>Filas organizadas</small><strong>{data.queues.length}</strong><span>Por operação e marketplace</span></div>
    <div><small>Atendentes ativos</small><strong>{data.activeTeam.length}</strong><span>Sem liberação antecipada</span></div>
   </div>
   <div className={styles.cards}>
    {data.drafts.map(d=><section key={d.email} className={styles.employee}>
     <div className={styles.employeeHeading}>
      <span className={styles.avatar}>{d.display_name.slice(0,1)}</span>
      <div><h2>{d.display_name}</h2><p>{d.email}</p></div>
      <span className={styles.draftTag}>Rascunho</span>
     </div>
     <p className={styles.role}>
      <Icon name={d.requested_role==='supervisor'?'shield':'users'} size={15}/>
      {d.requested_role==='supervisor'?'Supervisão · visualizar e transferir':'Atendimento · responder e transferir'}
     </p>
     <h3>Filas planejadas</h3>
     <div className={styles.queueList}>
      {data.queues.map(q=><label key={q.queue_code} className={styles.queue}>
       <input type="checkbox" checked={d.plannedQueues.includes(q.queue_code)}
        disabled={true}
        onChange={event=>toggle(d.email,q.queue_code,event.target.checked)}/>
       <i style={{background:q.color}} aria-hidden="true"/>
       <span>{q.display_name}</span>
      </label>)}
     </div>
     <div className={styles.foot}><Icon name="info" size={14}/>
      {d.plannedQueues.length} de {data.queues.length} filas selecionadas
     </div>
    </section>)}
   </div>
  </>}
 </main>;
}
