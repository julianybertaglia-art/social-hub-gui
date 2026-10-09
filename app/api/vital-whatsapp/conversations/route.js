import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';
import { summarizeVitalConversations, presentVitalMessage } from './inbox.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    const { data: connection, error: connectionError } = await db.from('workspace_meta_connections')
      .select('id,display_name,display_phone_number')
      .eq('owner_user_id', ownerId)
      .eq('workspace_id', 'vital-decor').eq('platform', 'whatsapp').eq('state', 'connected')
      .maybeSingle();
    if (connectionError) throw fail('Falha ao verificar o WhatsApp da Vital.', 503);
    if (!connection) throw fail('O WhatsApp da Vital Decor não está conectado.', 409);

    const url = new URL(request.url);
    const requestedContact = url.searchParams.get('contact');
    if (requestedContact && !/^\d{8,15}$/.test(requestedContact)) {
      throw fail('Contato inválido.', 400);
    }
    const { data: recent, error: recentError } = await db.from('workspace_meta_messages')
      .select('id,contact_wa_id,profile_name,direction,message_type,body,status,sent_at,created_at')
      .eq('owner_user_id', ownerId).eq('connection_id', connection.id)
      .order('sent_at', { ascending: false }).limit(1000);
    if (recentError) throw fail('Não foi possível carregar as conversas da Vital.', 503);
    const contacts = summarizeVitalConversations(recent || []);
    let messages = [];
    if (requestedContact) {
      if (!contacts.some(item => item.id === requestedContact)) throw fail('Contato não encontrado na Vital.', 404);
      const { data: thread, error: threadError } = await db.from('workspace_meta_messages')
        .select('id,contact_wa_id,direction,message_type,body,status,sent_at,created_at')
        .eq('owner_user_id', ownerId).eq('connection_id', connection.id)
        .eq('contact_wa_id', requestedContact)
        .order('sent_at', { ascending: false }).limit(200);
      if (threadError) throw fail('Não foi possível carregar as mensagens.', 503);
      messages = (thread || []).reverse().map(presentVitalMessage);
    }
    return Response.json({
      workspace: 'vital-decor',
      account: { name: connection.display_name, number: connection.display_phone_number },
      contacts,
      messages,
      syncLimit: 1000,
      automationsEnabled: false,
    }, { headers });
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'Erro ao carregar a caixa de entrada da Vital.' },
      { status: error.status || 503, headers });
  }
}
