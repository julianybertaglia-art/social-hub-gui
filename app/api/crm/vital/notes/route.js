import {getVitalCrmMember} from '../../../../lib/vital-crm-access.mjs';
import {resolveAuthorizedVitalContact,VITAL_PHONE} from '../../../../lib/vital-crm-context.mjs';
import {fail} from '../../../vital-connections/helpers.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};

async function context(request,phone){
  const auth=await getVitalCrmMember(request);
  if(!['owner','agent','supervisor'].includes(auth.access.role))
    throw fail('Seu perfil não possui acesso às notas do CRM.',403);
  const {data:connection,error}=await auth.db.from('workspace_meta_connections')
    .select('id').eq('owner_user_id',auth.organization.ownerUserId)
    .eq('workspace_id','vital-decor').eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if(error||!connection)throw fail('WhatsApp Vital indisponível.',503);
  const current=await resolveAuthorizedVitalContact({...auth,connection,phone});
  return {...auth,connection,current};
}

export async function GET(request){
  try{
    const phone=new URL(request.url).searchParams.get('contact')||'';
    const {db,organization,connection,current}=await context(request,phone);
    const {data,error}=await db.from('crm_vital_conversation_notes')
      .select('id,body,created_by,created_at')
      .eq('organization_id',organization.id).eq('connection_id',connection.id)
      .eq('contact_wa_id',phone).order('created_at',{ascending:false}).limit(100);
    if(error)throw fail('Não foi possível carregar as observações.',503);
    const authors=[...new Set((data||[]).map(note=>note.created_by))];
    const members=authors.length?await db.from('crm_organization_members')
      .select('user_id,display_name').eq('organization_id',organization.id).in('user_id',authors):{data:[],error:null};
    if(members.error)throw fail('Não foi possível identificar quem registrou as observações.',503);
    const names=new Map((members.data||[]).map(member=>[member.user_id,member.display_name||'Equipe Vital']));
    return Response.json({notes:(data||[]).reverse().map(note=>({
      id:note.id,body:note.body,createdAt:note.created_at,author:names.get(note.created_by)||'Equipe Vital',
    })),queue:current.queue},{headers});
  }catch(error){return Response.json({error:error.status?error.message:'Não foi possível consultar as observações.'},
    {status:error.status||503,headers});}
}

export async function POST(request){
  try{
    const origin=request.headers.get('origin');
    if(!origin||origin!==new URL(request.url).origin)throw fail('Origem inválida.',403);
    if(process.env.VITAL_CRM_WRITES_ENABLED!=='true')throw fail('O registro de notas está desativado nesta instalação.',403);
    const raw=await request.text();
    if(raw.length>6000)throw fail('A observação excede o tamanho permitido.',413);
    const input=JSON.parse(raw);
    const phone=String(input.contact||''),body=String(input.body||'').trim();
    if(!VITAL_PHONE.test(phone)||!body||body.length>2000)throw fail('Informe uma observação de até 2.000 caracteres.',400);
    const auth=await getVitalCrmMember(request);
    if(!['owner','agent'].includes(auth.access.role))throw fail('Seu perfil pode consultar, mas não registrar notas.',403);
    const {db,organization,userId}=auth;
    const {data:connection,error}=await db.from('workspace_meta_connections')
      .select('id').eq('owner_user_id',organization.ownerUserId)
      .eq('workspace_id','vital-decor').eq('platform','whatsapp').eq('state','connected').maybeSingle();
    if(error||!connection)throw fail('WhatsApp Vital indisponível.',503);
    const current=await resolveAuthorizedVitalContact({...auth,connection,phone});
    const {data:note,error:insertError}=await db.from('crm_vital_conversation_notes').insert({
      organization_id:organization.id,connection_id:connection.id,owner_user_id:organization.ownerUserId,
      contact_wa_id:phone,body,created_by:userId,
    }).select('id,body,created_at').single();
    if(insertError)throw fail('Não foi possível registrar a observação.',503);
    return Response.json({note:{...note,author:auth.member.displayName||'Equipe Vital'},queue:current.queue},
      {status:201,headers});
  }catch(error){return Response.json({error:error.status?error.message:'Não foi possível salvar a observação.'},
    {status:error.status||503,headers});}
}
