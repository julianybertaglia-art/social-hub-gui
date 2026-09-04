'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const shortcutStyle = {
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
};

export default function AutomationShortcut() {
  const pathname = usePathname();
  const showAutomations = pathname !== '/automacoes';
  const showWhatsApp = pathname !== '/whatsapp';

  if (!showAutomations && !showWhatsApp) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 22,
        bottom: 78,
        zIndex: 95,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 9,
      }}
    >
      {showWhatsApp && (
        <Link href="/whatsapp" style={{ ...shortcutStyle, borderColor: '#5c8f6b' }}>
          ◉ WhatsApp CRM
        </Link>
      )}
      {showAutomations && (
        <Link href="/automacoes" style={shortcutStyle}>
          ⚡ Automações
        </Link>
      )}
    </div>
  );
}
