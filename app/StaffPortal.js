'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './ui/Icon';
import styles from './staff-portal.module.css';
import { DEMO_SCOPES, DEMO_CONTACTS, demoConversationDetail } from './lib/crm-portal-demo.mjs';

const SECTORS = {
  comercial_vital:'Comercial Vital',atacado:'Atacado',pos_venda:'Pós-venda',
  vtx:'VTX Fitness',bluetti:'Bluetti',afiliados:'Afiliados TikTok',
};

function displayDate(value){
  const time=Date.parse(value||'');
  return Number.isFinite(time)
    ? new Date(time).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
    : 'Sem data';
}
async function staffGet(url,token) {
  const result=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const payload=await result.json().catch(()=>({}));
  if(!result.ok) throw new Error(payload.error || 'Não foi possível consultar o atendimento.');
  return payload;
}
export default function StaffPortal({token,onLogout,demo=false}){
  const [demoScope,setDemoScope]=useState('pos_venda');
  const [profile,setProfile]=useState(null);
  const [contacts,setContacts]=useState(demo ? DEMO_CONTACTS : []);
  const [selected,setSelected]=useState(null);
  const [detail,setDetail]=useState(null);
  const [page,setPage]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(!demo);
  const [detailLoading,setDetailLoading]=useState(false);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('all');
  const [revision,setRevision]=useState(0);

  const load=useCallback(async()=>{
    if(demo)return;
    let active=true;
    setLoading(true);setError('');
    try{
      const [me,conversations]=await Promise.all([
        staffGet('/api/crm/my-access',token),
        staffGet('/api/crm/staff/conversations?page='+page,token),
      ]);
      if(!me.portalEnabled)throw new Error('O atendimento restrito ainda não está habilitado.');
      if(active){
        setProfile(me);
        setContacts(conversations.conversations||[]);
        setHasMore(Boolean(conversations.hasMore));
      }
    }catch(e){if(active)setError(e.message);}
    finally{if(active)setLoading(false);}
    return()=>{active=false;};
  },[token,page,revision,demo]);
  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    if(!selected){setDetail(null);return;}
    if(demo){setDetail(demoConversationDetail(demoScope,selected));setDetailLoading(false);return;}
    let active=true;
    setDetailLoading(true);setDetail(null);
    staffGet('/api/crm/staff/conversations?contact='+encodeURIComponent(selected),token)
      .then(value=>{if(active)setDetail(value);})
      .catch(e=>{if(active){setError(e.message);setSelected(null);}})
      .finally(()=>{if(active)setDetailLoading(false);});
    return()=>{active=false;};
  },[selected,token,revision,demo,demoScope]);

  const allowed=demo ? DEMO_SCOPES[demoScope].sectors : (profile?.sectors||[]);
  const permitted=demo ? contacts.filter(item=>allowed.includes(item.sector)) : contacts;
  const displayed=filter==='all'?permitted:permitted.filter(item=>item.sector===filter);

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src="/brand/tideplace-mark.svg" alt="" />
        <div><strong>TIDEPLACE</strong><span>Vital Decor · Atendimento</span></div>
      </div>
      <div className={styles.navHeading}>MEU ESPAÇO</div>
      <div className={styles.navActive}><Icon name="inbox" size={18}/> Minhas conversas</div>
      <div className={styles.navInfo}><Icon name="shield" size={18}/> Acesso por setor</div>
      <div className={styles.sidebarBottom}>
        <span>{demo?'Ambiente fictício · sem acesso real':'CRM restrito · Vital Decor'}</span>
        {demo ? <a className={styles.backLink} href="/crm">Voltar para o Tide</a>
          : <button type="button" onClick={onLogout}><Icon name="logout" size={17}/> Sair da conta</button>}
      </div>
    </aside>
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>TIDEPLACE / VITAL DECOR</span>
          <h1>Central de atendimento</h1>
          <p>Somente conversas encaminhadas aos seus setores autorizados.</p>
        </div>
        {demo ? <label className={styles.demoRolePicker}>Simular acesso de
          <select value={demoScope} aria-label="Simular funcionário" onChange={event=>{setDemoScope(event.target.value);setSelected(null);setFilter('all');}}>
            {Object.entries(DEMO_SCOPES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}
          </select>
        </label> : <button type="button" onClick={()=>setRevision(n=>n+1)}><Icon name="refresh" size={16}/> Atualizar</button>}
      </header>
      {demo && <div className={styles.demoBanner} role="status"><strong>PRÉVIA INTERATIVA · DADOS FICTÍCIOS</strong>
        <span>Troque o perfil acima para ver como cada funcionário acessa apenas os setores permitidos. Nenhuma conversa ou dado real é consultado.</span></div>}
      <div className={styles.workspace}>
        <section className={styles.listArea} aria-label="Conversas do meu setor">
          <div className={styles.listHeading}>
            <h2>Minhas conversas</h2>
            <span>{loading?'—':displayed.length}</span>
          </div>
          <div className={styles.sectors} aria-label="Setores permitidos">
            <button className={filter==='all'?styles.selectedFilter:''} onClick={()=>setFilter('all')}>Todos</button>
            {allowed.map(sector=><button key={sector} className={filter===sector?styles.selectedFilter:''} onClick={()=>setFilter(sector)}>{SECTORS[sector]||sector}</button>)}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {loading && <p className={styles.empty}>Carregando conversas autorizadas…</p>}
          {!loading && !error && <>
            {!displayed.length && <p className={styles.empty}>Não há conversas atribuídas a estes setores no momento.</p>}
            {displayed.map(item=><button key={item.id} type="button"
              className={[styles.contact,selected===item.id?styles.contactActive:''].join(' ')}
              onClick={()=>{setSelected(item.id);setError('');}}>
              <span className={styles.avatar}>{(item.name||'?').slice(0,1).toUpperCase()}</span>
              <span className={styles.contactDetails}>
                <strong>{item.name}</strong>
                <small>{SECTORS[item.sector]||item.sector} · {displayDate(item.updatedAt)}</small>
                <span>{item.preview||'Sem prévia de mensagem'}</span>
              </span>
              <Icon name="chevronRight" size={16}/>
            </button>)}
            {!demo && <div className={styles.pageControls}>
              <button disabled={!page} onClick={()=>{setPage(n=>Math.max(0,n-1));setSelected(null);}}>Anterior</button>
              <span>Página {page+1}</span>
              <button disabled={!hasMore} onClick={()=>{setPage(n=>n+1);setSelected(null);}}>Próxima</button>
            </div>}
          </>}
        </section>
        <section className={styles.conversation} aria-label="Histórico da conversa selecionada">
          {!selected && <div className={styles.intro}>
            <Icon name="chat" size={32}/>
            <h2>Selecione uma conversa</h2>
            <p>Você verá somente o histórico dos atendimentos atribuídos a um dos seus setores.</p>
          </div>}
          {selected && <>
            <div className={styles.conversationHeader}>
              <div><h2>{detail?.contact?.name||'Conversa'}</h2><p>{detail?.contact?.phone||''} {detail?.contact?.sector ? '· '+(SECTORS[detail.contact.sector]||detail.contact.sector):''}</p></div>
              <button onClick={()=>setSelected(null)} aria-label="Fechar conversa"><Icon name="close" size={18}/></button>
            </div>
            {detailLoading && <p className={styles.empty}>Verificando setor e carregando histórico…</p>}
            {detail && <div className={styles.timeline}>
              {detail.messages.map(message=><article key={message.id} className={message.direction==='outbound'?styles.sent:styles.received}>
                <p>{message.body||'['+(message.type||'Mídia')+']'}</p>
                <time>{displayDate(message.date)}</time>
              </article>)}
              {!detail.messages.length && <p className={styles.empty}>Nenhuma mensagem registrada.</p>}
            </div>}
            <div className={styles.readOnly}>
              <Icon name="shield" size={15}/> {demo ? 'Demonstração: não envia mensagens nem altera atendimentos.' : 'Histórico em modo de leitura nesta fase. As respostas serão habilitadas somente após os testes de permissões de envio.'}
            </div>
          </>}
        </section>
      </div>
    </main>
  </div>;
}
