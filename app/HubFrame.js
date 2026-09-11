'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAccount } from './AccountContext';
import styles from './hub-frame.module.css';
import accountStyles from './account-switcher.module.css';

const GROUPS = [
  { label: 'PRINCIPAL', items: [{ href: '/', label: 'Hoje', icon: '●', section: 'dashboard' }] },
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
  dashboard: 'Hoje', calendar: 'Calendário de conteúdo', tasks: 'Tarefas',
  ideas: 'Ideias', metrics: 'Métricas', goals: 'Metas',
};

function pageLabel(pathname, section) {
  if (pathname === '/contas') return 'Contas do Instagram';
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { profiles, activeAccount, selectAccount } = useAccount();
  const connected = activeAccount?.status === 'connected';
  const showSetup = activeAccount && !connected && pathname !== '/contas';

  return (
    <div className={styles.frame}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Voltar para a tela inicial da Lynna"
          title="Voltar para o início"
          onClick={() => {
            setMenuOpen(false);
            setProfileMenuOpen(false);
          }}
        >
          <div className={styles.wordmark}>lynna.</div>
          <span className={styles.tagline}>your social space.</span>
        </Link>
        <nav className={styles.nav} aria-label="Áreas da Lynna">
          {GROUPS.map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => (
                <Link
                  href={item.href}
                  key={`${group.label}-${item.href}-${item.label}`}
                  className={`${styles.navLink} ${isActive(item, pathname, section) ? styles.active : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className={styles.icon} aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.profileDot}>J</div>
          <div className={styles.profileCopy}>
            <strong>Juliany</strong>
          </div>
        </div>
      </aside>

      {menuOpen && <button type="button" className={styles.overlay} onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Abrir menu">☰</button>

          <div className={accountStyles.accountPickerWrap}>
            <button type="button" className={accountStyles.accountPicker} onClick={() => setProfileMenuOpen((open) => !open)} aria-expanded={profileMenuOpen}>
              <span className={styles.accountAvatar}>{activeAccount?.initials || 'IG'}</span>
              <span className={accountStyles.accountPickerCopy}>
                <strong>{activeAccount?.name || 'Instagram'}</strong>
                <span>{activeAccount?.username ? `@${activeAccount.username}` : 'Conta ainda não conectada'}</span>
              </span>
              <span className={accountStyles.chevron}>⌄</span>
            </button>

            {profileMenuOpen && (
              <div className={accountStyles.accountMenu}>
                <span className={accountStyles.accountMenuTitle}>MUDAR DE CONTA</span>
                {profiles.map((profile) => (
                  <button
                    type="button"
                    key={profile.id}
                    className={`${accountStyles.accountOption} ${profile.id === activeAccount?.id ? accountStyles.accountOptionActive : ''}`}
                    onClick={() => { selectAccount(profile.id); setProfileMenuOpen(false); }}
                  >
                    <span className={accountStyles.accountOptionAvatar}>{profile.initials}</span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.username ? `@${profile.username}` : 'Conectar Instagram'}</small>
                    </span>
                    <i className={profile.status === 'connected' ? accountStyles.statusDotOnline : accountStyles.statusDotPending} />
                  </button>
                ))}
                <Link href="/contas" className={accountStyles.manageAccounts} onClick={() => setProfileMenuOpen(false)}>＋ Gerenciar contas</Link>
              </div>
            )}
          </div>

          <div className={styles.currentArea}>
            <span>VOCÊ ESTÁ EM</span>
            <strong>{pageLabel(pathname, section)}</strong>
          </div>

          <span className={`${styles.connection} ${!connected ? accountStyles.connectionPending : ''}`}>
            <i aria-hidden="true" />
            {connected ? 'Meta conectada' : 'Conectar Instagram'}
          </span>
        </header>

        <div className={styles.body}>
          {showSetup ? (
            <section className={accountStyles.accountSetupState}>
              <span className={accountStyles.setupEyebrow}>WORKSPACE · {activeAccount.name.toUpperCase()}</span>
              <h1>Conecte este Instagram para liberar a Lynna.</h1>
              <p>A conta já existe como workspace, mas ainda não está ligada à Meta. Enquanto isso, os dados do Gui ficam isolados e não aparecem aqui.</p>
              <Link href="/contas" className={accountStyles.setupButton}>Ir para Contas →</Link>
            </section>
          ) : children}
        </div>
      </div>
    </div>
  );
}
