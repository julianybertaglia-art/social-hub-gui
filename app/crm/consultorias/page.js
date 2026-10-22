'use client';
import { useState } from 'react';
import { useWorkspace } from '../../WorkspaceSwitcher';
import { api, useResource } from '../../operations/useOperations';
import { CONSULTORIA_URL, EXPERIENCE, REVENUE, RECORDING, REVIEW_STATUS } from '../../lib/consultoria.mjs';
import s from './consultorias.module.css';

const date = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
export default function Consultorias() {
  const [workspace] = useWorkspace();
  if (workspace.id !== 'gui-nonato') return <main className={s.page}><h1>Consultorias · Gui Nonato</h1><p>Selecione o workspace Gui Nonato para acessar as candidaturas.</p></main>;
  return <Applications />;
}
function Applications() {
  const [revision, refresh] = useState(0), [search, setSearch] = useState(''), [status, setStatus] = useState('all');
  const [experience, setExperience] = useState('all'), [revenue, setRevenue] = useState('all'), [recording, setRecording] = useState('all');
  const [selectedId, setSelectedId] = useState(null), [draftStatus, setDraftStatus] = useState('pending'), [notes, setNotes] = useState('');
  const [draftUpdatedAt, setDraftUpdatedAt] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const { data, loading, error } = useResource('/api/consultoria', revision);
  const applications = data?.applications || [];
  const selected = applications.find(a => a.id === selectedId);
  const shown = applications.filter(a => (status === 'all' || a.review_status === status)
    && (experience === 'all' || a.experience === experience) && (revenue === 'all' || a.revenue === revenue)
    && (recording === 'all' || a.recording === recording)
    && [a.name, a.instagram, a.phone, a.product, a.challenge].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
  function select(a) { setSelectedId(a.id); setDraftStatus(a.review_status); setNotes(a.review_notes || ''); setDraftUpdatedAt(a.updated_at); setNotice(''); }
  async function save(event) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setNotice('');
    try {
      const result = await api('/api/consultoria', { method: 'PATCH', body: JSON.stringify({ id: selected.id, status: draftStatus, notes, updatedAt: draftUpdatedAt }) });
      setDraftUpdatedAt(result.application.updated_at);
      setNotice('Análise salva.'); refresh(n => n + 1);
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(CONSULTORIA_URL); setNotice('Link do formulário copiado.'); }
    catch { setNotice('Link do formulário: ' + CONSULTORIA_URL); }
  }
  return <main className={s.page}>
    <header className={s.header}><div><span className={s.eyebrow}>GUI NONATO / CONSULTORIA</span><h1>Da candidatura à conversa.</h1><p>Consultoria gratuita de 30 minutos. Analise os perfis e acompanhe cada seleção.</p></div><div className={s.actions}><button onClick={copyLink}>Copiar formulário</button><a href="/consultoria" target="_blank" rel="noopener noreferrer">Ver formulário ↗</a></div></header>
    <section className={s.stats}><div><strong>{data ? applications.length : '—'}</strong><span>Candidaturas</span></div><div><strong>{data ? applications.filter(a => a.review_status === 'pending').length : '—'}</strong><span>A analisar</span></div><div><strong>{data ? applications.filter(a => a.segment === 'seller').length : '—'}</strong><span>Já vendem</span></div><div><strong>{data ? applications.filter(a => ['selected', 'contacted', 'scheduled', 'completed'].includes(a.review_status)).length : '—'}</strong><span>Selecionados</span></div></section>
    {(notice || error) && <p role="status" className={s.notice}>{notice || error}</p>}
    {data?.truncated && <p className={s.notice}>Mostrando as 1.000 candidaturas mais recentes. Os totais e filtros consideram esta amostra.</p>}
    <div className={s.toolbar}><input type="search" aria-label="Buscar candidatura" placeholder="Nome, Instagram, produto ou dificuldade…" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => refresh(n => n + 1)} disabled={busy}>Atualizar</button></div>
    <div className={s.filters}>
      <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos os status</option>{Object.entries(REVIEW_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>Experiência<select value={experience} onChange={e => setExperience(e.target.value)}><option value="all">Todos os momentos</option>{Object.entries(EXPERIENCE).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>Faturamento<select value={revenue} onChange={e => setRevenue(e.target.value)}><option value="all">Todas as faixas</option>{Object.entries(REVENUE).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>Conteúdos<select value={recording} onChange={e => setRecording(e.target.value)}><option value="all">Todas as respostas</option>{Object.entries(RECORDING).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    </div>
    <div className={s.layout}><section className={s.list} aria-label="Candidaturas"><div className={s.listHead}><b>Perfis para conhecer</b><span>{shown.length} {shown.length === 1 ? 'candidatura' : 'candidaturas'}</span></div>
      {loading ? <p className={s.empty}>Carregando candidaturas…</p> : !data ? <p className={s.empty}>Não foi possível consultar as candidaturas. Use Atualizar para tentar novamente.</p> : !shown.length ? <p className={s.empty}>{applications.length ? 'Nenhum perfil com estes filtros.' : 'As inscrições aparecerão aqui quando o formulário for preenchido.'}</p> : shown.map(a => <button className={`${s.lead} ${a.id === selectedId ? s.active : ''}`} key={a.id} onClick={() => select(a)}><div><strong>{a.name}</strong><span className={s.badge}>{REVIEW_STATUS[a.review_status]}</span></div><small>@{a.instagram} · {date(a.created_at)}</small><div className={s.tags}><span>{REVENUE[a.revenue]}</span><span>{EXPERIENCE[a.experience]}</span></div><p>{a.product}</p><p className={s.excerpt}>{a.challenge}</p></button>)}
    </section><aside className={s.detail} aria-label="Análise da candidatura">
      {!selected ? <div className={s.empty}><span className={s.detailIcon}>↗</span><h2>Conheça o próximo perfil.</h2><p>Escolha uma candidatura para ler a dificuldade, conferir os contatos e registrar sua análise.</p></div> : <>
        <div className={s.detailHead}><span className={s.eyebrow}>CANDIDATURA / {date(selected.created_at)}</span><h2>{selected.name}</h2><a href={'https://www.instagram.com/' + selected.instagram + '/'} target="_blank" rel="noopener noreferrer">@{selected.instagram} ↗</a></div>
        <dl className={s.facts}><div><dt>Momento</dt><dd>{EXPERIENCE[selected.experience]}</dd></div><div><dt>Faturamento mensal</dt><dd>{REVENUE[selected.revenue]}</dd></div><div><dt>Produto / nicho</dt><dd>{selected.product}</dd></div><div><dt>Participação nos conteúdos</dt><dd>{RECORDING[selected.recording]}</dd></div><div><dt>Conteúdos e ofertas pelo WhatsApp</dt><dd>{selected.marketing_opt_in ? 'Optou por receber' : 'Não optou por receber'}</dd></div><div><dt>WhatsApp</dt><dd>+{selected.phone}</dd></div></dl>
        {selected.store_url && <a className={s.store} href={selected.store_url} target="_blank" rel="noopener noreferrer">Ver loja ou anúncio ↗</a>}
        <div className={s.challenge}><span className={s.eyebrow}>O QUE QUER RESOLVER</span><p>{selected.challenge}</p></div>
        <form onSubmit={save}><label>Status da seleção<select value={draftStatus} onChange={e => setDraftStatus(e.target.value)} disabled={busy}>{Object.entries(REVIEW_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Notas internas<textarea rows="4" maxLength={3000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Pontos para o Gui analisar, contato e agendamento…" disabled={busy} /></label><button className={s.primary} type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar análise'}</button></form>
        <a className={s.whatsapp} href={'https://wa.me/' + selected.phone} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp ↗</a><p className={s.footnote}>A seleção e o agendamento são feitos pela equipe. Salvar uma análise não envia mensagens.</p>
      </>}
    </aside></div>
  </main>;
}
