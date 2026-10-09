'use client';
import { useEffect, useState } from 'react';
import { supabase } from './CloudGate';
const text = {fontSize:12,color:'var(--muted)'};
export default function VitalAffiliatePanel() {
  const [list,setList]=useState([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  useEffect(()=>{
    let active=true;
    async function load() {
      try{
        const {data}=await supabase.auth.getSession();
        if(!data?.session?.access_token) throw new Error('Faça login novamente.');
        const response=await fetch('/api/vital-whatsapp/afiliados',{
          headers:{Authorization:'Bearer '+data.session.access_token},cache:'no-store'
        });
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.error||'Erro ao consultar afiliados.');
        if(active) {setList(payload.applications||[]);setSelected(payload.applications?.[0]?.id||null);}
      }catch(e){if(active)setError(e.message);}
      finally{if(active)setLoading(false);}
    }
    void load();
    return()=>{active=false;};
  },[]);
  const current=list.find(v=>v.id===selected);
  return <main style={{margin:'0 auto',maxWidth:1220,padding:'32px 30px',color:'var(--text)'}}>
    <p style={{fontSize:10,letterSpacing:2,fontWeight:800,color:'var(--gold-dark)'}}>TIDEPLACE · VITAL DECOR</p>
    <h1 style={{fontSize:33,margin:'8px 0'}}>Afiliados TikTok Shop</h1>
    <p style={text}>Inscrições recebidas pela Vivi. Separadas das conversas e dos candidatos do Gui Nonato.</p>
    {error&&<p role="alert" style={{color:'#af333b'}}>{error}</p>}
    {loading&&<p style={text}>Carregando inscrições...</p>}
    <div style={{display:'grid',gridTemplateColumns:'minmax(245px,1fr) minmax(0,2fr)',gap:14,marginTop:22}}>
      <section style={{border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',background:'var(--surface)'}}>
        <div style={{padding:16,borderBottom:'1px solid var(--border)'}}><strong>Candidatos ({list.length})</strong></div>
        {!list.length&&!loading&&<p style={{...text,padding:16}}>Nenhuma inscrição recebida ainda.</p>}
        {list.map(v=><button key={v.id} type="button" onClick={()=>setSelected(v.id)}
          style={{display:'block',width:'100%',padding:16,textAlign:'left',cursor:'pointer',
            background:v.id===selected?'var(--gold-soft)':'transparent',
            color:'var(--text)',border:0,borderBottom:'1px solid var(--border)'}}>
          <strong style={{display:'block',fontSize:13}}>{v.creator_name||v.contact_wa_id}</strong>
          <small style={text}>{v.status==='submitted'?(v.qualification||'Em análise'):'Formulário pendente'}</small>
          {v.score!=null&&<b style={{display:'block',marginTop:5,color:'var(--gold-dark)'}}>Pontuação: {v.score}/100</b>}
        </button>)}
      </section>
      <section style={{padding:22,border:'1px solid var(--border)',borderRadius:14,background:'var(--surface)'}}>
        {!current?<p style={text}>Selecione um candidato para ver os detalhes.</p>:<>
          <p style={{fontSize:10,color:'var(--gold-dark)',letterSpacing:1.5}}>CADASTRO TIKTOK VITAL</p>
          <h2 style={{fontSize:24,margin:'8px 0'}}>{current.creator_name||'Inscrição iniciada'}</h2>
          <p style={text}>WhatsApp: {current.contact_wa_id}</p>
          <p style={text}>Status: {current.status==='submitted'?'Recebida para análise':'Aguardando formulário'}</p>
          {current.status==='submitted'&&<>
            <p style={text}>Cidade: {current.city_state||'—'} · Nicho: {current.niche||'—'}</p>
            <p style={text}>Seguidores: {current.followers??'—'} · Média de views: {current.average_views??'—'}</p>
            <p style={text}>Frequência: {current.posts_per_week??'—'} vídeos/semana · Público brasileiro: {current.brazil_audience_percent??'—'}%</p>
            <p style={text}>Vendas TikTok Shop: {current.sales_last_30d_range||'—'} · Pedidos: {current.sales_orders_last_30d??'—'}</p>
            <p style={text}>Classificação: <strong>{current.qualification}</strong> · Pontuação: <strong>{current.score}/100</strong></p>
            <p style={text}>{current.email}</p>
            {current.tiktok_url&&<p><a href={current.tiktok_url} target="_blank" rel="noreferrer">Abrir TikTok ↗</a></p>}
            {current.instagram_url&&<p><a href={current.instagram_url} target="_blank" rel="noreferrer">Abrir Instagram ↗</a></p>}
            {(current.top_video_urls||[]).map((url,i)=><p key={i}><a href={url} target="_blank" rel="noreferrer">Vídeo {i+1} ↗</a></p>)}
          </>}
        </>}
      </section>
    </div>
  </main>;
}
