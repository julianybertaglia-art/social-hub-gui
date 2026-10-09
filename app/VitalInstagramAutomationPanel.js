'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './CloudGate';
import { launchMetaLogin } from './conexoes/vital-decor/meta-login.mjs';
import { VITAL_WHATSAPP, VITAL_WHATSAPP_LINK, VITAL_WELCOME_TEXT } from './lib/vital-direct-copy.mjs';
import styles from './vital-instagram-automation.module.css';

const SCOPE = 'instagram_basic,pages_show_list,pages_read_engagement,instagram_manage_insights,pages_manage_metadata,instagram_manage_messages';

export default function VitalInstagramAutomationPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const cancelLogin = useRef(null);

  const api = useCallback(async (path = '/api/vital-connections', body = null) => {
    if (!supabase) throw new Error('A conexão com TidePlace não está disponível.');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('Entre novamente no TidePlace.');
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + data.session.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || 'Não foi possível atualizar a automação.');
    return json;
  }, []);

  const refresh = useCallback(async () => {
    const data = await api();
    setStatus(data);
    return data;
  }, [api]);

  useEffect(() => {
    let mounted = true;
    refresh().catch((error) => { if (mounted) setNotice(error.message); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; cancelLogin.current?.(); };
  }, [refresh]);

  useEffect(() => {
    if (!status?.appId) return;
    let mounted = true;
    const init = () => {
      if (!mounted || !window.FB) return;
      window.FB.init({ appId: status.appId, autoLogAppEvents: false, xfbml: false, version: 'v26.0' });
      setSdkReady(true);
    };
    window.fbAsyncInit = init;
    if (window.FB) init();
    else if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.onerror = () => { if (mounted) setNotice('Não foi possível abrir o login da Meta. Atualize a página.'); };
      document.body.appendChild(script);
    }
    return () => { mounted = false; };
  }, [status?.appId]);

  const instagram = status?.connections?.find((item) => item.platform === 'instagram');
  const enabled = Boolean(instagram?.connected && instagram?.automaticReplies);
  const connected = Boolean(instagram?.connected);

  function authorizeDirect() {
    if (!sdkReady || !window.FB) {
      setNotice('Aguarde o carregamento da Meta e tente novamente.');
      return;
    }
    cancelLogin.current?.();
    setPending(null);
    setSelectedId('');
    setNotice('Autorize o acesso às mensagens do Instagram na janela da Meta.');
    setBusy('meta');
    cancelLogin.current = launchMetaLogin(window.FB, { scope: SCOPE, auth_type: 'rerequest' },
      async (response) => {
        const token = response.authResponse?.accessToken;
        if (!token) {
          setBusy('');
          setNotice('A autorização não foi concluída. Tente novamente.');
          return;
        }
        try {
          const result = await api('/api/vital-connections', { action: 'prepare_instagram', userToken: token });
          if (!result.candidates?.length) throw new Error('A Meta não encontrou o Instagram da Vital Decor.');
          setPending(result);
          setSelectedId(result.candidates.length === 1 ? result.candidates[0].id : '');
          setNotice('Confirme abaixo que a conta selecionada é @vitaldecor_.');
        } catch (error) {
          setNotice(error.message);
        } finally {
          setBusy('');
        }
      },
      (error) => {
        setBusy('');
        setNotice(error?.message === 'meta_login_timeout'
          ? 'A Meta não respondeu. Verifique se a janela de autorização abriu.'
          : 'Não foi possível abrir a autorização da Meta. Tente novamente.');
      });
  }

  async function confirmDirect() {
    if (!pending || !selectedId) return;
    const chosen = pending.candidates.find((candidate) => candidate.id === selectedId);
    if (!chosen || String(chosen.username || '').toLowerCase().replace(/^@/, '') !== 'vitaldecor_') {
      setNotice('Por segurança, selecione a conta @vitaldecor_ para esta automação.');
      return;
    }
    setBusy('saving');
    try {
      await api('/api/vital-connections', {
        action: 'commit', platform: 'instagram', pendingId: pending.pendingId, accountId: selectedId,
      });
      await refresh();
      setPending(null);
      setSelectedId('');
      setNotice('Direct ativado! Faça um teste enviando uma mensagem de outra conta do Instagram.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  }

  async function pauseDirect() {
    setBusy('pausing');
    try {
      await api('/api/vital-connections/instagram/direct-control', { action: 'pause' });
      await refresh();
      setNotice('Automação pausada. Os próximos Directs não receberão essa resposta.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>INSTAGRAM · VITAL DECOR</span>
          <h1>Automações do Direct</h1>
          <p>Atendimento automático do Instagram para o WhatsApp comercial, sem misturar os contatos do Gui.</p>
        </div>
        <span className={enabled ? styles.activeBadge : styles.pendingBadge}>
          <span className={styles.bullet} />
          {loading ? 'Verificando' : enabled ? 'Ativa' : 'Aguardando ativação'}
        </span>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.appIcon}>◎</div>
          <div className={styles.cardTitle}>
            <h2>Boas-vindas → WhatsApp</h2>
            <p>@vitaldecor_ · Mensagem recebida no Direct</p>
          </div>
          <span className={enabled ? styles.activeBadge : styles.pendingBadge}>{enabled ? 'Ativa' : 'Pausada'}</span>
        </div>

        <div className={styles.steps}>
          <div><b>1</b><span>Cliente manda um Direct</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>2</b><span>Recebe a mensagem e o botão</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>3</b><span>Abre o WhatsApp da Vital</span></div>
        </div>

        <div className={styles.previewGrid}>
          <div className={styles.preview}>
            <span className={styles.previewLabel}>PRÉVIA DA MENSAGEM AUTOMÁTICA</span>
            <div className={styles.message}>{VITAL_WELCOME_TEXT}</div>
            <a href={VITAL_WHATSAPP_LINK} className={styles.whatsappButton} target="_blank" rel="noopener noreferrer">
              ◉ Abrir WhatsApp ↗
            </a>
          </div>
          <div className={styles.details}>
            <span className={styles.previewLabel}>COMO FUNCIONA</span>
            <div className={styles.detail}><strong>Canal</strong><span>Instagram @vitaldecor_</span></div>
            <div className={styles.detail}><strong>Destino</strong><span>WhatsApp (11) {VITAL_WHATSAPP.slice(4,9)}-{VITAL_WHATSAPP.slice(9)}</span></div>
            <div className={styles.detail}><strong>Frequência</strong><span>Uma resposta no início da conversa, sem repetir durante 24h de interação</span></div>
            <div className={styles.detail}><strong>Outras automações</strong><span>As palavras-chave e os Directs do Gui permanecem separados</span></div>
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.actionCopy}>
            <strong>{loading ? 'Consultando a conexão...' : enabled ? 'Resposta automática ligada' : connected ? 'A conexão está ativa, mas os Directs precisam de autorização.' : 'É preciso reconectar o Instagram da Vital Decor.'}</strong>
            <p>{enabled ? 'O TidePlace está autorizado a responder os novos Directs da Vital.' : 'Autorize o recebimento e o envio de mensagens na Meta. Nenhuma resposta será disparada até concluir.'}</p>
          </div>
          {enabled ? (
            <button type="button" className={styles.secondaryButton} onClick={pauseDirect} disabled={Boolean(busy)}> {busy === 'pausing' ? 'Pausando...' : 'Pausar automação'} </button>
          ) : (
            <button type="button" className={styles.primaryButton} onClick={authorizeDirect}
              disabled={!sdkReady || Boolean(busy) || loading}>
              {busy === 'meta' ? 'Aguardando Meta...' : !sdkReady ? 'Carregando Meta...' : 'Autorizar e ativar Direct'}
            </button>
          )}
        </div>
      </section>

      {pending && (
        <section className={styles.confirmCard}>
          <span className={styles.eyebrow}>CONFIRMAR PERFIL</span>
          <h2>Qual Instagram devemos autorizar?</h2>
          <p>Selecione somente o Instagram da Vital Decor para não afetar os fluxos das outras contas.</p>
          <div className={styles.options}>
            {pending.candidates.map((item) => (
              <label key={item.id} className={styles.option}>
                <input type="radio" checked={selectedId === item.id}
                  onChange={() => setSelectedId(item.id)} name="vital-direct-account" />
                <span><strong>{item.name || item.username}</strong><small>@{item.username || 'Conta sem nome'}</small></span>
              </label>
            ))}
          </div>
          <button type="button" className={styles.primaryButton} disabled={!selectedId || Boolean(busy)} onClick={confirmDirect}>
            {busy === 'saving' ? 'Confirmando...' : 'Confirmar e ativar'}
          </button>
        </section>
      )}

      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </main>
  );
}
