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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    const clean = () => URL.revokeObjectURL(url);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1;
      clean();
      resolve(duration);
    };
    audio.onerror = () => {
      clean();
      resolve(1);
    };
    audio.src = url;
  });
}

export default function AudioTest() {
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mentoriaFile, setMentoriaFile] = useState(null);
  const [mentoriaBusy, setMentoriaBusy] = useState(false);
  const [mentoriaMessage, setMentoriaMessage] = useState('');
  const [mentoriaError, setMentoriaError] = useState('');

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

  async function saveMentoriaAudio() {
    setMentoriaError('');
    setMentoriaMessage('');
    if (!mentoriaFile) {
      setMentoriaError('Escolha o arquivo M4A da Mentoria primeiro.');
      return;
    }

    const isM4a = mentoriaFile.name.toLowerCase().endsWith('.m4a') || mentoriaFile.type === 'audio/mp4';
    if (!isM4a) {
      setMentoriaError('Use o arquivo M4A da Mentoria. O Instagram não aceita esse áudio em OGG nessa automação.');
      return;
    }

    if (mentoriaFile.size > 2 * 1024 * 1024) {
      setMentoriaError('Esse áudio está maior que 2 MB. Use a versão M4A compactada.');
      return;
    }

    setMentoriaBusy(true);
    try {
      const [audioBase64, durationSeconds] = await Promise.all([
        readAsDataUrl(mentoriaFile),
        readAudioDuration(mentoriaFile),
      ]);
      const saved = await requestTest({
        action: 'save',
        purpose: 'mentoria',
        label: 'MENTORIA — áudio oficial',
        durationSeconds,
        audioBase64,
      });
      setTest(saved);
      setMentoriaMessage('Áudio da Mentoria salvo. Agora clique em “Preparar teste”.');
      setMentoriaFile(null);
    } catch (error) {
      setMentoriaError(error.message || 'Não consegui salvar o áudio da Mentoria.');
    } finally {
      setMentoriaBusy(false);
    }
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

      <div className={styles.argoCopy} style={{ margin: '18px 0' }}>
        <strong>Subir áudio da Mentoria</strong>
        <p className={styles.audioIntro} style={{ marginTop: 8 }}>
          Selecione o arquivo <strong>M4A</strong> da Mentoria. Depois ele vai aparecer aqui embaixo para você preparar o teste.
        </p>
        <input
          type="file"
          accept=".m4a,audio/mp4"
          onChange={(event) => {
            setMentoriaFile(event.target.files?.[0] || null);
            setMentoriaError('');
            setMentoriaMessage('');
          }}
          disabled={mentoriaBusy}
        />
        <div className={styles.audioActions} style={{ marginTop: 14 }}>
          <button type="button" className={styles.saveButton} onClick={saveMentoriaAudio} disabled={mentoriaBusy}>
            {mentoriaBusy ? 'Salvando áudio…' : 'Salvar áudio da Mentoria'}
          </button>
          <span>Use o M4A compactado para o Instagram.</span>
        </div>
        {mentoriaMessage && <p className={styles.audioIntro} role="status">{mentoriaMessage}</p>}
        {mentoriaError && <p className={styles.audioError} role="alert">{mentoriaError}</p>}
      </div>

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
