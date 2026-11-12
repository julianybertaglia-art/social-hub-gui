// Timeouts and server errors are ambiguous; preserve the handoff until a person checks.
export function metaRejectionIsDefinitive(status,payload) {
  return status>=400&&status<500&&Boolean(payload?.error)&&!payload?.messages?.[0]?.id;
}

// Compare-and-set keeps an in-flight human reply from overwriting a newer Vivi state.
export async function reserveViviHandoff(db, {connectionId, ownerId, contact, previous, marker}) {
 try {
  const table = db.from('vital_whatsapp_flow_sessions');
  const changes = {stage:'await_human', human_handoff:true, manual_override:true,
    updated_at:marker, last_interaction_at:marker};
  let query;
  if (previous) {
    query = table.update(changes).eq('connection_id',connectionId).eq('owner_user_id',ownerId)
      .eq('contact_wa_id',contact).eq('updated_at',previous.updated_at);
  } else {
    query = table.insert({connection_id:connectionId,owner_user_id:ownerId,contact_wa_id:contact,...changes});
  }
  const {data,error} = await query.select('contact_wa_id');
  if (error) return {ok:false,reason:error.code==='23505'?'changed':'storage'};
  return {ok:Array.isArray(data)&&data.length===1,reason:'changed'};
 } catch { return {ok:false,reason:'storage'}; }
}

// Restore only when no other process has updated this session after our change.
export async function restoreViviHandoff(db, {connectionId, ownerId, contact, previous, marker}) {
 try {
  const table = db.from('vital_whatsapp_flow_sessions');
  const query = previous ? table.update({
    stage:previous.stage,selection:previous.selection,human_handoff:previous.human_handoff,
    manual_override:previous.manual_override,last_interaction_at:previous.last_interaction_at,
    updated_at:new Date().toISOString(),
  }) : table.delete();
  const {data,error} = await query.eq('connection_id',connectionId).eq('owner_user_id',ownerId)
    .eq('contact_wa_id',contact).eq('updated_at',marker).select('contact_wa_id');
  return !error&&Array.isArray(data)&&data.length===1;
 } catch { return false; }
}
