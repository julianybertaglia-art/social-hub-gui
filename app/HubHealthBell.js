'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from './CloudGate';

export default function HubHealthBell() {
  const [issues, setIssues] = useState(null);
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        if (!supabase || document.visibilityState === 'hidden') return;
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.access_token) return;
        const response = await fetch('/api/admin/health', {
          cache: 'no-store', headers: { Authorization: 'Bearer ' + data.session.access_token },
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (active && Array.isArray(payload.nodes)) {
          setIssues(payload.nodes.filter((item) => ['offline', 'warning'].includes(item.status)).length);
        }
      } catch { /* Keep last result; never invent a green status after a failed check. */ }
    }
    void check();
    const timer = window.setInterval(check, 5 * 60 * 1000);
    function onFocus() { void check(); }
    document.addEventListener('visibilitychange', onFocus);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onFocus); };
  }, []);
  return <Link href="/admin/conexoes" title="Central de Controle" aria-label={issues === null
    ? 'Abrir Central de Controle' : issues ? issues + ' alertas de conexão. Abrir Central de Controle' : 'Abrir Central de Controle, sem alertas confirmados'}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 10px', color: 'var(--text)', textDecoration: 'none', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 11, fontSize: 16 }}>
    <span aria-hidden="true">♧</span>{issues !== null && <span style={{
      background: issues ? '#ad4051' : '#dfe8e2', color: issues ? '#fff' : '#355343',
      borderRadius: 10, fontSize: 10, padding: '2px 6px', fontWeight: 800,
    }}>{issues}</span>}
  </Link>;
}
