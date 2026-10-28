'use client';

import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../CloudGate';
import {useWorkspace} from '../../WorkspaceSwitcher';
import styles from '../../youtube/youtube.module.css';

const FEEDBACK={
  connected:'O TikTok autorizou a conta. A conexão foi salva com segurança no TidePlace.',
  denied:'A autorização foi cancelada no TikTok. Nenhuma conexão foi alterada.',
  invalid_state:'A sessão de autorização não corresponde ao navegador. Reinicie a conexão aqui.',
  expired:'A autorização expirou ou foi usada. Tente novamente.',
  save_error:'O TikTok autorizou, mas o TidePlace não conseguiu salvar a conta.',
  error:'O TikTok não concluiu a autorização. Verifique se o app está aprovado ou se está em Sandbox.',
};
async function authToken(){
  if(!supabase)throw new Error('A conexão com o banco está indisponível.');
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Faça login no TidePlace para conectar o TikTok.');
  return data.session.access_token;
}
export default function TikTokConnectionPage(){
  const [workspace]=useWorkspace();
  const [status,setStatus]=useState(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const token=await authToken();
      const response=await fetch('/api/tiktok/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Falha ao consultar TikTok.');
      setStatus(data);
    }catch(e){setError(e.message||'Falha ao verificar conexão.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    if(workspace.id!=='gui-nonato')return;
    const result=new URLSearchParams(window.location.search).get('connection');
    if(result){
      setNotice(FEEDBACK[result]||'Não foi possível confirmar a autorização.');
      window.history.replaceState({},'', '/tiktok/conectar');
    }
    void refresh();
  },[refresh,workspace.id]);

  async function connect(posting=false,environment='production'){
    setBusy(true);setError('');setNotice('');
    try{
      const token=await authToken();
      const response=await fetch('/api/tiktok/connect',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({posting,environment}),
      });
      const data=await response.json();
      if(!response.ok||!data.authorizationUrl)throw new Error(data.error||'O TikTok não iniciou a autorização.');
      window.location.assign(data.authorizationUrl);
    }catch(e){setError(e.message||'Falha ao conectar TikTok.');setBusy(false);}
  }

  async function disconnect(){
    if(!window.confirm('Desconectar o TikTok do Gui e revogar a autorização do TidePlace?'))return;
    setBusy(true);setError('');
    try{
      const token=await authToken();
      const response=await fetch('/api/tiktok/status',{method:'DELETE',
        headers:{Authorization:'Bearer '+token}});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Falha ao desconectar.');
      setStatus(prev=>({...prev,connected:false}));
      setNotice('Conta desconectada e autorização revogada no TikTok.');
    }catch(e){setError(e.message||'Não foi possível desconectar.');}
    finally{setBusy(false);}
  }

  if(workspace.id!=='gui-nonato'){
    return <main className={styles.page}><section className={styles.panel}><h1>TikTok</h1>
      <p>A autorização do TikTok pertence à conta Gui Nonato. Selecione o workspace correto no topo.</p>
    </section></main>;
  }
  const configured=Boolean(status?.configured);
  return <main className={styles.page}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>GUI NONATO / CANAIS</span>
      <h1>Conexão TikTok</h1>
      <p>Conecte a conta oficial do Gui pelo Login Kit. O acesso ficará separado do Instagram, WhatsApp e YouTube.</p></div>
      <button className={styles.secondary} type="button" onClick={refresh} disabled={busy||loading}>
        {loading?'Verificando…':'Atualizar status'}</button>
    </div>
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {error&&<p role="alert" className={styles.warning}>{error}</p>}
    <section className={styles.panel}>
      <div className={styles.panelTop}>
        <span className={styles.logo} aria-hidden="true">♪</span>
        <div><h2>Conta TikTok do Gui</h2><p>Autorização oficial, conta e permissões concedidas</p></div>
        <span className={styles.pill}>{loading?'Verificando':status?.connected?'Autorizado':'Não conectado'}</span>
      </div>
      {status?.connected? <div className={styles.account}>
        {status.avatarUrl&&<img className={styles.avatar} src={status.avatarUrl} alt="" />}
        <div><strong>{status.displayName||'Conta TikTok'}</strong>
        <small>ID da conta: {status.openId}</small>
        <small>Ambiente: {status.environment==='sandbox'?'Sandbox (teste)':'Production'}</small>
        <small>Permissões: {Array.isArray(status.scopes)?status.scopes.join(', '):'Sem dados'}</small>
        <small>Conectado em {new Date(status.connectedAt).toLocaleDateString('pt-BR')}</small></div>
      </div>:<p className={styles.empty}>{loading?'Consultando…':'Ainda não existe conta TikTok autorizada no TidePlace.'}</p>}
      {!loading&&!configured&&<div className={styles.help}>
        <strong>Falta configurar as credenciais na Vercel</strong>
        <p>No projeto <b>social-hub-gui</b>, adicione <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code> em <b>Settings → Environment Variables</b> para Production. Copie os valores de <b>TidePlace → Credentials</b> no portal TikTok. Não cole o Client Secret aqui no chat. Depois faça um redeploy para aplicar as alterações.</p>
      </div>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={!status?.sandboxConfigured||loading||busy}
          onClick={()=>connect(true,'sandbox')}>{busy?'Abrindo TikTok…':
            status?.connected&&status?.environment==='sandbox'?'Renovar permissões no Sandbox':'Conectar no Sandbox com permissões de vídeo'}</button>
        <button type="button" className={styles.secondary} disabled={!configured||loading||busy}
          onClick={()=>connect(false,'production')}>Conectar em Production (após aprovação)</button>
        {status?.connected&&<button type="button" className={styles.secondary} onClick={disconnect}
          disabled={busy}>Desconectar e revogar</button>}
      </div>
    </section>
    <section className={styles.panel}>
      <h2>Etapa de testes e aprovação</h2>
      {!loading&&!status?.sandboxConfigured&&<div className={styles.help}>
        <strong>Para testar o perfil @gui_nonato no Sandbox:</strong>
        <p>Adicione <code>TIKTOK_SANDBOX_CLIENT_KEY</code> e <code>TIKTOK_SANDBOX_CLIENT_SECRET</code> nas variáveis <b>Production</b> do projeto <b>social-hub-gui</b> na Vercel, usando os valores da seção <b>Sandbox → TidePlace Testes → Credentials</b> do TikTok. Não sobrescreva <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code>. Faça um redeploy de Production após salvar e atualize esta tela. Nunca compartilhe o segredo em conversa.</p>
      </div>}
      <p>O TikTok está integrado em ambiente de teste. Clique em <b>Renovar permissões no Sandbox</b> para autorizar <code>user.info.basic</code>, <code>video.upload</code> e <code>video.publish</code>. A autorização anterior tinha apenas <code>user.info.basic</code>.</p>
      <p>Com <code>video.upload</code> vamos enviar um vídeo à caixa de entrada do aplicativo TikTok, onde o criador poderá finalizar manualmente. Isso <b>não é uma publicação pública automática</b>. O Direct Post exige fluxo separado e aprovação da plataforma.</p>
      <div className={styles.features}>
        <div><span>01</span><strong>Conectar conta</strong><p>Configure a chave e o segredo da API e autorize o Gui pelo TikTok.</p></div>
        <div><span>02</span><strong>Sandbox e demonstração</strong><p>Teste a integração com usuários de teste autorizados. A gravação de tela deve mostrar o fluxo real, não uma simulação.</p></div>
        <div><span>03</span><strong>Rascunhos e revisão</strong><p>Com <code>video.upload</code> concedido, envie vídeos pelo publicador do TidePlace para revisar e finalizar no aplicativo TikTok. Publicação pública direta depende de aprovação.</p></div>
      </div>
      <div className={styles.actions}>
        <Link className={styles.secondary} href="/publicar">Abrir publicador multicanal ↗</Link>
        <a className={styles.secondary} href="https://developers.tiktok.com/portal/apps" target="_blank" rel="noopener noreferrer">Abrir TikTok for Developers ↗</a>
      </div>
      <p>Endereço de retorno cadastrado: <code>https://social-hub-gui.vercel.app/api/tiktok/callback</code></p>
      <p>O aplicativo ainda pode estar em <b>Draft</b>. Uma conexão bem-sucedida não garante liberação para publicações públicas.</p>
    </section>
    <section className={styles.help}><strong>Segurança e organização</strong>
      <p>Credenciais e tokens ficam somente no servidor. A interface exibe apenas o nome público e o status. As automações do Instagram, WhatsApp e a conexão YouTube permanecem independentes.</p>
      <p><Link href="/youtube">Voltar para o YouTube</Link></p>
    </section>
  </main>;
}
