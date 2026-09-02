'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../CloudGate';
import styles from './automacoes.module.css';

async function requestAutomation(body) {
  const { data } = supabase ? await supabase.auth.getSession() : { data: null };
  if (!data?.session?.access_token) throw new Error('Entre novamente no Hub para acessar a automação.');

  const response = await fetch('/api/instagram/audio-automation', {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a automação.');
  return payload.automation;
}

export default function ArgoAudioAutomation() {
  const [automation, setAutomation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setAutomation(await requestAutomation());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function toggle() {
    if (!automation) return;
    setBusy(true);
    setError('');
    try {
      setAutomation(await requestAutomation({ action: automation.active ? 'pause' : 'activate' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const status = loading ? 'Carregando' : automation?.active ? 'Ativa' : 'Pausada';
  const whatsapp = automation?.whatsappMessage || 'Quer mais informações sobre o ARGO? Chama a equipe no WhatsApp: (11) 92399-0244 👊';

  return (
    <section className={`${styles.panel} ${styles.argoPanel}`} aria-labelledby="argo-audio-title">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}>ÁUDIO NATIVO · ARGO</span>
          <h2 id="argo-audio-title">Áudio automático do Gui</h2>
        </div>
        <span className={`${styles.argoBadge} ${automation?.active ? styles.argoBadgeActive : ''}`} role="status">
          {status}
        </span>
      </div>

      <p className={styles.audioIntro}>
        Usa o áudio de 1:01 que apareceu como mensagem de voz no Direct.
      </p>

      <div className={styles.argoFlow} aria-label="Fluxo da automação">
        <span><b>1</b> Comentou <strong>{automation?.commentKeyword || 'ARGO'}</strong></span>
        <span><b>2</b> Toca em “{automation?.quickReplyTitle || 'Ouvir áudio do Gui'}”</span>
        <span><b>3</b> Recebe o áudio + WhatsApp</span>
      </div>

      <div className={styles.argoCopy}>
        <strong>Mensagem depois do áudio</strong>
        <p>{whatsapp}</p>
      </div>

      {error && <p className={styles.audioError} role="alert">{error}</p>}
      {!loading && !automation && (
        <p className={styles.audioError}>O áudio oficial ainda não foi preparado. Atualize esta página.</p>
      )}

      <div className={styles.argoActions}>
        <button className={automation?.active ? styles.argoPauseButton : styles.saveButton} type="button" onClick={toggle} disabled={loading || busy || !automation}>
          {busy ? 'Salvando…' : automation?.active ? 'Pausar automação' : 'Ativar automação'}
        </button>
        <span>Uma pessoa recebe esse áudio apenas uma vez.</span>
      </div>
    </section>
  );
}
