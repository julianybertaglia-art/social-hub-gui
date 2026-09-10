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
  color: '#fff',
  padding: '12px 16px',
  fontWeight: 800,
  cursor: 'pointer',
};

const EMPTY = {
  total: 9,
  pending: 9,
  sending: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  seller: { total: 3, pending: 3, sent: 0 },
  iniciante: { total: 6, pending: 6, sent: 0 },
};

export default function EnviarCampanhaPage() {
  const [data, setData] = useState({ counts: EMPTY, control: { status: 'paused', intervalMinSeconds: 45, intervalMaxSeconds: 75 } });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function request(action) {
    const options = action
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
          cache: 'no-store',
        }
      : { cache: 'no-store' };

    const response = await fetch('/api/whatsapp/campaign-worker?t=' + Date.now(), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Falha ao consultar a campanha.');
    setData(payload);
    return payload;
  }

  async function refresh(silent = false) {
    try {
      await request();
      if (!silent) setMessage('Lista revisada e sincronizada ✅');
    } catch (error) {
      if (!silent) setMessage('Erro: ' + error.message);
    }
  }

  useEffect(() => {
    refresh(true);
    const timer = setInterval(() => refresh(true), 8000);
    return () => clearInterval(timer);
  }, []);

  async function start() {
    const ok = window.confirm(
      'Iniciar a campanha revisada? Serão somente leads com interesse na Imersão, sem quem já recebeu áudio personalizado do Gui. Os envios continuam mesmo se você fechar esta página.'
    );
    if (!ok) return;

    setBusy(true);
    try {
      const result = await request('start');
      setMessage('Campanha iniciada no servidor ✅ Pode fechar esta página; os envios continuam sozinhos.');
      setData(result);
    } catch (error) {
      setMessage('Não iniciou: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    setBusy(true);
    try {
      const result = await request('pause');
      setData(result);
      setMessage('Campanha pausada no servidor. Nenhum novo áudio será enviado até você retomar.');
    } catch (error) {
      setMessage('Erro ao pausar: ' + error.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.counts || EMPTY;
  const control = data?.control || {};
  const status = control.status || 'paused';
  const running = status === 'running';
  const completed = status === 'completed';
  const hasError = status === 'error';

  const badge = running ? 'ENVIANDO NO SERVIDOR' : completed ? 'CONCLUÍDA' : hasError ? 'PAUSADA POR ERRO' : 'PRONTA';

  return (
    <main style={{ minHeight: 'calc(100vh - 72px)', background: '#f4f3ef', color: '#171714', padding: 24 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link href="/whatsapp/campanha" style={{ color: '#77746d', textDecoration: 'none', fontSize: 13 }}>← Voltar para os áudios</Link>

        <div style={{ margin: '14px 0 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: '#8e6b30' }}>CAMPANHA REVISADA · IMERSÃO</div>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 500, fontSize: 34, margin: '5px 0 7px' }}>Envio dos áudios do Gui</h1>
          <p style={{ margin: 0, color: '#77746d', fontSize: 14 }}>Agora o envio roda no servidor. Você não precisa deixar esta página aberta.</p>
        </div>

        <section style={{ ...box, border: '2px solid #b9924d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 23 }}>Leads revisados</h2>
              <p style={{ margin: '7px 0 0', color: '#77746d', fontSize: 13, lineHeight: 1.55 }}>
                Só entra quem demonstrou interesse na Imersão. Leads de treinamento, Mentoria ou ARGO sem interesse na Imersão ficam fora. Também ficam fora os leads que já receberam um áudio pessoal do Gui.
              </p>
            </div>
            <span style={{ height: 'fit-content', fontSize: 12, fontWeight: 900, padding: '8px 11px', borderRadius: 999, background: running ? '#e7f3e9' : hasError ? '#f6e9df' : '#f2eadb' }}>
              {badge}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginTop: 18 }}>
            {[
              ['Selecionados', counts.total],
              ['Sellers', counts.seller?.total || 0],
              ['Iniciantes', counts.iniciante?.total || 0],
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
            {!running && !completed && (
              <button type="button" onClick={start} disabled={busy || !counts.pending} style={{ ...button, background: '#8e6b30', opacity: busy || !counts.pending ? .45 : 1 }}>
                {hasError || counts.sent > 0 ? 'Retomar campanha' : 'Iniciar campanha revisada'}
              </button>
            )}

            {running && (
              <button type="button" onClick={pause} disabled={busy} style={{ ...button, background: '#7a3f3f' }}>Pausar campanha</button>
            )}

            <button type="button" onClick={() => refresh()} disabled={busy} style={{ ...button, background: '#fff', color: '#171714', border: '1px solid #d8d4c8' }}>
              Atualizar números
            </button>
          </div>

          {message && (
            <div style={{ marginTop: 14, padding: 12, background: '#f8f7f3', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
              {message}
            </div>
          )}

          {control.nextSendAt && running && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#6f6a61' }}>
              Próximo envio programado pelo servidor. A página pode ser fechada normalmente.
            </div>
          )}

          {control.lastError && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f6e9df', fontSize: 12 }}>
              Campanha pausada por segurança: {control.lastError}
            </div>
          )}

          <div style={{ marginTop: 14, padding: 13, borderRadius: 10, background: '#f8f7f3', color: '#6f6a61', fontSize: 12, lineHeight: 1.55 }}>
            Intervalo atual: aproximadamente <strong>45 a 75 segundos</strong> entre os áudios. Antes de cada envio, o servidor confere novamente o lead; se ele tiver respondido, tiver comprado ou não for mais elegível, o envio é pulado.
          </div>
        </section>
      </div>
    </main>
  );
}
