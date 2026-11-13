'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../CloudGate';
import {useWorkspace} from '../WorkspaceSwitcher';
import styles from './publicar.module.css';

const NETWORKS=[
  {id:'instagram',name:'Instagram',format:'Reels',symbol:'◎'},
  {id:'youtube',name:'YouTube',format:'Shorts',symbol:'▶'},
  {id:'tiktok',name:'TikTok',format:'Vídeos',symbol:'♪'},
];
const STATE={
  ready:'Preparado',sending:'Enviando',processing:'Processando na Meta',
  published:'Publicado',private:'Enviado como privado',draft:'Notificação sinalizada pela API',
  pending_approval:'Aguardando aprovação',failed:'Falhou',unknown:'Conferir manualmente',
};
const TIKTOK_PRIVACY_LABELS={PUBLIC_TO_EVERYONE:'Todos',MUTUAL_FOLLOW_FRIENDS:'Amigos',
  FOLLOWER_OF_CREATOR:'Seguidores',SELF_ONLY:'Somente eu'};
const YOUTUBE_PRIVACY_LABELS={public:'Público',unlisted:'Não listado',private:'Privado'};
const sizeLabel=n=>(n/1024/1024).toFixed(1)+' MB';
async function auth(){
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Sua sessão expirou. Entre novamente no TidePlace.');
  return data.session.access_token;
}
async function call(path,options={}){
  const token=await auth();
  const response=await fetch(path,{...options,cache:'no-store',
    headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Não foi possível concluir a operação.');
  return result;
}
function TargetState({target,postId,onVerifyYoutube,verifyingYoutube,youtubeCheck,onVerifyTikTok,verifyingTikTok,tiktokCheck,onRetryTikTok,retryingTikTok,onDiagnoseTikTok,diagnosingTikTok,tiktokDiagnostic,onPrepareNewTikTok,preparingNewTikTok,onSendSavedTikTok,sendingSavedTikTok}){
  const label=NETWORKS.find(n=>n.id===target.platform);
  const platformStatus=target.platform==='tiktok'&&target.state==='processing'?
    (target.mode==='direct'?'Publicando no TikTok':'Processando no TikTok'):STATE[target.state]||target.state;
  return <div className={styles.targetRow}>
    <span className={styles.networkSymbol}>{label?.symbol||'•'}</span>
    <span className={styles.targetBody}><strong>{label?.name||target.platform}</strong>
      <small>{target.platform==='instagram'&&target.state==='processing'?'O TidePlace finalizará o Reel automaticamente quando a Meta terminar o processamento.':
        target.platform==='tiktok'&&target.state==='draft'?'A API do TikTok sinalizou o envio para rascunho. Abra o app para revisar e publicar.':
        target.platform==='tiktok'&&target.state==='processing'&&target.mode==='direct'?'O TidePlace está acompanhando a publicação direta.':
        target.platform==='tiktok'&&target.state==='processing'?'Aguardando confirmação do TikTok.':target.error||platformStatus}</small></span>
    <span className={[styles.tag,
      ['published','private'].includes(target.state)?styles.doneTag:
      ['pending_approval','processing'].includes(target.state)?styles.pendingTag:styles.neutralTag].join(' ')}>
      {platformStatus}</span>
    {target.platform==='youtube'&&target.externalId&&<>
      <a className={styles.link} href={'https://studio.youtube.com/video/'+encodeURIComponent(target.externalId)+'/edit'}
         target="_blank" rel="noreferrer">Abrir no Studio ↗</a>
      <button className={styles.finish} type="button" disabled={!!verifyingYoutube}
         onClick={()=>onVerifyYoutube(postId)}>{verifyingYoutube===postId?'Consultando...':'Verificar no YouTube'}</button>
      {youtubeCheck&&<div className={styles.youtubeVerification} role="status">
        {youtubeCheck.error?youtubeCheck.error:
          youtubeCheck.found?('YouTube confirmou o vídeo · Canal '+(youtubeCheck.channelMatches?'correto':'DIFERENTE')+
            ' · Visibilidade: '+youtubeCheck.privacyStatus+
            ' · Upload: '+youtubeCheck.uploadStatus+
            ' · Processamento: '+youtubeCheck.processingStatus):
          (youtubeCheck.message||youtubeCheck.reason||'Vídeo não encontrado pela API do YouTube.')}
      </div>}
    </>}
    {target.platform==='tiktok'&&target.mode!=='direct'&&['failed','unknown'].includes(target.state)&&!target.externalId&&<>
      <button type="button" className={styles.finish} disabled={!!diagnosingTikTok}
        onClick={()=>onDiagnoseTikTok(postId)}>
        {diagnosingTikTok===postId?'Verificando acesso…':'Diagnosticar TikTok (sem enviar)'}
      </button>
      {tiktokDiagnostic&&<div className={styles.youtubeVerification} role="status">
        {tiktokDiagnostic.error?tiktokDiagnostic.error:
        <>
          <b>Arquivo no TidePlace:</b> {tiktokDiagnostic.storedFile?'Sim':'Não'}
          {' · '}<b>video.upload:</b> {tiktokDiagnostic.scopesGranted?.upload?'Concedido':'Ausente'}
          {' · '}<b>Identidade TikTok:</b> {tiktokDiagnostic.identity?.ok?'Confirmada':tiktokDiagnostic.identity?.code||'Não confirmada'}
          {' · '}<b>API de informações do criador:</b> {tiktokDiagnostic.creatorInfo?.ok?'Disponível':tiktokDiagnostic.creatorInfo?.code||'Indisponível'}
          <div style={{marginTop:5}}>{tiktokDiagnostic.conclusion}</div>
        </>}
      </div>}
      {(target.retryCount||0)<2&&tiktokDiagnostic?.identity?.ok&&tiktokDiagnostic?.creatorInfo?.ok&&
        <button type="button" className={styles.finish} disabled={!!retryingTikTok}
          onClick={()=>onRetryTikTok(postId)}>{retryingTikTok===postId?'Reenviando…':'Tentar novamente com diagnóstico ativo'}</button>}
    </>}
    {target.platform==='tiktok'&&target.state==='ready'&&target.mode==='direct'&&
      <small className={styles.youtubeVerification}>Direct Post preparado, mas ainda sem envio. Reabra a publicação para escolher privacidade, interações e consentimento.</small>}
    {target.platform==='tiktok'&&target.state==='ready'&&target.mode!=='direct'&&
      <button type="button" className={styles.finish} disabled={!!sendingSavedTikTok}
        onClick={()=>onSendSavedTikTok(postId)}>
        {sendingSavedTikTok===postId?'Enviando partes…':'Enviar vídeo salvo em partes'}
      </button>}
    {target.platform==='tiktok'&&target.externalId&&<>
      <button type="button" className={styles.finish} disabled={!!verifyingTikTok}
        onClick={()=>onVerifyTikTok(postId)}>{verifyingTikTok===postId?'Consultando...':'Verificar no TikTok'}</button>
      {tiktokCheck?.status==='PROCESSING_UPLOAD'&&tiktokCheck.uploadedBytes===0&&
        target.state==='unknown'&&
        <button type="button" className={styles.finish} disabled={!!preparingNewTikTok}
          onClick={()=>onPrepareNewTikTok(postId)}>
          {preparingNewTikTok===postId?'Preparando…':'Preparar um novo envio em partes'}
        </button>}
      {tiktokCheck&&<div className={styles.youtubeVerification} role="status">
        {tiktokCheck.error||<>
          <b>Status oficial:</b> {tiktokCheck.status||'Indisponível'}
          {Number.isFinite(tiktokCheck.uploadedBytes)&&
            <span>{' · '}<b>Bytes recebidos:</b> {tiktokCheck.uploadedBytes.toLocaleString('pt-BR')}
              {Number.isFinite(tiktokCheck.totalBytes)?' / '+tiktokCheck.totalBytes.toLocaleString('pt-BR'):''}
            </span>}
          <div style={{marginTop:5}}>{tiktokCheck.message||'Ainda não há confirmação de entrega.'}</div>
        </>}
      </div>}
    </>}
  </div>;
}
export default function UnifiedPublisher(){
  const [workspace]=useWorkspace();
  const [connections,setConnections]=useState(null);
  const [history,setHistory]=useState([]);
  const [selected,setSelected]=useState(['instagram','youtube']);
  const [file,setFile]=useState(null);
  const [metadata,setMetadata]=useState(null);
  const [title,setTitle]=useState('');
  const [caption,setCaption]=useState('');
  const [phase,setPhase]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [tiktokMode,setTikTokMode]=useState('draft');
  const [tiktokInfo,setTikTokInfo]=useState(null);
  const [tiktokInfoLoading,setTikTokInfoLoading]=useState(false);
  const [privacyLevel,setPrivacyLevel]=useState('');
  const [youtubePrivacy,setYoutubePrivacy]=useState('public');
  const [allowComment,setAllowComment]=useState(false);
  const [allowDuet,setAllowDuet]=useState(false);
  const [allowStitch,setAllowStitch]=useState(false);
  const [tiktokConsent,setTikTokConsent]=useState(false);
  const [commercialDisclosure,setCommercialDisclosure]=useState(false);
  const [brandContent,setBrandContent]=useState(false);
  const [brandOrganic,setBrandOrganic]=useState(false);
  const [verifyingYoutube,setVerifyingYoutube]=useState('');
  const [verifyingTikTok,setVerifyingTikTok]=useState('');
  const [retryingTikTok,setRetryingTikTok]=useState('');
  const [preparingNewTikTok,setPreparingNewTikTok]=useState('');
  const [sendingSavedTikTok,setSendingSavedTikTok]=useState('');
  const [diagnosingTikTok,setDiagnosingTikTok]=useState('');
  const [tiktokDiagnostics,setTikTokDiagnostics]=useState({});
  const [tiktokChecks,setTikTokChecks]=useState({});
  const [youtubeChecks,setYoutubeChecks]=useState({});
  const [currentId,setCurrentId]=useState('');
  const tiktokModeInitialized=useRef(false);
  const latestHistoryRef=useRef(history);
  const autoBusyRef=useRef(new Set());
  const tiktokSelected=selected.includes('tiktok');
  const preview=useMemo(()=>file?URL.createObjectURL(file):null,[file]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const refresh=useCallback(async()=>{
    try{
      const data=await call('/api/publicacao');
      setConnections(data.capabilities);setHistory(data.items||[]);
      const tiktok=data.capabilities?.tiktok;
      if(!tiktokModeInitialized.current&&tiktok?.connected){
        setTikTokMode(tiktok.directAvailable?'direct':'draft');
        tiktokModeInitialized.current=true;
      }
    }catch(e){setError(e.message||'Falha ao carregar o publicador.');}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{if(workspace.id==='gui-nonato')void refresh()},[refresh,workspace.id]);
  useEffect(()=>{latestHistoryRef.current=history},[history]);

  useEffect(()=>{
    const directSelected=tiktokSelected&&tiktokMode==='direct'&&connections?.tiktok?.directAvailable;
    if(!directSelected){setTikTokInfo(null);setTikTokInfoLoading(false);setPrivacyLevel('');return;}
    let active=true;
    setTikTokInfo(null);setTikTokInfoLoading(true);setPrivacyLevel('');
    call('/api/publicacao/tiktok-info').then(data=>{if(active)setTikTokInfo(data)}).catch(e=>{
      if(active)setTikTokInfo({error:e.message||'Não foi possível consultar a conta TikTok.'});
    }).finally(()=>{if(active)setTikTokInfoLoading(false)});
    return()=>{active=false};
  },[tiktokSelected,tiktokMode,connections?.tiktok?.directAvailable]);

  useEffect(()=>{
    const timer=setInterval(async()=>{
      const pending=[];
      for(const post of latestHistoryRef.current){
        for(const target of post.targets||[]){
          if(target.state!=='processing')continue;
          if(target.platform==='instagram'||(target.platform==='tiktok'&&target.mode==='direct'))
            pending.push({id:post.id,platform:target.platform});
        }
      }
      for(const item of pending){
        if(autoBusyRef.current.has(item.id))continue;
        autoBusyRef.current.add(item.id);
        try{
          if(item.platform==='instagram'){
            const result=await call('/api/publicacao/finalizar-instagram',{
              method:'POST',body:JSON.stringify({id:item.id})
            });
            if(result.state==='published')setNotice('Reel publicado automaticamente no Instagram.');
            if(result.state==='failed')setError(result.error||'A Meta não concluiu o processamento do Reel.');
          }else{
            const result=await call('/api/publicacao/verificar-tiktok',{
              method:'POST',body:JSON.stringify({id:item.id})
            });
            setTikTokChecks(old=>({...old,[item.id]:result}));
            if(result.state==='published')setNotice('TikTok confirmou a publicação direta.');
            if(result.state==='failed')setError(result.message||'O TikTok não concluiu a publicação.');
          }
          await refresh();
        }catch(e){
          if(item.platform==='tiktok')setTikTokChecks(old=>({...old,[item.id]:{error:e.message||'Falha temporária ao consultar o TikTok.'}}));
        }finally{autoBusyRef.current.delete(item.id)}
      }
    },10000);
    return()=>clearInterval(timer);
  },[refresh]);

  function toggle(platform){
    if(phase)return;
    setSelected(values=>values.includes(platform)?values.filter(x=>x!==platform):[...values,platform]);
    setError('');setNotice('');
  }
  function chooseFile(event){
    setFile(event.target.files?.[0]||null);setMetadata(null);setError('');setNotice('');
  }
  async function submit(event){
    event.preventDefault();setError('');setNotice('');
    try{
      if(!file)throw new Error('Selecione um vídeo MP4.');
      if(file.type!=='video/mp4'||file.size>50_000_000||file.size<=0)
        throw new Error('Este publicador aceita MP4 com até 50 MB.');
      if(!metadata||!Number.isFinite(metadata.duration)||metadata.duration<=0||
          metadata.duration>180||metadata.width>metadata.height)
        throw new Error('Escolha um vídeo vertical ou quadrado com até 3 minutos.');
      if(!selected.length)throw new Error('Selecione ao menos uma rede.');
      if(selected.includes('tiktok')){
        const modeAvailable=tiktokMode==='direct'?connections?.tiktok?.directAvailable:connections?.tiktok?.draftAvailable;
        if(!modeAvailable)throw new Error(tiktokMode==='direct'
          ?'O TikTok precisa da permissão video.publish. Renove a autorização em Conexão TikTok.'
          :'O TikTok precisa da permissão video.upload. Renove a autorização em Conexão TikTok.');
      }
      if(selected.some(platform=>platform!=='tiktok'&&!connections?.[platform]?.connected))
        throw new Error('Uma das redes selecionadas está desconectada. Confira as conexões.');
      if(!title.trim()||title.trim().length>100||caption.length>2200)
        throw new Error('Preencha título de até 100 caracteres e legenda de até 2.200.');
      if(selected.includes('tiktok')&&tiktokMode==='direct'){
        if(tiktokInfoLoading||!tiktokInfo)throw new Error('Aguarde as configurações atuais da conta TikTok.');
        if(tiktokInfo.error)throw new Error(tiktokInfo.error);
        if(!tiktokInfo.canDirectPost)throw new Error(tiktokInfo.note||'A conta TikTok ainda não pode usar Direct Post.');
        if(!privacyLevel)throw new Error('Escolha a privacidade para esta publicação no TikTok.');
        if(!tiktokConsent)throw new Error('Confirme a declaração de uso de música do TikTok.');
        if(tiktokInfo.maxVideoPostDurationSec&&metadata.duration>tiktokInfo.maxVideoPostDurationSec)
          throw new Error('Este vídeo ultrapassa o limite de '+tiktokInfo.maxVideoPostDurationSec+' segundos da conta TikTok.');
        if(commercialDisclosure&&!brandContent&&!brandOrganic)
          throw new Error('Indique se o vídeo promove sua marca, uma terceira marca ou ambas.');
        if(brandContent&&!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(privacyLevel))
          throw new Error('Conteúdo de marca exige visibilidade pública ou para amigos no TikTok.');
        if((tiktokInfo.commentDisabled&&allowComment)||(tiktokInfo.duetDisabled&&allowDuet)||
            (tiktokInfo.stitchDisabled&&allowStitch))
          throw new Error('Uma interação escolhida está desativada nas configurações atuais da conta TikTok.');
        const fresh=await call('/api/publicacao/tiktok-info');
        if(!fresh.canDirectPost)throw new Error(fresh.note||'As configurações do TikTok mudaram. Atualize a conta antes de publicar.');
        if(!fresh.privacyLevelOptions?.includes(privacyLevel))
          throw new Error('A privacidade escolhida não está mais disponível. Selecione uma opção atual do TikTok.');
      }
      const summary=selected.map(x=>NETWORKS.find(n=>n.id===x)?.name).join(', ');
      const tiktokSummary=selected.includes('tiktok')?(tiktokMode==='direct'
        ?'\nTikTok Direct Post: '+(tiktokInfo?.audited?'visibilidade '+TIKTOK_PRIVACY_LABELS[privacyLevel]+'.':'versão sem auditoria: conta privada e visibilidade Somente eu.')
        :'\nTikTok: o vídeo será enviado à caixa de entrada como rascunho para revisão no aplicativo.') :'';
      const youtubeSummary=selected.includes('youtube')?'\nYouTube: '+YOUTUBE_PRIVACY_LABELS[youtubePrivacy]+'.':'';
      if(!window.confirm('Enviar '+file.name+' para: '+summary+'?'+youtubeSummary+
        '\nInstagram: o Reel será finalizado automaticamente depois do processamento.'+tiktokSummary))return;
      setPhase('preparing');
      const job=await call('/api/publicacao/preparar',{method:'POST',body:JSON.stringify({
        title:title.trim(),caption:caption.trim(),platforms:selected,mimeType:file.type,size:file.size,
        tiktokMode
      })});
      setCurrentId(job.id);
      if(!supabase)throw new Error('Supabase indisponível.');
      setPhase('uploading');
      const {error:uploadError}=await supabase.storage.from(job.bucket)
        .uploadToSignedUrl(job.path,job.uploadToken,file,{contentType:file.type,upsert:false});
      if(uploadError)throw new Error('Falha ao enviar vídeo ao armazenamento: '+uploadError.message);
      let problems=[];
      let actualYoutubePrivacy=null;
      for(const platform of selected){
        setPhase(platform);
        try{
          const result=await call('/api/publicacao/enviar',{method:'POST',
            body:JSON.stringify({id:job.id,platform,tiktokMode,youtubePrivacy,privacyLevel,
              allowComment,allowDuet,allowStitch,tiktokConsent,commercialDisclosure,
              brandContent,brandOrganic,videoDurationSec:metadata.duration})});
          if(platform==='youtube'&&result.youtubePrivacyStatus){
            actualYoutubePrivacy=result.youtubePrivacyStatus;
            setYoutubeChecks(old=>({...old,[job.id]:{found:true,channelMatches:true,
              privacyStatus:result.youtubePrivacyStatus,uploadStatus:'enviado',processingStatus:'em processamento'}}));
          }
        }catch(e){problems.push((NETWORKS.find(x=>x.id===platform)?.name||platform)+': '+e.message)}
        await refresh();
      }
      await refresh();
      const youtubePrivacyMismatch=selected.includes('youtube')&&actualYoutubePrivacy&&actualYoutubePrivacy!==youtubePrivacy;
      setNotice(problems.length?'Envio parcialmente concluído. Confira cada rede no histórico.':
        youtubePrivacyMismatch?'O YouTube recebeu o vídeo como '+YOUTUBE_PRIVACY_LABELS[actualYoutubePrivacy]+'. Confira a visibilidade no Studio.':
        'Envio iniciado. O Instagram e o TikTok Direct Post serão acompanhados automaticamente nesta tela.');
      if(problems.length)setError(problems.join(' · '));
      setFile(null);setMetadata(null);
      setPrivacyLevel('');setAllowComment(false);setAllowDuet(false);setAllowStitch(false);
      setTikTokConsent(false);setCommercialDisclosure(false);setBrandContent(false);setBrandOrganic(false);
    }catch(e){setError(e.message||'Não foi possível enviar.');}
    finally{setPhase('')}
  }
  async function prepareNewTikTok(id){
    if(!window.confirm('O TikTok confirmou 0 bytes recebidos na tarefa anterior. Preparar UMA nova tarefa usando o vídeo já salvo no TidePlace? Esta etapa não envia o arquivo.'))return;
    setPreparingNewTikTok(id);setError('');setNotice('');
    try{
      const result=await call('/api/publicacao/reusar-video-tiktok',{
        method:'POST',body:JSON.stringify({id})
      });
      setNotice(result.message+' Localize o novo registro no topo do histórico e confirme o envio.');
      await refresh();
    }catch(e){setError(e.message||'Não foi possível preparar um novo teste.');}
    finally{setPreparingNewTikTok('');}
  }
  async function sendSavedTikTok(id){
    if(!window.confirm('Iniciar agora a transferência em partes do vídeo já salvo para o TikTok do Gui? O destino é a caixa de entrada para rascunhos, NÃO publicação pública.'))return;
    setSendingSavedTikTok(id);setError('');setNotice('');
    try{
      const result=await call('/api/publicacao/enviar',{
        method:'POST',body:JSON.stringify({id,platform:'tiktok'})
      });
      setNotice(result.state==='processing'?
        'TikTok criou a tarefa de envio em partes. Clique em Verificar no TikTok para conferir os bytes recebidos.':
        'Solicitação realizada. Confira o histórico.');
    }catch(e){setError(e.message||'Falha ao transferir o vídeo. Não repita antes de verificar a tarefa.');}
    finally{await refresh();setSendingSavedTikTok('');}
  }
  async function diagnoseTikTok(id){
    setDiagnosingTikTok(id);setError('');setNotice('');
    try{
      const report=await call('/api/publicacao/diagnosticar-tiktok',{
        method:'POST',body:JSON.stringify({id})
      });
      setTikTokDiagnostics(old=>({...old,[id]:report}));
      setNotice('Diagnóstico do TikTok concluído sem criar nem enviar vídeos.');
    }catch(e){
      setTikTokDiagnostics(old=>({...old,[id]:{error:e.message||'Falha no diagnóstico.'}}));
    }finally{setDiagnosingTikTok('');}
  }
  async function retryTikTok(id){
    if(!window.confirm('Repetir o envio deste vídeo armazenado para os rascunhos do TikTok? O TidePlace só permite tentar novamente quando a primeira transferência não recebeu um ID de tarefa.'))return;
    setRetryingTikTok(id);setError('');setNotice('');
    try{
      const result=await call('/api/publicacao/repetir-tiktok',{
        method:'POST',body:JSON.stringify({id})
      });
      setNotice(result.message||'Transferência iniciada. Confira o status no histórico.');
    }catch(e){setError(e.message||'Falha ao repetir envio. Confira o motivo no histórico.');}
    finally{await refresh();setRetryingTikTok('');}
  }
  async function verifyTikTok(id){
    setVerifyingTikTok(id);setError('');setNotice('');
    try{
      const result=await call('/api/publicacao/verificar-tiktok',{method:'POST',body:JSON.stringify({id})});
      setTikTokChecks(old=>({...old,[id]:result}));
      await refresh();
    }catch(e){setTikTokChecks(old=>({...old,[id]:{error:e.message||'Falha ao verificar TikTok.'}}));}
    finally{setVerifyingTikTok('');}
  }
  async function verifyYoutube(id){
    setVerifyingYoutube(id);
    try{
      const result=await call('/api/publicacao/verificar-youtube',{method:'POST',body:JSON.stringify({id})});
      setYoutubeChecks(prev=>({...prev,[id]:result}));
    }catch(e){setYoutubeChecks(prev=>({...prev,[id]:{error:e.message||'Falha ao verificar vídeo no YouTube.'}}));}
    finally{setVerifyingYoutube('');}
  }
  if(workspace.id!=='gui-nonato')return <main className={styles.page}>
    <section className={styles.panel}><h1>Publicação multicanal</h1>
      <p>Este publicador é exclusivo da conta Gui Nonato. Selecione o workspace do Gui no topo.</p></section></main>;
  const usable=selected.length>0&&selected.every(x=>x==='tiktok'
    ?(tiktokMode==='direct'?connections?.tiktok?.directAvailable:connections?.tiktok?.draftAvailable)
    :connections?.[x]?.connected);
  const commercialSettingsValid=!selected.includes('tiktok')||tiktokMode!=='direct'||
    !commercialDisclosure||brandContent||brandOrganic;
  const tiktokDirectReady=!selected.includes('tiktok')||tiktokMode!=='direct'||
    (!tiktokInfoLoading&&!tiktokInfo?.error&&Boolean(tiktokInfo?.canDirectPost)&&
     Boolean(privacyLevel)&&tiktokConsent&&commercialSettingsValid);
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>TIDEPLACE / CENTRAL DE CONTEÚDO</div>
        <h1>Publicação multicanal</h1>
        <p>Um vídeo, três possibilidades. Selecione os canais, prepare o conteúdo e acompanhe cada envio separadamente.</p></div>
      <span className={styles.contextBadge}>GUI NONATO</span>
    </header>
    {error&&<div className={styles.alert} role="alert">{error}</div>}
    {notice&&<div className={styles.notice} role="status">{notice}</div>}
    <div className={styles.grid}>
      <form onSubmit={submit} className={styles.panel}>
        <div className={styles.panelHeading}><span className={styles.step}>01</span><div><h2>Novo vídeo</h2>
          <p>Escolha um arquivo para distribuir às redes selecionadas.</p></div></div>
        <label className={styles.filebox}>
          {preview?<video className={styles.preview} src={preview} controls playsInline preload="metadata"
            onLoadedMetadata={e=>{const v=e.currentTarget;setMetadata({duration:v.duration,width:v.videoWidth,height:v.videoHeight})}}/>:
            <span className={styles.uploadIcon}>↑</span>}
          <strong>{file?file.name:'Clique para selecionar um vídeo'}</strong>
          <small>{file?sizeLabel(file.size):'MP4 · até 50 MB · vertical ou quadrado · até 3 minutos'}</small>
          <input type="file" accept="video/mp4" onChange={chooseFile} disabled={!!phase}/>
        </label>
        {metadata&&<small className={styles.muted}>{Math.round(metadata.duration)} segundos · {metadata.width} × {metadata.height} px</small>}
        <div className={styles.fields}>
          <label>Título <span className={styles.helper}>Título do YouTube e organização interna</span>
            <input type="text" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}
              disabled={!!phase} placeholder="Ex.: 3 estratégias para vender mais no Mercado Livre" required/>
          </label>
          <label>Legenda <span className={styles.helper}>TikTok, Instagram e descrição do YouTube</span>
            <textarea rows={5} maxLength={2200} value={caption} disabled={!!phase}
              onChange={e=>setCaption(e.target.value)} placeholder="Escreva a legenda e as hashtags..."/>
            <small className={styles.count}>{caption.length}/2200</small>
          </label>
        </div>
        <div className={styles.divider}/>
        <div className={styles.panelHeading}><span className={styles.step}>02</span><div><h2>Onde publicar?</h2>
          <p>Marque as redes que receberão este vídeo.</p></div></div>
        <div className={styles.networks}>
          {NETWORKS.map(n=>{
            const data=connections?.[n.id],active=selected.includes(n.id);
            return <label key={n.id} className={[styles.network,active?styles.networkActive:''].join(' ')}>
              <input type="checkbox" checked={active} onChange={()=>toggle(n.id)} disabled={!!phase}/>
              <span className={styles.networkLogo} data-platform={n.id}>{n.symbol}</span>
              <span className={styles.networkText}><strong>{n.name} <small>{n.format}</small></strong>
                <small>{loading?'Verificando conexão...':data?.note||'Verificando...'}</small></span>
              <span className={styles.selection}>{active?'✓':'+'}</span>
            </label>;
          })}
        </div>
        {selected.includes('youtube')&&<section className={styles.settings}>
          <label className={styles.settingField}>Visibilidade no YouTube
            <select value={youtubePrivacy} onChange={e=>setYoutubePrivacy(e.target.value)} disabled={!!phase}>
              {Object.entries(YOUTUBE_PRIVACY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
            <small>A visibilidade solicitada será confirmada pela resposta do YouTube e aparecerá no histórico.</small>
          </label>
        </section>}
        {selected.includes('tiktok')&&<section className={styles.settings}>
          <div className={styles.settingsTitle}>
            <div><h3>Como enviar ao TikTok</h3><p>O rascunho continua disponível como alternativa.</p></div>
            <Link href="/tiktok/conectar">Permissões ↗</Link>
          </div>
          <div className={styles.modeOptions}>
            {connections?.tiktok?.directAvailable&&<label className={styles.modeOption}>
              <input type="radio" name="tiktokMode" checked={tiktokMode==='direct'} disabled={!!phase}
                onChange={()=>{setTikTokMode('direct');setPrivacyLevel('');setTikTokConsent(false);setCommercialDisclosure(false);setBrandContent(false);setBrandOrganic(false)}}/>
              <span><strong>Publicar diretamente</strong><small>Publica pelo TidePlace e acompanha o status.</small></span>
            </label>}
            {connections?.tiktok?.draftAvailable&&<label className={styles.modeOption}>
              <input type="radio" name="tiktokMode" checked={tiktokMode==='draft'} disabled={!!phase}
                onChange={()=>{setTikTokMode('draft');setPrivacyLevel('');setTikTokConsent(false);setCommercialDisclosure(false);setBrandContent(false);setBrandOrganic(false)}}/>
              <span><strong>Enviar como rascunho</strong><small>Abre no aplicativo para revisar e publicar.</small></span>
            </label>}
          </div>
          {tiktokMode==='direct'?<>
            {tiktokInfoLoading&&<p className={styles.settingsNote}>Consultando as opções atuais da conta TikTok…</p>}
            {tiktokInfo?.error&&<p className={styles.settingsAlert}>{tiktokInfo.error} <Link href="/tiktok/conectar">Ver conexão</Link></p>}
            {tiktokInfo&&!tiktokInfo.error&&<>
              <div className={styles.creatorInfo}>
                {tiktokInfo.creatorAvatarUrl&&<img src={tiktokInfo.creatorAvatarUrl} alt=""/>}
                <div><strong>{tiktokInfo.creatorNickname}</strong>
                  {tiktokInfo.creatorUsername&&<small>@{tiktokInfo.creatorUsername}</small>}
                  {tiktokInfo.maxVideoPostDurationSec&&<small>Até {tiktokInfo.maxVideoPostDurationSec} segundos por vídeo</small>}
                </div>
              </div>
              {!tiktokInfo.canDirectPost&&<p className={styles.settingsAlert}>{tiktokInfo.note||'Direct Post indisponível para esta conta.'}</p>}
              {tiktokInfo.canDirectPost&&<>
                {!tiktokInfo.audited&&<p className={styles.settingsNote}>O app ainda não passou pela auditoria do TikTok. Esta etapa permite publicar somente em conta privada, com visibilidade “Somente eu”.</p>}
                <label className={styles.settingField}>Privacidade desta publicação
                  <select required value={privacyLevel} disabled={!!phase||tiktokInfoLoading}
                    onChange={e=>{const next=e.target.value;setPrivacyLevel(next);
                      if(!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(next))setBrandContent(false)}}>
                    <option value="">Selecione uma opção</option>
                    {(tiktokInfo.privacyLevelOptions||[]).map(value=><option key={value} value={value}>{TIKTOK_PRIVACY_LABELS[value]||value}</option>)}
                  </select>
                  <small>As opções vêm da conta conectada. Escolha uma em cada publicação.</small>
                </label>
                <div className={styles.settingGroup}>
                  <strong>Interações permitidas</strong>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={allowComment} disabled={!!phase||tiktokInfo.commentDisabled}
                      onChange={e=>setAllowComment(e.target.checked)}/>
                    <span>Permitir comentários{tiktokInfo.commentDisabled?' · desativado na conta':''}</span>
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={allowDuet} disabled={!!phase||tiktokInfo.duetDisabled}
                      onChange={e=>setAllowDuet(e.target.checked)}/>
                    <span>Permitir Duet{tiktokInfo.duetDisabled?' · desativado na conta':''}</span>
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={allowStitch} disabled={!!phase||tiktokInfo.stitchDisabled}
                      onChange={e=>setAllowStitch(e.target.checked)}/>
                    <span>Permitir Stitch{tiktokInfo.stitchDisabled?' · desativado na conta':''}</span>
                  </label>
                </div>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={commercialDisclosure} disabled={!!phase}
                    onChange={e=>{const checked=e.target.checked;setCommercialDisclosure(checked);
                      if(!checked){setBrandContent(false);setBrandOrganic(false)}}}/>
                  <span><strong>Este conteúdo promove uma marca, produto ou serviço?</strong><small>Desativado por padrão. Selecione a divulgação quando necessário.</small></span>
                </label>
                {commercialDisclosure&&<div className={styles.settingGroup}>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={brandOrganic} disabled={!!phase}
                      onChange={e=>setBrandOrganic(e.target.checked)}/>
                    <span>Sua marca · será identificado como conteúdo promocional</span>
                  </label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={brandContent}
                      disabled={!!phase||!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(privacyLevel)}
                      onChange={e=>setBrandContent(e.target.checked)}/>
                    <span>Conteúdo de marca de terceiros · será identificado como parceria paga</span>
                  </label>
                  {brandContent&&!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(privacyLevel)&&
                    <small className={styles.settingsNote}>Conteúdo de marca de terceiros não pode usar a opção “Somente eu”.</small>}
                  {!brandContent&&!brandOrganic&&<small className={styles.settingsAlert}>Selecione “Sua marca”, “Conteúdo de marca” ou ambos.</small>}
                </div>}
                <label className={styles.checkRow}>
                  <input type="checkbox" required checked={tiktokConsent} disabled={!!phase}
                    onChange={e=>setTikTokConsent(e.target.checked)}/>
                  <span>{brandContent
                    ?'Ao publicar, você concorda com a Política de Conteúdo de Marca e com a confirmação de uso de música do TikTok (“By posting, you agree to TikTok’s Branded Content Policy and Music Usage Confirmation”).'
                    :'Ao publicar, você concorda com a confirmação de uso de música do TikTok (“By posting, you agree to TikTok’s Music Usage Confirmation”).'}</span>
                </label>
                <p className={styles.settingsNote}>O TidePlace mostrará o status. O TikTok pode levar alguns minutos para processar o vídeo.</p>
              </>}
            </>}
          </>:<p className={styles.settingsNote}>O vídeo será enviado à caixa de entrada de rascunhos. Abra o TikTok para revisar e concluir a publicação.</p>}
        </section>}
        <div className={styles.disclosure}>
          <strong>Como funciona o envio agora</strong>
          <p><b>Instagram:</b> o TidePlace concluirá o Reel automaticamente quando a Meta finalizar o processamento. <b>YouTube:</b> escolha público, não listado ou privado. <b>TikTok:</b> use Direct Post para publicar sem abrir o aplicativo ou mantenha o fluxo de rascunho como alternativa. A publicação pública do Direct Post depende da auditoria do TikTok.</p>
          {connections?.tiktok&&!connections.tiktok.enabled&&<p>Para liberar rascunhos ou Direct Post, <Link href="/tiktok/conectar">renove as permissões da conexão</Link>.</p>}
        </div>
        <button type="submit" className={styles.submit} disabled={!!phase||!file||!usable||!tiktokDirectReady||loading}>
          {phase?({preparing:'Preparando publicação...',uploading:'Enviando arquivo...',instagram:'Enviando ao Instagram...',youtube:'Enviando ao YouTube...',tiktok:tiktokMode==='direct'?'Publicando diretamente no TikTok...':'Enviando rascunho ao TikTok...'}[phase]||'Processando...'):
            'Enviar para '+selected.length+' '+(selected.length===1?'rede selecionada':'redes selecionadas')}
        </button>
        <p className={styles.footnote}>Você confirma cada envio. Evite fechar esta aba durante o upload. A publicação não ocorre em redes desautorizadas.</p>
      </form>
      <aside className={styles.side}>
        <section className={styles.panel}>
          <div className={styles.historyTitle}><div><h2>Status das conexões</h2>
            <p>Informações das contas oficiais</p></div>
            <button type="button" onClick={()=>{setLoading(true);void refresh()}} className={styles.refresh}>↻</button></div>
          <div className={styles.connections}>
            {NETWORKS.map(n=><div className={styles.connection} key={n.id}>
              <span className={styles.networkLogo} data-platform={n.id}>{n.symbol}</span>
              <div><strong>{n.name}</strong><small>{connections?.[n.id]?.name||'Aguardando leitura'}</small></div>
              <span className={[styles.dot,connections?.[n.id]?.connected?styles.dotOk:styles.dotOff].join(' ')}/>
            </div>)}
          </div>
          <div className={styles.links}><Link href="/youtube">YouTube ↗</Link>
            <Link href="/tiktok/conectar">TikTok ↗</Link><Link href="/admin/conexoes">Central de conexões ↗</Link></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.historyTitle}><div><h2>Histórico de envios</h2>
            <p>Resultado individual de cada rede</p></div>
            <button type="button" onClick={()=>{setLoading(true);void refresh()}} className={styles.refresh}>↻</button></div>
          {!history.length?<div className={styles.empty}>Nenhum vídeo preparado nesta área ainda. O primeiro envio aparecerá aqui.</div>:
          <div className={styles.history}>{history.map(post=><article className={[styles.historyItem,post.id===currentId?styles.highlight:''].join(' ')} key={post.id}>
            <div className={styles.postTitle}><strong>{post.title}</strong><small>{new Date(post.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div>
            {post.targets.map(t=><TargetState key={t.platform} target={t} postId={post.id}
              onVerifyYoutube={verifyYoutube}
              verifyingYoutube={verifyingYoutube} youtubeCheck={youtubeChecks[post.id]}
              onVerifyTikTok={verifyTikTok} verifyingTikTok={verifyingTikTok} tiktokCheck={tiktokChecks[post.id]}
              onRetryTikTok={retryTikTok} retryingTikTok={retryingTikTok}
              onDiagnoseTikTok={diagnoseTikTok} diagnosingTikTok={diagnosingTikTok}
              tiktokDiagnostic={tiktokDiagnostics[post.id]}
              onPrepareNewTikTok={prepareNewTikTok} preparingNewTikTok={preparingNewTikTok}
              onSendSavedTikTok={sendSavedTikTok} sendingSavedTikTok={sendingSavedTikTok}/>)}
          </article>)}</div>}
        </section>
      </aside>
    </div>
  </main>;
}

