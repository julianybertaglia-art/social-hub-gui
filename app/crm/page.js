'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useWorkspace } from '../WorkspaceSwitcher';
import { api, useResource } from '../operations/useOperations';
import { KPI } from '../operations/Charts';
import { STAGES } from '../lib/operations.mjs';
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
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const { data, loading, error: loadError } = useResource('/api/operations?workspace=' + workspace.id + '&days=' + days, revision);
  const allContacts = data?.contacts || [];
  const contacts = crmFilter(allContacts, workspace.id, { search, lane, sort });
  const columns = crmLanes(workspace.id, allContacts);
  const selected = allContacts.find(c => crmContactKey(workspace.id, c) === selectedId);

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
    setSelectedId(crmContactKey(workspace.id, contact));
  }

  return (
    <main className={s.surface}>
      <header className={s.header}>
        <div>
          <span className={s.eyebrow}>CRM / {workspace.name.toUpperCase()}</span>
          <h1>Central de relacionamento</h1>
          <p className={s.muted}>Contatos e atendimento de {workspace.name}, organizados em um único lugar. Os dados das duas contas permanecem separados.</p>
        </div>
        <Link href="/whatsapp" className={s.primary}>Abrir caixa de entrada</Link>
      </header>

      <div className={s.crmTabs} role="tablist" aria-label="Visualizações do CRM">
        <button role="tab" aria-selected={view === 'contacts'} className={view === 'contacts' ? s.crmTabActive : ''} onClick={() => setView('contacts')}>Contatos <span>{allContacts.length}</span></button>
        <button role="tab" aria-selected={view === 'pipeline'} className={view === 'pipeline' ? s.crmTabActive : ''} onClick={() => setView('pipeline')}>{gui ? 'Pipeline de vendas' : 'Fila por setor'}</button>
      </div>

      <div className={s.kpis}>
        <KPI label={gui ? 'Oportunidades abertas' : 'Contatos identificados'} value={gui ? data?.crm?.open : allContacts.length} note="Posição atual" />
        <KPI label="Mensagens recebidas" value={data?.messaging?.inbound} note="No período selecionado" />
        <KPI label={gui ? 'Novos leads' : 'Mensagens enviadas'} value={gui ? data?.crm?.newLeads : data?.messaging?.outbound} note="No período selecionado" />
        <KPI label={gui ? 'Conversão dos encerrados' : 'Conversas atribuídas'} value={gui ? data?.crm?.closedWinRate : allContacts.filter(c => c.assigned_to).length} suffix={gui ? '%' : ''} note={gui ? 'Vendas ÷ (Vendas + Perdidos)' : 'Com responsável registrado'} />
      </div>

      <div className={s.crmToolbar}>
        <input type="search" aria-label="Pesquisar contatos" placeholder="Buscar por nome, telefone, tags…" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label={gui ? 'Filtrar por etapa' : 'Filtrar por setor'} value={lane} onChange={e => setLane(e.target.value)}>
          <option value="all">{gui ? 'Todas as etapas' : 'Todos os setores'}</option>
          {columns.map(value => <option key={value} value={value}>{crmLaneLabel(value)}</option>)}
        </select>
        <select aria-label="Ordenação dos contatos" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="recent">Última interação</option>
          <option value="name">Nome (A–Z)</option>
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Período dos indicadores">
          <option value={7}>Últimos 7 dias completos</option>
          <option value={14}>Últimos 14 dias completos</option>
          <option value={30}>Últimos 30 dias completos</option>
        </select>
        <button className={s.button} onClick={() => refresh(current => current + 1)}>Atualizar</button>
      </div>

      {(error || loadError) && <p role="alert" className={s.notice}>{error || loadError}</p>}
      {data?.truncated && <p className={s.notice}>A consulta atingiu o limite de registros. Os indicadores representam a amostra retornada.</p>}

      <div className={s.crmResultHeading}>
        <div>
          <h2>{view === 'contacts' ? 'Todos os contatos' : (gui ? 'Etapas da negociação' : 'Distribuição do atendimento')}</h2>
          <p className={s.muted}>{gui
            ? 'O pipeline mostra as etapas comerciais cadastradas no WhatsApp do Gui.'
            : 'Na Vital, os setores organizam o atendimento; não são etapas de negociação.'}</p>
        </div>
        <span>{contacts.length} {contacts.length === 1 ? 'registro' : 'registros'}</span>
      </div>

      {loading
        ? <div className={s.empty}>Carregando os registros de {workspace.name}…</div>
        : !data
          ? <div className={s.empty}>Os registros aparecerão quando a consulta estiver disponível.</div>
          : view === 'contacts'
            ? <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>Nome do contato</th><th>Telefone</th><th>{gui ? 'Etapa' : 'Setor'}</th><th>{gui ? 'Tags' : 'Responsável'}</th><th>Última interação</th><th>Ficha</th></tr></thead>
                  <tbody>
                    {contacts.map(contact => (
                      <tr key={crmContactKey(workspace.id, contact)}>
                        <td><strong>{contact.profile_name || contact.phone || 'Contato sem nome'}</strong></td>
                        <td>{contact.phone || '—'}</td>
                        <td><span className={s.crmPill}>{crmLaneLabel(crmLane(workspace.id, contact))}</span></td>
                        <td>{gui ? (contact.tags?.join(', ') || '—') : (contact.assigned_to || 'Não atribuído')}</td>
                        <td>{formattedDate(contact.last_message_at)}</td>
                        <td><button className={s.crmOpen} onClick={() => openContact(contact)} aria-label={'Abrir ficha de ' + (contact.profile_name || contact.phone)}>Ver ficha →</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!contacts.length && <div className={s.empty}>Nenhum contato encontrado com esses filtros.</div>}
              </div>
            : <div className={s.kanban}>
                {columns.map(column => {
                  const list = contacts.filter(contact => crmLane(workspace.id, contact) === column);
                  return <section className={s.column} key={column}>
                    <h3>{crmLaneLabel(column)} <span>{list.length}</span></h3>
                    {list.map(contact => (
                      <article className={s.lead} key={crmContactKey(workspace.id, contact)}>
                        <strong>{contact.profile_name || contact.phone || 'Contato sem nome'}</strong>
                        <p>{contact.phone || 'Telefone não informado'}</p>
                        {!gui && contact.assigned_to && <p>Responsável: {contact.assigned_to}</p>}
                        {!!contact.tags?.length && <p>{contact.tags.join(' · ')}</p>}
                        {contact.notes && <p>{contact.notes.slice(0,130)}</p>}
                        <p>Última interação: {formattedDate(contact.last_message_at)}</p>
                        {gui && <select aria-label={'Etapa de ' + (contact.profile_name || contact.phone)} value={contact.stage || 'Sem etapa'} disabled={busy !== null} onChange={e => move(contact, e.target.value)}>
                          {!STAGES.includes(contact.stage) && <option value={contact.stage || 'Sem etapa'}>{contact.stage || 'Sem etapa'}</option>}
                          {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                        </select>}
                        <button className={s.crmOpen} onClick={() => openContact(contact)}>Ver ficha →</button>
                      </article>
                    ))}
                    {!list.length && <p className={s.muted}>Nenhum contato nesta coluna.</p>}
                  </section>;
                })}
              </div>}

      <div className={s.links}>
        <Link href="/?section=tasks">Tarefas e lembretes →</Link>
        <Link href="/whatsapp/automacoes">Automações existentes →</Link>
        {gui ? <Link href="/crm/consultorias">Consultorias →</Link> : <Link href="/whatsapp/setores">Meus setores →</Link>}
      </div>
      <p className={s.muted}>O período altera os indicadores de mensagens e novos leads, não a lista atual de contatos. O histórico completo permanece na caixa de entrada.</p>

      {selected && <div className={s.crmBackdrop} onClick={() => setSelectedId(null)}>
        <aside className={s.crmDrawer} role="dialog" aria-modal="true" aria-label={'Ficha de ' + (selected.profile_name || selected.phone)} onClick={e => e.stopPropagation()}>
          <div className={s.crmDrawerHeader}>
            <div><span className={s.eyebrow}>FICHA DO CONTATO</span><h2>{selected.profile_name || selected.phone || 'Contato sem nome'}</h2></div>
            <button className={s.crmClose} onClick={() => setSelectedId(null)} aria-label="Fechar ficha">×</button>
          </div>
          <p className={s.muted}>Workspace: {workspace.name}</p>
          <dl className={s.crmProperties}>
            <div><dt>Telefone</dt><dd>{selected.phone || 'Não informado'}</dd></div>
            <div><dt>{gui ? 'Etapa da negociação' : 'Setor responsável'}</dt><dd>{crmLaneLabel(crmLane(workspace.id, selected))}</dd></div>
            {!gui && <div><dt>Atendente</dt><dd>{selected.assigned_to || 'Não atribuído'}</dd></div>}
            <div><dt>Última interação</dt><dd>{formattedDate(selected.last_message_at)}</dd></div>
            {gui && <div><dt>Tags</dt><dd>{selected.tags?.join(' · ') || 'Nenhuma'}</dd></div>}
            {gui && <div><dt>Anotações</dt><dd className={s.crmNotes}>{selected.notes || 'Nenhuma anotação registrada.'}</dd></div>}
          </dl>
          {gui && <label className={s.crmField}>Mover para outra etapa
            <select value={selected.stage || 'Sem etapa'} disabled={busy !== null} onChange={e => move(selected, e.target.value)}>
              {!STAGES.includes(selected.stage) && <option value={selected.stage || 'Sem etapa'}>{selected.stage || 'Sem etapa'}</option>}
              {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </label>}
          <div className={s.crmDrawerActions}>
            <Link href="/whatsapp" className={s.primary}>Abrir conversa no WhatsApp</Link>
            {!gui && <Link href="/whatsapp/setores" className={s.button}>Ver atendimento por setor</Link>}
          </div>
          <p className={s.muted}>A ficha utiliza os dados já existentes; mensagens e transferências continuam disponíveis no atendimento atual.</p>
        </aside>
      </div>}
    </main>
  );
}
