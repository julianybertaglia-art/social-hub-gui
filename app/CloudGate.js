'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import styles from './cloudgate.module.css';

const STORAGE_KEYS = [
  'guihub-metrics',
  'guihub-posts',
  'guihub-ideas',
  'guihub-tasks',
  'guihub-goals',
  'guihub-automations',
  'guihub-media-performance',
  'guihub-media-history',
];

const INSTAGRAM_REFRESH_INTERVAL = 10 * 60 * 1000;
const CONTENT_REFRESH_INTERVAL = 6 * 60 * 60 * 1000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

function readLocalState() {
  const data = {};

  STORAGE_KEYS.forEach((key) => {
    const value = window.localStorage.getItem(key);
    if (value !== null) data[key] = value;
  });

  return data;
}

function writeLocalState(data) {
  if (!data || typeof data !== 'object') return;

  STORAGE_KEYS.forEach((key) => {
    if (typeof data[key] === 'string') {
      window.localStorage.setItem(key, data[key]);
    }
  });
}

function serializeState(data) {
  return JSON.stringify(data);
}

function isUserEditing() {
  const element = document.activeElement;
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
}

async function refreshInstagramMetrics() {
  try {
    const response = await fetch('/api/instagram', { cache: 'no-store' });
    const payload = await response.json();

    if (!response.ok || !payload?.metrics) {
      throw new Error(payload?.error || 'Resposta inválida do Instagram.');
    }

    let currentMetrics = {};

    try {
      currentMetrics = JSON.parse(window.localStorage.getItem('guihub-metrics') || '{}');
    } catch {
      currentMetrics = {};
    }

    const nextMetrics = {
      ...currentMetrics,
      ...payload.metrics,
    };

    const changed = JSON.stringify(currentMetrics) !== JSON.stringify(nextMetrics);
    const source = payload.source || 'Instagram';

    window.localStorage.setItem('guihub-metrics', JSON.stringify(nextMetrics));
    window.localStorage.setItem('guihub-instagram-updated-at', payload.updatedAt || new Date().toISOString());
    window.localStorage.setItem('guihub-instagram-source', source);

    return { ok: true, changed, source };
  } catch (error) {
    console.warn('Não foi possível atualizar o Instagram:', error);
    return { ok: false, changed: false, source: null };
  }
}

function mergeDailyMediaSnapshot(payload) {
  let history = [];

  try {
    history = JSON.parse(window.localStorage.getItem('guihub-media-history') || '[]');
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  const capturedAt = payload.updatedAt || new Date().toISOString();
  const date = capturedAt.slice(0, 10);
  const snapshot = {
    date,
    capturedAt,
    source: payload.source || 'Meta',
    items: Array.isArray(payload.items) ? payload.items : [],
  };

  const nextHistory = [
    ...history.filter((item) => item?.date !== date),
    snapshot,
  ]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-45);

  window.localStorage.setItem('guihub-media-history', JSON.stringify(nextHistory));
}

async function refreshInstagramContentPerformance() {
  try {
    const response = await fetch('/api/instagram/content-performance', { cache: 'no-store' });
    const payload = await response.json();

    if (!response.ok || !Array.isArray(payload?.items)) {
      throw new Error(payload?.error || 'Resposta inválida da performance dos conteúdos.');
    }

    window.localStorage.setItem('guihub-media-performance', JSON.stringify(payload));
    window.localStorage.setItem(
      'guihub-media-performance-updated-at',
      payload.updatedAt || new Date().toISOString()
    );
    mergeDailyMediaSnapshot(payload);

    return { ok: true, count: payload.items.length };
  } catch (error) {
    console.warn('Não foi possível atualizar a performance dos conteúdos:', error);
    return { ok: false, count: 0 };
  }
}

export default function CloudGate({ children }) {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Conectando...');

  const rowIdRef = useRef(null);
  const lastSnapshotRef = useRef('');
  const saveInProgressRef = useRef(false);
  const metricsRefreshInProgressRef = useRef(false);
  const lastMetricsRefreshRef = useRef(0);
  const contentRefreshInProgressRef = useRef(false);
  const lastContentRefreshRef = useRef(0);

  useEffect(() => {
    if (!supabase) {
      setInitializing(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setInitializing(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(false);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;

    async function initializeCloudState() {
      setSyncStatus('Carregando dados...');

      const { data, error } = await supabase
        .from('content_items')
        .select('id, description, updated_at')
        .eq('title', '__SOCIAL_HUB_STATE__')
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Erro ao carregar dados do hub:', error);
        setSyncStatus('Erro de conexão');
        setReady(true);
        return;
      }

      if (data) {
        rowIdRef.current = data.id;

        try {
          const payload = JSON.parse(data.description || '{}');
          const remoteUpdatedAt = Number(payload.updatedAt || Date.parse(data.updated_at) || 0);
          const localUpdatedAt = Number(window.localStorage.getItem('guihub-cloud-updated-at') || 0);
          const localState = readLocalState();

          if (remoteUpdatedAt > localUpdatedAt || Object.keys(localState).length === 0) {
            writeLocalState(payload.data);
            window.localStorage.setItem('guihub-cloud-updated-at', String(remoteUpdatedAt));
          }
        } catch (parseError) {
          console.warn('Não foi possível ler o estado salvo:', parseError);
        }
      } else {
        rowIdRef.current = null;
      }

      if (cancelled) return;

      setSyncStatus('Atualizando Instagram...');
      const instagramResult = await refreshInstagramMetrics();
      lastMetricsRefreshRef.current = Date.now();

      if (cancelled) return;

      const previousContentUpdate = Date.parse(
        window.localStorage.getItem('guihub-media-performance-updated-at') || ''
      );
      lastContentRefreshRef.current = Number.isFinite(previousContentUpdate)
        ? previousContentUpdate
        : 0;

      lastSnapshotRef.current = data ? serializeState(readLocalState()) : '';
      setSyncStatus(
        instagramResult.ok
          ? `Sincronizado · Instagram atualizado · ${instagramResult.source}`
          : data
            ? 'Sincronizado · Instagram indisponível'
            : 'Preparando primeira sincronização...'
      );
      setReady(true);
    }

    initializeCloudState();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session || !ready) return undefined;

    let cancelled = false;

    async function updateInstagramAutomatically({ force = false } = {}) {
      const now = Date.now();
      const elapsed = now - lastMetricsRefreshRef.current;

      if (!force && elapsed < 60 * 1000) return;
      if (metricsRefreshInProgressRef.current) return;

      metricsRefreshInProgressRef.current = true;
      setSyncStatus('Atualizando Instagram...');

      const result = await refreshInstagramMetrics();
      lastMetricsRefreshRef.current = Date.now();
      metricsRefreshInProgressRef.current = false;

      if (cancelled) return;

      setSyncStatus(
        result.ok
          ? `Sincronizado · Instagram atualizado automaticamente · ${result.source}`
          : 'Sincronizado · não foi possível atualizar Instagram'
      );

      if (result.ok && result.changed && !isUserEditing()) {
        window.location.reload();
      }
    }

    const intervalId = window.setInterval(
      () => updateInstagramAutomatically({ force: true }),
      INSTAGRAM_REFRESH_INTERVAL
    );

    function handleFocus() {
      const elapsed = Date.now() - lastMetricsRefreshRef.current;
      if (elapsed >= 2 * 60 * 1000) {
        updateInstagramAutomatically();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') handleFocus();
    }

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ready, session]);

  useEffect(() => {
    if (!supabase || !session || !ready) return undefined;

    let cancelled = false;

    async function updateContentPerformance({ force = false } = {}) {
      const elapsed = Date.now() - lastContentRefreshRef.current;

      if (!force && elapsed < CONTENT_REFRESH_INTERVAL) return;
      if (contentRefreshInProgressRef.current) return;

      contentRefreshInProgressRef.current = true;
      const result = await refreshInstagramContentPerformance();
      lastContentRefreshRef.current = Date.now();
      contentRefreshInProgressRef.current = false;

      if (cancelled) return;

      if (result.ok) {
        console.info('Performance dos conteúdos atualizada.', { count: result.count });
      }
    }

    const firstRunId = window.setTimeout(() => updateContentPerformance(), 1200);
    const intervalId = window.setInterval(
      () => updateContentPerformance({ force: true }),
      CONTENT_REFRESH_INTERVAL
    );

    function handleFocus() {
      if (Date.now() - lastContentRefreshRef.current >= CONTENT_REFRESH_INTERVAL) {
        updateContentPerformance();
      }
    }

    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(firstRunId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [ready, session]);

  useEffect(() => {
    if (!supabase || !session || !ready) return undefined;

    async function saveCloudState() {
      if (saveInProgressRef.current) return;

      const localState = readLocalState();
      const snapshot = serializeState(localState);

      if (snapshot === lastSnapshotRef.current) return;

      saveInProgressRef.current = true;
      setSyncStatus('Salvando...');

      const updatedAt = Date.now();
      const payload = JSON.stringify({ updatedAt, data: localState });

      let result;

      if (rowIdRef.current) {
        result = await supabase
          .from('content_items')
          .update({ description: payload, status: 'Ativo' })
          .eq('id', rowIdRef.current)
          .select('id')
          .single();
      } else {
        result = await supabase
          .from('content_items')
          .insert({
            title: '__SOCIAL_HUB_STATE__',
            description: payload,
            platform: 'Sistema',
            format: 'Estado',
            objective: 'Sincronização',
            audience: 'Interno',
            status: 'Ativo',
          })
          .select('id')
          .single();
      }

      if (result.error) {
        console.error('Erro ao sincronizar o hub:', result.error);
        setSyncStatus('Erro ao salvar');
      } else {
        rowIdRef.current = result.data.id;
        lastSnapshotRef.current = snapshot;
        window.localStorage.setItem('guihub-cloud-updated-at', String(updatedAt));
        setSyncStatus('Sincronizado');
      }

      saveInProgressRef.current = false;
    }

    const firstSaveId = window.setTimeout(saveCloudState, 250);
    const intervalId = window.setInterval(saveCloudState, 1200);

    return () => {
      window.clearTimeout(firstSaveId);
      window.clearInterval(intervalId);
    };
  }, [ready, session]);

  async function handleLogin(event) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage('E-mail ou senha incorretos.');
    }

    setSubmitting(false);
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    rowIdRef.current = null;
    lastSnapshotRef.current = '';
    setSession(null);
  }

  if (!supabase) {
    return (
      <main className={styles.screen}>
        <section className={styles.card}>
          <div className={styles.mark}>GN</div>
          <p className={styles.eyebrow}>CONFIGURAÇÃO PENDENTE</p>
          <h1>O banco ainda não foi conectado.</h1>
          <p>Verifique as variáveis do Supabase na Vercel e faça um novo deploy.</p>
        </section>
      </main>
    );
  }

  if (initializing || (session && !ready)) {
    return (
      <main className={styles.screen}>
        <section className={styles.card}>
          <div className={styles.mark}>GN</div>
          <p className={styles.eyebrow}>GUI SOCIAL HUB</p>
          <h1>Preparando seu painel...</h1>
          <p>{syncStatus}</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.screen}>
        <section className={styles.card}>
          <div className={styles.mark}>GN</div>
          <p className={styles.eyebrow}>ACESSO RESTRITO</p>
          <h1>Gui Social Hub</h1>
          <p>Entre para acessar o calendário, as métricas e o planejamento do Instagram.</p>

          <form className={styles.form} onSubmit={handleLogin}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {message && <p className={styles.error}>{message}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar no painel'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      <div className={styles.syncBar}>
        <span>{syncStatus}</span>
        <button type="button" onClick={handleLogout}>Sair</button>
      </div>
    </>
  );
}
