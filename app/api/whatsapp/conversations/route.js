import { getSupabaseAdmin } from '../lib';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const contactId = url.searchParams.get('contact');
  const supabase = getSupabaseAdmin();

  const { data: contacts, error: contactsError } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(150);

  if (contactsError) {
    return Response.json({ ok: false, error: contactsError.message }, { status: 500 });
  }

  let messages = [];
  if (contactId) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('sent_at', { ascending: true })
      .limit(300);

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    messages = data || [];
  }

  return Response.json({ ok: true, contacts: contacts || [], messages });
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
