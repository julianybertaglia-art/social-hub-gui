'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../CloudGate';
import styles from './connections.module.css';

function facebookOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return host === 'facebook.com' || host.endsWith('.facebook.com');
  } catch { return false; }
}

function configurationId(value) {
  try {
    const url = new URL(value);
    value = url.searchParams.get('config_id') || url.searchParams.get('configuration_id') || '';
  } catch {}
  return /^\d{5,40}$/.test(value.trim()) ? value.trim() : '';
}

export default function VitalConnections() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [configInput, setConfigInput] = useState('');
  const [pending, setPending] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const whatsapp = useRef(null);

  const api = useCallback(async (body) => {
    if (!supabase) throw new Error('A conexão com o TidePlace está indisponível.');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('Entre no TidePlace para conectar suas contas.');
    const response = await fetch('/api/vital-connections', {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + data.session.access_token,
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar as conexões.');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    const next = await api();
    setStatus(next);
    return next;
  }, [api]);

  function showCandidates(result) {
    setPending(result);
    setSelectedId(result.candidates.length === 1 ? result.candidates[0].id : '');
    setMessage('Confira a conta da Vital Decor e confirme a conexão.');
  }

  const finishWhatsApp = useCallback(async () => {
    const session = whatsapp.current;
    if (!session?.active || !session.code || !session.wabaId || session.finishing) return;
    session.finishing = true;
    setMessage('Conferindo o número autorizado pela Meta...');
    try {
      const result = await api({
        action: 'prepare_whatsapp', code: session.code, wabaId: session.wabaId,
      });
      showCandidates(result);
    } catch (error) {
      setMessage(error.message);
    } finally {
      whatsapp.current = null;
      setBusy('');
    }
  }, [api]);

  useEffect(() => {
    let mounted = true;
    refresh().then((data) => {
      if (!mounted) return;
      const saved = window.localStorage.getItem('lynna_meta_whatsapp_config_id') || '';
      setConfigInput(data.whatsappConfigId || saved);
    }).catch((error) => { if (mounted) setMessage(error.message); });
    return () => { mounted = false; };
  }, [refresh]);

  useEffect(() => {
    if (!status?.appId) return;
    let mounted = true;
    const initialize = () => {
      if (!mounted || !window.FB) return;
      window.FB.init({ appId: status.appId, autoLogAppEvents: false, xfbml: false, version: 'v26.0' });
      setSdkReady(true);
    };
    window.fbAsyncInit = initialize;
    if (window.FB) initialize();
    else if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.onerror = () => { if (mounted) setMessage('Não foi possível carregar o login da Meta. Atualize a página.'); };
      document.body.appendChild(script);
    }
    return () => { mounted = false; };
  }, [status?.appId]);

  useEffect(() => {
    const listener = (event) => {
      if (!whatsapp.current?.active || !facebookOrigin(event.origin)) return;
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(data.event)) {
        whatsapp.current.wabaId = String(data.data?.waba_id || '');
        finishWhatsApp();
      } else if (['CANCEL', 'ERROR'].includes(data.event)) {
        whatsapp.current = null;
        setBusy('');
        setMessage('A autorização do WhatsApp não foi concluída. Você pode tentar novamente.');
      }
    };
    window.addEventListener('message', listener);
    return () => { window.removeEventListener('message', listener); whatsapp.current = null; };
  }, [finishWhatsApp]);

  function connectInstagram() {
    setPending(null);
    setBusy('instagram');
    setMessage('Conclua a autorização do Instagram na janela da Meta.');
    window.FB.login(async (response) => {
      const userToken = response.authResponse?.accessToken;
      if (!userToken) {
        setMessage('A autorização do Instagram não foi concluída. Você pode tentar novamente.');
        setBusy('');
        return;
      }
      try {
        showCandidates(await api({ action: 'prepare_instagram', userToken }));
      } catch (error) {
        setMessage(error.message);
      } finally { setBusy(''); }
    }, {
      scope: 'instagram_basic,pages_show_list,pages_read_engagement,instagram_manage_insights',
      auth_type: 'rerequest',
    });
  }

  function connectWhatsApp() {
    const configId = configurationId(configInput);
    if (!configId) {
      setMessage('A configuração de cadastro do WhatsApp na Meta precisa ser informada.');
      return;
    }
    window.localStorage.setItem('lynna_meta_whatsapp_config_id', configId);
    setPending(null);
    setBusy('whatsapp');
    setMessage('Conclua a autorização do WhatsApp na janela da Meta.');
    whatsapp.current = { active: true, code: '', wabaId: '', finishing: false };
    window.FB.login((response) => {
      if (!whatsapp.current) return;
      if (!response.authResponse?.code) {
        whatsapp.current = null;
        setBusy('');
        setMessage('A autorização do WhatsApp não foi concluída. Você pode tentar novamente.');
        return;
      }
      whatsapp.current.code = response.authResponse.code;
      finishWhatsApp();
    }, {
      config_id: configId, response_type: 'code', override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
    });
  }

  async function confirmAccount() {
    if (!pending || !selectedId) return;
    setBusy(pending.platform);
    try {
      await api({ action: 'commit', pendingId: pending.pendingId,
        platform: pending.platform, accountId: selectedId });
      setPending(null);
      setSelectedId('');
      await refresh();
      setMessage('Conexão da Vital Decor confirmada.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(''); }
  }

  const channels = [
    { id: 'instagram', label: 'Instagram', description: 'Perfil profissional e métricas da Vital Decor.',
      connect: connectInstagram },
    { id: 'whatsapp', label: 'WhatsApp Business', description: 'Conecte o número que você já usa no WhatsApp Business.',
      connect: connectWhatsApp },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>Tide<span>Place</span></Link>
        <Link href="/" className={styles.back}>Voltar ao Hub ↗</Link>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>CONEXÕES · VITAL DECOR</p>
        <h1>Os canais da sua marca,<br />no mesmo lugar.</h1>
        <p>Autorize suas contas pela Meta e confira o perfil e o número antes de conectar.</p>
      </section>
      <div className={styles.grid}>
        {channels.map((channel) => {
          const connection = status?.connections.find((item) => item.platform === channel.id);
          const connected = connection?.connected;
          return (
            <section key={channel.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.channelIcon}>{channel.id === 'instagram' ? '◎' : '◉'}</span>
                <span className={connected ? styles.connected : styles.disconnected}>
                  {!status ? 'Verificando' : connected ? 'Conectado' : 'Conexão pendente'}
                </span>
              </div>
              <h2>{channel.label}</h2>
              <p>{channel.description}</p>
              {connection && <div className={styles.account}>
                <strong>{connection.name || 'Vital Decor'}</strong>
                <span>{connection.username ? '@' + connection.username : connection.displayPhoneNumber}</span>
                {connection.state === 'reauthorization_required' && <span>Autorize novamente para recuperar a conexão.</span>}
              </div>}
              {channel.id === 'whatsapp' && !connected && (
                <label className={styles.config}>
                  Configuração do cadastro na Meta
                  <input value={configInput} onChange={(event) => setConfigInput(event.target.value)}
                    placeholder="ID ou link da configuração" autoComplete="off" />
                  <span>Disponível em Facebook Login para Empresas, no aplicativo da Meta.</span>
                </label>
              )}
              <button className={styles.button} onClick={channel.connect} disabled={!sdkReady || Boolean(busy)}>
                {busy === channel.id ? 'Aguardando autorização...' : connected ? 'Renovar autorização' : 'Conectar ' + channel.label}
              </button>
              {channel.id === 'whatsapp' && connected && <p className={styles.note}>Respostas automáticas pausadas.</p>}
            </section>
          );
        })}
      </div>
      {pending && (
        <section className={styles.selection} aria-labelledby="account-selection">
          <p className={styles.eyebrow}>ÚLTIMA ETAPA</p>
          <h2 id="account-selection">Selecione a conta da Vital Decor</h2>
          <fieldset disabled={Boolean(busy)}>
            <legend>Contas autorizadas na Meta</legend>
            {pending.candidates.map((account) => (
              <label key={account.id} className={styles.option}>
                <input type="radio" name="meta-account" value={account.id}
                  checked={selectedId === account.id} onChange={() => setSelectedId(account.id)} />
                <span><strong>{account.name}</strong><span>
                  {account.username ? '@' + account.username : account.displayPhoneNumber}
                  {account.pageName ? ' · Página ' + account.pageName : ''}
                </span></span>
              </label>
            ))}
          </fieldset>
          <button className={styles.button} onClick={confirmAccount} disabled={!selectedId || Boolean(busy)}>
            Conectar esta conta
          </button>
        </section>
      )}
      {message && <p role="status" aria-live="polite" className={styles.message}>{message}</p>}
      <footer className={styles.footer}>Vital Decor · Instagram e WhatsApp</footer>
    </main>
  );
}
