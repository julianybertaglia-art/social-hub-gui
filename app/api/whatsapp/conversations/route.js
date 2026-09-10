import { getSupabaseAdmin } from '../lib';

export const dynamic = 'force-dynamic';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function enrichContact(contact, recentMessages = []) {
  const latest = recentMessages[0] || null;
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const corpus = normalizeText([
    ...tags,
    contact.notes,
    ...recentMessages.slice(0, 12).map((message) => message.body),
  ].filter(Boolean).join(' '));

  const categories = [];
  if (includesAny(corpus, ['imersao', '26/09', 'ingresso'])) categories.push('Imersão');
  if (includesAny(corpus, ['mentoria', 'mentor'])) categories.push('Mentoria');
  if (includesAny(corpus, ['argo', 'argoplace'])) categories.push('ARGO');
  if (includesAny(corpus, ['treinamento', 'curso', 'renda livre', 'destravando'])) categories.push('Treinamento');
  if (includesAny(corpus, ['importacao', 'importar', 'alibaba', 'fornecedor'])) categories.push('Importação');

  const stage = normalizeText(contact.stage);
  const actionable = !includesAny(stage, ['venda', 'perdido']);
  const lastDirection = latest?.direction || null;
  const latestMs = Date.parse(latest?.sent_at || contact.last_message_at || '');
  const hoursSinceLast = Number.isFinite(latestMs)
    ? Math.max(0, (Date.now() - latestMs) / 36e5)
    : null;

  const isReactivation = includesAny(corpus, ['reativar', 'sem resposta']);
  const needsReply = actionable && lastDirection === 'inbound';
  const needsFollowUp = actionable && !needsReply && (
    isReactivation
    || (lastDirection === 'outbound' && (hoursSinceLast === null || hoursSinceLast >= 12))
  );

  let priority = 'normal';
  if (includesAny(corpus, ['quente', 'prioridade alta'])) priority = 'high';
  else if (includesAny(corpus, ['morno', 'prioridade media'])) priority = 'medium';
  else if (includesAny(corpus, ['frio'])) priority = 'low';

  return {
    ...contact,
    smart_categories: categories,
    last_message_direction: lastDirection,
    last_message_body: latest?.body || null,
    last_message_sent_at: latest?.sent_at || contact.last_message_at || null,
    needs_reply: needsReply,
    needs_follow_up: needsFollowUp,
    smart_priority: priority,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const contactId = url.searchParams.get('contact');
  const supabase = getSupabaseAdmin();

  const { data: contacts, error: contactsError } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(250);

  if (contactsError) {
    return Response.json({ ok: false, error: contactsError.message }, { status: 500 });
  }

  const rawContacts = contacts || [];
  const messageMap = new Map();
  const contactIds = rawContacts.map((contact) => contact.id).filter(Boolean);

  if (contactIds.length) {
    const { data: activity, error: activityError } = await supabase
      .from('whatsapp_messages')
      .select('contact_id,direction,body,sent_at,message_type')
      .in('contact_id', contactIds)
      .order('sent_at', { ascending: false })
      .limit(5000);

    if (activityError) {
      return Response.json({ ok: false, error: activityError.message }, { status: 500 });
    }

    for (const message of activity || []) {
      const bucket = messageMap.get(message.contact_id) || [];
      if (bucket.length < 20) bucket.push(message);
      messageMap.set(message.contact_id, bucket);
    }
  }

  const enrichedContacts = rawContacts.map((contact) =>
    enrichContact(contact, messageMap.get(contact.id) || [])
  );

  let messages = [];
  if (contactId) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('sent_at', { ascending: true })
      .limit(500);

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    messages = data || [];
  }

  return Response.json({ ok: true, contacts: enrichedContacts, messages });
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '').trim();
  if (!id) return Response.json({ ok: false, error: 'Contato não informado.' }, { status: 400 });

  const patch = { updated_at: new Date().toISOString() };
  if (typeof body.stage === 'string') patch.stage = body.stage.slice(0, 80);
  if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 5000);
  if (Array.isArray(body.tags)) patch.tags = body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, contact: data });
}
