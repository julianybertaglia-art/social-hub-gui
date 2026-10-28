'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
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
  published:'Publicado',private:'Enviado como privado',
  pending_approval:'Aguardando aprovação',failed:'Falhou',unknown:'Conferir manualmente',
};
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
function TargetState({target,postId,onFinish,busy,onVerifyYoutube,verifyingYoutube,youtubeCheck}){
  const label=NETWORKS.find(n=>n.id===target.platform);
  return <div className={styles.targetRow}>
    <span className={styles.networkSymbol}>{label?.symbol||'•'}</span>
    <span className={styles.targetBody}><strong>{label?.name||target.platform}</strong>
      <small>{target.error||STATE[target.state]||target.state}</small></span>
    <span className={[styles.tag,
      ['published','private'].includes(target.state)?styles.doneTag:
      ['pending_approval','processing'].includes(target.state)?styles.pendingTag:styles.neutralTag].join(' ')}>
      {STATE[target.state]||target.state}</span>
    {target.platform==='instagram'&&target.state==='processing'&&
      <button className={styles.finish} type="button" disabled={!!busy}
        onClick={()=>onFinish(postId)}>{busy===postId?'Verificando…':'Concluir Reel'}</button>}
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
  const [finishing,setFinishing]=useState('');
  const [verifyingYoutube,setVerifyingYoutube]=useState('');
  const [youtubeChecks,setYoutubeChecks]=useState({});
  const [currentId,setCurrentId]=useState('');
  const preview=useMemo(()=>file?URL.createObjectURL(file):null,[file]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const refresh=useCallback(async()=>{
    try{
      const data=await call('/api/publicacao');
      setConnections(data.capabilities);setHistory(data.items||[]);
    }catch(e){setError(e.message||'Falha ao carregar o publicador.');}
    finally{setLoading(false)}
  },[]);
  useEffect(()=>{if(workspace.id==='gui-nonato')void refresh()},[refresh,workspace.id]);

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
      if(!selected.some(platform=>platform!=='tiktok'))
        throw new Error('O TikTok ainda está em Sandbox. Escolha também Instagram ou YouTube.');
      if(selected.some(platform=>platform!=='tiktok'&&!connections?.[platform]?.connected))
        throw new Error('Uma das redes selecionadas está desconectada. Confira as conexões.');
      if(!title.trim()||title.trim().length>100||caption.length>2200)
        throw new Error('Preencha título de até 100 caracteres e legenda de até 2.200.');
      const summary=selected.map(x=>NETWORKS.find(n=>n.id===x)?.name).join(', ');
      const warnings=selected.filter(x=>x==='tiktok').length?
       '\nTikTok será marcado como aguardando aprovação, sem publicar.':'';
      if(!window.confirm('Enviar '+file.name+' para: '+summary+'?\n\nO YouTube recebe como PRIVADO; o Instagram poderá publicar um Reel após o processamento.'+warnings))return;
      setPhase('preparing');
      const job=await call('/api/publicacao/preparar',{method:'POST',body:JSON.stringify({
        title:title.trim(),caption:caption.trim(),platforms:selected,mimeType:file.type,size:file.size
      })});
      setCurrentId(job.id);
      if(!supabase)throw new Error('Supabase indisponível.');
      setPhase('uploading');
      const {error:uploadError}=await supabase.storage.from(job.bucket)
        .uploadToSignedUrl(job.path,job.uploadToken,file,{contentType:file.type,upsert:false});
      if(uploadError)throw new Error('Falha ao enviar vídeo ao armazenamento: '+uploadError.message);
      let problems=[];
      for(const platform of selected.filter(x=>x!=='tiktok')){
        setPhase(platform);
        try{
          const result=await call('/api/publicacao/enviar',{method:'POST',
            body:JSON.stringify({id:job.id,platform})});
          if(result.state==='processing'){
            // Container creation is asynchronous on Instagram. It is shown in history,
            // and publishing requires a second confirmation once processing finishes.
          }
        }catch(e){problems.push((NETWORKS.find(x=>x.id===platform)?.name||platform)+': '+e.message)}
        await refresh();
      }
      await refresh();
      setNotice(problems.length?'Envio parcialmente concluído. Confira cada rede no histórico.':
        'Arquivo recebido. Confira o resultado de cada rede no histórico; Reels podem aguardar processamento.');
      if(problems.length)setError(problems.join(' · '));
      setFile(null);setMetadata(null);
    }catch(e){setError(e.message||'Não foi possível enviar.');}
    finally{setPhase('')}
  }
  async function verifyYoutube(id){
    setVerifyingYoutube(id);
    try{
      const result=await call('/api/publicacao/verificar-youtube',{method:'POST',body:JSON.stringify({id})});
      setYoutubeChecks(prev=>({...prev,[id]:result}));
    }catch(e){setYoutubeChecks(prev=>({...prev,[id]:{error:e.message||'Falha ao verificar vídeo no YouTube.'}}));}
    finally{setVerifyingYoutube('');}
  }
  async function finalize(id){
    setFinishing(id);setError('');setNotice('');
    try{
      const result=await call('/api/publicacao/finalizar-instagram',{method:'POST',body:JSON.stringify({id})});
      if(result.state==='processing')setNotice(result.message);
      else if(result.state==='published')setNotice('Reel publicado no Instagram!');
      else setError(result.error||'A Meta não concluiu o processamento.');
      await refresh();
    }catch(e){setError(e.message);await refresh()}
    finally{setFinishing('')}
  }
  if(workspace.id!=='gui-nonato')return <main className={styles.page}>
    <section className={styles.panel}><h1>Publicação multicanal</h1>
      <p>Este publicador é exclusivo da conta Gui Nonato. Selecione o workspace do Gui no topo.</p></section></main>;
  const usable=selected.some(x=>x!=='tiktok')&&selected.every(x=>x==='tiktok'||connections?.[x]?.connected);
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
          <label>Título <span className={styles.helper}>YouTube e organização interna</span>
            <input type="text" maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}
              disabled={!!phase} placeholder="Ex.: 3 estratégias para vender mais no Mercado Livre" required/>
          </label>
          <label>Legenda <span className={styles.helper}>Compartilhada com os canais selecionados</span>
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
        <div className={styles.disclosure}>
          <strong>Como funciona o envio agora</strong>
          <p><b>Instagram:</b> o Reel será enviado à Meta para processamento e poderá ser finalizado pelo histórico. <b>YouTube:</b> o vídeo será enviado como privado. <b>TikTok:</b> ficará marcado como pendente até aprovação da API; não será enviado neste momento.</p>
        </div>
        <button type="submit" className={styles.submit} disabled={!!phase||!file||!usable||loading}>
          {phase?({preparing:'Preparando publicação...',uploading:'Enviando arquivo...',instagram:'Enviando ao Instagram...',youtube:'Enviando ao YouTube...'}[phase]||'Processando...'):
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
              onFinish={finalize} busy={finishing} onVerifyYoutube={verifyYoutube}
              verifyingYoutube={verifyingYoutube} youtubeCheck={youtubeChecks[post.id]}/>)}
          </article>)}</div>}
        </section>
      </aside>
    </div>
  </main>;
}
