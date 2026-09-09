'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from './hub-frame.module.css';

const GROUPS = [
  { label: 'PRINCIPAL', items: [{ href: '/', label: 'Visão geral', icon: '⌂' }] },
  {
    label: 'PLANEJAMENTO',
    items: [
      { href: '/?section=calendar', label: 'Calendário', icon: '▦' },
      { href: '/?section=tasks', label: 'Tarefas', icon: '✓' },
      { href: '/?section=ideas', label: 'Ideias', icon: '✦' },
    ],
  },
  {
    label: 'AUDIÊNCIA',
    items: [
      { href: '/whatsapp', label: 'CRM', icon: '◉', match: '/whatsapp' },
      { href: '/automacoes', label: 'Automações', icon: '⚡', match: '/automacoes' },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { href: '/?section=metrics', label: 'Métricas', icon: '↗' },
      { href: '/?section=goals', label: 'Metas', icon: '◎' },
    ],
  },
];

function pageLabel(pathname) {
  if (pathname.startsWith('/whatsapp')) return 'CRM';
  if (pathname.startsWith('/automacoes')) return 'Automações';
  return 'Central estratégica';
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const framed = pathname.startsWith('/whatsapp') || pathname.startsWith('/automacoes');
  if (!framed) return children;

  return (
    <div className={styles.frame}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <Link href="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
          <div className={styles.brandMark}>GN</div>
          <div>
            <strong>GUI SOCIAL HUB</strong>
            <span>Central estratégica</span>
          </div>
        </Link>

        <nav className={styles.nav} aria-label="Áreas do Hub">
          {GROUPS.map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = item.match ? pathname.startsWith(item.match) : false;
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
          <div className={styles.account}>
            <span className={styles.instagramDot}>GN</span>
            <div>
              <strong>Gui Nonato</strong>
              <span>@gui_nonato · Instagram</span>
            </div>
          </div>
          <div className={styles.context}>
            <span>ÁREA ATUAL</span>
            <strong>{pageLabel(pathname)}</strong>
          </div>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
