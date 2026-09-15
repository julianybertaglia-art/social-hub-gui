'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

function stateLabel(status) {
  if (status?.connected) return 'Conectado';
  if (status?.state === 'awaiting_qr') return 'Aguardando QR Code';
  if (status?.state === 'starting') return 'Iniciando';
  if (status?.state === 'connecting') return 'Conectando';
  if (status?.state === 'reconnecting') return 'Reconectando';
  if (status?.state === 'not_configured') return 'Não configurado';
  if (status?.state === 'unavailable') return 'Indisponível';
  return 'Desconectado';
}

export default function WhatsAppGatoPage() {
  const [contacts, setContacts] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [sent, setSent] = useState({});

  const loadContacts = useCallback(async () => {
    const response = await fetch('/api/whatsapp/conversations', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar os leads.');
    setContacts(data.contacts || []);
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch('/api/whatsapp/gato', { cache: 'no-store' });
    const data = await response.json();
    setStatus(data);
    if (!response.ok && data?.state === 'not_configured') {
      setError(data?.error || 'WhatsApp Gato ainda não está configurado.');
    }
    return data;
  }, []);

  useEffect(() => {
    Promise.all([loadContacts(), loadStatus()])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadContacts, loadStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadStatus().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [loadStatus]);

  const queue = useMemo(() => {
    return contacts
      .filter((contact) => {
        const tags = contact.tags || [];
        return tags.includes('Aguardando resposta para áudio') || tags.includes('Aguardar áudio específico');
      })
      .sort((a, b) => String(a.profile_name || a.phone).localeCompare(String(b.profile_name || b.phone), 'pt-BR'));
  }, [contacts]);

  async function bridgeAction(action) {
    setBusy(action);
    setError('');
    try {
      const response = await fetch('/api/whatsapp/gato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível controlar a conexão.');
      setStatus(data);
      setTimeout(() => loadStatus().catch(() => {}), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sendAudio(contact) {
    setBusy(contact.id);
    setError('');
    try {
      const response = await fetch('/api/whatsapp/gato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_audio', contactId: contact.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar o áudio.');
      setSent((current) => ({ ...current, [contact.id]: true }));
      await loadContacts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const page = { minHeight: '100vh', background: '#080808', color: '#f5f5f5', padding: '34px 16px 70px' };
  const shell = { width: 'min(1100px, 100%)', margin: '0 auto' };
  const eyebrow = { fontSize: 11, fontWeight: 900, letterSpacing: '.14em', color: '#999' };
  const card = { padding: 18, borderRadius: 16, border: '1px solid rgba(255,255,255,.1)', background: '#111' };
  const primary = { border: 0, cursor: 'pointer', padding: '12px 15px', borderRadius: 10, background: '#fff', color: '#111', fontWeight: 900, fontSize: 13 };
  const secondary = { ...primary, background: '#222', color: '#fff', border: '1px solid rgba(255,255,255,.12)' };

  return (
    <main style={page}>
      <div style={shell}>
        <Link href="/" style={{ color: '#aaa', textDecoration: 'none', fontSize: 13 }}>← Voltar para o Hub</Link>

        <div style={{ marginTop: 24 }}>
          <span style={eyebrow}>WHATSAPP GATO · BAILEYS</span>
          <h1 style={{ fontSize: 42, margin: '8px 0 10px' }}>Envio direto pelo WhatsApp</h1>
          <p style={{ color: '#aaa', maxWidth: 780, lineHeight: 1.6, margin: 0 }}>
            Esta conexão é independente do WhatsApp Meta. Os áudios são enviados como mensagem de voz nativa (PTT), usando os arquivos já salvos no Lynna.
          </p>
        </div>

        <section style={{ ...card, marginTop: 22, display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
          <div>
            <span style={eyebrow}>CONEXÃO DO GATO</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: status?.connected ? '#65d98b' : status?.state === 'awaiting_qr' ? '#f0c45b' : '#777' }} />
              <strong style={{ fontSize: 20 }}>{stateLabel(status)}</strong>
            </div>
            {status?.account?.phone && <p style={{ color: '#aaa', margin: '7px 0 0' }}>{formatPhone(status.account.phone)}</p>}
            {status?.lastError && <p style={{ color: '#ff9a9a', margin: '8px 0 0', fontSize: 13 }}>{status.lastError}</p>}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!status?.connected && status?.state !== 'awaiting_qr' && (
              <button style={primary} disabled={Boolean(busy)} onClick={() => bridgeAction('connect')}>
                {busy === 'connect' ? 'Conectando...' : 'Conectar Gato'}
              </button>
            )}
            {status?.connected && (
              <button style={secondary} disabled={Boolean(busy)} onClick={() => bridgeAction('relink')}>Gerar novo QR</button>
            )}
          </div>
        </section>

        {status?.state === 'awaiting_qr' && status?.qrDataUrl && (
          <section style={{ ...card, marginTop: 14, display: 'grid', gridTemplateColumns: 'minmax(230px, 320px) 1fr', gap: 26, alignItems: 'center' }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 14 }}>
              <img src={status.qrDataUrl} alt="QR Code do WhatsApp Gato" style={{ width: '100%', display: 'block' }} />
            </div>
            <div>
              <span style={eyebrow}>ÚNICA ETAPA NO CELULAR</span>
              <h2 style={{ margin: '7px 0 10px', fontSize: 26 }}>Escaneie este QR no WhatsApp Business</h2>
              <p style={{ color: '#aaa', lineHeight: 1.6, margin: 0 }}>
                WhatsApp Business → Configurações → Aparelhos conectados → Conectar aparelho. Depois de escanear, esta tela muda sozinha para “Conectado”.
              </p>
              <button style={{ ...secondary, marginTop: 14 }} disabled={Boolean(busy)} onClick={() => bridgeAction('relink')}>Gerar outro QR</button>
            </div>
          </section>
        )}

        {error && (
          <button onClick={() => setError('')} style={{ width: '100%', textAlign: 'left', marginTop: 14, padding: 13, borderRadius: 10, border: '1px solid #633', background: '#241212', color: '#ffb1b1', cursor: 'pointer' }}>
            {error} ×
          </button>
        )}

        <div style={{ marginTop: 28 }}>
          <span style={eyebrow}>FILA DE ÁUDIOS</span>
          <h2 style={{ margin: '6px 0 0', fontSize: 27 }}>Pendentes para enviar</h2>
        </div>

        {loading && <p style={{ color: '#aaa', marginTop: 24 }}>Carregando...</p>}
        {!loading && !queue.length && <p style={{ color: '#aaa', marginTop: 24 }}>Nenhum áudio pendente nesta fila.</p>}

        <section style={{ display: 'grid', gap: 12, marginTop: 18 }}>
          {queue.map((contact) => {
            const p = profile(contact);
            const wasSent = Boolean(sent[contact.id]);
            return (
              <article key={contact.id} style={{ ...card, display: 'grid', gridTemplateColumns: '1.1fr .8fr 1.35fr', gap: 18, alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 18 }}>{contact.profile_name || formatPhone(contact.phone)}</strong>
                  <span style={{ color: '#999', fontSize: 13 }}>{formatPhone(contact.phone || contact.wa_id)}</span>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ padding: '5px 8px', borderRadius: 999, background: '#222', fontSize: 11, fontWeight: 800 }}>{p.label}</span>
                  </div>
                </div>

                <div>
                  <span style={eyebrow}>ÁUDIO</span>
                  <strong style={{ display: 'block', marginTop: 6 }}>{p.audio === 'seller' ? 'Gui · Já vende' : p.audio === 'iniciante' ? 'Gui · Iniciante' : 'Novo áudio · Não respondeu'}</strong>
                </div>

                <div style={{ display: 'grid', gap: 9 }}>
                  {p.audio ? <audio controls preload="none" src={`/api/whatsapp/campaign-audio?key=${p.audio}&raw=1`} style={{ width: '100%' }} /> : <span style={{ color: '#999', fontSize: 13 }}>Aguardando o novo áudio.</span>}
                  {p.audio && (
                    <button
                      style={{ ...primary, opacity: !status?.connected || busy === contact.id ? .55 : 1 }}
                      disabled={!status?.connected || Boolean(busy)}
                      onClick={() => sendAudio(contact)}
                    >
                      {busy === contact.id ? 'Enviando...' : wasSent ? 'Enviado ✓' : 'Enviar como áudio do WhatsApp'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
