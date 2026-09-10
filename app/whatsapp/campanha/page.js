'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const box = {
  background: '#fff',
  border: '1px solid #dedbd2',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 12px 35px rgba(30,27,21,.06)',
};

const button = {
  border: 0,
  borderRadius: 10,
  background: '#171714',
  color: '#fff',
  padding: '11px 15px',
  fontWeight: 800,
  cursor: 'pointer',
};

function AudioCard({ type, title, subtitle, asset, onUploaded }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function upload() {
    if (!file) return setMessage('Escolha o arquivo .ogg primeiro.');
    setBusy(true);
    setMessage('Enviando...');
    try {
      const form = new FormData();
      form.append('key', type);
      form.append('file', file);
      const response = await fetch('/api/whatsapp/campaign-audio', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar o áudio.');
      setMessage('Áudio salvo ✅');
      await onUploaded();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#8e6b30' }}>{title}</div>
          <h2 style={{ margin: '6px 0 5px', fontSize: 20 }}>{subtitle}</h2>
          <p style={{ margin: 0, color: '#77746d', fontSize: 13 }}>Use exatamente o arquivo .ogg que veio do WhatsApp.</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '7px 10px', borderRadius: 999, background: asset?.ready ? '#e7f3e9' : '#f2eadb' }}>
          {asset?.ready ? 'Áudio pronto' : 'Falta subir'}
        </span>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <input type="file" accept="audio/ogg,.ogg" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={upload} disabled={busy || !file} style={{ ...button, opacity: busy || !file ? .45 : 1 }}>
            {busy ? 'Salvando...' : asset?.ready ? 'Trocar áudio' : 'Salvar áudio'}
          </button>
          {message && <span style={{ fontSize: 12, color: message.includes('✅') ? '#557d62' : '#6f6a61' }}>{message}</span>}
        </div>
        {asset?.ready && (
          <audio controls preload="none" src={asset.url} style={{ width: '100%', marginTop: 4 }} />
        )}
      </div>
    </section>
  );
}

export default function CampanhaWhatsAppPage() {
  const [assets, setAssets] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadAssets() {
    const response = await fetch('/api/whatsapp/campaign-audio', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setAssets(data.assets || {});
    setLoading(false);
  }

  useEffect(() => { loadAssets(); }, []);

  return (
    <main style={{ minHeight: 'calc(100vh - 72px)', background: '#f4f3ef', color: '#171714', padding: '24px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link href="/whatsapp" style={{ color: '#77746d', textDecoration: 'none', fontSize: 13 }}>← Voltar para WhatsApp</Link>
        <div style={{ margin: '14px 0 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: '#8e6b30' }}>CAMPANHA DE ÁUDIO</div>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 500, fontSize: 34, margin: '5px 0 7px' }}>Áudios do Gui</h1>
          <p style={{ margin: 0, color: '#77746d', fontSize: 14 }}>Suba os dois arquivos uma vez. Depois o Hub usa o áudio certo para cada grupo de leads.</p>
        </div>

        {loading ? <div style={box}>Carregando...</div> : (
          <div style={{ display: 'grid', gap: 14 }}>
            <AudioCard
              type="seller"
              title="ÁUDIO 1 · SELLERS"
              subtitle="Para quem já vende"
              asset={assets.seller}
              onUploaded={loadAssets}
            />
            <AudioCard
              type="iniciante"
              title="ÁUDIO 2 · INICIANTES"
              subtitle="Para quem está começando"
              asset={assets.iniciante}
              onUploaded={loadAssets}
            />
          </div>
        )}

        <div style={{ ...box, marginTop: 14, background: '#171714', color: '#fff' }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>Nada será enviado ao salvar os arquivos.</strong>
          <span style={{ color: '#c9c6bd', fontSize: 13 }}>Primeiro vamos testar em um único número. Só depois eu libero o botão de iniciar a campanha.</span>
        </div>
      </div>
    </main>
  );
}
