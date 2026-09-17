'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../CloudGate';
import styles from './influenciadores.module.css';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'prequalified', label: 'Pré-aprovados' },
  { id: 'review', label: 'Revisar' },
  { id: 'low_fit', label: 'Baixa aderência' },
];

const CLASSIFICATION = {
  prequalified: 'Pré-aprovado',
  review: 'Revisar',
  low_fit: 'Baixa aderência',
};

const NICHE = {
  casa_decoracao: 'Casa e decoração',
  diy_reforma: 'DIY e reforma',
  organizacao: 'Organização',
  jardinagem: 'Jardinagem',
  lifestyle: 'Lifestyle',
  maternidade: 'Maternidade',
  beleza: 'Beleza',
  multinicho: 'Conteúdo variado',
  outro: 'Outro',
};

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { notation: Number(value) >= 10000 ? 'compact' : 'standard' }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Formulário pendente';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function InfluenciadoresPage() {
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [reviewStatus, setReviewStatus] = useState('pending');
  const [reviewNotes, setReviewNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente no Hub.');
      const response = await fetch('/api/whatsapp/influencers', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível carregar os influenciadores.');
      setApplications(payload.applications || []);
      setSelectedId((current) => current || payload.applications?.[0]?.id || null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = applications.find((item) => item.id === selectedId) || null;
  useEffect(() => {
    setReviewStatus(selected?.review_status || 'pending');
    setReviewNotes(selected?.review_notes || '');
  }, [selectedId, selected?.review_status, selected?.review_notes]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [
    item.id,
    item.id === 'all' ? applications.length : applications.filter((app) => app.qualification === item.id).length,
  ])), [applications]);
  const filtered = filter === 'all' ? applications : applications.filter((app) => app.qualification === filter);

  async function saveReview() {
    if (!selected) return;
    setSaving(true);
    setNotice('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente no Hub.');
      const response = await fetch('/api/whatsapp/influencers', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, reviewStatus, reviewNotes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível salvar.');
      setApplications((current) => current.map((item) => item.id === selected.id ? { ...item, ...payload.application } : item));
      setNotice('Revisão salva.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>VITAL DECOR · TIKTOK</span>
          <h1>Influenciadores</h1>
          <p>O Hub pontua cada inscrição e coloca os melhores perfis primeiro.</p>
        </div>
        <Link className={styles.back} href="/whatsapp">Abrir conversas</Link>
      </header>

      {notice && <button className={styles.notice} type="button" onClick={() => setNotice('')}>{notice} ×</button>}

      <section className={styles.filters}>
        {FILTERS.map((item) => <button type="button" key={item.id} className={filter === item.id ? styles.active : ''} onClick={() => setFilter(item.id)}>{item.label}<b>{counts[item.id] || 0}</b></button>)}
      </section>

      <section className={styles.workspace}>
        <aside className={styles.list}>
          {loading && <div className={styles.empty}>Carregando inscrições...</div>}
          {!loading && !filtered.length && <div className={styles.empty}>Nenhuma inscrição nesta fila.</div>}
          {filtered.map((item) => (
            <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className={`${styles.creator} ${selectedId === item.id ? styles.selected : ''}`}>
              <span className={`${styles.score} ${styles[item.qualification]}`}>{item.score ?? '—'}</span>
              <span><strong>{item.creator_name || item.profile_name || 'Formulário pendente'}</strong><small>{CLASSIFICATION[item.qualification] || 'Aguardando formulário'} · {formatDate(item.submitted_at)}</small></span>
            </button>
          ))}
        </aside>

        <article className={styles.detail}>
          {!selected ? <div className={styles.empty}>Escolha um influenciador para analisar.</div> : selected.status !== 'submitted' ? (
            <div className={styles.empty}><strong>{selected.profile_name || 'Influenciador'}</strong><p>O formulário ainda não foi enviado.</p></div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div><span className={styles.eyebrow}>{CLASSIFICATION[selected.qualification]}</span><h2>{selected.creator_name}</h2><p>{selected.city_state} · {NICHE[selected.niche] || selected.niche}</p></div>
                <div className={`${styles.bigScore} ${styles[selected.qualification]}`}><b>{selected.score}</b><span>/100</span></div>
              </div>

              <div className={styles.metrics}>
                <div><span>Seguidores</span><b>{formatNumber(selected.followers)}</b></div>
                <div><span>Média de views</span><b>{formatNumber(selected.average_views)}</b></div>
                <div><span>Curtidas</span><b>{formatNumber(selected.average_likes)}</b></div>
                <div><span>Posts/semana</span><b>{selected.posts_per_week}</b></div>
                <div><span>Público BR</span><b>{selected.brazil_audience_percent}%</b></div>
                <div><span>Já foi afiliado</span><b>{selected.affiliate_experience ? 'Sim' : 'Não'}</b></div>
              </div>

              <div className={styles.links}>
                <a href={selected.tiktok_url} target="_blank" rel="noreferrer">Abrir TikTok ↗</a>
                {selected.instagram_url && <a href={selected.instagram_url} target="_blank" rel="noreferrer">Abrir Instagram ↗</a>}
                {(selected.top_video_urls || []).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Vídeo {index + 1} ↗</a>)}
              </div>

              <section className={styles.answer}><span>POR QUE QUER A PARCERIA</span><p>{selected.motivation}</p></section>

              <section className={styles.reviewForm}>
                <label>Decisão<select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="declined">Não seguir</option></select></label>
                <label>Observações<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Qualidade dos vídeos, fit com a marca, próximos passos..." /></label>
                <button type="button" onClick={saveReview} disabled={saving}>{saving ? 'Salvando...' : 'Salvar revisão'}</button>
              </section>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
