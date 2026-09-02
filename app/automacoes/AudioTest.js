'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../CloudGate';
import styles from './automacoes.module.css';

const statusNames = {
  draft: 'Áudio recebido', preparing: 'Preparando', prepare_failed: 'Revisar conexão',
  ready: 'Esperando sua mensagem', sending: 'Enviando', sent: 'Envio aceito pelo Instagram',
  send_failed: 'Confira o Direct', cancelled: 'Teste encerrado',
};

async function requestTest(body) {
  const { data } = supabase ? await supabase.auth.getSession() : { data: null };
  if (!data?.session?.access_token) throw new Error('Entre novamente no Hub para acessar o teste.');
  const response = await fetch('/api/instagram/audio-test', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o teste.');
  return payload.test;
}

export default function AudioTest() {
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    try { setTest(await requestTest()); setError(''); }
    catch (error) { setError(error.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!['ready', 'preparing', 'sending'].includes(test?.status)) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [refresh, test?.status]);

  async function act(action, result) {
    setBusy(true); setError('');
    try { setTest(await requestTest({ id: test.id, action, ...(result ? { result } : {}) })); }
    catch (error) { await refresh(); setError(error.message); }
    finally { setBusy(false); }
  }

  async function copyKeyword() {
    try { await navigator.clipboard.writeText(test.keyword); setCopied(true); }
    catch { setError('Selecione e copie a palavra exibida abaixo.'); }
  }

  const expired = test?.status === 'ready' && new Date(test.expires_at).getTime() < Date.now();
  const seconds = Math.round(Number(test?.duration_seconds || 0));
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <section className={`${styles.panel} ${styles.audioPanel}`} id="teste-audio" aria-labelledby="audio-test-title">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>TESTE NO SEU DIRECT</span>
          <h2 id="audio-test-title">Teste de áudio</h2>
        </div>
        <span className={styles.audioBadge} role="status">
          {loading ? 'Carregando' : expired ? 'Código expirado' : statusNames[test?.status] || 'Aguardando áudio'}
        </span>
      </div>
      <p className={styles.audioIntro}>Confira como a voz do Gui aparece na conversa do Instagram.</p>
      {test && <div className={styles.audioFile}><span aria-hidden="true">♫</span><strong>{test.label}</strong><span>{duration}</span></div>}
      {(error || test?.error_message) && <p className={styles.audioError} role="alert">{error || test.error_message}</p>}
      {!loading && !test && <p className={styles.audioIntro}>O áudio do teste ainda não está disponível. Atualize para conferir.</p>}

      {['draft', 'prepare_failed'].includes(test?.status) && (
        <div className={styles.audioActions}>
          <button type="button" className={styles.saveButton} onClick={() => act('prepare')} disabled={busy}>
            {busy ? 'Preparando…' : 'Preparar teste'}
          </button>
          <span>Uma resposta em áudio · código válido por 48 horas</span>
        </div>
      )}

      {test?.status === 'preparing' && <p className={styles.audioIntro}>Conectando o áudio ao Instagram. O código aparecerá quando estiver pronto.</p>}
      {test?.status === 'ready' && !expired && (
        <div className={styles.audioSteps}>
          <ol>
            <li>Copie a palavra abaixo.</li>
            <li>Pelo <strong>seu Instagram</strong>, envie essa palavra no Direct do <a href="https://www.instagram.com/gui_nonato/" target="_blank" rel="noreferrer">@gui_nonato</a>.</li>
            <li>Abra a resposta no celular e confira como o áudio aparece.</li>
          </ol>
          <div className={styles.audioKeyword}>
            <code>{test.keyword}</code>
            <button type="button" onClick={copyKeyword}>{copied ? 'Copiado ✓' : 'Copiar palavra'}</button>
          </div>
          <p>A palavra funciona uma vez. O resultado será atualizado aqui.</p>
          <button className={styles.clearButton} type="button" onClick={() => act('cancel')} disabled={busy}>Encerrar teste</button>
        </div>
      )}
      {expired && <p className={styles.audioIntro}>Este código expirou. Será necessário preparar um novo teste.</p>}
      {test?.status === 'sending' && <p className={styles.audioIntro}>Sua mensagem foi recebida. Confira o Direct; estamos aguardando a confirmação do envio.</p>}

      {['sent', 'send_failed', 'sending'].includes(test?.status) && (
        <fieldset className={styles.audioResults} disabled={busy}>
          <legend>Como apareceu no seu celular?</legend>
          {[
            ['voice_bubble', 'Balão de voz'], ['file', 'Arquivo ou link'], ['not_received', 'Não recebi'],
          ].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={test.visual_result === value} onClick={() => act('result', value)}>{label}</button>
          ))}
          {test.visual_result && <p role="status">Resultado registrado.</p>}
        </fieldset>
      )}

      <button className={styles.audioRefresh} type="button" onClick={refresh} disabled={loading || busy}>Atualizar resultado</button>
    </section>
  );
}
