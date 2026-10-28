'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useResource } from '../operations/useOperations';
import { crmLane, crmLaneLabel } from '../lib/crm-view.mjs';
import { STAGES } from '../lib/operations.mjs';
import Icon from '../ui/Icon';
import s from './contact-record.module.css';

const ACTIVITY_TABS = [
  ['all', 'Atividades'], ['notes', 'Notas'], ['email', 'E-mails'],
  ['call', 'Ligações'], ['task', 'Tarefas'], ['meeting', 'Reuniões'],
];

function formatDate(value, extended = true) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return 'Não registrado';
  return new Date(time).toLocaleString('pt-BR',
    extended ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'short' });
}

function initials(value) {
  return (value || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function Property({ label, children }) {
  return <div className={s.property}><dt>{label}</dt><dd>{children || 'Não informado'}</dd></div>;
}

function RecordBlock({ title, count, children }) {
  return <section className={s.association}>
    <div className={s.associationHeading}><h3>{title}{typeof count === 'number' && <span> ({count})</span>}</h3></div>
    {children}
  </section>;
}

export default function ContactRecord({ workspace, contact: summary, onBack, onMove, busy }) {
  const gui = workspace.id === 'gui-nonato';
  const [tab, setTab] = useState('all');
  const [overview, setOverview] = useState('overview');
  const [messageFilter, setMessageFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const endpoint = '/api/crm/activities?workspace=' + workspace.id + '&contactId=' + encodeURIComponent(String(summary.id));
  const { data, loading, error } = useResource(endpoint);
  const contact = { ...(data?.contact || {}), ...summary };
  const activities = data?.activities || [];
  const notes = data?.notes || [];
  const name = contact.profile_name || contact.name || contact.phone || 'Contato sem nome';
  const phone = String(contact.phone || '').replace(/\D/g, '');
  const callLink = phone ? 'tel:+' + phone : null;
  const messageList = activities.filter(item => {
    if (messageFilter !== 'all' && item.direction !== messageFilter) return false;
    const text = String(item.body || '') + ' ' + String(item.type || '');
    return !query || text.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'));
  });
  const recentMessages = expanded ? messageList : messageList.slice(0, 18);
  const showTimeline = overview === 'overview' || tab === 'all';
  const showNotes = overview === 'overview' || tab === 'notes';

  async function copyPhone() {
    if (!phone || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return <main className={s.record}>
    <div className={s.breadcrumb}>
      <button type="button" onClick={onBack}><Icon name="arrowLeft" size={17}/> Voltar aos contatos</button>
      <span> / {workspace.name} / Ficha do contato</span>
    </div>
    <div className={s.recordGrid}>
      <aside className={s.left} aria-label="Informações do contato">
        <div className={s.identity}>
          <div className={s.identityTop}>
            <span className={s.avatar}>{initials(name)}</span>
            <div className={s.identityCopy}>
              <span className={s.overline}>CONTATO</span>
              <h1>{name}</h1>
              <p>{gui ? 'CRM comercial' : 'Atendimento Vital Decor'}</p>
            </div>
          </div>
          <div className={s.quickActions}>
            <Link href="/whatsapp" title="Abrir a caixa de entrada" aria-label="Abrir a caixa de entrada"><Icon name="chat" size={19}/><small>WhatsApp</small></Link>
            {callLink
              ? <a href={callLink} title="Ligar para o contato"><Icon name="phone" size={19}/><small>Ligar</small></a>
              : <span className={s.disabledAction}><Icon name="phone" size={19}/><small>Sem nº</small></span>}
            <button onClick={copyPhone} disabled={!phone} title="Copiar telefone"><Icon name="copy" size={19}/><small>{copied ? 'Copiado' : 'Copiar'}</small></button>
          </div>
        </div>

        <details className={s.propertyPanel} open>
          <summary>Sobre este contato <Icon name="chevronDown" size={16}/></summary>
          <dl>
            <Property label="Nome">{name}</Property>
            <Property label="Telefone">{contact.phone || 'Não informado'}</Property>
            <Property label="Canal de origem">{gui ? (contact.source || 'WhatsApp') : 'WhatsApp Vital Decor'}</Property>
            <Property label="Última atividade">{formatDate(contact.last_message_at)}</Property>
            {gui && <Property label="Registrado em">{formatDate(contact.created_at, false)}</Property>}
          </dl>
        </details>

        <details className={s.propertyPanel} open>
          <summary>{gui ? 'Sobre a oportunidade' : 'Sobre o atendimento'} <Icon name="chevronDown" size={16}/></summary>
          <dl>
            <Property label={gui ? 'Etapa atual' : 'Setor'}><span className={s.stagePill}>{crmLaneLabel(crmLane(workspace.id, contact))}</span></Property>
            {!gui && <Property label="Responsável">{contact.assigned_to || 'Não atribuído'}</Property>}
            {gui && <Property label="Etiquetas">{contact.tags?.length ? contact.tags.join(' · ') : 'Nenhuma etiqueta'}</Property>}
          </dl>
          {gui && <label className={s.moveLabel}>Alterar etapa
            <select value={contact.stage || 'Sem etapa'} disabled={busy !== null || loading} onChange={event => onMove(contact, event.target.value)}>
              {!STAGES.includes(contact.stage) && <option value={contact.stage || 'Sem etapa'}>{contact.stage || 'Sem etapa'}</option>}
              {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </label>}
        </details>
      </aside>

      <section className={s.center} aria-label="Atividades e histórico">
        <div className={s.recordTabs} role="tablist" aria-label="Área do contato">
          <button role="tab" aria-selected={overview === 'overview'} className={overview === 'overview' ? s.active : ''} onClick={() => setOverview('overview')}>Visão geral</button>
          <button role="tab" aria-selected={overview === 'activity'} className={overview === 'activity' ? s.active : ''} onClick={() => setOverview('activity')}>Atividades</button>
        </div>

        {overview === 'overview' && <div className={s.overviewStrip}>
          <div><span>Última interação</span><strong>{formatDate(contact.last_message_at, false)}</strong></div>
          <div><span>Mensagens exibidas</span><strong>{loading ? '—' : activities.length}</strong></div>
          <div><span>{gui ? 'Etapa atual' : 'Setor atual'}</span><strong>{crmLaneLabel(crmLane(workspace.id, contact))}</strong></div>
        </div>}

        <div className={s.activityHeader}>
          <h2>{overview === 'overview' ? 'Linha do tempo' : 'Histórico de atividades'}</h2>
          <p>Conversas registradas neste contato, sem misturar as contas.</p>
        </div>

        <nav className={s.activityTabs} aria-label="Filtrar tipos de atividade">
          {ACTIVITY_TABS.map(([key, label]) =>
            <button key={key} type="button" className={tab === key ? s.selected : ''} onClick={() => { setTab(key); setOverview('activity'); }}>{label}</button>
          )}
          
        </nav>

        {(overview === 'overview' || tab === 'all') && <div className={s.activityFilters}>
          <input aria-label="Buscar no histórico" value={query} placeholder="Pesquisar nas mensagens" onChange={e => setQuery(e.target.value)}/>
          <select aria-label="Filtrar sentido das mensagens" value={messageFilter} onChange={e => setMessageFilter(e.target.value)}>
            <option value="all">Todas as mensagens</option>
            <option value="inbound">Recebidas</option>
            <option value="outbound">Enviadas</option>
          </select>
        </div>}

        {error && <div className={s.error} role="alert">{error}</div>}
        {loading && <div className={s.empty}>Carregando o histórico do contato…</div>}

        {!loading && !error && <div className={s.activityBody}>
          {showNotes && notes.length > 0 && <div className={s.noteGroup}>
            <h3>Anotações do contato</h3>
            {notes.map(note => <article className={s.noteCard} key={note.id}>
              <div className={s.noteTitle}><Icon name="idea" size={17}/> Nota registrada <time>{formatDate(note.date, false)}</time></div>
              <p>{note.body}</p>
            </article>)}
          </div>}

          {showTimeline && <>
            <div className={s.groupTitle}><h3>Histórico do WhatsApp</h3><span>{messageList.length} mensagens nesta consulta</span></div>
            {recentMessages.length
              ? <ol className={s.timeline}>
                {recentMessages.map(item => <li key={item.id}>
                  <span className={s.timelineIcon}><Icon name={item.direction === 'inbound' ? 'inbox' : 'send'} size={15}/></span>
                  <article className={s.activityCard}>
                    <div className={s.activityCardTop}>
                      <strong>{item.direction === 'inbound' ? 'Mensagem recebida' : 'Mensagem enviada'}</strong>
                      <time>{formatDate(item.date)}</time>
                    </div>
                    <span className={s.channel}>WhatsApp · {item.type === 'text' ? 'Texto' : item.type || 'Mensagem'}</span>
                    <p>{item.body || 'Mensagem sem conteúdo textual disponível.'}</p>
                  </article>
                </li>)}
              </ol>
              : <div className={s.empty}>Nenhuma mensagem encontrada para estes filtros.</div>}
            {messageList.length > 18 && <button className={s.moreButton} onClick={() => setExpanded(current => !current)}>{expanded ? 'Mostrar menos' : 'Mostrar todas as ' + messageList.length + ' mensagens'}</button>}
            {data?.truncated && <p className={s.limitNote}>Mostrando até 250 mensagens recentes deste contato. O restante continua no atendimento original.</p>}
          </>}

          {overview === 'activity' && tab === 'notes' && !notes.length && <div className={s.empty}>Ainda não há anotações cadastradas para este contato.</div>}
          {overview === 'activity' && !['all', 'notes'].includes(tab) && <div className={s.empty}>
            <strong>{ACTIVITY_TABS.find(([key]) => key === tab)?.[1]} não registrados</strong>
            <p>Esta categoria ainda não possui registros integrados ao TidePlace. Não exibimos atividades fictícias.</p>
          </div>}
        </div>}
      </section>

      <aside className={s.right} aria-label="Associações do contato">
        <RecordBlock title="Empresas" count={data?.companies?.length || 0}>
          <div className={s.noAssociation}><Icon name="users" size={19}/><p>Nenhuma empresa vinculada a este contato.</p><small>Associações de empresas serão adicionadas ao CRM em uma próxima etapa.</small></div>
        </RecordBlock>
        <RecordBlock title="Negócios" count={data?.deals?.length || 0}>
          <div className={s.noAssociation}><Icon name="funnel" size={19}/><p>Nenhum negócio cadastrado como registro separado.</p>
            <small>{gui ? 'A etapa comercial existente permanece disponível no painel do contato.' : 'A Vital continua com sua divisão por setores.'}</small>
          </div>
        </RecordBlock>
        <RecordBlock title="Atendimento" >
          <dl className={s.sideProperties}>
            <Property label="Canal">WhatsApp</Property>
            <Property label={gui ? 'Etapa' : 'Setor'}>{crmLaneLabel(crmLane(workspace.id, contact))}</Property>
            {!gui && <Property label="Atribuído a">{contact.assigned_to || 'Não atribuído'}</Property>}
          </dl>
          <Link href="/whatsapp" className={s.sideLink}>Abrir caixa de entrada <Icon name="arrowRight" size={16}/></Link>
        </RecordBlock>
      </aside>
    </div>
  </main>;
}
