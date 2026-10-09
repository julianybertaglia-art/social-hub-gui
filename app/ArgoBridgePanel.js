'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from './CloudGate';

const GROUPS=[
 ['comercial_vital','Compras · Vital Decor'],
 ['bluetti','Geradores BLUETTI'],
 ['vtx','VTX Fitness'],
 ['pos_venda','Pedidos / pós-venda'],
 ['atacado','Revendedores / atacado'],
 ['afiliados','Afiliados TikTok Shop'],
];
const PEOPLE=[['tide','Você · TidePlace'],['andrey','Andrey · Argo'],['vitor','Vitor · Argo']];
const panel={padding:20,border:'1px solid var(--border)',borderRadius:15,background:'var(--surface)'};
const btn={background:'var(--gold-dark)',border:0,color:'white',borderRadius:9,padding:'10px 14px',fontWeight:750,cursor:'pointer'};
const field={padding:10,border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text)'};
const muted={fontSize:12,color:'var(--muted)',lineHeight:1.5};

export default function ArgoBridgePanel(){
 const [settings,setSettings]=useState([]);
 const [assignments,setAssignments]=useState([]);
 const [keys,setKeys]=useState([]);
 const [newKey,setNewKey]=useState(null);
 const [manualPhone,setManualPhone]=useState('');
 const [manualSector,setManualSector]=useState('pos_venda');
 const [manualAgent,setManualAgent]=useState('tide');
 const [working,setWorking]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const request=useCallback(async(route,body)=>{
  if(!supabase)throw new Error('Sessão indisponível.');
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Entre novamente no TidePlace.');
  const response=await fetch(route,{method:body?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+data.session.access_token,
     ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error||'Falha na integração.');
  return payload;
 },[]);
 const refresh=useCallback(async()=>{
  try{
   const [routing,credentials]=await Promise.all([
    request('/api/vital-whatsapp/argo-routing'),request('/api/vital-whatsapp/argo-keys')
   ]);
   setSettings(routing.defaults||[]);setAssignments(routing.assignments||[]);
   setKeys(credentials.keys||[]);setError('');
  }catch(e){setError(e.message)}
 },[request]);
 useEffect(()=>{void refresh()},[refresh]);
 async function run(route,payload,msg){
  setWorking(true);setMessage('');setError('');
  try{await request(route,payload);setMessage(msg);await refresh()}
  catch(e){setError(e.message)}finally{setWorking(false)}
 }
 async function issue(agent){
  setWorking(true);setNewKey(null);setError('');setMessage('');
  try{const data=await request('/api/vital-whatsapp/argo-keys',{action:'issue',agent});
    setNewKey(data);setMessage('Chave criada. Copie agora: ela não poderá ser consultada novamente.');
    await refresh();
  }catch(e){setError(e.message)}
  finally{setWorking(false)}
 }
 async function revoke(id){
  if(!window.confirm('Revogar esta chave agora? O acesso correspondente no Argo deixará de funcionar.'))return;
  await run('/api/vital-whatsapp/argo-keys',{action:'revoke',keyId:id},'Acesso revogado.');
 }
 return <main style={{maxWidth:1220,margin:'auto',padding:'30px 24px 60px',color:'var(--text)'}}>
  <p style={{fontSize:10,letterSpacing:2,fontWeight:850,color:'var(--gold-dark)'}}>VITAL DECOR · INTEGRAÇÕES</p>
  <h1 style={{fontSize:32,margin:'8px 0'}}>Integração com Argo</h1>
  <p style={{...muted,maxWidth:820}}>A Vivi e o WhatsApp continuam no TidePlace. Você atende aqui; Andrey e Vitor respondem pelo Argo, com acessos separados. A distribuição planejada não encaminha conversas enquanto o Argo não for ativado.</p>
  {error&&<p role="alert" style={{padding:12,color:'#9c2e38',background:'#fff0f2'}}>{error}</p>}
  {message&&<p role="status" style={{padding:12,color:'#247a4f',background:'#edfbef'}}>{message}</p>}
  <section style={{...panel,marginTop:20}}>
   <h2 style={{fontSize:18,margin:'0 0 8px'}}>1. Defina quem recebe cada assunto</h2>
   <p style={muted}>Os responsáveis são planejados. Novas conversas continuam no TidePlace até o encaminhamento para o Argo ser ativado após os testes.</p>
   <div style={{display:'grid',gap:10,marginTop:16}}>
    {GROUPS.map(([id,name])=>{
     const rule=settings.find(i=>i.sector===id); const current=rule?.assignee||'tide'; const active=Boolean(rule?.enabled); const ready=keys.some(k=>k.agent===current&&!k.revoked_at&&Date.parse(k.expires_at)>Date.now());
     return <div key={id} style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) minmax(180px,230px)',gap:14,alignItems:'center'}}>
      <strong style={{fontSize:13}}>{name}</strong>
      <select aria-label={'Responsável: '+name} style={field} disabled={working} value={current}
        onChange={e=>run('/api/vital-whatsapp/argo-routing',{action:'default',sector:id,assignee:e.target.value},'Setor atualizado.')}>
       {PEOPLE.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
     </div>;
    })}
   </div>
  </section>
  <section style={{...panel,marginTop:16}}>
   <h2 style={{fontSize:18,margin:'0 0 8px'}}>2. Gere as credenciais para o Andrey</h2>
   <p style={muted}>Cada credencial tem validade de 90 dias, pode ser revogada e só acessa conversas atribuídas ao atendente. Guarde a chave apenas no servidor do Argo; nunca no navegador ou em mensagens públicas.</p>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'16px 0'}}>
    <button style={btn} type="button" disabled={working} onClick={()=>issue('andrey')}>Gerar chave do Andrey</button>
    <button style={btn} type="button" disabled={working} onClick={()=>issue('vitor')}>Gerar chave do Vitor</button>
   </div>
   {newKey&&<div style={{padding:16,borderRadius:10,background:'var(--surface-secondary)',border:'1px solid var(--border)'}}>
    <strong>Nova chave de {newKey.agent} — aparece uma única vez</strong>
    <p style={{...muted}}>Copie e transfira por um canal seguro diretamente ao responsável técnico. O TidePlace guarda apenas o hash.</p>
    <textarea aria-label="Chave de integração criada" readOnly rows={2} value={newKey.token}
      style={{...field,width:'100%',fontFamily:'monospace',fontSize:12}}/>
    <button style={{...btn,marginTop:8}} type="button" onClick={()=>navigator.clipboard.writeText(newKey.token)}>Copiar chave</button>
    <button style={{...btn,marginLeft:8,background:'transparent',color:'var(--text)',border:'1px solid var(--border)'}} type="button" onClick={()=>setNewKey(null)}>Já guardei, ocultar</button>
   </div>}
   <div style={{marginTop:14,display:'grid',gap:8}}>
    {keys.map(k=><div key={k.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,borderTop:'1px solid var(--border)',paddingTop:10}}>
      <span style={{fontSize:12}}><strong>{k.agent}</strong> · {k.prefix}… · {k.revoked_at?'Revogada':new Date(k.expires_at)<new Date()?'Expirada':'Ativa'}</span>
      {!k.revoked_at&&<button type="button" disabled={working} style={{...btn,background:'transparent',color:'var(--text)',border:'1px solid var(--border)'}} onClick={()=>revoke(k.id)}>Revogar</button>}
    </div>)}
   </div>
  </section>
  <section style={{...panel,marginTop:16}}>
   <h2 style={{fontSize:18,margin:'0 0 8px'}}>3. Transferir uma conversa existente</h2>
   <p style={muted}>Você também pode enviar manualmente uma conversa já iniciada para um dos atendentes do Argo.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
    <input aria-label="WhatsApp do cliente com DDI" style={field} placeholder="5511999999999" value={manualPhone} onChange={e=>setManualPhone(e.target.value.replace(/\D/g,''))}/>
    <select aria-label="Setor para transferência" style={field} value={manualSector} onChange={e=>setManualSector(e.target.value)}>
      {GROUPS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select>
    <select aria-label="Responsável para transferência" style={field} value={manualAgent} onChange={e=>setManualAgent(e.target.value)}>
     {PEOPLE.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <button type="button" disabled={working||manualPhone.length<8} style={btn} onClick={()=>run('/api/vital-whatsapp/argo-routing',{
     action:'assign',phone:manualPhone,sector:manualSector,assignee:manualAgent
    },'Conversa transferida.')}>Transferir</button>
   </div>
   <div style={{marginTop:20,maxHeight:270,overflow:'auto'}}>
    {assignments.map(a=><div key={a.contact_wa_id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,borderTop:'1px solid var(--border)',padding:'10px 0',fontSize:12}}>
     <span><strong>{a.contact_wa_id}</strong> · {GROUPS.find(s=>s[0]===a.sector)?.[1]||a.sector} · {a.assigned_to==='tide'?'TidePlace':a.assigned_to}</span>
     <button style={{...btn,background:'transparent',color:'var(--text)',border:'1px solid var(--border)',padding:'6px 10px'}} type="button" onClick={()=>{
       setManualPhone(a.contact_wa_id);setManualSector(a.sector);setManualAgent(a.assigned_to);
     }}>Editar</button>
    </div>)}
   </div>
  </section>
  <p style={{...muted,marginTop:20}}>Base da API: /api/integrations/argo/v1 · O Argo deve consultar a fila a cada 10 segundos e enviar mensagens somente pelo servidor. Meta, Instagram e credenciais de outros workspaces não são expostos.</p>
 </main>
}
