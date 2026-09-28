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
      notifyLocalUpdate(key);
    }
  });
}

function serializeState(data) {
  return JSON.stringify(data);
}

function notifyLocalUpdate(key) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tideplace:storage-update', { detail: { key } }));
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
    notifyLocalUpdate('guihub-metrics');

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
    notifyLocalUpdate('guihub-media-performance');
    notifyLocalUpdate('guihub-media-history');

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
    return (
      <main className={styles.screen}>
        <section className={styles.statusCard}>
          <img className={styles.statusLogo} src="/tideplace-mark.svg" alt="" />
          <p className={styles.eyebrow}>TIDEPLACE</p>
          <h1>Configuração pendente</h1>
          <p>Verifique as variáveis do Supabase na Vercel e faça um novo deploy.</p>
        </section>
      </main>
    );
  }

  if (initializing) {
    return (
      <main className={styles.loadingScreen} aria-live="polite">
        <div className={styles.loadingBrand}>
          <img src="/tideplace-mark.svg" alt="" />
          <strong><b>TIDE</b>PLACE</strong>
          <span>Flow with your audience.</span>
        </div>
        <div className={styles.loadingLine}><span /></div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className={styles.screen}>
        <section className={styles.loginShell}>
          <div className={styles.brandPanel}>
            <div className={styles.brandLockup}>
              <img src="/tideplace-mark.svg" alt="" />
              <div>
                <strong><b>TIDE</b>PLACE</strong>
                <span>Flow with your audience.</span>
              </div>
            </div>

            <div className={styles.brandMessage}>
              <span className={styles.brandKicker}>YOUR SOCIAL PLACE</span>
              <h1>Tudo o que move sua audiência, em um só lugar.</h1>
              <p>Conteúdo, conversas, leads e automações organizados para você acompanhar o fluxo sem perder o que importa.</p>
            </div>

            <div className={styles.brandFeatures}>
              <span>Conteúdo</span>
              <span>Audiência</span>
              <span>Automação</span>
              <span>Relacionamento</span>
            </div>
          </div>

          <div className={styles.authPanel}>
            <div className={styles.mobileBrand}>
              <img src="/tideplace-mark.svg" alt="" />
              <strong><b>TIDE</b>PLACE</strong>
            </div>
            <p className={styles.eyebrow}>ACESSO À PLATAFORMA</p>
            <h2>Bem-vinda de volta.</h2>
            <p className={styles.authIntro}>Entre para acessar sua central TidePlace.</p>

            <form className={styles.form} onSubmit={handleLogin}>
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="seu@email.com"
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
                  placeholder="••••••••"
                  required
                />
              </label>
              {message && <p className={styles.error}>{message}</p>}
              <button type="submit" disabled={submitting}>
                {submitting ? 'Entrando...' : 'Entrar na TidePlace'}
              </button>
            </form>
            <p className={styles.securityNote}>Acesso seguro · seus dados permanecem sincronizados.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      <div className={`${styles.syncBar} ${ready ? styles.syncReady : styles.syncBusy}`}>
        <span>{ready ? syncStatus : 'Sincronizando em segundo plano...'}</span>
        <button type="button" onClick={handleLogout}>Sair</button>
      </div>
    </>
  );
}
