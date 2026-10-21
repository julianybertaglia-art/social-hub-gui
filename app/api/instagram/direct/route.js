import { authorize } from '../../vital-connections/service';
import { verifiedGuiInstagram } from '../../../lib/gui-instagram-meta.mjs';
import { GUI_ACCOUNT, saveDirectMessage } from './store.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const FOLDERS=['spontaneous','automation','personal'];
const CATEGORIES=['unclassified','beginners','sellers','partnership'];
function failure(error) {
  const status=error?.status||503;
  return Response.json({error:status===503?'Não foi possível consultar o Direct agora.':error.message},{status,headers});
}
function validateOrigin(req) {
  const origin=req.headers.get('origin');
  if(origin && origin!==new URL(req.url).origin)throw Object.assign(new Error('Origem inválida.'),{status:403});
}
async function getThread(db,id) {
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Object.assign(new Error('Conversa inválida.'),{status:400});
  const {data,error}=await db.from('instagram_direct_threads').select('*')
    .eq('account_id',GUI_ACCOUNT).eq('id',id).maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error('Conversa não localizada.'),{status:404});
  return data;
}
export async function GET(request){
  try{
    const {db}=await authorize(request);
    const params=new URL(request.url).searchParams;
    const id=params.get('thread');
    if(id){
      const thread=await getThread(db,id);
      const {data,error}=await db.from('instagram_direct_messages').select('id,meta_message_id,direction,body,message_type,source,sent_at')
        .eq('account_id',GUI_ACCOUNT).eq('sender_id',thread.sender_id)
        .order('sent_at',{ascending:false}).limit(150);
      if(error)throw error;
      return Response.json({thread,messages:(data||[]).reverse()},{headers});
    }
    const {data,error}=await db.from('instagram_direct_threads')
      .select('id,account_id,sender_id,username,display_name,folder,category,folder_manual,category_manual,automation_keyword,automation_paused,last_inbound_at,last_message_at,last_excerpt,needs_reply')
      .eq('account_id',GUI_ACCOUNT).order('last_message_at',{ascending:false,nullsFirst:false}).limit(350);
    if(error)throw error;
    return Response.json({threads:data||[],hasMore:(data||[]).length===350,updatedAt:new Date().toISOString()},{headers});
  }catch(error){return failure(error);}
}
export async function PATCH(request){
  try{
    validateOrigin(request);
    const {db}=await authorize(request),body=await request.json();
    const thread=await getThread(db,String(body.id||''));
    const patch={updated_at:new Date().toISOString()};
    if(Object.hasOwn(body,'folder')){
      if(!FOLDERS.includes(body.folder))throw Object.assign(new Error('Pasta inválida.'),{status:400});
      patch.folder=body.folder;patch.folder_manual=true;
    }
    if(Object.hasOwn(body,'category')){
      if(!CATEGORIES.includes(body.category))throw Object.assign(new Error('Classificação inválida.'),{status:400});
      patch.category=body.category;patch.category_manual=true;
    }
    if(Object.hasOwn(body,'automationPaused')){
      if(typeof body.automationPaused!=='boolean')throw Object.assign(new Error('Valor inválido.'),{status:400});
      patch.automation_paused=body.automationPaused;
    }
    if(Object.hasOwn(body,'needsReply')){
      if(typeof body.needsReply!=='boolean')throw Object.assign(new Error('Valor inválido.'),{status:400});
      patch.needs_reply=body.needsReply;
    }
    if(Object.keys(patch).length===1)throw Object.assign(new Error('Nenhuma alteração informada.'),{status:400});
    const {data,error}=await db.from('instagram_direct_threads').update(patch)
      .eq('id',thread.id).eq('account_id',GUI_ACCOUNT).select('*').single();
    if(error)throw error;
    return Response.json({ok:true,thread:data},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request){
  try{
    validateOrigin(request);
    const {db}=await authorize(request),body=await request.json();
    const thread=await getThread(db,String(body.id||''));
    const text=String(body.text||'').trim();
    if(!text||text.length>1000)throw Object.assign(new Error('A resposta precisa ter entre 1 e 1.000 caracteres.'),{status:400});
    const last=Date.parse(thread.last_inbound_at||'');
    if(!Number.isFinite(last)||Date.now()-last > 24*60*60*1000 || last>Date.now()+60000) {
      throw Object.assign(new Error('A janela de atendimento de 24 horas terminou. Aguarde uma nova mensagem do contato.'),{status:409});
    }
    const connection=await verifiedGuiInstagram();
    if(connection.host!=='graph.instagram.com')throw Object.assign(new Error('A credencial atual não permite confirmar o envio pelo Instagram Login. Revise as permissões de mensagens da Meta.'),{status:409});
    const res=await fetch('https://graph.instagram.com/v26.0/'+GUI_ACCOUNT+'/messages',{
      method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},
      body:JSON.stringify({recipient:{id:thread.sender_id},message:{text}}),
      signal:AbortSignal.timeout(16000),cache:'no-store'
    });
    const result=await res.json().catch(()=>({}));
    if(!res.ok||!result?.message_id)throw Object.assign(new Error('A Meta não confirmou o envio. Confira a janela de mensagens e as permissões.'),{status:502});
    await saveDirectMessage(db,{accountId:GUI_ACCOUNT,senderId:thread.sender_id,messageId:String(result.message_id),direction:'outbound',body:text,type:'text',sentAt:new Date().toISOString(),source:'manual'},{enrich:false});
    return Response.json({ok:true,messageId:result.message_id},{headers});
  }catch(error){return failure(error);}
}
