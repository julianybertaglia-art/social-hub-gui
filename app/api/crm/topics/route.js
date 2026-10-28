import {authorize} from '../../vital-connections/service';
import {fail} from '../../vital-connections/helpers.mjs';
import {validTopic} from '../../../lib/conversation-topics.mjs';
import {GUI_ACCOUNT} from '../../instagram/direct/store.mjs';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHONE=/^\d{8,15}$/;
function validateScope(workspace,channel){
  if(!['gui-nonato','vital-decor'].includes(workspace)
    || !['whatsapp','instagram'].includes(channel)
    || (workspace==='vital-decor'&&channel!=='whatsapp'))throw fail('Conta ou canal inválido.',400);
}
async function assertExisting(db,ownerId,workspace,channel,key){
  if(workspace==='gui-nonato'&&channel==='whatsapp'){
    if(!UUID.test(key))throw fail('Contato inválido.',400);
    const {data,error}=await db.from('whatsapp_contacts').select('id').eq('id',key).maybeSingle();
    if(error)throw fail('Falha ao conferir o contato.',503);
    if(!data)throw fail('Contato não encontrado.',404);
    return;
  }
  if(workspace==='gui-nonato'&&channel==='instagram'){
    if(!UUID.test(key))throw fail('Direct inválido.',400);
    const {data,error}=await db.from('instagram_direct_threads').select('id').eq('id',key).eq('account_id',GUI_ACCOUNT).maybeSingle();
    if(error)throw fail('Falha ao conferir o Direct.',503);
    if(!data)throw fail('Direct não encontrado.',404);
    return;
  }
  if(!PHONE.test(key))throw fail('Contato inválido.',400);
  const {data:connection,error:connectionError}=await db.from('workspace_meta_connections')
    .select('id').eq('owner_user_id',ownerId).eq('workspace_id','vital-decor')
    .eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(connectionError||!connection)throw fail('WhatsApp da Vital não conectado.',409);
  const {data,error}=await db.from('workspace_meta_messages')
    .select('id').eq('owner_user_id',ownerId).eq('connection_id',connection.id)
    .eq('contact_wa_id',key).limit(1).maybeSingle();
  if(error)throw fail('Falha ao conferir a conversa.',503);
  if(!data)throw fail('Conversa não encontrada na Vital.',404);
}
export async function GET(request){
  try{
    const {db,ownerId}=await authorize(request);
    const url=new URL(request.url);
    const workspace=url.searchParams.get('workspace');
    const channel=url.searchParams.get('channel');
    validateScope(workspace,channel);
    const {data,error}=await db.from('crm_conversation_topics')
      .select('contact_key,topic').eq('owner_user_id',ownerId)
      .eq('workspace_id',workspace).eq('channel',channel).limit(10000);
    if(error)throw fail('Não foi possível carregar as classificações.',503);
    return Response.json({workspace,channel,assignments:Object.fromEntries((data||[]).map(r=>[r.contact_key,r.topic]))},{headers});
  }catch(e){return Response.json({error:e.status?e.message:'Falha ao consultar assuntos.'},{status:e.status||503,headers});}
}
export async function PATCH(request){
  try{
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
    const {db,ownerId}=await authorize(request);
    const body=await request.json().catch(()=>({}));
    const {workspace,channel,topic}=body;
    const contactId=String(body.contactId||'').trim();
    validateScope(workspace,channel);
    if(!validTopic(workspace,topic))throw fail('Assunto inválido para esta conta.',400);
    await assertExisting(db,ownerId,workspace,channel,contactId);
    const {data,error}=await db.from('crm_conversation_topics')
      .upsert({owner_user_id:ownerId,workspace_id:workspace,channel,contact_key:contactId,topic,updated_at:new Date().toISOString()},
        {onConflict:'owner_user_id,workspace_id,channel,contact_key'})
      .select('contact_key,topic').single();
    if(error||!data)throw fail('Não foi possível salvar o assunto.',503);
    return Response.json({ok:true,topic:data.topic,contactId:data.contact_key,workspace,channel},{headers});
  }catch(e){return Response.json({error:e.status?e.message:'Falha ao salvar o assunto.'},{status:e.status||503,headers});}
}
