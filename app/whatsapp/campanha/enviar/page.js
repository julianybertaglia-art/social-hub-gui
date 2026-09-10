'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
  padding: '12px 16px',
  fontWeight: 800,
  cursor: 'pointer',
};

const FALLBACK_COUNTS = {
  total: 29,
  pending: 29,
  sending: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  seller: { total: 12, sent: 0, pending: 12 },
  iniciante: { total: 17, sent: 0, pending: 17 },
};

export default function EnviarCampanhaPage() {
  const [counts, setCounts] = useState(FALLBACK_COUNTS);
  const [synced, setSynced] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [statusNote, setStatusNote] = useState('Conferindo a fila real...');
  const [seconds, setSeconds] = useState(null);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const tickRef = useRef(null);

  async function campaignRequest(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('O servidor respondeu de um jeito inesperado.');
      }
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Falha na campanha.');
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadCampaign({ silent = false } = {}) {
    try {
      const data = await campaignRequest({ campaignAction: 'status' });
      if (!data?.counts) throw new Error('O servidor não retornou os números da fila.');
      setCounts(data.counts);
      setSynced(true);
      setStatusNote('Lista sincronizada ✅');
      return data;
    } catch (error) {
      setSynced(false);
      if (!silent) {
        setStatusNote('Não consegui sincronizar a fila. Nenhuma mensagem foi enviada.');
        setMessage('Erro: ' + error.message);
      }
      return null;
    }
  }

  useEffect(() => {
    loadCampaign();
    return () => {
      runningRef.current = false;
      busyRef.current = false;
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

  function stopRunning() {
    runningRef.current = false;
    setRunning(false);
    clearTimers();
  }

  function scheduleNext() {
    if (!runningRef.current) return;
    const delay = Math.floor(120 + Math.random() * 121);
    setSeconds(delay);
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setSeconds((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    timerRef.current = setTimeout(() => {
      clearTimers();
      sendNext();
    }, delay * 1000);
  }

  async function sendNext() {
    if (!runningRef.current || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setMessage('Enviando o próximo áudio...');

    try {
      const data = await campaignRequest({ campaignAction: 'next' });
      if (data?.counts) {
        setCounts(data.counts);
        setSynced(true);
        setStatusNote('Lista sincronizada ✅');
      }

      if (data?.sent) {
        const name = data.contact?.name || data.contact?.phone || 'Lead';
        setMessage('Enviado para ' + name + ' ✅');
      } else if (data?.skipped || data?.alreadySkipped) {
        const name = data.contact?.name || data.contact?.phone || 'Lead';
        setMessage(name + ' foi pulado: ' + (data.reason || 'não está mais elegível'));
      } else if (data?.alreadySent) {
        setMessage('Esse lead já tinha recebido. Seguindo para o próximo.');
      }

      const c = data?.counts;
      if (data?.done === true && c && c.pending === 0 && c.sending === 0) {
        stopRunning();
        setMessage((c.failed || 0) > 0 ? 'Fila terminou com envio(s) para revisar.' : 'Campanha concluída ✅');
      } else if (runningRef.current) {
        scheduleNext();
      }
    } catch (error) {
      stopRunning();
      await loadCampaign({ silent: true });
      setMessage('Campanha pausada: ' + error.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function startCampaign() {
    if (busyRef.current) return;

    setBusy(true);
    const fresh = await loadCampaign({ silent: true });
    setBusy(false);

    if (!fresh?.counts) {
      setMessage('Não vou iniciar sem conseguir conferir a fila real. Clique em “Atualizar números” e tente novamente.');
      return;
    }

    if (!fresh.counts.pending) {
      setMessage('Não há envios pendentes nessa campanha.');
      return;
    }

    const ok = window.confirm(
      'Começar agora? O primeiro áudio será enviado imediatamente. Depois, os próximos sairão com intervalo aleatório de 2 a 4 minutos.'
    );
    if (!ok) return;

    runningRef.current = true;
    setRunning(true);
    setMessage('Campanha iniciada. Enviando o primeiro áudio...');
    setTimeout(sendNext, 100);
  }

  function pauseCampaign() {
    stopRunning();
    setMessage('Campanha pausada. Os contatos que faltam continuam salvos para você retomar depois.');
  }

  const finished = synced && counts.pending === 0 && counts.sending === 0;

  return (
    <main style={{ minHeight: 'calc(100vh - 72px)', background: '#f4f3ef', color: '#171714', padding: 24 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link href="/whatsapp/campanha" style={{ color: '#77746d', textDecoration: 'none', fontSize: 13 }}>← Voltar para os áudios</Link>

        <div style={{ margin: '14px 0 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: '#8e6b30' }}>CAMPANHA REAL · 1ª ONDA</div>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 500, fontSize: 34, margin: '5px 0 7px' }}>Envio dos áudios do Gui</h1>
          <p style={{ margin: 0, color: '#77746d', fontSize: 14 }}>Agora a campanha só inicia e só conclui quando o servidor confirma a fila real.</p>
        </div>

        <section style={{ ...box, border: '2px solid #b9924d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 23 }}>Leads selecionados</h2>
              <p style={{ margin: '7px 0 0', color: '#77746d', fontSize: 13, lineHeight: 1.5 }}>
                Seller recebe o áudio de seller e iniciante recebe o áudio de iniciante. Antes de cada envio o Hub confere de novo se o lead ainda pode receber.
              </p>
            </div>
            <span style={{ height: 'fit-content', fontSize: 12, fontWeight: 900, padding: '8px 11px', borderRadius: 999, background: running ? '#e7f3e9' : '#f2eadb' }}>
              {running ? 'ENVIANDO' : finished ? 'CONCLUÍDA' : synced ? 'PRONTA' : 'AGUARDANDO SINCRONIZAÇÃO'}
            </span>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: synced ? '#557d62' : '#8e6b30', fontWeight: 700 }}>{statusNote}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 18 }}>
            {[
              ['Selecionados', counts.total],
              ['Sellers', counts.seller.total],
              ['Iniciantes', counts.iniciante.total],
              ['Enviados', counts.sent],
              ['Faltam', counts.pending],
              ['Pulados', counts.skipped],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#f8f7f3', border: '1px solid #ebe7df', borderRadius: 12, padding: 13 }}>
                <div style={{ fontSize: 11, color: '#77746d', fontWeight: 800 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {!running ? (
              <button
                type="button"
                onClick={startCampaign}
                disabled={!synced || finished || busy}
                style={{ ...button, background: '#8e6b30', opacity: !synced || finished || busy ? .45 : 1 }}
              >
                {counts.sent > 0 ? 'Continuar campanha' : 'Iniciar campanha'}
              </button>
            ) : (
              <button type="button" onClick={pauseCampaign} style={{ ...button, background: '#7a3f3f' }}>Pausar campanha</button>
            )}

            <button type="button" onClick={() => loadCampaign()} disabled={busy} style={{ ...button, background: '#fff', color: '#171714', border: '1px solid #d8d4c8' }}>
              Atualizar números
            </button>

            {seconds !== null && running && <strong style={{ fontSize: 13 }}>Próximo envio em ~{seconds}s</strong>}
          </div>

          {message && (
            <div style={{ marginTop: 14, padding: 12, background: '#f8f7f3', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              {message}
            </div>
          )}

          <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: '#f8f7f3', color: '#6f6a61', fontSize: 12, lineHeight: 1.55 }}>
            Os envios têm intervalo aleatório de 2 a 4 minutos. Deixe esta aba aberta enquanto estiver em “ENVIANDO”. Se fechar a página, a sequência para. Quem já recebeu fica registrado e não recebe de novo.
          </div>
        </section>
      </div>
    </main>
  );
}
