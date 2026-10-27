'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabase} from '../../CloudGate';
import {useWorkspace} from '../../WorkspaceSwitcher';
import styles from './shorts.module.css';

const STORAGE_BUCKET='tide-youtube-videos';
const MAX=50000000;
const ALLOWED=['video/mp4','video/webm','video/quicktime'];
const STATE_LABELS={awaiting_file:'Arquivo pendente',uploading_to_youtube:'Enviando ao YouTube',
  uploaded_private:'Enviado como privado',failed:'Atenção necessária'};
const fmt=(n)=>n? (n/1024/1024).toFixed(1)+' MB':'';
async function sessionToken(){
  if(!supabase) throw new Error('O TidePlace está sem conexão com o banco.');
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Entre novamente no TidePlace.');
  return data.session.access_token;
}
async function jsonFetch(path,options={}){
  const token=await sessionToken();
  const response=await fetch(path,{
    ...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})},
    cache:'no-store',
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Não foi possível concluir a solicitação.');
  return result;
}
export default function PublishShortsPage(){
  const [workspace]=useWorkspace();
  const [connection,setConnection]=useState(null);
  const [history,setHistory]=useState([]);
  const [loadError,setLoadError]=useState('');
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [file,setFile]=useState(null);
  const [info,setInfo]=useState(null);
  const [phase,setPhase]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(null);
  const preview=useMemo(()=>file?URL.createObjectURL(file):'', [file]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);

  const refresh=useCallback(async()=>{
    if(workspace.id!=='gui-nonato')return;
    try{
      setLoadError('');
      const [a,b]=await Promise.all([
        jsonFetch('/api/youtube/status'),
        jsonFetch('/api/youtube/uploads'),
      ]);
      setConnection(a);setHistory(b.items||[]);
    }catch(cause){setLoadError(cause.message||'Falha ao consultar conexão.');}
  },[workspace.id]);

  useEffect(()=>{void refresh();},[refresh]);

  function selected(event){
    setFile(event.target.files?.[0]||null);
    setInfo(null);setError('');setSuccess(null);
  }

  async function publish(event){
    event.preventDefault(); setError('');setSuccess(null);
    try{
      if(!connection?.connected)throw new Error('Conecte o canal Gui Nonato antes de enviar.');
      if(!file)throw new Error('Selecione um vídeo.');
      if(!ALLOWED.includes(file.type)||file.size>MAX||!file.size)throw new Error('Use MP4, WebM ou MOV com até 50 MB.');
      if(!info||!Number.isFinite(info.duration)||info.duration>180||info.duration<=0||info.width>info.height)
        throw new Error('Este teste aceita vídeos quadrados ou verticais com até 3 minutos.');
      if(title.trim().length<1||title.trim().length>100)throw new Error('Título precisa ter de 1 a 100 caracteres.');
      if(description.length>5000)throw new Error('A descrição pode ter até 5.000 caracteres.');
      if(!supabase)throw new Error('Armazenamento não configurado.');
      setPhase('preparing');
      const staged=await jsonFetch('/api/youtube/uploads/start',{
        method:'POST',body:JSON.stringify({title:title.trim(),description:description.trim(),mimeType:file.type,size:file.size}),
      });
      setPhase('uploading');
      const {error:storageError}=await supabase.storage.from(STORAGE_BUCKET).uploadToSignedUrl(
        staged.path,staged.uploadToken,file,{contentType:file.type});
      if(storageError) throw new Error('Falha ao enviar arquivo ao armazenamento temporário: '+storageError.message);
      setPhase('youtube');
      const output=await jsonFetch('/api/youtube/uploads/complete',{
        method:'POST',body:JSON.stringify({id:staged.id}),
      });
      setSuccess(output.video);setFile(null);setInfo(null);
      setTitle('');setDescription('');
      void refresh();
    }catch(cause){setError(cause.message||'O envio não foi concluído.');void refresh();}
    finally{setPhase('');}
  }
  if(workspace.id!=='gui-nonato')
    return <main className={styles.page}><section className={styles.panel}><h1>Publicar Shorts</h1><p>Esta área é exclusiva da conta Gui Nonato. Selecione o workspace do Gui no topo do TidePlace.</p></section></main>;

  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>GUI NONATO / PUBLICAÇÃO MULTICANAL</span>
        <h1>Publicar YouTube Shorts</h1>
        <p>Primeiro passo da publicação multicanal. Envie um vídeo vertical diretamente pelo TidePlace.</p></div>
      <Link href="/youtube" className={styles.back}>Gerenciar conexão ↗</Link>
    </header>
    <div className={styles.notice}><strong>Modo de teste privado</strong>
      <p>Este recurso envia vídeos apenas como <b>privados</b>. Não publica para os seguidores nem agenda postagens. Projetos novos podem precisar passar pela auditoria da API do Google para liberar vídeos públicos.</p>
    </div>
    {loadError&&<p role="alert" className={styles.error}>{loadError}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {success&&<div role="status" className={styles.success}>
      <strong>Vídeo recebido pelo YouTube!</strong>
      <p>O envio foi registrado como privado. Confirme o processamento no YouTube Studio antes de fazer qualquer alteração de visibilidade.</p>
      {success.videoId&&<a href={'https://studio.youtube.com/video/'+encodeURIComponent(success.videoId)+'/edit'} target="_blank" rel="noopener noreferrer">Ver no YouTube Studio ↗</a>}
    </div>}
    <div className={styles.layout}>
      <section className={styles.panel}>
        <div className={styles.sectionHeading}><div><h2>Novo vídeo</h2>
          <p>Canal: <strong>{connection?.connected?connection.title:'Não conectado'}</strong></p></div>
          <span className={styles.privateBadge}>🔒 Privado</span>
        </div>
        <form onSubmit={publish} className={styles.form}>
          <label className={styles.uploadArea}>
            {preview?<video className={styles.preview} src={preview} playsInline controls preload="metadata"
              onLoadedMetadata={(e)=>{const v=e.currentTarget;setInfo({duration:v.duration,width:v.videoWidth,height:v.videoHeight});}}/>:
              <span className={styles.uploadGlyph}>↑</span>}
            <strong>{file?file.name:'Selecionar vídeo'}</strong>
            <span>{file?fmt(file.size):'MP4, WebM ou MOV · até 50 MB · vertical/quadrado · até 3 minutos'}</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={selected} disabled={!!phase}/>
          </label>
          {info&&<small className={styles.videoInfo}>{Math.round(info.duration)} segundos · {info.width} × {info.height} pixels</small>}
          <label className={styles.field}>Título do vídeo
            <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder="Ex.: 3 erros que travam suas vendas no Mercado Livre" required disabled={!!phase}/>
            <span className={styles.counter}>{title.length}/100</span>
          </label>
          <label className={styles.field}>Descrição
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={5} maxLength={5000} placeholder="Legenda, CTA e links para o YouTube..." disabled={!!phase}/>
          </label>
          <button className={styles.publish} disabled={!!phase||!connection?.connected||!file} type="submit">
            {phase==='preparing'?'Preparando arquivo…':phase==='uploading'?'Enviando arquivo…':
              phase==='youtube'?'Enviando ao YouTube…':'Enviar como vídeo privado'}
          </button>
          <small className={styles.footnote}>Mantenha a aba aberta até terminar o envio. Este teste não posta no Instagram ou TikTok.</small>
        </form>
      </section>
      <aside className={styles.panel}>
        <div className={styles.sectionHeading}><div><h2>Envios recentes</h2><p>Histórico da sua conta</p></div>
          <button type="button" className={styles.refresh} onClick={refresh}>Atualizar</button></div>
        {!history.length?<p className={styles.empty}>Ainda não há vídeos enviados por esta ferramenta.</p>:
          <div className={styles.history}>{history.map(v=><div key={v.id} className={styles.historyItem}>
            <strong>{v.title}</strong><small>{new Date(v.createdAt).toLocaleDateString('pt-BR')} · {STATE_LABELS[v.state]||v.state}</small>
            {v.videoId&&<a href={'https://studio.youtube.com/video/'+encodeURIComponent(v.videoId)+'/edit'} target="_blank" rel="noopener noreferrer">Abrir vídeo ↗</a>}
            {v.error&&<small className={styles.historyError}>{v.error}</small>}
          </div>)}</div>}
        <hr className={styles.divider}/>
        <h3>Próximas integrações</h3>
        <p className={styles.smallPrint}>Estamos preparando o uso do mesmo arquivo para Instagram Reels e TikTok e as automações separadas por rede.</p>
      </aside>
    </div>
  </main>;
}
