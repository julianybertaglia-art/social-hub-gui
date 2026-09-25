import { getMetaCredentials, getSupabaseAdmin, normalizeWaId, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEMPLATE_NAME = 'imersao_ultimas_2_vagas_v1';
const TARGET_TAG = 'Campanha 2 vagas · 25/09';
const SENT_TAG = '2 vagas enviado · 25/09';
const TEMPLATE_TEXT = `Oi! Passando rapidinho porque acabaram de liberar 2 vagas para a Imersão Ecommerce de amanhã 👀

Lembrei de você porque tinha falado com a gente sobre o evento.

Se ainda tiver interesse em participar, responde QUERO por aqui. As vagas serão liberadas por ordem de confirmação. 😊`;

async function graphJson(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
    error.code = payload?.error?.code || response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function templateStatus() {
  const meta = await getMetaCredentials();
  if (!meta?.accessToken || !meta?.wabaId) throw new Error('Credenciais Meta indisponíveis.');
  const payload = await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.wabaId)}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}&fields=id,name,status,category,language,components&limit=10`,
    { headers: { Authorization: `Bearer ${meta.accessToken}` } }
  );
  return payload?.data?.[0] || null;
}

async function createTemplate() {
  const existing = await templateStatus().catch(() => null);
  if (existing) return { ok: true, existing: true, template: existing };

  const meta = await getMetaCredentials();
  if (!meta?.accessToken || !meta?.wabaId) throw new Error('Credenciais Meta indisponíveis.');

  const payload = await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.wabaId)}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: TEMPLATE_NAME,
        language: 'pt_BR',
        category: 'MARKETING',
        components: [
          { type: 'BODY', text: TEMPLATE_TEXT },
          {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Tenho interesse' }]
          }
        ],
      }),
    }
  );
  return { ok: true, created: true, meta: payload };
}

async function sendCampaign() {
  const tpl = await templateStatus();
  if (!tpl || tpl.status !== 'APPROVED') {
    return { ok: false, waitingApproval: true, template: tpl };
  }

  const meta = await getMetaCredentials();
  if (!meta?.accessToken || !meta?.phoneNumberId) throw new Error('Credenciais Meta indisponíveis.');
  const supabase = getSupabaseAdmin();

  const { data: contacts, error } = await supabase
    .from('whatsapp_contacts')
    .select('id,profile_name,phone,wa_id,stage,tags')
    .contains('tags', [TARGET_TAG])
    .order('profile_name', { ascending: true });
  if (error) throw error;

  const results = [];
  for (const contact of contacts || []) {
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    const phone = normalizeWaId(contact.phone || contact.wa_id);

    if (!phone) {
      results.push({ id: contact.id, name: contact.profile_name, status: 'skipped', reason: 'Número inválido' });
      continue;
    }
    if (['Venda', 'Perdido'].includes(contact.stage) || tags.includes(SENT_TAG)) {
      results.push({ id: contact.id, name: contact.profile_name, status: 'skipped', reason: 'Já enviado ou não elegível' });
      continue;
    }

    const { data: participant } = await supabase
      .from('event_participants')
      .select('id')
      .eq('active', true)
      .or(`phone.eq.${phone},phone.eq.${phone.replace(/^55/, '')}`)
      .limit(1)
      .maybeSingle();

    if (participant) {
      results.push({ id: contact.id, name: contact.profile_name, status: 'skipped', reason: 'Já é participante' });
      continue;
    }

    try {
      const payload = await graphJson(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${meta.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'template',
            template: {
              name: TEMPLATE_NAME,
              language: { code: 'pt_BR' },
            },
          }),
        }
      );

      const messageId = payload?.messages?.[0]?.id || null;
      const now = new Date().toISOString();

      await supabase.from('whatsapp_messages').insert({
        meta_message_id: messageId,
        contact_id: contact.id,
        direction: 'outbound',
        message_type: 'template',
        body: TEMPLATE_TEXT,
        status: 'sent',
        raw_payload: payload,
        sent_at: now,
      });

      const nextTags = tags.includes(SENT_TAG) ? tags : [...tags, SENT_TAG];
      await supabase.from('whatsapp_contacts')
        .update({ tags: nextTags, last_message_at: now, updated_at: now })
        .eq('id', contact.id);

      results.push({ id: contact.id, name: contact.profile_name, status: 'sent', messageId });
    } catch (error) {
      results.push({
        id: contact.id,
        name: contact.profile_name,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Falha no envio',
        code: error?.code || null,
      });
    }
  }

  return {
    ok: true,
    template: tpl,
    total: results.length,
    sent: results.filter((x) => x.status === 'sent').length,
    skipped: results.filter((x) => x.status === 'skipped').length,
    failed: results.filter((x) => x.status === 'failed').length,
    results,
  };
}

export async function GET() {
  try {
    return Response.json({ ok: true, template: await templateStatus() });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao consultar template.' }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').toLowerCase();
  try {
    if (action === 'create') return Response.json(await createTemplate());
    if (action === 'send') return Response.json(await sendCampaign());
    return Response.json({ ok: false, error: 'Ação inválida.' }, { status: 400 });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha na campanha.',
      code: error?.code || null,
      meta: error?.payload || null,
    }, { status: 500 });
  }
}
