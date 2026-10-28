import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const UUID = /^[a-f0-9-]{36}$/i;
const PHONE = /^\d{8,15}$/;

function publicActivity(row) {
  return {
    id: row.id, direction: row.direction, type: row.message_type || 'text',
    body: String(row.body || '').slice(0, 5000),
    status: row.status || null, date: row.sent_at || row.created_at || null,
  };
}

// This API only reads the selected workspace's WhatsApp records. Never join
// Gui contacts to Vital messages, even when phone numbers match.
export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    const url = new URL(request.url);
    const workspace = url.searchParams.get('workspace');
    const contactId = url.searchParams.get('contactId') || '';
    if (!['gui-nonato', 'vital-decor'].includes(workspace)) throw fail('Selecione uma conta válida.', 400);

    if (workspace === 'gui-nonato') {
      if (!UUID.test(contactId)) throw fail('Contato inválido.', 400);
      const { data: contact, error: contactError } = await db.from('whatsapp_contacts')
        .select('id,profile_name,phone,source,stage,tags,notes,created_at,updated_at,last_message_at')
        .eq('id', contactId).maybeSingle();
      if (contactError) throw fail('Não foi possível consultar a ficha.', 503);
      if (!contact) throw fail('Contato não encontrado.', 404);
      const { data: rows, error } = await db.from('whatsapp_messages')
        .select('id,direction,message_type,body,status,sent_at,created_at')
        .eq('contact_id', contact.id).order('sent_at', { ascending: false }).limit(250);
      if (error) throw fail('Não foi possível carregar as atividades.', 503);
      return Response.json({
        workspace, contact, activities: (rows || []).map(publicActivity),
        notes: contact.notes ? [{ id: 'legacy-note', body: contact.notes, date: contact.updated_at || null }] : [],
        companies: [], deals: [], truncated: (rows || []).length === 250,
      }, { headers });
    }

    if (!PHONE.test(contactId)) throw fail('Contato inválido.', 400);
    const { data: connection, error: connectionError } = await db.from('workspace_meta_connections')
      .select('id').eq('owner_user_id', ownerId).eq('workspace_id', workspace)
      .eq('platform', 'whatsapp').eq('state', 'connected').maybeSingle();
    if (connectionError || !connection) throw fail('A conexão WhatsApp da Vital não está disponível.', 409);

    const [messages, assignment] = await Promise.all([
      db.from('workspace_meta_messages')
        .select('id,profile_name,direction,message_type,body,status,sent_at,created_at')
        .eq('owner_user_id', ownerId).eq('connection_id', connection.id)
        .eq('contact_wa_id', contactId).order('sent_at', { ascending: false }).limit(250),
      db.from('vital_whatsapp_assignments')
        .select('sector,assigned_to,status,updated_at')
        .eq('owner_user_id', ownerId).eq('connection_id', connection.id)
        .eq('contact_wa_id', contactId).maybeSingle(),
    ]);
    if (messages.error || assignment.error) throw fail('Não foi possível consultar a ficha da Vital.', 503);
    const rows = messages.data || [];
    if (!rows.length) throw fail('Contato não encontrado na Vital Decor.', 404);
    const contact = {
      id: contactId, phone: contactId,
      profile_name: rows.find(row => row.profile_name)?.profile_name || contactId,
      sector: assignment.data?.sector || 'Sem setor',
      assigned_to: assignment.data?.assigned_to || null,
      status: assignment.data?.status || null,
      last_message_at: rows[0].sent_at || rows[0].created_at || null,
      created_at: rows[rows.length - 1].created_at || null,
    };
    return Response.json({
      workspace, contact, activities: rows.map(publicActivity),
      notes: [], companies: [], deals: [], truncated: rows.length === 250,
    }, { headers });
  } catch (e) {
    return Response.json({ error: e.status ? e.message : 'Não foi possível carregar o contato.' },
      { status: e.status || 503, headers });
  }
}
