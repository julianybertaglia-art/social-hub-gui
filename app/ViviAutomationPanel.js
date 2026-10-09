'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './CloudGate';

const common = { padding: '16px 20px', border: '1px solid var(--border)',
  borderRadius: 14, background: 'var(--surface)' };
export default function ViviAutomationPanel() {
  const [status, setStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const request = useCallback(async (body) => {
    if (!supabase) throw new Error('Conexão Supabase indisponível.');
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/vital-whatsapp/automacoes', {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + data.session.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Erro ao configurar a Vivi.');
    return payload;
  }, []);
  const refresh = useCallback(async () => {
    try { setStatus(await request()); setError(''); }
    catch (e) { setError(e.message); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function upload(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setMessage(''); setError('');
    try {
      if (file.type !== 'application/pdf' || file.size > 16000000) {
        throw new Error('Selecione um catálogo PDF de até 16 MB.');
      }
      const signed = await request({ action: 'prepare_bluetti_catalog',
        size: file.size, mimeType: file.type });
      const { error: uploadError } = await supabase.storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: 'application/pdf', upsert: true,
        });
      if (uploadError) throw new Error('Não foi possível enviar o PDF: ' + uploadError.message);
      await request({ action: 'confirm_bluetti_catalog' });
      setMessage('Catálogo BLUETTI enviado! A Vivi foi ativada automaticamente para novas conversas.');
      setFile(null);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function toggle() {
    setBusy(true); setError(''); setMessage('');
    try {
      const action = status?.enabled ? 'pause' : 'activate';
      await request({ action });
      setMessage(action === 'pause' ? 'Vivi pausada.' : 'Vivi ativada.');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <main style={{maxWidth:1150, margin:'0 auto',padding:'32px 30px 60px', color:'var(--text)'}}>
      <p style={{letterSpacing:2,textTransform:'uppercase',fontSize:10,color:'var(--gold-dark)',fontWeight:850}}>TIDEPLACE · VITAL DECOR</p>
      <h1 style={{fontSize:34,letterSpacing:-1,margin:'8px 0'}}>Vivi · Atendimento automático</h1>
      <p style={{fontSize:13,color:'var(--muted)',maxWidth:760}}>
        Menu de boas-vindas e triagem do WhatsApp da Vital Decor, separado do CRM e das automações do Gui Nonato.
      </p>
      <section style={{...common,marginTop:24,display:'flex',alignItems:'center',justifyContent:'space-between',gap:18,flexWrap:'wrap'}}>
        <div>
          <strong style={{fontSize:16}}>Status: {status?.enabled ? 'Ativada' : 'Pausada'}</strong>
          <p style={{fontSize:12,color:'var(--muted)',margin:'6px 0 0'}}>
            {status?.enabled ? 'Novos contatos recebem o menu da Vivi.' :
              'Nenhuma nova resposta automática será enviada até a ativação.'}
          </p>
        </div>
        <button type="button" onClick={toggle} disabled={busy || !status} style={{
          padding:'12px 20px',border:0,borderRadius:9,background:'var(--gold-dark)',color:'white',
          fontWeight:800,cursor:'pointer'
        }}>{status?.enabled ? 'Pausar Vivi' : 'Ativar Vivi'}</button>
      </section>
      <section style={{...common,marginTop:14}}>
        <strong>Catálogo BLUETTI (PDF)</strong>
        <p style={{fontSize:12,color:'var(--muted)'}}>
          {status?.bluettiCatalogReady ? 'Catálogo disponível para envio automático no menu BLUETTI.' :
            'Envie o PDF aqui para que a Vivi possa encaminhá-lo aos clientes. A ativação ocorre após o upload.'}
        </p>
        <form onSubmit={upload} style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
          <input type="file" accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}
            aria-label="Selecionar catálogo BLUETTI em PDF"/>
          <button type="submit" disabled={!file||busy} style={{padding:'11px 16px',borderRadius:9,border:0,
            background:'var(--gold-dark)',color:'white',fontWeight:800,cursor:'pointer'}}>
            {busy?'Enviando...':'Enviar catálogo e ativar'}
          </button>
        </form>
      </section>
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(225px,1fr))',gap:12,marginTop:18}}>
        {[
          ['Comprar produtos','Vital Decor, BLUETTI e VTX Fitness. Direciona para o comercial.'],
          ['Meu pedido','Shopee, Mercado Livre, TikTok Shop, Amazon e loja oficial.'],
          ['Revendedores','Mínimo geral R$ 25 mil · Grama 1.000 m² · PVC R$ 3 mil.'],
          ['Afiliados TikTok','Formulário e qualificação individual da Vital Decor.'],
        ].map(([title,description])=>(
          <article key={title} style={common}><strong>{title}</strong>
            <p style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>{description}</p>
          </article>
        ))}
      </section>
      <p style={{fontSize:12,color:'var(--muted)',marginTop:18}}>
        Digitar MENU reabre o início. Depois do encaminhamento para um atendente humano, o robô fica em silêncio.
        Catálogo de revenda: envio automático disponível quando você fornecer o arquivo.
      </p>
      {message && <p role="status" style={{color:'#246f45',fontSize:12}}>{message}</p>}
      {error && <p role="alert" style={{color:'#a62638',fontSize:12}}>{error}</p>}
    </main>
  );
}
