'use client';
import {useCallback, useEffect, useState} from 'react';
import {api} from '../operations/useOperations';
import {topicOption, topicsFor} from '../lib/conversation-topics.mjs';
import css from './conversation-topics.module.css';

export function useConversationTopics(workspace,channel='whatsapp') {
  const [assignments,setAssignments]=useState({});
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const reload=useCallback(async()=>{
    try{
      const payload=await api('/api/crm/topics?workspace='+encodeURIComponent(workspace)+'&channel='+encodeURIComponent(channel));
      setAssignments(payload.assignments||{});
      setError('');
    }catch(e){setError(e.message||'Não foi possível carregar as categorias.');}
  },[workspace,channel]);
  useEffect(()=>{setAssignments({});void reload();},[reload]);
  const save=useCallback(async(contactId,topic)=>{
    setSaving(true);setError('');
    try{
      const payload=await api('/api/crm/topics',{method:'PATCH',body:JSON.stringify({workspace,channel,contactId:String(contactId),topic})});
      setAssignments(current=>({...current,[String(contactId)]:payload.topic}));
      return true;
    }catch(e){setError(e.message||'Não foi possível salvar a categoria.');return false;}
    finally{setSaving(false);}
  },[workspace,channel]);
  return {assignments,save,saving,error,reload};
}

export function TopicBadge({workspace,topic}){
  const chosen=topicOption(workspace,topic);
  if(!chosen)return null;
  return <span className={css.badge} style={{'--topic-color':chosen.color}}><i aria-hidden="true"/>{chosen.label}</span>;
}
export function TopicFilter({workspace,value='all',onChange,items=[],counts={},label='Filtrar conversas por assunto'}){
  return <div className={css.filter} role="group" aria-label={label}>
    <button type="button" className={value==='all'?css.active:css.chip} onClick={()=>onChange('all')} aria-pressed={value==='all'}>Todos <span>{counts.all??items.length}</span></button>
    {topicsFor(workspace).map(item=><button type="button" key={item.id}
      className={value===item.id?css.active:css.chip}
      style={{'--topic-color':item.color}}
      onClick={()=>onChange(item.id)} aria-pressed={value===item.id}>
      <i aria-hidden="true"/>{item.label} <span>{counts[item.id]??0}</span>
    </button>)}
  </div>;
}
export function TopicPicker({workspace,value,onChange,disabled=false,label='Assunto da conversa'}){
  return <label className={css.picker}><span>{label}</span>
    <select aria-label={label} value={value||'outros'} disabled={disabled} onChange={e=>onChange(e.target.value)}>
      {topicsFor(workspace).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
  </label>;
}
