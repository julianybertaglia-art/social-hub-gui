'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './CloudGate';
import { startVitalInstagramUnifiedLogin } from './lib/vital-instagram-unified-client.mjs';
import { VITAL_WHATSAPP_DISPLAY, VITAL_WHATSAPP_LINK, VITAL_STORE_LINK, VITAL_WELCOME_TEXT } from './lib/vital-direct-copy.mjs';
import styles from './vital-instagram-automation.module.css';


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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('ig_auth');
    const reason = params.get('reason');
    if (kind === 'connected') {
      setNotice('Instagram @vitaldecor_ autorizado. Faça um teste de Direct e comentário MARMORE usando outra conta.');
    } else if (kind === 'failed') {
      const explanations = {
        cancelled: 'Você cancelou a autorização na Meta.',
        expired: 'A autorização expirou ou já foi utilizada. Inicie uma nova.',
        state: 'A confirmação de segurança expirou. Inicie a autorização novamente nesta mesma janela.',
        missing_code: 'A Meta não enviou o código da autorização.',
        secret_missing: 'A configuração segura do aplicativo Meta está incompleta no servidor.',
        exchange: 'A Meta não aceitou a troca do código de autorização por uma credencial.',
        wrong_business: 'Selecione o portfólio empresarial Vital Decor na Meta.',
        account_not_shared: 'Selecione e compartilhe @vitaldecor_ com o TidePlace na Meta.',
        token_invalid: 'A Meta não confirmou a credencial do aplicativo correto.',
        permissions: 'A autorização não incluiu mensagens e comentários do Instagram.',
        subscribe: 'A Meta não confirmou a assinatura dos webhooks de mensagens e comentários.',
        save: 'A autorização funcionou, mas não foi possível salvar a conexão.',
      };
      setNotice(explanations[reason] || 'A autorização não foi concluída. A conexão anterior foi preservada.');
    }
  }, []);

  const instagram = status?.connections?.find((item) => item.platform === 'instagram');
  const enabled = Boolean(instagram?.connected && instagram?.automaticReplies);
  const connected = Boolean(instagram?.connected);
  const commentsEnabled = Boolean(instagram?.connected && instagram?.commentsSubscribed);

  async function authorizeDirect() {
    setBusy('meta');
    setNotice('Abrindo o Login Unificado da Meta para @vitaldecor_...');
    try {
      const loginUrl = await startVitalInstagramUnifiedLogin(supabase);
      window.location.assign(loginUrl);
    } catch (error) {
      setBusy('');
      setNotice(error.message);
    }
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

  async function activateExistingDirect() {
    setBusy('existing');
    setNotice('Conferindo com a Meta a autorização já salva da Vital Decor...');
    try {
      await api('/api/vital-connections/instagram/direct-control', { action: 'activate_existing' });
      await refresh();
      setNotice('Direct ativado com a conexão existente! Envie uma mensagem de outra conta do Instagram para testar.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  }

  async function activateComments() {
    setBusy('comments');
    setNotice('Conferindo a autorização de comentários da Vital Decor na Meta...');
    try {
      await api('/api/vital-connections/instagram/comment-control', { action: 'activate_comments' });
      await refresh();
      setNotice('Comentários MARMORE ativados. Teste comentando em um post da Vital com outra conta.');
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
          <p>Resposta de boas-vindas que direciona clientes para a loja oficial ou para o WhatsApp da Vital Decor.</p>
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
            <h2>Boas-vindas → Site ou WhatsApp</h2>
            <p>@vitaldecor_ · Mensagem recebida no Direct</p>
          </div>
          <span className={enabled ? styles.activeBadge : styles.pendingBadge}>{enabled ? 'Ativa' : 'Pausada'}</span>
        </div>

        <div className={styles.steps}>
          <div><b>1</b><span>Cliente manda um Direct</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>2</b><span>Recebe a mensagem e o botão</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>3</b><span>Abre a loja ou o WhatsApp da Vital</span></div>
        </div>

        <div className={styles.previewGrid}>
          <div className={styles.preview}>
            <span className={styles.previewLabel}>PRÉVIA DA MENSAGEM AUTOMÁTICA</span>
            <div className={styles.message}>{VITAL_WELCOME_TEXT}</div>
            <a href={VITAL_STORE_LINK} className={styles.whatsappButton} target="_blank" rel="noopener noreferrer">
              Comprar no site ↗
            </a>
            <a href={VITAL_WHATSAPP_LINK} className={styles.whatsappButton} target="_blank" rel="noopener noreferrer">
              Falar no WhatsApp ↗
            </a>
          </div>
          <div className={styles.details}>
            <span className={styles.previewLabel}>COMO FUNCIONA</span>
            <div className={styles.detail}><strong>Canal</strong><span>Instagram @vitaldecor_</span></div>
            <div className={styles.detail}><strong>Destino</strong><span>{VITAL_STORE_LINK} ou WhatsApp {VITAL_WHATSAPP_DISPLAY}</span></div>
            <div className={styles.detail}><strong>Frequência</strong><span>Uma resposta no início da conversa, sem repetir durante 24h de interação</span></div>
            <div className={styles.detail}><strong>Outras automações</strong><span>As palavras-chave e os Directs do Gui permanecem separados</span></div>
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.actionCopy}>
            <strong>{loading ? 'Consultando a conexão...' : enabled ? 'Resposta automática ligada' : connected ? 'Instagram conectado. Tente liberar as mensagens com a conexão atual ou autorize novamente.' : 'É preciso reconectar o Instagram da Vital Decor.'}</strong>
            <p>{enabled ? 'O TidePlace está autorizado a responder os novos Directs da Vital.' : 'Autorize o recebimento e o envio de mensagens na Meta. Nenhuma resposta será disparada até concluir.'}</p>
          </div>
          {enabled ? (
            <button type="button" className={styles.secondaryButton} onClick={pauseDirect} disabled={Boolean(busy)}> {busy === 'pausing' ? 'Pausando...' : 'Pausar automação'} </button>
          ) : (
            <div className={styles.activationButtons}>
              {connected && (
                <button type="button" className={styles.primaryButton} onClick={activateExistingDirect}
                  disabled={Boolean(busy) || loading}>
                  {busy === 'existing' ? 'Conferindo autorização...' : 'Tentar ativar conexão atual'}
                </button>
              )}
              <button type="button" className={connected ? styles.secondaryButton : styles.primaryButton}
                onClick={authorizeDirect} disabled={Boolean(busy) || loading}>
                {busy === 'meta' ? 'Aguardando Meta...' : connected ? 'Autorizar novamente pela Meta' : 'Autorizar e ativar Direct'}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.appIcon}>#</div>
          <div className={styles.cardTitle}>
            <h2>Comentário MARMORE → link no Direct</h2>
            <p>@vitaldecor_ · Comentário contendo MARMORE ou MÁRMORE</p>
          </div>
          <span className={commentsEnabled ? styles.activeBadge : styles.pendingBadge}>
            {commentsEnabled ? 'Ativa' : 'Aguardando ativação'}
          </span>
        </div>
        <div className={styles.steps}>
          <div><b>1</b><span>Cliente comenta MARMORE</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>2</b><span>Recebe um Direct automático</span></div>
          <span className={styles.arrow}>→</span>
          <div><b>3</b><span>Acessa os modelos de mármore</span></div>
        </div>
        <div className={styles.previewGrid}>
          <div className={styles.preview}>
            <span className={styles.previewLabel}>PRÉVIA DO DIRECT</span>
            <div className={styles.message}>
              Oi! 💜 Aqui estão os adesivos de mármore da Vital Decor que você pediu!
              {'\n\n'}🤍 Carrara branco 60x60
              {'\n'}🖤 Mármore preto 60x60
              {'\n'}✨ Calacata Gold 60x60
              {'\n\n'}Cada modelo acompanha seu link direto para comprar. 😊
            </div>
          </div>
          <div className={styles.details}>
            <span className={styles.previewLabel}>COMO FUNCIONA</span>
            <div className={styles.detail}><strong>Canal</strong><span>Somente @vitaldecor_</span></div>
            <div className={styles.detail}><strong>Palavra-chave</strong><span>MARMORE (aceita acento)</span></div>
            <div className={styles.detail}><strong>Produtos</strong><span>Carrara, Preto e Calacata Gold (links oficiais)</span></div>
            <div className={styles.detail}><strong>Limite da Meta</strong><span>Uma resposta privada por comentário</span></div>
            <div className={styles.detail}><strong>WhatsApp e Gui</strong><span>Não são alterados por esta regra</span></div>
          </div>
        </div>
        <div className={styles.actions}>
          <div className={styles.actionCopy}>
            <strong>{commentsEnabled ? 'Respostas a comentários autorizadas pela Meta' : 'Falta confirmar a permissão de comentários na Meta'}</strong>
            <p>{commentsEnabled
              ? 'O TidePlace pode enviar o link dos adesivos de mármore para comentários novos.'
              : 'Ative os comentários com a conexão atual. Se a Meta exigir nova permissão, use o botão de reautorização.'}</p>
          </div>
          {!commentsEnabled && (
            <div className={styles.activationButtons}>
              {connected && (
                <button type="button" className={styles.primaryButton} disabled={Boolean(busy)}
                  onClick={activateComments}>
                  {busy === 'comments' ? 'Conferindo Meta...' : 'Ativar comentários MARMORE'}
                </button>
              )}
              <button type="button" className={styles.secondaryButton}
                disabled={Boolean(busy)} onClick={authorizeDirect}>
                Autorizar novamente pela Meta
              </button>
            </div>
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
