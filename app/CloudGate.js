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
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey
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

    window.localStorage.setItem('guihub-metrics', JSON.stringify(nextMetrics));
    window.localStorage.setItem('guihub-instagram-updated-at', payload.updatedAt || new Date().toISOString());

    return true;
  } catch (error) {
    console.warn('Não foi possível atualizar o Instagram:', error);
    return false;
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
      const instagramUpdated = await refreshInstagramMetrics();

      if (cancelled) return;

      lastSnapshotRef.current = data ? serializeState(readLocalState()) : '';
      setSyncStatus(
        instagramUpdated
          ? 'Sincronizado · Instagram atualizado'
          : data
            ? 'Sincronizado'
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
