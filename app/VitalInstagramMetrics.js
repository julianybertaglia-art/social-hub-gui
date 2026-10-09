'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './CloudGate';
import styles from './vital-instagram-metrics.module.css';

const fields = [
  { key: 'seguidores', label: 'Seguidores' },
  { key: 'alcance', label: 'Alcance · 30 dias' },
  { key: 'visualizacoes', label: 'Visualizações · 30 dias' },
  { key: 'interacoes', label: 'Interações · 30 dias' },
];

function formatMetric(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('pt-BR').format(value);
}

function periodDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
    .format(new Date(value + 'T12:00:00-03:00'));
}

export default function VitalInstagramMetrics({ onProfile }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const controller = useRef(null);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError('');
    try {
      if (!supabase) throw new Error('A conexão com o TidePlace está indisponível.');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data?.session?.access_token) throw new Error('Entre no TidePlace para acessar as métricas.');
      const response = await fetch('/api/vital-connections/instagram', {
        headers: { Authorization: 'Bearer ' + data.session.access_token },
        cache: 'no-store', signal: abort.signal,
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || 'Não foi possível atualizar as métricas da Vital.');
      if (next.workspace !== 'vital-decor' || !next.profile || !next.metrics) {
        throw new Error('A resposta das métricas da Vital está incompleta.');
      }
      if (id !== requestId.current) return;
      setPayload(next);
      onProfile?.(next.profile);
    } catch (failure) {
      if (id === requestId.current && failure.name !== 'AbortError') setError(failure.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [onProfile]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [refresh]);

  const profile = payload?.profile;
  const updated = payload?.updatedAt && new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(payload.updatedAt));

  return (
    <section className={styles.panel} aria-label="Métricas do Instagram da Vital Decor">
      <header className={styles.header}>
        <div className={styles.identity}>
          {profile?.profilePictureUrl
            ? <img className={styles.avatar} src={profile.profilePictureUrl} alt="Foto do Instagram da Vital Decor" />
            : <span className={styles.avatarFallback}>VD</span>}
          <div>
            <h2>Instagram da Vital Decor</h2>
            <p>@{profile?.username || 'vitaldecor_'}</p>
          </div>
        </div>
        <button className={styles.refresh} type="button" onClick={() => { void refresh(); }} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar métricas'}
        </button>
      </header>
      <p className={styles.period}>
        {payload?.range
          ? `Últimos 30 dias · ${periodDate(payload.range.startDate)} a ${periodDate(payload.range.endDate)}`
          : 'Últimos 30 dias'}
      </p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.grid} aria-busy={loading}>
        {fields.map(({ key, label }) => (
          <article className={styles.metric} key={key}>
            <span>{label}</span>
            <strong>{!payload && loading ? '…' : formatMetric(payload?.metrics[key])}</strong>
            <small>{payload && payload.metrics[key] === null ? 'Não disponível pela Meta' : 'Meta'}</small>
          </article>
        ))}
        <article className={styles.metric}>
          <span>Publicações no perfil</span>
          <strong>{!payload && loading ? '…' : formatMetric(profile?.mediaCount)}</strong>
          <small>Total do perfil</small>
        </article>
      </div>
      <p className={styles.updated} role="status" aria-live="polite">
        {updated ? `Atualizado em ${updated} · Meta` : loading ? 'Buscando os dados da conta conectada…' : 'Use “Atualizar métricas” para tentar novamente.'}
      </p>
    </section>
  );
}
