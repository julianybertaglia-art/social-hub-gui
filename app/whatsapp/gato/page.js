'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatPhone(value) {
  const d = digits(value);
  if (d.length === 13 && d.startsWith('55')) return '+55 (' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9);
  if (d.length === 12 && d.startsWith('55')) return '+55 (' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8);
  return d ? '+' + d : 'Sem número';
}

function profile(contact) {
  const tags = contact.tags || [];
  if (tags.includes('Já vende')) return { label: 'Já vende', audio: 'seller' };
  if (tags.includes('Iniciante')) return { label: 'Iniciante', audio: 'iniciante' };
  if (tags.includes('Não respondeu')) return { label: 'Não respondeu', audio: null };
  return { label: 'Não classificado', audio: null };
}

export default function WhatsAppGatoPage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/whatsapp/conversations', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar os leads.');
        setContacts(data.contacts || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const queue = useMemo(() => {
    return contacts
      .filter((contact) => {
        const tags = contact.tags || [];
        return tags.includes('Aguardando resposta para áudio') || tags.includes('Aguardar áudio específico');
      })
      .sort((a, b) => String(a.profile_name || a.phone).localeCompare(String(b.profile_name || b.phone), 'pt-BR'));
  }, [contacts]);

  const page = {
    minHeight: '100vh',
    background: '#080808',
    color: '#f5f5f5',
    padding: '34px 16px 70px',
  };
  const shell = { width: 'min(1100px, 100%)', margin: '0 auto' };
  const eyebrow = { fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#999' };
  const grid = { display: 'grid', gap: 14, marginTop: 24 };
  const card = {
    display: 'grid',
    gridTemplateColumns: '1.25fr .8fr 1.2fr',
    gap: 18,
    alignItems: 'center',
    padding: 18,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,.1)',
    background: '#111',
  };
  const button = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '11px 14px',
    borderRadius: 10,
    background: '#fff',
    color: '#111',
    textDecoration: 'none',
    fontWeight: 900,
    fontSize: 13,
  };

  return (
    <main style={page}>
      <div style={shell}>
        <Link href="/" style={{ color: '#aaa', textDecoration: 'none', fontSize: 13 }}>← Voltar para o Hub</Link>
        <div style={{ marginTop: 24 }}>
          <span style={eyebrow}>WHATSAPP GATO · MODO APP/WEB</span>
          <h1 style={{ fontSize: 42, margin: '8px 0 10px' }}>Fila fora da janela da Meta</h1>
          <p style={{ color: '#aaa', maxWidth: 760, lineHeight: 1.6, margin: 0 }}>
            Use esta área para os contatos que precisam ser tratados pelo WhatsApp App/Web. O WhatsApp Meta continua separado e funcionando normalmente.
          </p>
        </div>

        <div style={{ marginTop: 20, padding: 16, borderRadius: 14, background: '#161616', border: '1px solid rgba(255,255,255,.08)' }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>Como usar</strong>
          <span style={{ color: '#aaa', fontSize: 14 }}>Abra a conversa pelo botão, confira o tipo de áudio indicado e envie pelo próprio WhatsApp. Aqui o Lynna só organiza a fila; não mistura essa operação com a API Meta.</span>
        </div>

        {loading && <p style={{ color: '#aaa', marginTop: 30 }}>Carregando fila...</p>}
        {error && <p style={{ color: '#ff8b8b', marginTop: 30 }}>{error}</p>}
        {!loading && !error && !queue.length && <p style={{ color: '#aaa', marginTop: 30 }}>Nenhum contato pendente nessa fila.</p>}

        <section style={grid}>
          {queue.map((contact) => {
            const p = profile(contact);
            const phone = digits(contact.phone || contact.wa_id);
            const waUrl = phone ? `https://wa.me/${phone}` : '#';
            return (
              <article key={contact.id} style={card}>
                <div>
                  <strong style={{ display: 'block', fontSize: 18 }}>{contact.profile_name || formatPhone(contact.phone)}</strong>
                  <span style={{ color: '#999', fontSize: 13 }}>{formatPhone(contact.phone)}</span>
                  <div style={{ marginTop: 9, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '5px 8px', borderRadius: 999, background: '#222', fontSize: 11, fontWeight: 800 }}>{p.label}</span>
                    {(contact.tags || []).includes('Aguardando resposta para áudio') && (
                      <span style={{ padding: '5px 8px', borderRadius: 999, background: '#222', fontSize: 11, fontWeight: 800 }}>Pendente de áudio</span>
                    )}
                  </div>
                </div>

                <div>
                  <span style={eyebrow}>ÁUDIO INDICADO</span>
                  <strong style={{ display: 'block', marginTop: 6 }}>{p.audio === 'seller' ? 'Gui · Já vende' : p.audio === 'iniciante' ? 'Gui · Iniciante' : 'Novo áudio · Não respondeu'}</strong>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {p.audio ? (
                    <audio controls preload="none" src={`/api/whatsapp/campaign-audio?key=${p.audio}&raw=1`} style={{ width: '100%' }} />
                  ) : (
                    <div style={{ color: '#999', fontSize: 13 }}>Ainda aguardando o novo áudio do Gui.</div>
                  )}
                  <a href={waUrl} target="_blank" rel="noreferrer" style={button}>Abrir conversa no WhatsApp</a>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
