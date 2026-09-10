'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

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

  async function upload(chosenFile = file) {
    if (!chosenFile) return setMessage('Escolha o arquivo .ogg primeiro.');
    setBusy(true);
    setMessage('Salvando áudio...');
    try {
      const form = new FormData();
      form.append('key', type);
      form.append('file', chosenFile);
      const response = await fetch('/api/whatsapp/campaign-audio', { method: 'POST', body: form, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar o áudio.');
      setMessage('Áudio salvo de verdade ✅');
      await onUploaded();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(event) {
    const chosen = event.target.files?.[0] || null;
    setFile(chosen);
    if (chosen) upload(chosen);
  }

  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#8e6b30' }}>{title}</div>
          <h2 style={{ margin: '6px 0 5px', fontSize: 20 }}>{subtitle}</h2>
          <p style={{ margin: 0, color: '#77746d', fontSize: 13 }}>Escolha o .ogg e aguarde aparecer “Áudio salvo de verdade ✅”.</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 800, padding: '7px 10px', borderRadius: 999, background: asset?.ready ? '#e7f3e9' : '#f6e9df' }}>
          {asset?.ready ? 'Áudio pronto ✅' : 'Áudio ainda não salvo'}
        </span>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <input type="file" accept="audio/ogg,.ogg" onChange={chooseFile} disabled={busy} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => upload()} disabled={busy || !file} style={{ ...button, opacity: busy || !file ? .45 : 1 }}>
            {busy ? 'Salvando...' : asset?.ready ? 'Salvar novamente' : 'Salvar áudio'}
          </button>
          {message && <span style={{ fontSize: 12, color: message.includes('✅') ? '#557d62' : '#6f6a61', fontWeight: 700 }}>{message}</span>}
        </div>
        {asset?.ready && asset?.url && (
          <audio key={asset.sha256 || asset.url} controls preload="metadata" src={asset.url} style={{ width: '100%', marginTop: 4 }} />
        )}
      </div>
    </section>
  );
}

function TestCard({ assets }) {
  const [phone, setPhone] = useState('');
  const [audioKey, setAudioKey] = useState('seller');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedAsset = assets?.[audioKey];
  const selectedReady = Boolean(selectedAsset?.ready && selectedAsset?.url);
  const cleanPhone = useMemo(() => String(phone || '').replace(/\D/g, ''), [phone]);

  async function sendTest() {
    if (!cleanPhone) return setMessage('Digite um número de WhatsApp para o teste.');
    if (!selectedReady) return setMessage('Esse áudio ainda não foi salvo de verdade.');

    setBusy(true);
    setMessage('Enviando teste...');
    try {
      const audioUrl = new URL(selectedAsset.url, window.location.origin).href;
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: cleanPhone, audioUrl }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível enviar o teste.');
      setMessage('Teste enviado como mensagem de voz ✅');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ ...box, marginTop: 14, border: '1px solid #d7ccb5' }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#8e6b30' }}>TESTE SEGURO · 1 NÚMERO</div>
      <h2 style={{ margin: '6px 0 6px', fontSize: 21 }}>Teste antes de liberar a campanha</h2>
      <p style={{ margin: '0 0 16px', color: '#77746d', fontSize: 13 }}>
        Use de preferência outro número que você controla. Esse botão envia somente 1 áudio.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(210px,.7fr) auto', gap: 10, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#5f5b53' }}>
          Número do teste
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Ex.: 5511999999999"
            inputMode="tel"
            style={{ border: '1px solid #d8d4c8', borderRadius: 10, padding: '11px 12px', font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, color: '#5f5b53' }}>
          Qual áudio testar
          <select
            value={audioKey}
            onChange={(event) => { setAudioKey(event.target.value); setMessage(''); }}
            style={{ border: '1px solid #d8d4c8', borderRadius: 10, padding: '11px 12px', background: '#fff', font: 'inherit' }}
          >
            <option value="seller">Áudio para Sellers</option>
            <option value="iniciante">Áudio para Iniciantes</option>
          </select>
        </label>
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !selectedReady || !cleanPhone}
          style={{ ...button, opacity: busy || !selectedReady || !cleanPhone ? .45 : 1, minHeight: 42 }}
        >
          {busy ? 'Enviando...' : 'Enviar teste'}
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 11, fontSize: 12, fontWeight: 700, color: message.includes('✅') ? '#557d62' : '#795f2b' }}>
          {message}
        </div>
      )}
    </section>
  );
}

function CampaignCard() {
  const [campaign, setCampaign] = useState(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(null);
  const timerRef = useRef(null);
  const tickRef = useRef(null);

  async function loadCampaign() {
    const response = await fetch('/api/whatsapp/campaign-run?t=' + Date.now(), { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setCampaign(data);
    return data;
  }

  useEffect(() => {
    loadCampaign();
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(tickRef.current);
    };
  }, []);

  function clearTimers() {
    clearTimeout(timerRef.current);
    clearInterval(tickRef.current);
    timerRef.current = null;
    tickRef.current = null;
    setSeconds(null);
  }

  function scheduleNext() {
    const delay = Math.floor(120 + Math.random() * 121);
    setSeconds(delay);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setSeconds((current) => {
        if (current === null || current <= 1) return 0;
        return current - 1;
      });
    }, 1000);
    timerRef.current = setTimeout(() => {
      clearTimers();
      sendNext();
    }, delay * 1000);
  }

  async function sendNext() {
    if (!running && !busy) return;
    setBusy(true);
    setMessage('Enviando próximo áudio...');
    try {
      const response = await fetch('/api/whatsapp/campaign-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-next' }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Falha ao enviar próximo áudio.');
      const fresh = await loadCampaign();
      const count = fresh?.counts || data?.counts;

      if (data?.sent) {
        const name = data.contact?.name || data.contact?.phone || 'Lead';
        setMessage('Enviado para ' + name + ' ✅');
      } else if (data?.skipped) {
        const name = data.contact?.name || data.contact?.phone || 'Lead';
        setMessage(name + ' foi pulado: ' + data.reason);
      }

      if (data?.done || !count?.pending) {
        setRunning(false);
        clearTimers();
        setMessage('Campanha concluída ✅');
      } else if (running) {
        scheduleNext();
      }
    } catch (error) {
      setRunning(false);
      clearTimers();
      setMessage('Campanha pausada: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  function startCampaign() {
    const pending = campaign?.counts?.pending || 0;
    if (!pending) return;
    const ok = window.confirm(
      'Começar agora? O primeiro áudio será enviado imediatamente e os próximos sairão com intervalo aleatório de 2 a 4 minutos.'
    );
    if (!ok) return;
    setRunning(true);
    setMessage('Campanha iniciada. Enviando o primeiro...');
    setTimeout(() => sendNext(), 0);
  }

  function pauseCampaign() {
    setRunning(false);
    clearTimers();
    setMessage('Campanha pausada. Nenhum novo áudio será enviado até você continuar.');
  }

  const c = campaign?.counts;
  const finished = c && c.pending === 0;

  return (
    <section style={{ ...box, marginTop: 14, border: '2px solid #b9924d' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#8e6b30' }}>CAMPANHA REAL · 1ª ONDA</div>
          <h2 style={{ margin: '6px 0 6px', fontSize: 23 }}>Áudio do Gui para os leads selecionados</h2>
          <p style={{ margin: 0, color: '#77746d', fontSize: 13 }}>
            Sellers recebem o áudio de seller. Iniciantes recebem o áudio de iniciante. Quem responder antes da vez é pulado automaticamente.
          </p>
        </div>
        <span style={{ height: 'fit-content', fontSize: 12, fontWeight: 900, padding: '8px 11px', borderRadius: 999, background: running ? '#e7f3e9' : '#f2eadb' }}>
          {running ? 'ENVIANDO' : finished ? 'CONCLUÍDA' : 'PRONTA'}
        </span>
      </div>

      {!c ? (
        <div style={{ marginTop: 16, color: '#77746d' }}>Carregando a lista...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 10, marginTop: 18 }}>
            {[
              ['Selecionados', c.total],
              ['Sellers', c.seller.total],
              ['Iniciantes', c.iniciante.total],
              ['Enviados', c.sent],
              ['Faltam', c.pending],
              ['Pulados', c.skipped],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#f8f7f3', border: '1px solid #ebe7df', borderRadius: 12, padding: 13 }}>
                <div style={{ fontSize: 11, color: '#77746d', fontWeight: 800 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {!running ? (
              <button type="button" onClick={startCampaign} disabled={finished || busy} style={{ ...button, background: '#8e6b30', opacity: finished || busy ? .45 : 1 }}>
                {c.sent > 0 ? 'Continuar campanha' : 'Iniciar campanha'}
              </button>
            ) : (
              <button type="button" onClick={pauseCampaign} style={{ ...button, background: '#7a3f3f' }}>Pausar campanha</button>
            )}
            <button type="button" onClick={loadCampaign} disabled={busy} style={{ ...button, background: '#fff', color: '#171714', border: '1px solid #d8d4c8' }}>
              Atualizar números
            </button>
            {seconds !== null && running && <strong style={{ fontSize: 13 }}>Próximo envio em ~{seconds}s</strong>}
          </div>

          {message && (
            <div style={{ marginTop: 13, padding: 12, background: '#f8f7f3', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              {message}
            </div>
          )}

          <div style={{ marginTop: 13, color: '#77746d', fontSize: 12, lineHeight: 1.55 }}>
            Intervalo aleatório de 2 a 4 minutos. Deixe esta aba aberta enquanto estiver em “ENVIANDO”. Se fechar ou pausar, os contatos que ainda faltam ficam salvos e você pode continuar depois sem duplicar os que já foram enviados.
          </div>
        </>
      )}
    </section>
  );
}

export default function CampanhaWhatsAppPage() {
  const [assets, setAssets] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadAssets() {
    const response = await fetch('/api/whatsapp/campaign-audio?t=' + Date.now(), { cache: 'no-store' });
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
          <p style={{ margin: 0, color: '#77746d', fontSize: 14 }}>Teste validado. A campanha real está pronta para começar de forma controlada.</p>
        </div>

        {loading ? <div style={box}>Carregando...</div> : (
          <>
            <div style={{ display: 'grid', gap: 14 }}>
              <AudioCard
                type="seller"
                title="ÁUDIO · SELLERS"
                subtitle="Para quem já vende"
                asset={assets.seller}
                onUploaded={loadAssets}
              />
              <AudioCard
                type="iniciante"
                title="ÁUDIO · INICIANTES"
                subtitle="Para quem está começando"
                asset={assets.iniciante}
                onUploaded={loadAssets}
              />
            </div>
            <TestCard assets={assets} />
            <CampaignCard />
          </>
        )}
      </div>
    </main>
  );
}
