'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import styles from './hub-frame.module.css';

const GROUPS = [
  {
    label: 'PRINCIPAL',
    items: [
      { href: '/', label: 'Hoje', icon: '●', section: 'dashboard' },
    ],
  },
  {
    label: 'CONTEÚDO',
    items: [
      { href: '/?section=calendar', label: 'Calendário', icon: '▦', section: 'calendar' },
      { href: '/?section=tasks', label: 'Tarefas', icon: '✓', section: 'tasks' },
      { href: '/?section=ideas', label: 'Ideias', icon: '✦', section: 'ideas' },
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
      { href: '/?section=metrics', label: 'Métricas', icon: '⌁', section: 'metrics' },
      { href: '/?section=goals', label: 'Metas', icon: '◎', section: 'goals' },
    ],
  },
];

const SECTION_LABELS = {
  dashboard: 'Hoje',
  calendar: 'Calendário de conteúdo',
  tasks: 'Tarefas',
  ideas: 'Ideias',
  metrics: 'Métricas',
  goals: 'Metas',
};

function pageLabel(pathname, section) {
  if (pathname.startsWith('/whatsapp/campanha')) return 'Campanhas';
  if (pathname.startsWith('/whatsapp')) return 'CRM & Conversas';
  if (pathname.startsWith('/automacoes')) return 'Automações';
  return SECTION_LABELS[section] || 'Hoje';
}

function isActive(item, pathname, section) {
  if (item.match) return pathname.startsWith(item.match);
  if (pathname !== '/') return false;
  return item.section === section;
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get('section') || 'dashboard';
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
                const active = isActive(item, pathname, section);
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
            <strong>{pageLabel(pathname, section)}</strong>
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
