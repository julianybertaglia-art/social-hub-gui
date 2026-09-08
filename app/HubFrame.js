'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const MODULES = [
  { href: '/', label: 'Estratégia & conteúdo', icon: '◫', group: 'PRINCIPAL' },
  { href: '/whatsapp', label: 'WhatsApp CRM', icon: '◉', group: 'OPERAÇÃO' },
  { href: '/automacoes', label: 'Automações', icon: '⚡', group: 'OPERAÇÃO' },
];

function pageLabel(pathname) {
  if (pathname.startsWith('/whatsapp')) return 'Atendimento & CRM';
  if (pathname.startsWith('/automacoes')) return 'Automações';
  return 'Central estratégica';
}

export default function HubFrame({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // A home já possui a navegação interna de Conteúdo/Performance.
  // O frame global entra apenas nos módulos operacionais para não duplicar a sidebar.
  const framed = pathname.startsWith('/whatsapp') || pathname.startsWith('/automacoes');

  if (!framed) return children;

  let lastGroup = null;

  return (
    <div className="hub-frame">
      <aside className={`hub-sidebar ${menuOpen ? 'open' : ''}`}>
        <Link href="/" className="hub-brand" onClick={() => setMenuOpen(false)}>
          <div className="hub-brand-mark">GN</div>
          <div>
            <strong>GUI SOCIAL HUB</strong>
            <span>Central estratégica</span>
          </div>
        </Link>

        <nav className="hub-nav" aria-label="Áreas do Hub">
          {MODULES.map((item) => {
            const active = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;

            return (
              <div key={item.href} className="hub-nav-item-wrap">
                {showGroup && <span className="hub-nav-group">{item.group}</span>}
                <Link
                  href={item.href}
                  className={`hub-nav-link ${active ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="hub-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="hub-sidebar-note">
          <span>ORGANIZAÇÃO</span>
          <p>Conteúdo e performance ficam juntos. Leads e automações ficam na operação.</p>
        </div>

        <div className="hub-profile">
          <div className="hub-profile-dot">J</div>
          <div>
            <strong>Juliany</strong>
            <span>Social media</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="hub-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className="hub-main">
        <header className="hub-topbar">
          <button
            type="button"
            className="hub-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            ☰
          </button>

          <div className="hub-account">
            <span className="hub-instagram-dot">◎</span>
            <div>
              <strong>@gui_nonato</strong>
              <span>Instagram</span>
            </div>
          </div>

          <div className="hub-page-context">
            <span>ÁREA ATUAL</span>
            <strong>{pageLabel(pathname)}</strong>
          </div>
        </header>

        <div className="hub-body">{children}</div>
      </div>

      <style jsx>{`
        .hub-frame {
          min-height: 100vh;
          background: var(--bg);
        }

        .hub-sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 50;
          display: flex;
          width: 250px;
          flex-direction: column;
          padding: 28px 18px 20px;
          background: var(--dark);
          color: white;
        }

        .hub-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 8px 28px;
          border-bottom: 1px solid rgba(255,255,255,.1);
          color: white;
          text-decoration: none;
        }

        .hub-brand-mark {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.3);
          border-radius: 50%;
          color: #e7c98f;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: .08em;
        }

        .hub-brand strong,
        .hub-profile strong {
          display: block;
          font-size: 13px;
          letter-spacing: .08em;
        }

        .hub-brand span,
        .hub-profile span {
          display: block;
          margin-top: 3px;
          color: rgba(255,255,255,.5);
          font-size: 12px;
        }

        .hub-nav {
          display: grid;
          gap: 5px;
          margin-top: 24px;
        }

        .hub-nav-item-wrap {
          display: grid;
          gap: 5px;
        }

        .hub-nav-group {
          margin: 12px 12px 2px;
          color: rgba(255,255,255,.34);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .14em;
        }

        .hub-nav-link {
          display: flex;
          min-height: 44px;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          color: rgba(255,255,255,.63);
          text-decoration: none;
          transition: .2s ease;
        }

        .hub-nav-link:hover,
        .hub-nav-link.active {
          background: rgba(185,146,77,.15);
          color: white;
        }

        .hub-nav-link.active {
          box-shadow: inset 3px 0 0 var(--gold);
        }

        .hub-nav-icon {
          display: inline-grid;
          width: 22px;
          place-items: center;
          color: var(--gold);
        }

        .hub-sidebar-note {
          margin: 24px 8px 0;
          padding: 14px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px;
          background: rgba(255,255,255,.035);
        }

        .hub-sidebar-note span {
          color: #d5b57a;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .hub-sidebar-note p {
          margin: 7px 0 0;
          color: rgba(255,255,255,.5);
          font-size: 11px;
          line-height: 1.5;
        }

        .hub-profile {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: auto;
          padding: 18px 8px 0;
          border-top: 1px solid rgba(255,255,255,.1);
        }

        .hub-profile-dot {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border-radius: 50%;
          background: var(--gold);
          color: var(--dark);
          font-weight: 700;
        }

        .hub-main {
          min-height: 100vh;
          margin-left: 250px;
        }

        .hub-topbar {
          position: sticky;
          top: 0;
          z-index: 40;
          display: flex;
          min-height: 72px;
          align-items: center;
          gap: 14px;
          padding: 12px 34px;
          border-bottom: 1px solid var(--border);
          background: rgba(244,243,239,.92);
          backdrop-filter: blur(14px);
        }

        .hub-account {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .hub-account strong,
        .hub-account span {
          display: block;
        }

        .hub-account strong {
          font-size: 14px;
        }

        .hub-account span {
          margin-top: 2px;
          color: var(--muted);
          font-size: 11px;
        }

        .hub-instagram-dot {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 1px solid var(--border);
          border-radius: 50%;
          background: var(--surface);
          color: var(--gold-dark);
          font-size: 18px;
        }

        .hub-page-context {
          margin-left: auto;
          text-align: right;
        }

        .hub-page-context span,
        .hub-page-context strong {
          display: block;
        }

        .hub-page-context span {
          color: var(--muted);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .hub-page-context strong {
          margin-top: 3px;
          font-size: 12px;
        }

        .hub-body {
          min-height: calc(100vh - 72px);
        }

        .hub-menu-button,
        .hub-overlay {
          display: none;
        }

        @media (max-width: 760px) {
          .hub-sidebar {
            transform: translateX(-102%);
            transition: transform .25s ease;
          }

          .hub-sidebar.open {
            transform: translateX(0);
          }

          .hub-main {
            margin-left: 0;
          }

          .hub-menu-button {
            display: block;
            border: 0;
            background: transparent;
            color: var(--text);
            font-size: 21px;
            cursor: pointer;
          }

          .hub-overlay {
            position: fixed;
            inset: 0;
            z-index: 45;
            display: block;
            border: 0;
            background: rgba(0,0,0,.4);
          }

          .hub-topbar {
            padding: 12px 18px;
          }

          .hub-page-context {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
