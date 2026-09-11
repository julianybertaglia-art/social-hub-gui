'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from './hub-frame.module.css';

const GROUPS = [
  {
    label: 'PRINCIPAL',
    items: [
      { href: '/', label: 'Hoje', icon: '●', match: 'home' },
    ],
  },
  {
    label: 'CONTEÚDO',
    items: [
      { href: '/?section=calendar', label: 'Calendário', icon: '▦' },
      { href: '/?section=tasks', label: 'Tarefas', icon: '✓' },
      { href: '/?section=ideas', label: 'Ideias', icon: '✦' },
    ],
  },
  {
    label: 'RELACIONAMENTO',
    items: [
      { href: '/whatsapp', label: 'CRM & Conversas', icon: '◉', match: '/whatsapp' },
      { href: '/automacoes', label: 'Automações', icon: '↗', match: '/automacoes' },
    ],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { href: '/?section=metrics', label: 'Métricas', icon: '⌁' },
      { href: '/?section=goals', label: 'Metas', icon: '◎' },
    ],
  },
];

function pageLabel(pathname) {
  if (pathname.startsWith('/whatsapp/campanha')) return 'Campanhas';
  if (pathname.startsWith('/whatsapp')) return 'CRM & Conversas';
  if (pathname.startsWith('/automacoes')) return 'Automações';
  return 'Seu espaço social';
}

function isActive(item, pathname) {
  if (item.match === 'home') return pathname === '/';
  if (item.match) return pathname.startsWith(item.match);
  return false;
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.frame}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <Link href="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
          <div className={styles.wordmark}>lynna.</div>
          <span className={styles.tagline}>your social space.</span>
        </Link>

        <nav className={styles.nav} aria-label="Áreas da Lynna">
          {GROUPS.map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <Link
                    href={item.href}
                    key={`${group.label}-${item.href}-${item.label}`}
                    className={`${styles.navLink} ${active ? styles.active : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className={styles.icon} aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.profileDot}>J</div>
          <div className={styles.profileCopy}>
            <strong>Juliany</strong>
            <span>Workspace · Gui Nonato</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className={styles.overlay}
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            ☰
          </button>

          <div className={styles.account}>
            <span className={styles.accountAvatar}>GN</span>
            <div>
              <strong>Gui Nonato</strong>
              <span>@gui_nonato · Instagram</span>
            </div>
          </div>

          <div className={styles.currentArea}>
            <span>VOCÊ ESTÁ EM</span>
            <strong>{pageLabel(pathname)}</strong>
          </div>

          <span className={styles.connection}>
            <i aria-hidden="true" />
            Meta conectada
          </span>
        </header>

        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
