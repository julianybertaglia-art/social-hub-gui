'use client';

import Link from 'next/link';
import {useState} from 'react';
import {supabase,useAccessScope} from '../CloudGate';
import VitalCRMReal from '../VitalCRMReal';
import styles from './equipe.module.css';

const QUEUE_NAMES={
  varejo_nv:'Varejo Nuvemshop',
  pos_nv:'Pós-venda Nuvemshop',
  afiliados:'Afiliados TikTok Shop',
  pos_shopee:'Pós-venda Shopee',
  pos_tiktok:'Pós-venda TikTok Shop',
  atacado:'Atacado',
  vtx:'VTX Fitness',
  bluetti:'Bluetti',
  pos_ml:'Pós-venda Mercado Livre',
};
const TEAM_ROLES={owner:'Administração',agent:'Atendimento',supervisor:'Supervisão'};

export default function EquipePage(){
  const access=useAccessScope();
  const [leaving,setLeaving]=useState(false);

  // Never treat the client page as a security boundary: every CRM API checks
  // the Supabase identity, organization, role and authorized queues again.
  if(access?.scope!=='staff'&&access?.scope!=='admin'){
    return <main className={styles.denied}>
      <img src="/brand/tideplace-mark.svg" alt="" />
      <h1>Área reservada à equipe Vital Decor</h1>
      <p>Entre com uma conta de membro autorizada pela administração.</p>
      <Link href="/">Voltar ao TidePlace</Link>
    </main>;
  }

  const isAdmin=access.scope==='admin';
  const queueCodes=Array.isArray(access.queueCodes)?access.queueCodes:[];
  const readOnly=access.role==='supervisor';
  async function signOut(){
    if(leaving||!supabase)return;
    setLeaving(true);
    try{await supabase.auth.signOut();}
    finally{setLeaving(false);}
  }

  return <main className={styles.portal}>
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img src="/brand/tideplace-mark.svg" alt="" />
        <span><strong>TIDEPLACE</strong><small>VITAL DECOR / EQUIPE</small></span>
      </div>
      <div className={styles.identity}>
        <span className={styles.avatar}>{String(access.displayName||'E').slice(0,1).toUpperCase()}</span>
        <span className={styles.profile}><strong>{access.displayName||'Equipe Vital Decor'}</strong><small>{TEAM_ROLES[access.role]||'Equipe'}</small></span>
        {isAdmin&&<Link className={styles.backLink} href="/crm/vital">Painel completo</Link>}
        <button className={styles.signOut} type="button" disabled={leaving} onClick={signOut}>{leaving?'Saindo…':'Sair'}</button>
      </div>
    </header>
    <section className={styles.welcome}>
      <div>
        <span className={styles.eyebrow}>CENTRAL DE ATENDIMENTO</span>
        <h1>Olá, {access.displayName||'equipe'}.</h1>
        <p>{readOnly
          ?'Acompanhe os atendimentos e indicadores das filas autorizadas, sem modificar conversas.'
          :isAdmin
            ?'Acompanhe toda a operação da Vital Decor e as filas da equipe.'
            :'Consulte e acompanhe os atendimentos atribuídos aos seus setores.'}</p>
      </div>
      <div className={styles.permissions}>
        <span className={styles.roleBadge}>{readOnly?'Somente leitura':isAdmin?'Visão geral':'Filas autorizadas'}</span>
        {!isAdmin&&<div className={styles.queueList} aria-label="Setores permitidos">
          {queueCodes.map(code=><span key={code}>{QUEUE_NAMES[code]||code}</span>)}
        </div>}
      </div>
    </section>
    <section className={styles.crm} aria-label="CRM da equipe Vital Decor">
      <VitalCRMReal embedded/>
    </section>
    <footer className={styles.footer}>As permissões são verificadas novamente no servidor em cada consulta e operação.</footer>
  </main>;
}
