'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './automacoes.module.css';
import AudioTest from './AudioTest';
import ArgoAudioAutomation from './ArgoAudioAutomation';
import { isArgoKeyword } from '../lib/argo-flow';
import { supabase } from '../CloudGate';

const DEFAULT_IMERSAO_MESSAGE = 'Fala! Vi que você comentou IMERSÃO no vídeo 👊\n\nA Imersão Ecommerce Mercado Livre Pro é um evento presencial para quem quer escalar sua operação nos marketplaces, com conteúdo prático sobre Mercado Livre, anúncios, operação, IA, importação e estratégias de crescimento.\n\n📅 26 de setembro de 2026\n⏰ 09h30 às 20h30\n📍 R. Airi, 227 — Tatuapé, São Paulo/SP\n\nPara compra de ingressos ou mais informações, fale com a equipe pelo WhatsApp: (11) 92399-0244';

const initialRules = [
  {
    id: 'imersao-reel',
    name: 'Leads — Imersão',
    keyword: 'IMERSÃO',
    publicReply: 'Te chamei no Direct 👊',
    privateMessage: DEFAULT_IMERSAO_MESSAGE,
    tag: 'Interesse — Imersão',
    active: true,
  },
  {
    id: 'automacao-2',
    name: 'Nova automação 2',
    keyword: '',
    publicReply: 'Te chamei no Direct 👊',
    privateMessage: '',
    tag: '',
    active: false,
  },
  {
    id: 'automacao-3',
    name: 'Nova automação 3',
    keyword: '',
    publicReply: 'Te chamei no Direct 👊',
    privateMessage: '',
    tag: '',
    active: false,
  },
];

function ensureThreeRules(value) {
  const parsed = Array.isArray(value) ? value.slice(0, 3) : [];
  return initialRules.map((fallback, index) => ({
    ...fallback,
    ...(parsed[index] || {}),
    id: parsed[index]?.id || fallback.id,
    active: Boolean((parsed[index]?.active ?? fallback.active) && !isArgoKeyword(parsed[index]?.keyword || fallback.keyword)),
  }));
}

export default function AutomacoesPage() {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [connected, setConnected] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [activeTool, setActiveTool] = useState('comments');

  useEffect(() => {
    let cancelled = false;

    async function loadRules() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.access_token) throw new Error('Entre novamente no Hub.');
        const response = await fetch('/api/instagram/comment-automations', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: 'no-store',
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as automações.');
        if (cancelled) return;
        const nextRules = ensureThreeRules(payload.rules);
        window.localStorage.setItem('guihub-automations', JSON.stringify(nextRules));
        setRules(nextRules);
        setConnected(Boolean(payload.connected));
      } catch (error) {
        if (cancelled) return;
        setSaveError(error.message);
        try {
          const stored = window.localStorage.getItem('guihub-automations');
          setRules(stored ? ensureThreeRules(JSON.parse(stored)) : initialRules);
        } catch {
          setRules(initialRules);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    async function recoverQuietly() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.access_token || cancelled) return;
        const response = await fetch('/api/instagram/comment-automations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'recover_latest' }),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!cancelled && response.ok && payload?.recovery?.recovered) {
          setRecoveryMessage(`${payload.recovery.recovered} comentário(s) recuperado(s) e Direct enviado.`);
        }
      } catch {
        // The webhook remains the primary trigger; background recovery is best effort.
      }
    }

    loadRules();
    const recoveryTimer = window.setTimeout(recoverQuietly, 1500);
    const recoveryInterval = window.setInterval(recoverQuietly, 20000);
    return () => {
      cancelled = true;
      window.clearTimeout(recoveryTimer);
      window.clearInterval(recoveryInterval);
    };
  }, []);

  const activeCount = useMemo(
    () => rules.filter((rule) => rule.active && rule.keyword.trim() && !isArgoKeyword(rule.keyword)).length,
    [rules]
  );

  function updateRule(index, field, value) {
    setRules((current) => current.map((rule, ruleIndex) => (
      ruleIndex === index ? { ...rule, [field]: value, ...(field === 'keyword' && isArgoKeyword(value) ? { active: false } : {}) } : rule
    )));
    setSaved(false);
  }

  function resetRule(index) {
    if (index === 0) return;
    setRules((current) => current.map((rule, ruleIndex) => (
      ruleIndex === index ? { ...initialRules[index] } : rule
    )));
    setSaved(false);
  }

  async function saveRules() {
    const cleaned = rules.map((rule) => ({
      ...rule,
      name: rule.name.trim() || 'Automação sem nome',
      keyword: rule.keyword.trim().toUpperCase(),
      publicReply: rule.publicReply.trim(),
      privateMessage: rule.privateMessage.trim(),
      tag: rule.tag.trim(),
      active: Boolean(rule.active && rule.keyword.trim() && rule.privateMessage.trim() && !isArgoKeyword(rule.keyword)),
    }));

    setSaving(true);
    setSaveError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no Hub.');
      const response = await fetch('/api/instagram/comment-automations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rules: cleaned }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar as automações.');
      const nextRules = ensureThreeRules(payload.rules);
      window.localStorage.setItem('guihub-automations', JSON.stringify(nextRules));
      setRules(nextRules);
      setConnected(Boolean(payload.connected));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setConnected(false);
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function recoverLatestComments() {
    setRecovering(true);
    setRecoveryMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente no Hub.');
      const response = await fetch('/api/instagram/comment-automations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'recover_latest' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível recuperar os comentários.');
      const result = payload.recovery;
      setRecoveryMessage(
        result.recovered
          ? `${result.recovered} comentário(s) recuperado(s) e Direct enviado.`
          : result.failed
            ? `O Instagram recusou o Direct de ${result.failed} comentário(s). Salve as regras para reparar a conexão.`
          : result.matched
            ? 'Os comentários encontrados já tinham sido processados.'
            : 'Ainda não encontrei comentário recente com uma palavra-chave ativa.'
      );
    } catch (error) {
      setRecoveryMessage(error.message);
    } finally {
      setRecovering(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INSTAGRAM</span>
          <h1>Automações do Instagram</h1>
          <p>Comentários, Direct e fluxos automáticos organizados por função — sem misturar com WhatsApp.</p>
        </div>
        <span className={styles.accountBadge}><i /> @gui_nonato</span>
      </header>

      <section className={styles.statusGrid}>
        <article className={styles.statusCard}>
          <span>Conta profissional</span>
          <strong>Conectada</strong>
          <small>Instagram Business</small>
        </article>
        <article className={styles.statusCard}>
          <span>Regras por comentário</span>
          <strong>{activeCount} ativas</strong>
          <small>Direct automático por palavra-chave</small>
        </article>
        <article className={styles.statusCard}>
          <span>Webhook</span>
          <strong>{connected === null ? 'Verificando' : connected ? 'Online' : 'Atenção'}</strong>
          <small>{connected ? 'Eventos chegando pela Meta' : 'Salve as regras para reparar a conexão'}</small>
        </article>
      </section>

      <nav className={styles.toolTabs} aria-label="Ferramentas de automação do Instagram">
        <button type="button" className={activeTool === 'comments' ? styles.toolTabActive : ''} onClick={() => setActiveTool('comments')}>
          <span>01</span>
          <div><strong>Comentários → Direct</strong><small>Palavra-chave e resposta automática</small></div>
        </button>
        <button type="button" className={activeTool === 'argo' ? styles.toolTabActive : ''} onClick={() => setActiveTool('argo')}>
          <span>02</span>
          <div><strong>Direct ARGO</strong><small>Fluxo automático com áudio</small></div>
        </button>
        <button type="button" className={activeTool === 'audio' ? styles.toolTabActive : ''} onClick={() => setActiveTool('audio')}>
          <span>03</span>
          <div><strong>Teste de áudio</strong><small>Validação antes de ativar</small></div>
        </button>
      </nav>

      {activeTool === 'argo' && <ArgoAudioAutomation />}
      {activeTool === 'audio' && <AudioTest />}

      {activeTool === 'comments' && (
        <>
          <section className={styles.sectionIntro}>
            <div>
              <span className={styles.eyebrow}>COMENTÁRIOS</span>
              <h2>Regras por palavra-chave</h2>
              <p>Quando alguém comenta uma palavra ativa, a TidePlace responde publicamente e envia a mensagem definida no Direct.</p>
            </div>
            <button className={styles.recoverButton} type="button" onClick={recoverLatestComments} disabled={!hydrated || recovering || saving}>
              {recovering ? 'Verificando…' : 'Recuperar pendentes'}
            </button>
          </section>

          {recoveryMessage && <div className={styles.feedback}>{recoveryMessage}</div>}
          {saveError && <div className={styles.feedback + ' ' + styles.feedbackError}>{saveError}</div>}

          <section className={styles.rulesWrap}>
            {rules.map((rule, index) => (
              <article className={styles.panel} key={rule.id}>
                <div className={styles.panelHeading}>
                  <div className={styles.ruleTitle}>
                    <span className={styles.ruleNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <span className={styles.eyebrow}>AUTOMAÇÃO</span>
                      <h2>{rule.name || ('Automação ' + (index + 1))}</h2>
                    </div>
                  </div>
                  <label className={styles.switchRow}>
                    <span>{rule.active ? 'Ativa' : 'Pausada'}</span>
                    <input
                      type="checkbox"
                      checked={rule.active}
                      disabled={isArgoKeyword(rule.keyword)}
                      onChange={(event) => updateRule(index, 'active', event.target.checked)}
                    />
                    <i aria-hidden="true" />
                  </label>
                </div>

                {index === 0 && (
                  <div className={styles.notice}>
                    Esta é a regra que já usamos para IMERSÃO. Você pode atualizar o texto sem criar outro fluxo.
                  </div>
                )}
                {isArgoKeyword(rule.keyword) && (
                  <div className={styles.notice}>ARGO agora usa o fluxo próprio de Direct + áudio. Esta regra por comentário fica pausada.</div>
                )}

                <div className={styles.formGrid}>
                  <label>
                    Nome
                    <input
                      value={rule.name}
                      onChange={(event) => updateRule(index, 'name', event.target.value)}
                      placeholder="Ex.: Leads — Mentoria"
                    />
                  </label>

                  <label>
                    Palavra-chave
                    <input
                      value={rule.keyword}
                      onChange={(event) => updateRule(index, 'keyword', event.target.value.toUpperCase())}
                      placeholder="Ex.: MENTORIA"
                    />
                  </label>

                  <label className={styles.fullField}>
                    Resposta pública
                    <input
                      value={rule.publicReply}
                      onChange={(event) => updateRule(index, 'publicReply', event.target.value)}
                      placeholder="Ex.: Te chamei no Direct 👊"
                    />
                  </label>

                  <label className={styles.fullField}>
                    Mensagem no Direct
                    <textarea
                      rows="7"
                      value={rule.privateMessage}
                      onChange={(event) => updateRule(index, 'privateMessage', event.target.value)}
                      placeholder="Escreva aqui a mensagem automática..."
                    />
                  </label>

                  <label className={styles.fullField}>
                    Tag do lead
                    <input
                      value={rule.tag}
                      onChange={(event) => updateRule(index, 'tag', event.target.value)}
                      placeholder="Ex.: Interesse — Mentoria"
                    />
                  </label>
                </div>

                {index > 0 && (
                  <button className={styles.clearButton} type="button" onClick={() => resetRule(index)}>
                    Limpar automação
                  </button>
                )}
              </article>
            ))}
          </section>

          <section className={styles.saveDock}>
            <div>
              <strong>{saved ? 'Configurações salvas ✓' : 'Alterações das regras do Instagram'}</strong>
              <span>{hydrated ? 'Salve para publicar as mudanças no servidor.' : 'Carregando configurações...'}</span>
            </div>
            <button className={styles.saveButton} type="button" onClick={saveRules} disabled={!hydrated || saving}>
              {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar automações'}
            </button>
          </section>
        </>
      )}
    </main>
  );
}
