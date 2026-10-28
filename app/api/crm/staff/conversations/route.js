import { getVitalCrmMember } from '../../../../lib/vital-crm-access.mjs';
import { canCrmAccess } from '../../../../lib/crm-authorization.mjs';
import { fail } from '../../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const PHONE = /^\d{8,15}$/;

async function vitalConnection(db, ownerId) {
  const { data, error } = await db.from('workspace_meta_connections')
    .select('id').eq('owner_user_id', ownerId)
    .eq('workspace_id', 'vital-decor').eq('platform', 'whatsapp')
    .eq('state', 'connected').maybeSingle();
  if (error) throw fail('Não foi possível consultar o WhatsApp da Vital.', 503);
  if (!data) throw fail('O WhatsApp da Vital não está conectado.', 409);
  return data;
}

function sanitizedMessage(message) {
  return {
    id: message.id, body: String(message.body || '').slice(0, 3500),
    direction: message.direction, type: message.message_type,
    status: message.status, date: message.sent_at || message.created_at,
  };
}

export async function GET(request) {
  try {
    const { db, organization, access } = await getVitalCrmMember(request);
    if (!['owner','supervisor','agent'].includes(access.role))
      throw fail('Seu perfil não possui acesso às conversas.', 403);
    const connection = await vitalConnection(db, organization.ownerUserId);
    const url = new URL(request.url);
    const contact = String(url.searchParams.get('contact') || '').trim();

    if (contact) {
      if (!PHONE.test(contact)) throw fail('Contato inválido.', 400);
      // Authorize the current assignment BEFORE fetching message bodies.
      // A conversation reassigned to another sector immediately ceases to
      // be readable by the previous sector, even with a copied URL.
      const { data: assignment, error: assignError } = await db.from('vital_whatsapp_assignments')
        .select('contact_wa_id,sector,status,assigned_to,updated_at')
        .eq('owner_user_id', organization.ownerUserId).eq('connection_id', connection.id)
        .eq('contact_wa_id', contact).maybeSingle();
      if (assignError) throw fail('Não foi possível verificar a atribuição.', 503);
      if (!assignment || !canCrmAccess(access,'read_conversation',assignment.sector))
        throw fail('Conversa não encontrada no seu setor.', 404);
      const { data: rows, error } = await db.from('workspace_meta_messages')
        .select('id,contact_wa_id,profile_name,direction,message_type,body,status,sent_at,created_at')
        .eq('owner_user_id', organization.ownerUserId).eq('connection_id', connection.id)
        .eq('contact_wa_id', contact).order('sent_at', { ascending: false }).limit(150);
      if (error) throw fail('Não foi possível consultar as mensagens.', 503);
      return Response.json({
        contact: { phone: contact, name: (rows || []).find(m=>m.profile_name)?.profile_name || contact,
          sector: assignment.sector, status: assignment.status,
          lastAssignedAt: assignment.updated_at },
        messages: (rows || []).reverse().map(sanitizedMessage),
        truncated: (rows || []).length === 150,
        readOnly: true,
      }, { headers });
    }

    const pageRaw = Number(url.searchParams.get('page') || 0);
    const page = Number.isSafeInteger(pageRaw) && pageRaw >= 0 && pageRaw <= 50 ? pageRaw : 0;
    if (access.role !== 'owner' && access.sectors.length === 0)
      return Response.json({ conversations: [], page, hasMore: false, readOnly: true }, { headers });
    let query = db.from('vital_whatsapp_assignments')
      .select('contact_wa_id,sector,status,assigned_to,updated_at')
      .eq('owner_user_id', organization.ownerUserId).eq('connection_id', connection.id);
    if (access.role !== 'owner') query = query.in('sector', access.sectors);
    const { data: assigned, error } = await query.order('updated_at', { ascending: false })
      .range(page * 25, page * 25 + 25);
    if (error) throw fail('Não foi possível consultar os atendimentos.', 503);

    const permitted = (assigned || []).filter(a=>canCrmAccess(access,'read_conversation',a.sector));
    const visible = permitted.slice(0, 25);
    // Never query a list of all Vital contacts and filter client-side.
    // Each preview query is restricted to a single authorized contact.
    const rows = await Promise.all(visible.map(async assignment => {
      const { data: last, error: lastError } = await db.from('workspace_meta_messages')
        .select('profile_name,body,sent_at,direction,message_type')
        .eq('owner_user_id', organization.ownerUserId).eq('connection_id', connection.id)
        .eq('contact_wa_id', assignment.contact_wa_id)
        .order('sent_at', { ascending: false }).limit(1).maybeSingle();
      if (lastError) throw fail('Não foi possível consultar as últimas mensagens.', 503);
      return {
        id: assignment.contact_wa_id, phone: assignment.contact_wa_id,
        name: last?.profile_name || assignment.contact_wa_id,
        sector: assignment.sector, status: assignment.status,
        updatedAt: last?.sent_at || assignment.updated_at,
        preview: String(last?.body || (last?.message_type ? '[' + last.message_type + ']' : 'Sem mensagem')).slice(0, 140),
        direction: last?.direction || null,
      };
    }));
    return Response.json({
      workspace: 'vital-decor', conversations: rows, page,
      hasMore: (assigned || []).length > 25, readOnly: true,
    }, { headers });
  } catch(e) {
    return Response.json({ error: e.status ? e.message : 'Não foi possível carregar os atendimentos.' },
      { status: e.status || 503, headers });
  }
}
