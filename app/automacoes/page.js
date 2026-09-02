'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './automacoes.module.css';
import AudioTest from './AudioTest';
import ArgoAudioAutomation from './ArgoAudioAutomation';

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
  }));
}

export default function AutomacoesPage() {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('guihub-automations');
      if (stored) {
        setRules(ensureThreeRules(JSON.parse(stored)));
      } else {
        window.localStorage.setItem('guihub-automations', JSON.stringify(initialRules));
        setRules(initialRules);
      }
    } catch (error) {
      console.warn('Não foi possível carregar as automações.', error);
      setRules(initialRules);
    } finally {
      setHydrated(true);
    }
  }, []);

  const activeCount = useMemo(
    () => rules.filter((rule) => rule.active && rule.keyword.trim()).length,
    [rules]
  );

  function updateRule(index, field, value) {
    setRules((current) => current.map((rule, ruleIndex) => (
      ruleIndex === index ? { ...rule, [field]: value } : rule
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

  function saveRules() {
    const cleaned = rules.map((rule) => ({
      ...rule,
      name: rule.name.trim() || 'Automação sem nome',
      keyword: rule.keyword.trim().toUpperCase(),
      publicReply: rule.publicReply.trim(),
      privateMessage: rule.privateMessage.trim(),
      tag: rule.tag.trim(),
      active: Boolean(rule.active && rule.keyword.trim() && rule.privateMessage.trim()),
    }));

    window.localStorage.setItem('guihub-automations', JSON.stringify(cleaned));
    setRules(cleaned);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INSTAGRAM · @GUI_NONATO</span>
          <h1>Automações</h1>
          <p>Crie até três palavras-chave. O Hub identifica o comentário e envia a resposta e o Direct correspondentes.</p>
        </div>
        <Link className={styles.backButton} href="/">← Voltar ao Hub</Link>
      </header>

      <section className={styles.statusGrid}>
        <article className={styles.statusCard}>
          <span>Conta profissional</span>
          <strong>Conectada</strong>
          <small>@gui_nonato</small>
        </article>
        <article className={styles.statusCard}>
          <span>Automações ativas</span>
          <strong>{activeCount} de 3</strong>
          <small>Você pode deixar até três regras prontas</small>
        </article>
        <article className={styles.statusCard}>
          <span>Envio automático</span>
          <strong>Conectado</strong>
          <small>Webhook oficial da Meta ativo</small>
        </article>
      </section>

      <ArgoAudioAutomation />

      <AudioTest />

      <section className={styles.rulesWrap}>
        {rules.map((rule, index) => (
          <article className={styles.panel} key={rule.id}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.eyebrow}>AUTOMAÇÃO {index + 1}</span>
                <h2>{rule.name || `Automação ${index + 1}`}</h2>
              </div>
              <label className={styles.switchRow}>
                <span>{rule.active ? 'Ativa' : 'Pausada'}</span>
                <input
                  type="checkbox"
                  checked={rule.active}
                  onChange={(event) => updateRule(index, 'active', event.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </div>

            {index === 0 && (
              <div className={styles.notice}>
                Esta é a automação que já testamos com IMERSÃO. Você pode editar o texto e salvar normalmente.
              </div>
            )}

            <div className={styles.formGrid}>
              <label>
                Nome da automação
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
                Resposta pública no comentário
                <input
                  value={rule.publicReply}
                  onChange={(event) => updateRule(index, 'publicReply', event.target.value)}
                  placeholder="Ex.: Te chamei no Direct 👊"
                />
              </label>

              <label className={styles.fullField}>
                Mensagem enviada no Direct
                <textarea
                  rows="9"
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
                Limpar esta automação
              </button>
            )}
          </article>
        ))}
      </section>

      <section className={styles.saveDock}>
        <div>
          <strong>{hydrated ? 'As alterações são sincronizadas com o Hub.' : 'Carregando configurações...'}</strong>
          <span>Depois de salvar, aguarde alguns segundos antes de testar a nova palavra-chave.</span>
        </div>
        <button className={styles.saveButton} type="button" onClick={saveRules} disabled={!hydrated}>
          {saved ? 'Configurações salvas ✓' : 'Salvar as 3 automações'}
        </button>
      </section>
    </main>
  );
}
