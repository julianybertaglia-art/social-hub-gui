import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
const UUID = /^[a-f0-9-]{36}$/i;
const PHONE = /^\d{8,15}$/;


// Public, clearly labeled fictional example for inspecting the CRM layout.
// Never reads live contacts or the database and never allows mutations.
function exampleRecord(workspace) {
  const gui = workspace === 'gui-nonato';
  const contact = {
    id: 'crm-demo-contact', phone: '11 90000-0000', profile_name: 'Contato de exemplo',
    last_message_at: '2026-10-28T12:45:00-03:00',
    created_at: '2026-10-20T10:30:00-03:00',
    source: 'WhatsApp', stage: 'Interessado',
    sector: 'comercial_vital', assigned_to: 'Equipe comercial',
    tags: ['Exemplo', gui ? 'Mentoria' : 'Jardim vertical'],
    notes: gui ? 'Exemplo: interessado em conhecer as condições da mentoria.' : '',
  };
  const activities = [
    {id:'example-a',direction:'inbound',type:'text',body:gui ? 'Olá! Gostaria de saber como funciona a mentoria.' : 'Oi, gostaria de um jardim vertical para minha parede.',date:'2026-10-28T12:45:00-03:00',status:'received'},
    {id:'example-b',direction:'outbound',type:'text',body:gui ? 'Claro! Você já vende em marketplaces ou está começando?' : 'Temos opções de jardins artificiais. Qual é a medida da parede?',date:'2026-10-28T12:42:00-03:00',status:'sent'},
    {id:'example-c',direction:'inbound',type:'text',body:gui ? 'Já vendo no Mercado Livre, mas quero melhorar os resultados.' : 'Ela mede 2 metros de altura por 3 metros de largura.',date:'2026-10-28T12:39:00-03:00',status:'received'},
  ];
  return {
    workspace, example:true, contact, activities,
    notes:[{id:'example-note',body:gui ? 'Exemplo: lead qualificado pelo WhatsApp, aguardando direcionamento comercial.' : 'Exemplo: cliente procura jardim vertical e precisa de orientação sobre a quantidade.',date:'2026-10-28T11:00:00-03:00'}],
    companies:[],deals:[],truncated:false,
  };
}

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
    const url = new URL(request.url);
    const workspace = url.searchParams.get('workspace');
    const contactId = url.searchParams.get('contactId') || '';
    if (!['gui-nonato', 'vital-decor'].includes(workspace)) throw fail('Selecione uma conta válida.', 400);
    if (url.searchParams.get('demo') === '1' && contactId === 'crm-demo-contact') {
      return Response.json(exampleRecord(workspace), { headers });
    }
    const { db, ownerId } = await authorize(request);

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
