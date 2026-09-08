'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AutomationShortcut() {
  const pathname = usePathname();

  if (pathname !== '/') return null;

  return (
    <div className="home-operation-shortcuts" aria-label="Operação do Hub">
      <span className="shortcut-group-label">OPERAÇÃO</span>

      <Link href="/whatsapp" className="shortcut-link">
        <span className="shortcut-icon">◉</span>
        <strong>WhatsApp CRM</strong>
      </Link>

      <Link href="/automacoes" className="shortcut-link">
        <span className="shortcut-icon">⚡</span>
        <strong>Automações</strong>
      </Link>

      <style jsx>{`
        .home-operation-shortcuts {
          position: fixed;
          left: 18px;
          bottom: 82px;
          z-index: 60;
          display: grid;
          width: 214px;
          gap: 6px;
          padding-top: 15px;
          border-top: 1px solid rgba(255,255,255,.08);
        }

        .shortcut-group-label {
          margin: 0 14px 2px;
          color: rgba(255,255,255,.34);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .14em;
        }

        .shortcut-link {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          align-items: center;
          gap: 12px;
          min-height: 42px;
          padding: 9px 14px;
          border-radius: 10px;
          background: transparent;
          color: rgba(255,255,255,.63);
          text-decoration: none;
          transition: .2s ease;
        }

        .shortcut-link:hover {
          background: rgba(185,146,77,.15);
          color: white;
        }

        .shortcut-icon {
          display: inline-grid;
          width: 22px;
          place-items: center;
          color: var(--gold);
        }

        .shortcut-link strong {
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 760px) {
          .home-operation-shortcuts {
            left: 50%;
            right: auto;
            bottom: 12px;
            width: calc(100% - 24px);
            grid-template-columns: 1fr 1fr;
            transform: translateX(-50%);
            padding: 6px;
            border: 1px solid var(--border);
            border-radius: 14px;
            background: rgba(21,21,21,.96);
            box-shadow: 0 16px 45px rgba(0,0,0,.22);
            backdrop-filter: blur(12px);
          }

          .shortcut-group-label {
            display: none;
          }

          .shortcut-link {
            min-height: 46px;
            padding: 8px 10px;
          }
        }
      `}</style>
    </div>
  );
}
