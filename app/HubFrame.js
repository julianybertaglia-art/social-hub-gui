'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './hub-frame.module.css';
import ThemeCustomizer from './ThemeCustomizer';
import WorkspaceSwitcher, { useWorkspace, useVitalConnectionStatus } from './WorkspaceSwitcher';
import VitalWhatsAppInbox from './VitalWhatsAppInbox';
import ViviAutomationPanel from './ViviAutomationPanel';
import VitalAffiliatePanel from './VitalAffiliatePanel';
import ArgoBridgePanel from './ArgoBridgePanel';
import VitalInstagramAutomationPanel from './VitalInstagramAutomationPanel';
import HubHealthBell from './HubHealthBell';
import Icon from './ui/Icon';
import NavigationSearch from './ui/NavigationSearch';
import { visibleNavGroups, matchesNavigation } from './ui/navigation';

function pageLabel(pathname) {
  if (pathname.startsWith('/radar')) return 'Criação · Radar de conteúdo';
  if (pathname.startsWith('/crm')) return 'CRM · Funil';
  if (pathname.startsWith('/conteudo')) return 'Conteúdo · IA';
  if (pathname.startsWith('/criar-post')) return 'Criar post';
  if (pathname.startsWith('/admin')) return 'Administração · Central de Controle';
  if (pathname.startsWith('/tiktok/afiliados')) return 'TikTok · Afiliados';
  if (pathname === '/whatsapp/setores') return 'WhatsApp · Meus setores';
  if (pathname.startsWith('/whatsapp/automacoes')) return 'WhatsApp · Automações';
  if (pathname.startsWith('/whatsapp/integracao-argo')) return 'WhatsApp · Integração Argo';
  if (pathname.startsWith('/whatsapp/campanha')) return 'WhatsApp · Campanhas';
  if (pathname.startsWith('/whatsapp/grupos')) return 'WhatsApp · Grupos';
  if (pathname.startsWith('/whatsapp/gato')) return 'WhatsApp · Gato';
  if (pathname === '/whatsapp') return 'WhatsApp · Caixa de entrada';
  if (pathname.startsWith('/automacoes')) return 'Instagram · Automações';
  return 'Central estratégica';
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const [workspace] = useWorkspace();
  const vital = useVitalConnectionStatus();
  const vitalConnected = vital.instagram === true && vital.whatsapp === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState('dashboard');
  useEffect(() => {
    function syncSection(event) {
      const requested = event?.detail?.section || new URLSearchParams(window.location.search).get('section');
      setSection(requested || 'dashboard');
    }
    syncSection();
    window.addEventListener('tideplace:section-change', syncSection);
    window.addEventListener('popstate', syncSection);
    return () => {
      window.removeEventListener('tideplace:section-change', syncSection);
      window.removeEventListener('popstate', syncSection);
    };
  }, [pathname]);

  function changeSection(next) {
    setSection(next);
    window.dispatchEvent(new CustomEvent('tideplace:section-change', { detail: { section: next } }));
  }

  const framed = pathname === '/' || pathname.startsWith('/whatsapp') || pathname.startsWith('/automacoes') || pathname.startsWith('/tiktok') || pathname.startsWith('/admin') || pathname.startsWith('/criar-post') || pathname.startsWith('/crm') || pathname.startsWith('/conteudo') || pathname.startsWith('/radar');
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
          {visibleNavGroups(workspace.id).map((group) => (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = matchesNavigation(item, pathname, section);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={item.description}
                    onClick={(event) => {
                      if (pathname === '/' && item.section) {
                        event.preventDefault();
                        changeSection(item.section);
                      }
                      setMenuOpen(false);
                    }}
                  >
                    <span className={styles.icon}><Icon name={item.icon} size={18} /></span>
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
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Icon name="menu" size={21} /></button>
          <WorkspaceSwitcher />
          <NavigationSearch workspaceId={workspace.id} pathname={pathname} onSectionChange={changeSection} />
          <ThemeCustomizer />
          <HubHealthBell />
          <div className={styles.context}>
            <span>VOCÊ ESTÁ EM</span>
            <strong>{pageLabel(pathname)}</strong>
          </div>
        </header>
        <div className={styles.body}>
          {workspace.id === 'gui-nonato' ? children : pathname === '/' ? children : pathname.startsWith('/admin') || pathname.startsWith('/criar-post') || pathname.startsWith('/crm') || pathname.startsWith('/conteudo') || pathname.startsWith('/radar') ? children : pathname.startsWith('/tiktok') ? (
            <VitalAffiliatePanel />
          ) : pathname === '/whatsapp' || pathname === '/whatsapp/setores' ? (
            <VitalWhatsAppInbox view={pathname === '/whatsapp/setores' ? 'mine' : 'all'} />
          ) : pathname === '/whatsapp/automacoes' ? (
            <ViviAutomationPanel />
          ) : pathname === '/whatsapp/integracao-argo' ? (
            <ArgoBridgePanel />
          ) : pathname === '/automacoes' ? (
            <VitalInstagramAutomationPanel />
          ) : (
            <section className={styles.workspaceEmpty}>
              <span className={styles.workspaceEyebrow}>WORKSPACE · {workspace.name.toUpperCase()}</span>
              <h1>{vital.loading ? 'Verificando canais da Vital Decor...' : vitalConnected ? 'Canais da Vital Decor conectados.' : 'Gerencie as conexões da Vital Decor.'}</h1>
              <p>
                {vitalConnected
                  ? 'O Instagram e o WhatsApp estão autorizados. As métricas da Vital já podem ser consultadas. O CRM do Gui permanece isolado para não misturar as conversas entre empresas.'
                  : vital.error ? 'Não foi possível consultar a Meta agora. Confira a página de conexões.'
                  : 'Veja o estado de cada canal da Vital Decor e atualize a autorização quando necessário.'}
              </p>
              <div className={styles.workspaceSteps}>
                <span><b>{vital.instagram ? '✓' : '1'}</b> Instagram</span>
                <span><b>{vital.whatsapp ? '✓' : '2'}</b> WhatsApp</span>
                <span><b>3</b> Automações separadas</span>
              </div>
              <p style={{marginTop: 20}}><Link href="/conexoes/vital-decor">Ver conexões da Vital Decor →</Link></p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
