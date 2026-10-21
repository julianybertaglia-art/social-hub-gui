import { authorize } from '../../../vital-connections/service';
import { verifiedGuiInstagram } from '../../../../lib/gui-instagram-meta.mjs';
import { GUI_ACCOUNT, saveDirectMessage, configuredKeywords } from '../store.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function POST(request){
  try{
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) return Response.json({error:'Origem inválida.'},{status:403,headers});
    const {db}=await authorize(request);
    const connection=await verifiedGuiInstagram();
    if(connection.host!=='graph.instagram.com')return Response.json({error:'Histórico indisponível nesta credencial. A recepção de novos Directs por webhook continua independente.'},{status:409,headers});
    async function graph(path,params={}){
      const u=new URL('https://graph.instagram.com/v26.0/'+path);
      Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
      const res=await fetch(u,{headers:{Authorization:'Bearer '+connection.token},cache:'no-store',signal:AbortSignal.timeout(9500)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||data.error)throw new Error('A Meta não disponibilizou o histórico. Confirme a permissão de mensagens do Instagram.');
      return data;
    }
    const threads=await graph(GUI_ACCOUNT+'/conversations',{limit:10});
    const keywords=await configuredKeywords(db);
    let saved=0,reviewed=0,failures=0;
    for(const conversation of (threads.data||[]).slice(0,10)){
      let messages=[];
      try{
        const detail=await graph(encodeURIComponent(String(conversation.id)),{fields:'messages.limit(12){id,created_time,from,to,message}'});
        messages=detail.messages?.data||[];
      }catch{
        try {
          const detail=await graph(encodeURIComponent(String(conversation.id)),{fields:'messages'});
          for(const m of (detail.messages?.data||[]).slice(0,7)){
            try{messages.push(await graph(encodeURIComponent(String(m.id)),{fields:'id,created_time,from,to,message'}));}catch{failures++;}
          }
        }catch{failures++;continue;}
      }
      reviewed++;
      for(const msg of messages.reverse()){
        const from=String(msg.from?.id||''),to=String(msg.to?.data?.[0]?.id||msg.to?.id||'');
        const direction=from===GUI_ACCOUNT?'outbound':'inbound';
        const senderId=from===GUI_ACCOUNT?to:from;
        try{
          if(await saveDirectMessage(db,{accountId:GUI_ACCOUNT,senderId,messageId:msg.id,direction,
            username:direction==='inbound'?msg.from?.username:null,
            body:typeof msg.message==='string'?msg.message:'[Mídia ou mensagem sem texto]',
            type:typeof msg.message==='string'?'text':'attachment',sentAt:msg.created_time,source:'meta-history'}, {keywords})){
              saved++;
          }
        }catch{failures++;}
      }
    }
    return Response.json({ok:true,reviewed,saved,failures,limited:true,
      note:'A Meta restringe o histórico recuperável e não garante todas as pastas ou mensagens antigas.'},{headers});
  }catch(error){
    const status=error?.status||502;
    return Response.json({error:status===502?'A Meta não disponibilizou o histórico para esta autorização.':'Não foi possível sincronizar o Direct.'},{status,headers});
  }
}
