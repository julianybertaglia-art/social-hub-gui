'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './automacoes-refresh.module.css';
import AudioTest from './AudioTest';
import ArgoAudioAutomation from './ArgoAudioAutomation';
import { isArgoKeyword } from '../lib/argo-flow';

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
  const [hydrated, setHydrated] = useState(false);
  const [openRule, setOpenRule] = useState(0);

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

  function saveRules() {
    const cleaned = rules.map((rule) => ({
      ...rule,
      name: rule.name.trim() || 'Automação sem nome',
      keyword: rule.keyword.trim().toUpperCase(),
      publicReply: rule.publicReply.trim(),
      privateMessage: rule.privateMessage.trim(),
      tag: rule.tag.trim(),
      active: Boolean(rule.active && rule.keyword.trim() && rule.privateMessage.trim() && !isArgoKeyword(rule.keyword)),
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
          <span className={styles.eyebrow}>INSTAGRAM · AUTOMAÇÕES</span>
          <h1>Automações</h1>
          <p>Veja primeiro o que está ativo. Abra uma automação só quando quiser editar e deixe os testes técnicos fora do caminho no dia a dia.</p>
        </div>
      </header>

      <section className={styles.statusStrip} aria-label="Resumo das automações">
        <div><span>Conta</span><strong>@gui_nonato</strong><small>Meta conectada</small></div>
        <div><span>Comentários</span><strong>{activeCount} ativa{activeCount === 1 ? '' : 's'}</strong><small>de até 3 regras</small></div>
        <div><span>Envio</span><strong>Online</strong><small>Webhook da Meta ativo</small></div>
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>DIRECT</span>
            <h2>Fluxos no Direct</h2>
            <p>Automações que começam por mensagem privada e seguem um fluxo de resposta.</p>
          </div>
        </div>
        <ArgoAudioAutomation />
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>COMENTÁRIOS</span>
            <h2>Respostas por palavra-chave</h2>
            <p>Uma visão simples das regras. Clique em editar apenas quando precisar alterar alguma coisa.</p>
          </div>
          <span className={styles.sectionCount}>{activeCount} ativa{activeCount === 1 ? '' : 's'}</span>
        </div>

        <div className={styles.rulesWrap}>
          {rules.map((rule, index) => {
            const opened = openRule === index;
            const keyword = rule.keyword.trim() || 'Sem palavra-chave';
            return (
              <article className={`${styles.ruleCard} ${opened ? styles.ruleCardOpen : ''}`} key={rule.id}>
                <div className={styles.ruleSummary}>
                  <button className={styles.ruleMainButton} type="button" onClick={() => setOpenRule(opened ? null : index)} aria-expanded={opened}>
                    <span className={styles.ruleNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <span className={styles.ruleCopy}>
                      <strong>{rule.name || `Automação ${index + 1}`}</strong>
                      <small><b>{keyword}</b>{rule.tag ? ` · ${rule.tag}` : ''}</small>
                    </span>
                    <span className={styles.editHint}>{opened ? 'Fechar' : 'Editar'} <i aria-hidden="true">{opened ? '↑' : '↓'}</i></span>
                  </button>

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

                {opened && (
                  <div className={styles.ruleEditor}>
                    {index === 0 && <div className={styles.notice}>Esta é a automação já usada para IMERSÃO. Você pode editar normalmente.</div>}
                    {isArgoKeyword(rule.keyword) && <div className={styles.notice}>ARGO funciona pelo fluxo de Direct acima. Esta regra por comentário fica desativada.</div>}

                    <div className={styles.formGrid}>
                      <label>Nome da automação<input value={rule.name} onChange={(event) => updateRule(index, 'name', event.target.value)} placeholder="Ex.: Leads — Mentoria" /></label>
                      <label>Palavra-chave<input value={rule.keyword} onChange={(event) => updateRule(index, 'keyword', event.target.value.toUpperCase())} placeholder="Ex.: MENTORIA" /></label>
                      <label className={styles.fullField}>Resposta pública no comentário<input value={rule.publicReply} onChange={(event) => updateRule(index, 'publicReply', event.target.value)} placeholder="Ex.: Te chamei no Direct 👊" /></label>
                      <label className={styles.fullField}>Mensagem enviada no Direct<textarea rows="7" value={rule.privateMessage} onChange={(event) => updateRule(index, 'privateMessage', event.target.value)} placeholder="Escreva aqui a mensagem automática..." /></label>
                      <label className={styles.fullField}>Tag do lead<input value={rule.tag} onChange={(event) => updateRule(index, 'tag', event.target.value)} placeholder="Ex.: Interesse — Mentoria" /></label>
                    </div>

                    <div className={styles.editorActions}>
                      {index > 0 && <button className={styles.clearButton} type="button" onClick={() => resetRule(index)}>Limpar automação</button>}
                      <button className={styles.saveButton} type="button" onClick={saveRules} disabled={!hydrated}>{saved ? 'Salvo ✓' : 'Salvar alterações'}</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <details className={styles.toolsPanel}>
        <summary><span><b>Ferramentas de teste</b><small>Abra somente quando precisar testar ou trocar um áudio.</small></span><i aria-hidden="true">＋</i></summary>
        <div className={styles.toolsContent}><AudioTest /></div>
      </details>

      <div className={styles.pageSaveNote}>
        <span>{hydrated ? 'As alterações ficam sincronizadas com o Hub.' : 'Carregando configurações...'}</span>
        {!saved && <button type="button" onClick={saveRules} disabled={!hydrated}>Salvar tudo</button>}
        {saved && <strong>Salvo ✓</strong>}
      </div>
    </main>
  );
}
