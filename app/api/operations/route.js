import { authorize } from '../vital-connections/service';
import { fail } from '../vital-connections/helpers.mjs';
import { periodRange, aggregateMessages, crmMetrics, STAGES, readRows } from '../../lib/operations.mjs';
import { summarizeVitalConversations } from '../vital-whatsapp/conversations/inbox.mjs';
export const dynamic='force-dynamic';
// Page below PostgREST's default row cap; never silently count only its first page.
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){try{
 const {db,ownerId}=await authorize(request),url=new URL(request.url),workspace=url.searchParams.get('workspace');
 if(!['gui-nonato','vital-decor'].includes(workspace))throw fail('Selecione uma marca válida.',400);
 const range=periodRange(url.searchParams.get('days'));let contacts=[],messages=[],assignments=[],truncated=false;
 if(workspace==='gui-nonato'){
  const [c,m]=await Promise.all([readRows(()=>db.from('whatsapp_contacts').select('id,profile_name,phone,stage,tags,notes,created_at,updated_at,last_message_at').order('last_message_at',{ascending:false,nullsFirst:false}).order('id'),5000),readRows(()=>db.from('whatsapp_messages').select('id,contact_id,direction,message_type,status,sent_at').gte('sent_at',range.previousStart).lt('sent_at',range.end).order('sent_at',{ascending:false}).order('id'),10000)]);
  if(c.error||m.error)throw fail('Não foi possível consultar os registros do CRM.',503);
  contacts=c.data||[];messages=m.data||[];truncated=contacts.length>=5000||messages.length>=10000;
 }else{
  const {data:connection,error}=await db.from('workspace_meta_connections').select('id').eq('owner_user_id',ownerId).eq('workspace_id',workspace).eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(error||!connection)throw fail('Conecte o WhatsApp da Vital para consultar sua operação.',409);
  const [m,a]=await Promise.all([readRows(()=>db.from('workspace_meta_messages').select('id,contact_wa_id,profile_name,direction,message_type,body,status,sent_at,created_at').eq('owner_user_id',ownerId).eq('connection_id',connection.id).order('sent_at',{ascending:false}).order('id'),10000),readRows(()=>db.from('vital_whatsapp_assignments').select('contact_wa_id,sector,assigned_to,status,updated_at').eq('owner_user_id',ownerId).eq('connection_id',connection.id).order('contact_wa_id'),5000)]);
  if(m.error||a.error)throw fail('Não foi possível consultar os atendimentos da Vital.',503);
  messages=m.data||[];assignments=a.data||[];truncated=messages.length>=10000||assignments.length>=5000;
  contacts=summarizeVitalConversations(messages).map(c=>({...c,profile_name:c.name,phone:c.phone,last_message_at:c.lastMessageAt,...assignments.find(a=>a.contact_wa_id===c.id)}));
 }
 return Response.json({workspace,range,contacts,assignments,truncated,crm:workspace==='gui-nonato'?crmMetrics(contacts,range):null,messaging:aggregateMessages(messages,range),activity:messages.slice(0,8).map(m=>({id:m.id,contactId:m.contact_id||m.contact_wa_id,direction:m.direction,type:m.message_type,status:m.status,date:m.sent_at})),updatedAt:new Date().toISOString()}, {headers});
 }catch(e){
 const configError = typeof e?.message === 'string' && e.message.includes('Supabase do servidor não configurado');
 const code = configError ? 'SUPABASE_PREVIEW_CONFIG' : e?.status ? 'OPERATIONS_DATA_ERROR' : 'OPERATIONS_RUNTIME_ERROR';
 console.error('[tideplace-operations]', code, e?.name || 'Error', String(e?.message || '').slice(0,250));
 return Response.json({error:configError
   ? 'A prévia do CRM está sem a conexão de servidor com o banco de dados. Confira as variáveis do Supabase no ambiente Preview da Vercel.'
   : e?.status ? e.message : 'O CRM não conseguiu carregar os dados nesta versão. Verifique as configurações de Preview e o registro de erros da Vercel.',
   code}, {status:e?.status||503,headers});
}}
export async function PATCH(request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
 const {db}=await authorize(request),body=await request.json();
 if(body.workspace!=='gui-nonato'||!STAGES.includes(body.stage)||!/^[-a-f0-9]{36}$/i.test(body.id||''))throw fail('Etapa ou contato inválido.',400);
 let query=db.from('whatsapp_contacts').update({stage:body.stage,updated_at:new Date().toISOString()}).eq('id',body.id);
 if(body.updatedAt)query=query.eq('updated_at',body.updatedAt);
 const {data,error}=await query.select('id,stage,updated_at').maybeSingle();
 if(error)throw fail('Não foi possível salvar a etapa.',503);if(!data)throw fail('O contato foi atualizado por outra pessoa. Atualize o painel.',409);
 return Response.json({contact:data},{headers});
 }catch(e){return Response.json({error:e.status?e.message:'Falha ao salvar a etapa.'},{status:e.status||503,headers});}}
