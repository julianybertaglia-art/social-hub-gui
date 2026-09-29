'use client';

import Link from 'next/link';
import styles from './automacoes-whatsapp.module.css';

const flows = [
  {
    title: 'Menu de entrada',
    description: 'Organiza cada novo contato por assunto antes de cair no atendimento.',
    status: 'Ativo',
    items: ['Imersão', 'Começar no ML', 'Importação', 'Mentoria', 'Influenciador', 'Outro'],
    href: '/whatsapp',
    cta: 'Abrir CRM',
  },
  {
    title: 'Campanhas e reengajamento',
    description: 'Envios controlados para listas segmentadas, com acompanhamento do que já foi enviado.',
    status: 'Disponível',
    items: ['Áudios por perfil', 'Fila de envio', 'Pausa e retomada', 'Controle de duplicidade'],
    href: '/whatsapp/campanha',
    cta: 'Abrir campanhas',
  },
  {
    title: 'Envios rápidos · Gato',
    description: 'Ferramenta operacional para envios pontuais e testes sem misturar com o CRM principal.',
    status: 'Disponível',
    items: ['Áudio', 'Teste individual', 'Envio manual'],
    href: '/whatsapp/gato',
    cta: 'Abrir Gato',
  },
];

const tools = [
  { href: '/whatsapp', title: 'CRM', text: 'Conversas, leads, etapas e follow-up.' },
  { href: '/whatsapp/campanha', title: 'Campanhas', text: 'Envios em lote e reengajamento.' },
  { href: '/whatsapp/grupos', title: 'Grupos', text: 'Acompanhamento de grupos do WhatsApp.' },
  { href: '/whatsapp/diagnostico', title: 'Diagnóstico', text: 'Status técnico da conexão oficial.' },
];

export default function WhatsappAutomacoesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>WHATSAPP</span>
          <h1>Automações do WhatsApp</h1>
          <p>Fluxos de atendimento, campanhas e envios separados das automações do Instagram.</p>
        </div>
        <span className={styles.channelBadge}><i /> Canal oficial Meta</span>
      </header>

      <section className={styles.summary} aria-label="Resumo das automações">
        <article><span>Fluxos principais</span><strong>3</strong><small>Organizados por função</small></article>
        <article><span>Entrada de leads</span><strong>Triagem</strong><small>Antes do atendimento humano</small></article>
        <article><span>Afiliados TikTok</span><strong>Separado</strong><small>Agora em área própria</small></article>
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>FLUXOS</span>
          <h2>O que está automatizado</h2>
        </div>
      </section>

      <section className={styles.flowGrid}>
        {flows.map((flow) => (
          <article className={styles.flowCard} key={flow.title}>
            <div className={styles.flowTop}>
              <span className={styles.flowIcon}>⚡</span>
              <span className={styles.status}>{flow.status}</span>
            </div>
            <h3>{flow.title}</h3>
            <p>{flow.description}</p>
            <div className={styles.chips}>
              {flow.items.map((item) => <span key={item}>{item}</span>)}
            </div>
            <Link href={flow.href}>{flow.cta} →</Link>
          </article>
        ))}
      </section>

      <section className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>FERRAMENTAS</span>
          <h2>WhatsApp</h2>
        </div>
      </section>

      <section className={styles.toolGrid}>
        {tools.map((tool) => (
          <Link href={tool.href} className={styles.toolCard} key={tool.href}>
            <div>
              <strong>{tool.title}</strong>
              <span>{tool.text}</span>
            </div>
            <b>→</b>
          </Link>
        ))}
      </section>

      <section className={styles.tiktokCallout}>
        <div>
          <span className={styles.eyebrow}>TIKTOK</span>
          <h2>Afiliados agora têm uma área própria.</h2>
          <p>A triagem de criadores continua funcionando, mas a gestão não fica mais misturada com WhatsApp.</p>
        </div>
        <Link href="/tiktok/afiliados">Abrir afiliados →</Link>
      </section>
    </main>
  );
}
