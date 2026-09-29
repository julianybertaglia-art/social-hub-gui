'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from './hub-frame.module.css';
import ThemeCustomizer from './ThemeCustomizer';
import WorkspaceSwitcher, { useWorkspace } from './WorkspaceSwitcher';

const GROUPS = [
  {
    label: 'PRINCIPAL',
    items: [
      { href: '/', label: 'Visão geral', icon: '⌂' },
      { href: '/?section=tasks', label: 'Tarefas', icon: '✓' },
    ],
  },
  {
    label: 'INSTAGRAM',
    items: [
      { href: '/?section=calendar', label: 'Calendário', icon: '▦' },
      { href: '/?section=ideas', label: 'Ideias', icon: '✦' },
      { href: '/?section=metrics', label: 'Métricas', icon: '↗' },
      { href: '/?section=goals', label: 'Metas', icon: '◎' },
      { href: '/automacoes', label: 'Automações', icon: '⚡', match: '/automacoes' },
    ],
  },
  {
    label: 'WHATSAPP',
    items: [
      { href: '/whatsapp', label: 'CRM', icon: '◉', exact: true },
      { href: '/whatsapp/automacoes', label: 'Automações', icon: '⚙', match: '/whatsapp/automacoes' },
      { href: '/whatsapp/campanha', label: 'Campanhas', icon: '↗', match: '/whatsapp/campanha' },
      { href: '/whatsapp/grupos', label: 'Grupos', icon: '◎', match: '/whatsapp/grupos' },
      { href: '/whatsapp/gato', label: 'Gato / envios', icon: '⌁', match: '/whatsapp/gato' },
    ],
  },
  {
    label: 'TIKTOK',
    items: [
      { href: '/tiktok/afiliados', label: 'Afiliados', icon: '◇', match: '/tiktok/afiliados' },
    ],
  },
];

function pageLabel(pathname) {
  if (pathname.startsWith('/tiktok/afiliados')) return 'TikTok · Afiliados';
  if (pathname.startsWith('/whatsapp/automacoes')) return 'WhatsApp · Automações';
  if (pathname.startsWith('/whatsapp/campanha')) return 'WhatsApp · Campanhas';
  if (pathname.startsWith('/whatsapp/grupos')) return 'WhatsApp · Grupos';
  if (pathname.startsWith('/whatsapp/gato')) return 'WhatsApp · Gato';
  if (pathname === '/whatsapp') return 'WhatsApp · CRM';
  if (pathname.startsWith('/automacoes')) return 'Instagram · Automações';
  return 'Central estratégica';
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const [workspace] = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const framed = pathname.startsWith('/whatsapp') || pathname.startsWith('/automacoes') || pathname.startsWith('/tiktok');
  if (!framed) return children;

  return (
    <div className={styles.frame}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <Link href="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
          <div className={styles.brandMark}><img src="/brand/tideplace-mark.svg" alt="" /></div>
          <div className={styles.brandCopy}>
            <strong><b>TIDE</b>PLACE</strong>
            <span>Flow with your audience.</span>
          </div>
        </Link>

        <nav className={styles.nav} aria-label="Áreas da TidePlace">
          {GROUPS.map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = item.exact ? pathname === item.href : item.match ? pathname.startsWith(item.match) : false;
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className={styles.icon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.profile}>
          <div className={styles.profileDot}>J</div>
          <div>
            <strong>Juliany</strong>
            <span>Social media</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button type="button" className={styles.overlay} onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />
      )}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Abrir menu">☰</button>
          <WorkspaceSwitcher />
          <ThemeCustomizer />
          <div className={styles.context}>
            <span>ÁREA ATUAL</span>
            <strong>{pageLabel(pathname)}</strong>
          </div>
        </header>
        <div className={styles.body}>
          {workspace.id === 'gui-nonato' || pathname.startsWith('/tiktok') ? children : (
            <section className={styles.workspaceEmpty}>
              <span className={styles.workspaceEyebrow}>WORKSPACE · {workspace.name.toUpperCase()}</span>
              <h1>Conecte os canais desta conta.</h1>
              <p>
                A estrutura da TidePlace já separa esse workspace do Gui Nonato. Para CRM e automações,
                falta conectar o Instagram e o WhatsApp da {workspace.name}; enquanto isso, os dados do Gui
                não aparecem aqui para não misturar as contas.
              </p>
              <div className={styles.workspaceSteps}>
                <span><b>1</b> Instagram</span>
                <span><b>2</b> WhatsApp</span>
                <span><b>3</b> Automações</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
