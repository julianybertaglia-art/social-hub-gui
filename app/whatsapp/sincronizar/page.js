'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function SyncWhatsAppPage() {
  const [state, setState] = useState('Sincronizando contatos e conversas recentes...');
  const [details, setDetails] = useState('');

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const response = await fetch('/api/whatsapp/meta/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok || !data?.ok) {
          setState('A Meta não concluiu a sincronização.');
          setDetails((data?.warnings || []).join(' · ') || data?.error || 'Tente novamente em alguns instantes.');
          return;
        }

        setState('Sincronização solicitada ✓');
        if (data.historyRequested || data.contactsRequested) {
          setDetails('A Meta está enviando o histórico e os contatos para o Hub. Isso pode levar alguns minutos.');
        } else {
          setDetails((data.warnings || []).join(' · ') || 'O webhook foi conectado. Novas mensagens já podem chegar ao Hub.');
        }
      } catch (error) {
        if (!active) return;
        setState('Não foi possível iniciar a sincronização.');
        setDetails(error instanceof Error ? error.message : 'Erro inesperado.');
      }
    }

    run();
    return () => { active = false; };
  }, []);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f1e9', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <section style={{ maxWidth: 620, width: '100%', background: '#fff', border: '1px solid #ddd6c8', borderRadius: 20, padding: 32 }}>
        <p style={{ fontSize: 12, letterSpacing: 1.4, fontWeight: 700 }}>WHATSAPP · META</p>
        <h1 style={{ margin: '10px 0 14px' }}>{state}</h1>
        <p style={{ lineHeight: 1.6 }}>{details || 'Não feche esta página ainda.'}</p>
        <p style={{ marginTop: 24 }}><Link href="/whatsapp">← Voltar para o CRM</Link></p>
      </section>
    </main>
  );
}
