import { authorizeAgent, assignedContact, ASSIGNEES, replyError, noCacheJson } from '../../../bridge.mjs';
import { fail } from '../../../../../../vital-connections/helpers.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function POST(request, context) {
  try {
    const ctx=await authorizeAgent(request);
    const {phone}=await context.params;
    await assignedContact(ctx,phone);
    const raw=await request.text();
    if(raw.length>2500)throw fail('Dados inválidos.',400);
    let input;
    try {input=JSON.parse(raw);} catch {throw fail('JSON inválido.',400);}
    const now=new Date().toISOString();
    let patch;
    if(input.action==='status' && ['open','waiting','closed'].includes(input.status)){
      patch={status:input.status,updated_at:now};
    }else if(input.action==='transfer' && ASSIGNEES.includes(input.to) && input.to!==ctx.agent){
      patch={assigned_to:input.to,status:'open',assigned_at:now,updated_at:now};
    }else throw fail('Ação inválida.',400);
    const {data,error}=await ctx.db.from('vital_whatsapp_assignments')
      .update(patch).eq('connection_id',ctx.connection.id)
      .eq('owner_user_id',ctx.ownerId).eq('contact_wa_id',phone)
      .eq('assigned_to',ctx.agent).select('contact_wa_id').maybeSingle();
    if(error||!data)throw fail('Conversa não disponível.',409);
    return noCacheJson({ok:true,contact:phone,...patch});
  }catch(error){return replyError(error);}
}