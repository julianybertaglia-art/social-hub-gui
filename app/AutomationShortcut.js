'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AutomationShortcut() {
  const pathname = usePathname();
  if (pathname === '/automacoes') return null;

  return (
    <Link
      href="/automacoes"
      style={{
        position: 'fixed',
        right: 22,
        bottom: 78,
        zIndex: 95,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 46,
        padding: '0 17px',
        border: '1px solid #b9924d',
        borderRadius: 999,
        background: '#151515',
        color: '#fff',
        boxShadow: '0 12px 28px rgba(0,0,0,.18)',
        fontSize: 13,
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      ⚡ Automações
    </Link>
  );
}
