'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function WhatsappModeTabs() {
  const pathname = usePathname();
  const gato = pathname.startsWith('/whatsapp/gato');

  const wrap = {
    width: 'min(1440px, calc(100% - 32px))',
    margin: '18px auto 0',
    display: 'flex',
    gap: 8,
    padding: 6,
    border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 14,
    background: 'rgba(255,255,255,.035)',
  };

  const tab = (active) => ({
    flex: '0 0 auto',
    padding: '11px 16px',
    borderRadius: 10,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 800,
    color: active ? '#111' : '#ddd',
    background: active ? '#fff' : 'transparent',
    border: active ? '1px solid #fff' : '1px solid transparent',
  });

  return (
    <nav style={wrap} aria-label="Modos do WhatsApp">
      <Link href="/whatsapp" style={tab(!gato)}>WhatsApp Meta</Link>
      <Link href="/whatsapp/gato" style={tab(gato)}>WhatsApp Gato</Link>
    </nav>
  );
}
