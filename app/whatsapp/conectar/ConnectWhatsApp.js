'use client';

import { useEffect, useRef, useState } from 'react';

const APP_ID = '1975149819862842';
const VERSION = 'v26.0';

function configIdFrom(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.searchParams.get('config_id') || url.searchParams.get('configuration_id') || '';
  } catch {}
  const match = raw.match(/(?:config_id|configuration_id)=([^&\s]+)/i);
  if (match?.[1]) return decodeURIComponent(match[1]);
  return /^[A-Za-z0-9_-]{8,}$/.test(raw) ? raw : '';
}

function isFacebookOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'facebook.com' || hostname.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

export default function ConnectWhatsApp() {
  const [sdkReady, setSdkReady] = useState(false);
  const [input, setInput] = useState('');
  const [configId, setConfigId] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef('');
  const sessionRef = useRef(null);
  const finishingRef = useRef(false);

  async function finishIfReady() {
    if (finishingRef.current || !codeRef.current || !sessionRef.current?.wabaId) return;
    finishingRef.current = true;
    setBusy(true);
    setMessage('Finalizando a conexão no Hub...');
    try {
      const response = await fetch('/api/whatsapp/meta/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeRef.current,
          wabaId: sessionRef.current.wabaId,
          phoneNumberId: sessionRef.current.phoneNumberId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Não foi possível concluir a conexão.');
      const checkResponse = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      const check = await checkResponse.json().catch(() => ({}));
      setStatus(check);
      if (!check?.connected || !check?.webhookReady || !check?.webhookEnsure?.ok) {
        setMessage('Autorização recebida, mas a entrega de mensagens ainda precisa ser confirmada. Abra o diagnóstico antes de ativar as automações.');
      } else {
        setDone(data);
        setMessage('WhatsApp Business conectado e webhook confirmado.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao concluir a conexão.');
    } finally {
      finishingRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem('tideplace_gui_whatsapp_config_id') || '';
    if (saved) {
      setConfigId(saved);
      setInput(saved);
    }

    fetch('/api/whatsapp/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        setStatus(data);
        if (data?.provider === 'meta' && data?.connected && data?.webhookReady && data?.webhookEnsure?.ok) {
          setDone({
            verifiedName: data.verifiedName,
            displayPhoneNumber: data.displayPhoneNumber,
          });
        }
      })
      .catch(() => {});

    window.fbAsyncInit = () => {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: VERSION });
      setSdkReady(true);
    };

    if (window.FB) window.fbAsyncInit();
    else if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      document.body.appendChild(script);
    }

    function onMessage(event) {
      if (!isFacebookOrigin(event.origin)) return;
      let payload = event.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (payload.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || payload.event === 'FINISH') {
        sessionRef.current = {
          wabaId: String(payload?.data?.waba_id || ''),
          phoneNumberId: payload?.data?.phone_number_id ? String(payload.data.phone_number_id) : '',
        };
        finishIfReady();
      }
      if (payload.event === 'CANCEL') {
        setBusy(false);
        setMessage('Conexão cancelada. Nada foi alterado.');
      }
      if (payload.event === 'ERROR') {
        setBusy(false);
        setMessage(payload?.data?.error_message || 'A Meta informou um erro durante a conexão.');
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function saveConfig() {
    const parsed = configIdFrom(input);
    if (!parsed) {
      setMessage('Use o Configuration ID do WhatsApp do Gui, não o da Vital Decor.');
      return;
    }
    window.localStorage.setItem('tideplace_gui_whatsapp_config_id', parsed);
    setConfigId(parsed);
    setInput(parsed);
    setMessage('Configuração salva. Agora é só conectar.');
  }

  function connect() {
    if (!window.FB || !sdkReady || !configId) return;
    codeRef.current = '';
    sessionRef.current = null;
    setBusy(true);
    setMessage('Na janela da Meta, escolha conectar o WhatsApp Business que você já usa.');
    window.FB.login((response) => {
      const code = response?.authResponse?.code;
      if (code) {
        codeRef.current = String(code);
        finishIfReady();
      } else if (response?.status !== 'connected') {
        setBusy(false);
        setMessage('A autorização não foi concluída.');
      }
    }, {
      config_id: configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    });
  }

  if (done) {
    return (
      <div>
        <h2>WhatsApp conectado ✓</h2>
        <p>{done.verifiedName || 'WhatsApp Business'}</p>
        {done.displayPhoneNumber && <strong>{done.displayPhoneNumber}</strong>}
        <p><a href="/whatsapp">Abrir CRM</a></p>
        {message && <p>{message}</p>}
      </div>
    );
  }

  const needsCredentialRefresh = status?.state === 'credential_refresh_required'
    || status?.needsCredentialRefresh
    || status?.needsReauthorization;
  const reconnectRequired = needsCredentialRefresh
    || status?.state === 'coexistence_reconnect_required'
    || status?.needsCoexistenceReconnect;

  return (
    <div>
      {!configId && (
        <div>
          <label htmlFor="meta-config">Cole o link gerado pela Meta ou o Configuration ID</label>
          <input id="meta-config" value={input} onChange={(event) => setInput(event.target.value)} />
          <button type="button" onClick={saveConfig}>Salvar configuração</button>
        </div>
      )}
      {configId && <p>Configuração da Meta pronta ✓</p>}
      {reconnectRequired && (
        <p role="alert">
          <strong>{needsCredentialRefresh
            ? 'A autorização da Meta do WhatsApp do Gui precisa ser renovada.'
            : 'A conexão da API do WhatsApp do Gui foi interrompida.'}</strong>{' '}
          Clique abaixo para autorizar novamente pela janela oficial da Meta, selecionando o mesmo número.
          Não exclua o número, não troque a WABA e não desinstale o WhatsApp Business.
        </p>
      )}
      <button type="button" disabled={!configId || !sdkReady || busy} onClick={connect}>
        {busy ? 'Aguardando a Meta...' : sdkReady ? 'Conectar WhatsApp Business' : 'Carregando Meta...'}
      </button>
      <p>{reconnectRequired
        ? 'Após concluir a reconexão, confirme em Diagnóstico que aparece CLOUD_API e CONNECTED.'
        : 'Use esta opção para a primeira conexão. Se o número já recebe mensagens normalmente, não refaça o cadastro.'}</p>
      {message && <p>{message}</p>}
    </div>
  );
}
