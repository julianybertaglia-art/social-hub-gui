'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './automacoes.module.css';

const initialRule = {
  id: 'mentoria-reel',
  name: 'Leads — Mentoria',
  keyword: 'MENTORIA',
  publicReply: 'Te chamei no Direct 👊',
  privateMessage: 'Fala! Vi que você comentou MENTORIA no vídeo 👊\n\nHoje você já vende em marketplace?',
  tag: 'Interesse — Mentoria',
  active: false,
};

export default function AutomacoesPage() {
  const [rule, setRule] = useState(initialRule);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('guihub-automation-mentoria');
      if (stored) setRule(JSON.parse(stored));
    } catch (error) {
      console.warn('Não foi possível carregar a automação.', error);
    }
  }, []);

  function updateField(field, value) {
    setRule((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function saveRule() {
    window.localStorage.setItem('guihub-automation-mentoria', JSON.stringify(rule));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>INSTAGRAM · @GUI_NONATO</span>
          <h1>Automações</h1>
          <p>Configure como o Hub deverá agir quando alguém comentar uma palavra-chave.</p>
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
          <span>Regra criada</span>
          <strong>MENTORIA</strong>
          <small>Comentário → Direct</small>
        </article>
        <article className={`${styles.statusCard} ${styles.pendingCard}`}>
          <span>Envio automático</span>
          <strong>Aguardando Meta</strong>
          <small>Webhook e permissões ainda serão configurados</small>
        </article>
      </section>

      <section className={styles.layout}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>PRIMEIRA AUTOMAÇÃO</span>
              <h2>{rule.name}</h2>
            </div>
            <label className={styles.switchRow}>
              <span>{rule.active ? 'Ativa' : 'Pausada'}</span>
              <input
                type="checkbox"
                checked={rule.active}
                onChange={(event) => updateField('active', event.target.checked)}
              />
              <i aria-hidden="true" />
            </label>
          </div>

          <div className={styles.notice}>
            O botão pode ser preparado agora, mas nenhuma mensagem será enviada até a integração oficial da Meta estar concluída.
          </div>

          <div className={styles.formGrid}>
            <label>
              Nome da automação
              <input value={rule.name} onChange={(event) => updateField('name', event.target.value)} />
            </label>

            <label>
              Palavra-chave
              <input
                value={rule.keyword}
                onChange={(event) => updateField('keyword', event.target.value.toUpperCase())}
              />
            </label>

            <label className={styles.fullField}>
              Resposta pública no comentário
              <input
                value={rule.publicReply}
                onChange={(event) => updateField('publicReply', event.target.value)}
              />
            </label>

            <label className={styles.fullField}>
              Primeira mensagem no Direct
              <textarea
                rows="6"
                value={rule.privateMessage}
                onChange={(event) => updateField('privateMessage', event.target.value)}
              />
            </label>

            <label className={styles.fullField}>
              Tag criada no CRM
              <input value={rule.tag} onChange={(event) => updateField('tag', event.target.value)} />
            </label>
          </div>

          <button className={styles.saveButton} onClick={saveRule}>
            {saved ? 'Configuração salva ✓' : 'Salvar configuração'}
          </button>
        </article>

        <aside className={styles.sideColumn}>
          <article className={`${styles.panel} ${styles.flowPanel}`}>
            <span className={styles.eyebrow}>COMO VAI FUNCIONAR</span>
            <h2>Fluxo da Mentoria</h2>
            <ol>
              <li><b>1</b><div><strong>Comentário</strong><span>A pessoa comenta “MENTORIA” no Reel.</span></div></li>
              <li><b>2</b><div><strong>Resposta pública</strong><span>O perfil avisa que chamou no Direct.</span></div></li>
              <li><b>3</b><div><strong>Mensagem privada</strong><span>O Hub inicia a qualificação do lead.</span></div></li>
              <li><b>4</b><div><strong>CRM</strong><span>O contato recebe a tag de interesse.</span></div></li>
            </ol>
          </article>

          <article className={`${styles.panel} ${styles.nextPanel}`}>
            <span className={styles.eyebrow}>PRÓXIMA ETAPA TÉCNICA</span>
            <h2>Conectar comentários em tempo real</h2>
            <p>Depois desta tela, configuraremos o aplicativo da Meta, o webhook e as permissões para responder pelo Instagram.</p>
            <span className={styles.stepBadge}>Etapa 1 de 2</span>
          </article>
        </aside>
      </section>
    </main>
  );
}
