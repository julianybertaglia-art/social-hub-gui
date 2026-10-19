'use client';

import { useMemo, useState } from 'react';
import { calendarToday, isCalendarDate } from '../lib/editorial-calendar.mjs';
import s from './EditorialCalendar.module.css';

const FORMATS = ['Reel', 'Carrossel', 'Stories', 'Live'];
const formatClass = { Reel: 'reel', Carrossel: 'carousel', Stories: 'stories', Live: 'live', Foto: 'photo' };
const statusClass = { Ideia: 'idea', Roteiro: 'script', 'Em criação': 'creating', 'Aguardando aprovação': 'review', 'Pronto para publicar': 'ready', Publicado: 'published' };

function FormatIcon({ format }) {
  return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    {format === 'Reel' ? <><rect x="3" y="3" width="14" height="14" rx="4"/><path d="m8 6 5 4-5 4Z" fill="currentColor" stroke="none"/></>
      : format === 'Carrossel' ? <><rect x="3" y="6" width="11" height="11" rx="2"/><path d="M7 3h8a2 2 0 0 1 2 2v8"/></>
        : format === 'Stories' ? <><circle cx="10" cy="10" r="7" strokeDasharray="8 3"/><circle cx="10" cy="10" r="3"/></>
          : format === 'Live' ? <><circle cx="10" cy="10" r="2" fill="currentColor" stroke="none"/><path d="M6 6a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M3 3a10 10 0 0 0 0 14M17 3a10 10 0 0 1 0 14"/></>
            : <rect x="3" y="3" width="14" height="14" rx="3"/>}
  </svg>;
}

function PostCard({ post, onOpen }) {
  return <button type="button" className={s.post} onClick={() => onOpen(post.id)} aria-haspopup="dialog"
    aria-label={`${post.format} · ${post.title} · ${post.status}. Abrir briefing`} title={post.title}>
    <span className={`${s.format} ${s[formatClass[post.format] || 'photo']}`}><FormatIcon format={post.format}/>{post.format}</span>
    <strong className={s.postTitle}>{post.title}</strong>
    <span className={s.postFooter}><span className={`${s.status} ${s[statusClass[post.status] || 'idea']}`}><i/>{post.status}</span>{post.time && <time>{post.time}</time>}</span>
  </button>;
}

export default function EditorialCalendar({ posts, onOpen, workspaceName, loading, saving, synced, error, onRetry, onAdd }) {
  const today = calendarToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const first = new Date(month + '-01T12:00:00Z');
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((offset + count) / 7) * 7;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
  const postsByDate = useMemo(() => {
    const grouped = new Map();
    for (const post of posts) {
      if (!isCalendarDate(post.date)) continue;
      if (!grouped.has(post.date)) grouped.set(post.date, []);
      grouped.get(post.date).push(post);
    }
    for (const group of grouped.values()) group.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return grouped;
  }, [posts]);
  const monthPosts = posts.filter(p => isCalendarDate(p.date) && p.date.startsWith(month));
  const agendaDays = [...postsByDate.keys()].filter(date => date.startsWith(month)).sort();
  const undated = posts.filter(p => !isCalendarDate(p.date)).length;

  function moveMonth(delta) {
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1));
    setMonth(next.toISOString().slice(0, 7));
  }

  return <section className={s.root} aria-label={`Calendário editorial · ${workspaceName}`}>
    <header className={s.heading}>
      <div><span className={s.eyebrow}>PLANEJAMENTO</span><h1>Calendário editorial<span>.</span></h1><p>{workspaceName} <span>·</span> Ideias organizadas, conteúdo com direção.</p></div>
      <button type="button" className={s.add} onClick={onAdd}><span aria-hidden="true">＋</span>Novo conteúdo</button>
    </header>
    <div className={s.panel}>
      <div className={s.toolbar}>
        <div className={s.monthNav}>
          <h2 aria-live="polite">{monthLabel}</h2>
          <div className={s.arrows}><button type="button" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button><button type="button" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button></div>
          <button type="button" className={s.todayButton} onClick={() => setMonth(today.slice(0, 7))}>Hoje</button>
        </div>
        <div className={s.monthMeta}><span>{monthPosts.length} {monthPosts.length === 1 ? 'conteúdo' : 'conteúdos'}</span><label className={s.monthPicker}>Ir para<input type="month" aria-label="Mês do calendário" value={month} min="0001-01" max="9999-12" onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }}/></label></div>
      </div>
      <div className={s.legend} aria-label="Legenda de formatos"><span className={s.legendLabel}>FORMATOS</span>{FORMATS.map(format => <span key={format} className={`${s.format} ${s[formatClass[format]]}`}><FormatIcon format={format}/>{format}</span>)}</div>
      {error && <div className={s.error} role="alert"><span>{error}</span><button type="button" onClick={onRetry} disabled={loading || saving}>Tentar novamente</button></div>}
      {loading ? <div className={s.loading} role="status">Carregando seu planejamento…</div> : <>
        <div className={s.monthGrid}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => <div key={day} className={s.weekday}>{day}</div>)}
          {Array.from({ length: cellCount }, (_, index) => {
            const day = index - offset + 1;
            if (day < 1 || day > count) return <div key={`outside-${index}`} className={s.outside} aria-hidden="true"/>;
            const date = `${month}-${String(day).padStart(2, '0')}`;
            const current = date === today;
            return <div key={date} className={`${s.day} ${index % 7 > 4 ? s.weekend : ''} ${current ? s.current : ''}`} aria-label={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))} aria-current={current ? 'date' : undefined}>
              <div className={s.dayHeading}><time dateTime={date} className={s.dayNumber}>{day}</time>{current && <span>Hoje</span>}</div>
              <div className={s.dayPosts}>{(postsByDate.get(date) || []).map(post => <PostCard key={post.id} post={post} onOpen={onOpen}/>)}</div>
            </div>;
          })}
        </div>
        <div className={s.agenda} aria-label="Agenda do mês">
          {agendaDays.map(date => <div key={date} className={`${s.agendaDay} ${date === today ? s.agendaToday : ''}`}>
            <div className={s.agendaDate}><strong>{date.slice(-2)}</strong><span>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))}</span></div>
            <div className={s.agendaPosts}>{postsByDate.get(date).map(post => <PostCard key={post.id} post={post} onOpen={onOpen}/>)}</div>
          </div>)}
          {agendaDays.length === 0 && <p className={s.empty}>Espaço para novas ideias. Adicione seu primeiro conteúdo deste mês.</p>}
        </div>
      </>}
      <footer className={s.footer}><span className={`${s.sync} ${synced && !error ? s.synced : ''}`} role="status"><i/>{loading ? 'Conectando' : saving ? 'Salvando…' : error ? 'Verifique a sincronização' : 'Salvo na sua conta'}</span><span>Clique em um conteúdo para abrir o briefing <span aria-hidden="true">↗</span></span></footer>
    </div>
    <p className={s.footnote}>Planejamento editorial · A publicação é feita manualmente.{undated > 0 && ` ${undated} conteúdo(s) com data em texto estão em “Gerenciar conteúdos”.`}</p>
  </section>;
}
