'use client';
import {useEffect,useState} from 'react';
import {api} from './operations/useOperations';
import css from './vital-store-crm.module.css';

const TABS=[
 {id:'customers',label:'Clientes'},
 {id:'orders',label:'Pedidos'},
 {id:'checkouts',label:'Checkouts não concluídos'},
 {id:'products',label:'Produtos'},
];
function date(value){
 const stamp=Date.parse(value||'');
 return Number.isFinite(stamp)?new Date(stamp).toLocaleDateString('pt-BR'):'Data indisponível';
}
function money(value,currency='BRL'){
 if(value===null||value===undefined||value==='')return 'Valor indisponível';
 const num=Number(value);
 if(!Number.isFinite(num))return 'Valor indisponível';
 try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:currency||'BRL'}).format(num);}
 catch{return 'Valor indisponível';}
}
function Row({resource,item}){
 if(resource==='customers')return <article className={css.row}>
  <div><strong>{item.name||'Cliente sem nome'}</strong><p>{item.email||'E-mail não informado'} · {item.phone||'Telefone não informado'}</p></div>
  <span>{item.acceptsMarketing===true?'Aceita e-mail de marketing':item.acceptsMarketing===false?'Não aceita e-mail de marketing':'Preferência de e-mail não informada'}</span>
 </article>;
 if(resource==='orders')return <article className={css.row}>
  <div><strong>Pedido {item.number||'sem número'}</strong><p>{item.customer?.name||'Cliente não informado'} · {date(item.createdAt)}</p></div>
  <div className={css.rowEnd}><strong>{money(item.total,item.currency)}</strong><span>{item.paymentStatus||'Pagamento não informado'}</span></div>
 </article>;
 if(resource==='checkouts')return <article className={css.row}>
  <div><strong>{item.name||'Cliente não identificado'}</strong><p>{item.email||'E-mail não informado'} · {item.phone||'Telefone não informado'}</p></div>
  <div className={css.rowEnd}><strong>{money(item.total)}</strong><span>{date(item.createdAt)}</span></div>
 </article>;
 const variant=item.variants?.[0];
 return <article className={css.row}>
  <div><strong>{item.name||'Produto sem nome'}</strong><p>{item.published===true?'Publicado':item.published===false?'Não publicado':'Publicação não informada'}</p></div>
  <div className={css.rowEnd}><strong>{variant?money(variant.price):'Preço indisponível'}</strong><span>{variant?.stock!==null&&variant?.stock!==undefined?variant.stock+' em estoque':'Estoque não informado'}{item.variants?.length>1?' · Primeira variação':''}</span></div>
 </article>;
}

export default function VitalStoreCRM(){
 const [resource,setResource]=useState('customers'),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;const controller=new AbortController();setLoading(true);setError('');setItems([]);
  api('/api/crm/vital/store?resource='+encodeURIComponent(resource)+'&page='+page+'&perPage=25',{signal:controller.signal})
   .then(result=>{if(active)setItems(Array.isArray(result.items)?result.items:[]);})
   .catch(e=>{if(active)setError(e.message||'Não foi possível consultar a loja.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[resource,page,revision]);
 const select=id=>{setResource(id);setPage(1);};
 return <section className={css.store} aria-label="CRM da loja Vital Decor">
  <div className={css.intro}>
   <div><span className={css.eyebrow}>LOJA VITAL DECOR</span>
    <h2>Relacionamento com clientes</h2>
    <p>Clientes, pedidos e produtos da Nuvemshop em um só lugar.</p></div>
   <button type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)} className={css.refresh}>Atualizar</button>
  </div>
  <div className={css.notice}>Visitas e automações de e-mail e WhatsApp ainda não estão disponíveis aqui.</div>
  <div className={css.panel}>
   <nav className={css.tabs} aria-label="Dados da loja">
    {TABS.map(tab=><button key={tab.id} type="button" disabled={loading} aria-pressed={resource===tab.id}
      className={resource===tab.id?css.active:''} onClick={()=>select(tab.id)}>{tab.label}</button>)}
   </nav>
   {resource==='checkouts'&&<p className={css.hint}>São exibidos checkouts não concluídos disponíveis na Nuvemshop, não todas as visitas ou todos os carrinhos.</p>}
   {loading&&<p role="status" className={css.state}>Consultando a loja…</p>}
   {!loading&&error&&<p role="alert" className={css.error}>{error}</p>}
   {!loading&&!error&&!items.length&&<p className={css.state}>Nenhum resultado nesta página.</p>}
   {!loading&&!error&&items.map((item,index)=><Row key={String(item.id??index)} resource={resource} item={item}/>)}
   <div className={css.pagination}>
    <button type="button" disabled={loading||page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
    <span>Página {page}</span>
    <button type="button" disabled={loading||Boolean(error)||items.length<25} onClick={()=>setPage(p=>p+1)}>Próxima</button>
   </div>
  </div>
 </section>;
}
