'use client';

import Link from 'next/link';
import { useState } from 'react';
import Icon from '../ui/Icon';
import { TopicFilter, TopicBadge, useConversationTopics } from '../ui/ConversationTopics';
import { resolvedTopic, topicsFor } from '../lib/conversation-topics.mjs';
import { useWorkspace } from '../WorkspaceSwitcher';
import { api, useResource } from '../operations/useOperations';
import { KPI } from '../operations/Charts';
import { STAGES } from '../lib/operations.mjs';
import ContactRecord from './ContactRecord';
import { VitalRoutingOverview } from './VitalRouting';
import { crmContactKey, crmFilter, crmLane, crmLaneLabel, crmLanes } from '../lib/crm-view.mjs';
import s from '../operations/operations.module.css';

function formattedDate(value) {
  const date = Date.parse(value || '');
  return Number.isFinite(date)
    ? new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Não registrada';
}

export default function CRM() {
  const [workspace] = useWorkspace();
  // A workspace change remounts the board, clearing searches and selected records.
  return <Board key={workspace.id} workspace={workspace} />;
}

function Board({ workspace }) {
  const gui = workspace.id === 'gui-nonato';
  const [revision, refresh] = useState(0);
  const [days, setDays] = useState(30);
  const [view, setView] = useState('contacts');
  const [search, setSearch] = useState('');
  const [lane, setLane] = useState('all');
  const [sort, setSort] = useState('recent');
  const [pageSize, setPageSize] = useState(25);
  const [subject, setSubject] = useState('all');
  const subjectStore = useConversationTopics(workspace.id,'whatsapp');
  const [selectedId, setSelectedId] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const { data, loading, error: loadError } = useResource('/api/operations?workspace=' + workspace.id + '&days=' + days, revision);
  const allContacts = data?.contacts || [];
  const contacts = crmFilter(allContacts, workspace.id, { search, lane, sort });
  const subjectCounts = {all:contacts.length};
  for(const topic of topicsFor(workspace.id)) subjectCounts[topic.id]=contacts.filter(contact=>resolvedTopic(workspace.id,contact,subjectStore.assignments)===topic.id).length;
  const subjectContacts = subject==='all' ? contacts : contacts.filter(contact=>resolvedTopic(workspace.id,contact,subjectStore.assignments)===subject);
  const visibleContacts = subjectContacts.slice(0, pageSize);
  const columns = crmLanes(workspace.id, allContacts);
  const selected = allContacts.find(c => crmContactKey(workspace.id, c) === selectedId) || selectedContact;

  async function move(contact, stage) {
    if (!gui || busy !== null) return;
    setBusy(contact.id);
    setError('');
    try {
      await api('/api/operations', {
        method: 'PATCH',
        body: JSON.stringify({ workspace: workspace.id, id: contact.id, stage, updatedAt: contact.updated_at }),
      });
      refresh(current => current + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function openContact(contact) {
    setSelectedContact(contact);
    setSelectedId(crmContactKey(workspace.id, contact));
  }

  if (selected) return <ContactRecord
    key={crmContactKey(workspace.id, selected)}
    workspace={workspace}
    contact={selected}
    onBack={() => { setSelectedId(null); setSelectedContact(null); }}
    onMove={move}
    busy={busy}
    subject={resolvedTopic(workspace.id,selected,subjectStore.assignments)}
    onSaveSubject={next=>subjectStore.save(selected.id,next)}
    subjectSaving={subjectStore.saving}
    onAssigned={() => refresh(current => current + 1)}
  />;

  return (
    <main className={s.surface}>
      <div className={s.crmDashboard}>
        <header className={s.crmTop}>
          <div>
            <span className={s.eyebrow}>CRM / {workspace.name.toUpperCase()}</span>
            <h1>Relacionamento</h1>
            <p className={s.muted}>Contatos, oportunidades e atendimentos de {workspace.name}, em um só lugar.</p>
          </div>
          <Link href="/whatsapp" className={s.primary}><Icon name="chat" size={18}/> Caixa de entrada</Link>
        </header>

        <div className={s.crmWorkspaceLayout}>
          <section className={s.crmMainColumn} aria-label="Contatos e oportunidades">
            <div className={s.crmMainHead}>
              <div>
                <span className={s.crmSectionEyebrow}>GESTÃO DE CLIENTES</span>
                <h2>{gui ? 'Contatos e oportunidades' : 'Contatos e atendimentos'}</h2>
              </div>
              <span className={s.crmCount}>{allContacts.length} contatos</span>
            </div>

            <div className={s.crmTabs} role="tablist" aria-label="Visualizações do CRM">
              <button role="tab" aria-selected={view === 'contacts'} className={view === 'contacts' ? s.crmTabActive : ''} onClick={() => setView('contacts')}><Icon name="list" size={17}/> Lista de contatos</button>
              <button role="tab" aria-selected={view === 'pipeline'} className={view === 'pipeline' ? s.crmTabActive : ''} onClick={() => setView('pipeline')}><Icon name="funnel" size={17}/> {gui ? 'Pipeline de vendas' : 'Setores'}</button>
            </div>

            <div className={s.crmFilterPanel}>
              <label className={s.crmSearchLabel}>
                <span>Pesquisar contatos</span>
                <input type="search" aria-label="Pesquisar contatos" placeholder="Nome, telefone ou etiqueta..." value={search} onChange={e => { setSearch(e.target.value); setPageSize(25); }} />
              </label>
              <div className={s.crmFilterRow}>
                <label>
                  <span>{gui ? 'Etapa da venda' : 'Setor de atendimento'}</span>
                  <select aria-label={gui ? 'Filtrar por etapa' : 'Filtrar por setor'} value={lane} onChange={e => { setLane(e.target.value); setPageSize(25); }}>
                    <option value="all">{gui ? 'Todas as etapas' : 'Todos os setores'}</option>
                    {columns.map(value => <option key={value} value={value}>{crmLaneLabel(value)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Ordenar por</span>
                  <select aria-label="Ordenação dos contatos" value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="recent">Última interação</option>
                    <option value="name">Nome (A–Z)</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={s.crmSubjectFilter}><span className={s.crmSectionEyebrow}>FILTRAR POR ASSUNTO</span><TopicFilter workspace={workspace.id} value={subject} onChange={next=>{setSubject(next);setPageSize(25);}} counts={subjectCounts}/></div>
            {subjectStore.error && <p role="alert" className={s.notice}>{subjectStore.error}</p>}

            {(error || loadError) && <div role="alert" className={s.notice}>
              <strong>Não foi possível carregar os contatos desta versão.</strong>
              <p>{error || loadError}</p>
              {loadError && <p>Você ainda pode <Link href="/crm/exemplo">explorar a ficha de exemplo</Link> com o visual novo.</p>}
            </div>}
            {data?.truncated && <p className={s.notice}>A consulta atingiu o limite de registros. Os indicadores representam a amostra retornada.</p>}

            <div className={s.crmResultHeading}>
              <div>
                <h2>{view === 'contacts' ? 'Todos os contatos' : (gui ? 'Etapas da negociação' : 'Distribuição por setor')}</h2>
                <p className={s.muted}>{view === 'contacts' ? 'Selecione um contato para abrir sua ficha e o histórico de atividades.' : gui ? 'Organize as oportunidades conforme o avanço comercial.' : 'A organização por setor não altera as etapas de venda.'}</p>
              </div>
              <span>{subjectContacts.length} {subjectContacts.length === 1 ? 'registro' : 'registros'}</span>
            </div>

            {loading
              ? <div className={s.empty}>Carregando os registros de {workspace.name}…</div>
              : !data
                ? <div className={s.crmEmptyState}>
                    <Icon name="users" size={28}/>
                    <h3>Conheça a nova ficha do contato</h3>
                    <p>Os dados reais não estão disponíveis nesta prévia. Você pode testar a navegação com um exemplo.</p>
                    <Link href="/crm/exemplo" className={s.button}>Abrir demonstração</Link>
                  </div>
                : view === 'contacts'
                  ? <div className={s.crmContactList}>
                      {visibleContacts.map(contact => {
                        const name = contact.profile_name || contact.phone || 'Contato sem nome';
                        const initials = name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toLocaleUpperCase('pt-BR')||'').join('');
                        return <button type="button" className={s.crmContactRow} key={crmContactKey(workspace.id, contact)} onClick={() => openContact(contact)} aria-label={'Abrir ficha de ' + name}>
                          <span className={s.crmContactAvatar} aria-hidden="true">{initials}</span>
                          <span className={s.crmContactIdentity}>
                            <strong>{name}</strong>
                            <small>{contact.phone || 'Telefone não informado'}</small>
                            {!!contact.tags?.length && <span className={s.crmContactTags}>{contact.tags.slice(0,2).join(' · ')}</span>}
                          </span>
                          <span className={s.crmContactMeta}>
                            <TopicBadge workspace={workspace.id} topic={resolvedTopic(workspace.id,contact,subjectStore.assignments)}/>
                            <span className={s.crmPill}>{crmLaneLabel(crmLane(workspace.id, contact))}</span>
                            <small>{formattedDate(contact.last_message_at)}</small>
                          </span>
                          <Icon name="chevronRight" size={18}/>
                        </button>;
                      })}
                      {!subjectContacts.length && <div className={s.empty}>Nenhuma conversa encontrada nesta categoria.</div>}
                      {subjectContacts.length > pageSize && <button type="button" className={s.crmLoadMore} onClick={() => setPageSize(n => n + 25)}>Mostrar mais 25 contatos <Icon name="chevronDown" size={16}/></button>}
                    </div>
                  : <div className={s.crmStages}>
                      {columns.map(column => {
                        const list = subjectContacts.filter(c => crmLane(workspace.id, c) === column);
                        return <details className={s.crmStageGroup} key={column} open={false}>
                          <summary><span className={s.crmStageTitle}><span className={s.crmStageDot}/>{crmLaneLabel(column)}</span><span className={s.crmStageCount}>{list.length} contatos <Icon name="chevronDown" size={16}/></span></summary>
                          <div className={s.crmStageContents}>
                            {list.map(contact => <div className={s.crmStageContact} key={crmContactKey(workspace.id, contact)}>
                              <div><strong>{contact.profile_name || contact.phone || 'Contato sem nome'}</strong><small>{contact.phone}</small><TopicBadge workspace={workspace.id} topic={resolvedTopic(workspace.id,contact,subjectStore.assignments)}/></div>
                              <button type="button" className={s.crmOpen} onClick={() => openContact(contact)}>Ver ficha <Icon name="arrowRight" size={14}/></button>
                              {gui && <select aria-label={'Etapa de ' + (contact.profile_name || contact.phone)} value={contact.stage || 'Sem etapa'} disabled={busy !== null} onChange={e => move(contact, e.target.value)}>
                                {!STAGES.includes(contact.stage) && <option value={contact.stage || 'Sem etapa'}>{contact.stage || 'Sem etapa'}</option>}
                                {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                              </select>}
                            </div>)}
                            {!list.length && <p className={s.muted}>Nenhum contato nesta etapa.</p>}
                          </div>
                        </details>;
                      })}
                    </div>}
          </section>

          <aside className={s.crmSideColumn} aria-label="Indicadores e atalhos do CRM">
            <section className={s.crmSidePanel}>
              <div className={s.crmSideHead}>
                <div><span className={s.crmSectionEyebrow}>VISÃO GERAL</span><h2>Indicadores</h2></div>
                <button type="button" className={s.crmRefresh} aria-label="Atualizar indicadores" onClick={() => refresh(n=>n+1)}><Icon name="refresh" size={16}/></button>
              </div>
              <label className={s.crmPeriodLabel}><span>Período de análise</span>
                <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Período dos indicadores">
                  <option value={7}>Últimos 7 dias completos</option>
                  <option value={14}>Últimos 14 dias completos</option>
                  <option value={30}>Últimos 30 dias completos</option>
                </select>
              </label>
              <div className={s.crmSideMetrics}>
                <KPI label={gui ? 'Oportunidades abertas' : 'Contatos identificados'} value={gui ? data?.crm?.open : data ? allContacts.length : undefined} note="Posição atual" />
                <KPI label="Mensagens recebidas" value={data?.messaging?.inbound} note="No período selecionado" />
                <KPI label={gui ? 'Novos leads' : 'Mensagens enviadas'} value={gui ? data?.crm?.newLeads : data?.messaging?.outbound} note="No período selecionado" />
                <KPI label={gui ? 'Conversão dos encerrados' : 'Conversas atribuídas'} value={gui ? data?.crm?.closedWinRate : data ? allContacts.filter(c => c.assigned_to).length : undefined} suffix={gui ? '%' : ''} note={gui ? 'Vendas ÷ encerrados' : 'Com responsável registrado'} />
              </div>
            </section>

            {!gui && <section className={s.crmSidePanel}><VitalRoutingOverview /></section>}

            <section className={s.crmSidePanel}>
              <div className={s.crmSideHead}><div><span className={s.crmSectionEyebrow}>ACESSOS RÁPIDOS</span><h2>Ferramentas</h2></div></div>
              <div className={s.crmSideLinks}>
                <Link href="/crm/exemplo"><Icon name="users" size={17}/><span>Ver ficha de exemplo</span><Icon name="chevronRight" size={15}/></Link>
                <Link href="/?section=tasks"><Icon name="check" size={17}/><span>Tarefas e lembretes</span><Icon name="chevronRight" size={15}/></Link>
                <Link href="/whatsapp/automacoes"><Icon name="flow" size={17}/><span>Automações existentes</span><Icon name="chevronRight" size={15}/></Link>
                {gui ? <Link href="/crm/consultorias"><Icon name="users" size={17}/><span>Consultorias</span><Icon name="chevronRight" size={15}/></Link> : <Link href="/whatsapp/setores"><Icon name="inbox" size={17}/><span>Meus setores</span><Icon name="chevronRight" size={15}/></Link>}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
