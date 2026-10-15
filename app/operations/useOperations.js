'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../CloudGate';
export async function api(path,options={}){
 const {data}=await supabase?.auth.getSession()||{};const token=data?.session?.access_token;
 if(!token)throw new Error('Entre no TidePlace para consultar os dados.');
 const response=await fetch(path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},cache:'no-store'});
 const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Não foi possível concluir a solicitação.');return payload;
}
export function useResource(path,revision=0){const[state,setState]=useState({path,data:null,error:null,loading:true});useEffect(()=>{let active=true;const controller=new AbortController();setState({path,data:null,error:null,loading:true});api(path,{signal:controller.signal}).then(data=>{if(active)setState({path,data,error:null,loading:false});}).catch(e=>{if(active)setState({path,data:null,error:e.message,loading:false});});return()=>{active=false;controller.abort();};},[path,revision]);return state.path===path?state:{data:null,error:null,loading:true};}
