'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../CloudGate';
import { useWorkspace } from '../WorkspaceSwitcher';
import styles from './youtube.module.css';

const CALLBACK_URI = 'https://social-hub-gui.vercel.app/api/youtube/callback';
const FEEDBACK = {
  connected: 'O Google autorizou o canal. Conexão salva no TidePlace.',
  denied: 'A autorização foi cancelada no Google. Nenhuma conexão foi alterada.',
  invalid_state: 'A sessão de autorização não corresponde a este navegador. Reinicie a conexão aqui.',
  expired: 'A autorização expirou ou já foi utilizada. Clique em conectar novamente.',
  save_error: 'O Google autorizou a conta, mas não foi possível salvar a conexão. Tente novamente.',
  error: 'Não foi possível concluir a autorização. Verifique a conta Google e o endereço de retorno OAuth.',
};

async function token() {
  if (!supabase) throw new Error('O TidePlace ainda não configurou o acesso ao banco.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Entre na sua conta do TidePlace para conectar o canal.');
  return data.session.access_token;
}

export default function YoutubeConnectionPage() {
  const [workspace] = useWorkspace();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/youtube/status', {
        headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A consulta falhou.');
      setStatus(data);
    } catch (cause) {
      setError(cause.message || 'Não foi possível verificar o canal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspace.id !== 'gui-nonato') return;
    const result = new URLSearchParams(window.location.search).get('connection');
    if (result) {
      setFeedback(FEEDBACK[result] || 'Não foi possível confirmar a conexão.');
      window.history.replaceState({}, '', '/youtube');
    }
    void refresh();
  }, [refresh, workspace.id]);

  async function connect() {
    setBusy(true); setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/youtube/connect', {
        method: 'POST', headers: { Authorization: 'Bearer ' + accessToken },
      });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || 'Não foi possível iniciar a autorização.');
      window.location.assign(data.authorizationUrl);
    } catch (cause) {
      setError(cause.message || 'Erro ao abrir a autorização.');
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o canal do YouTube do TidePlace?')) return;
    setBusy(true); setError('');
    try {
      const accessToken = await token();
      const response = await fetch('/api/youtube/status', {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + accessToken },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao desconectar.');
      setStatus({ connected: false });
      setFeedback('Canal desconectado do TidePlace. Para revogar no Google, use as permissões da sua conta.');
    } catch (cause) { setError(cause.message || 'Não foi possível desconectar.'); }
    finally { setBusy(false); }
  }

  if (workspace.id !== 'gui-nonato') {
    return <main className={styles.page}><div className={styles.panel}><h1>YouTube</h1><p>Esta integração pertence ao workspace Gui Nonato. Troque de conta no topo do TidePlace para gerenciá-la.</p></div></main>;
  }

  return <main className={styles.page}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>GUI NONATO / CANAIS</span><h1>Conexão YouTube</h1>
        <p>Autorize o canal pelo Google, sem compartilhar sua senha. Esta conexão fica separada do Instagram e do WhatsApp.</p></div>
      <button type="button" className={styles.secondary} onClick={refresh} disabled={loading || busy}>{loading ? 'Verificando…' : 'Atualizar status'}</button>
    </div>
    {feedback && <p role="status" className={styles.notice}>{feedback}</p>}
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    <section className={styles.panel}>
      <div className={styles.panelTop}><span className={styles.logo}>▶</span>
        <div><h2>Canal do YouTube</h2><p>Publicação de Shorts e gerenciamento de comentários</p></div>
        <span className={styles.pill}>{loading ? 'Verificando' : status?.connected ? 'Autorizado' : 'Não conectado'}</span>
      </div>
      {status?.connected ? <div className={styles.account}>
        {status.thumbnail && <img className={styles.avatar} src={status.thumbnail} alt="" />}
        <div><strong>{status.title}</strong><small>ID: {status.channelId}</small>
          <small>Autorizado em {new Date(status.connectedAt).toLocaleDateString('pt-BR')}</small></div>
        <a href={'https://www.youtube.com/channel/' + encodeURIComponent(status.channelId)} target="_blank" rel="noopener noreferrer">Abrir canal ↗</a>
      </div> : <p className={styles.empty}>{loading ? 'Consultando a conexão autorizada…' : 'Ainda não há canal autorizado para o Gui Nonato.'}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || loading} onClick={connect}>
          {busy ? 'Preparando autorização…' : status?.connected ? 'Reconectar pelo Google' : 'Conectar YouTube'}
        </button>
        {status?.connected && <button type="button" className={styles.secondary} disabled={busy} onClick={disconnect}>Desconectar</button>}
      </div>
    </section>
    <section className={styles.panel}>
      <h2>Próximas funcionalidades</h2>
      <div className={styles.features}>
        <div><span>01</span><strong>Publicar Shorts</strong><p>Publicação e agendamento serão liberados após os testes de upload e a auditoria do Google.</p></div>
        <div><span>02</span><strong>Automações</strong><p>Monitoramento e resposta a comentários serão ativados separadamente das automações do Instagram.</p></div>
      </div>
    </section>
    <section className={styles.help}>
      <strong>Configuração necessária no Google Cloud</strong>
      <p>No cliente OAuth “TidePlace - YouTube”, adicione este endereço exato em “URIs de redirecionamento autorizados”:</p>
      <code>{CALLBACK_URI}</code>
      <p>O aplicativo deve manter o e-mail do Gui como usuário de teste. Enquanto estiver no modo Teste, as autorizações com escopos do YouTube normalmente expiram em 7 dias.</p>
    </section>
  </main>;
}
