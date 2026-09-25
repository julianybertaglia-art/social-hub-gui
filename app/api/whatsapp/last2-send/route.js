import { getMetaCredentials, getSupabaseAdmin, normalizeWaId, WHATSAPP_API_VERSION } from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'last2-20260925-7f1c4e9a';
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

export async function POST(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== KEY) {
    return Response.json({ ok: false }, { status: 404 });
  }

  try {
    const meta = await getMetaCredentials();
    if (!meta?.accessToken || !meta?.phoneNumberId || !meta?.wabaId) {
      return Response.json({ ok: false, error: 'Credenciais Meta indisponíveis.' }, { status: 503 });
    }

    const check = await graphJson(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.wabaId)}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}&fields=id,name,status,category,language,components&limit=10`,
      { headers: { Authorization: `Bearer ${meta.accessToken}` } }
    );
    const tpl = check?.data?.[0] || null;

    if (!tpl || tpl.status !== 'APPROVED') {
      return Response.json({ ok: false, waitingApproval: true, templateStatus: tpl?.status || null });
    }

    const supabase = getSupabaseAdmin();
    const { data: contacts, error } = await supabase
      .from('whatsapp_contacts')
      .select('id,profile_name,phone,wa_id,stage,tags')
      .contains('tags', [TARGET_TAG])
      .order('profile_name', { ascending: true });
    if (error) throw error;

    const { data: participants, error: pError } = await supabase
      .from('event_participants')
      .select('name,phone,active')
      .eq('active', true);
    if (pError) throw pError;

    const participantPhones = new Set(
      (participants || []).map((p) => normalizeWaId(p.phone)).filter(Boolean)
    );

    const results = [];
    for (const contact of contacts || []) {
      const tags = Array.isArray(contact.tags) ? contact.tags : [];
      const phone = normalizeWaId(contact.phone || contact.wa_id);

      if (!phone) {
        results.push({ name: contact.profile_name, phone: null, status: 'skipped', reason: 'Número inválido' });
        continue;
      }
      const localPhone = phone.replace(/^55/, '');
      const participantMatch = participantPhones.has(phone) || participantPhones.has(localPhone);

      if (participantMatch) {
        results.push({ name: contact.profile_name, phone, status: 'skipped', reason: 'Já é participante' });
        continue;
      }
      if (['Venda', 'Perdido'].includes(contact.stage) || tags.includes(SENT_TAG)) {
        results.push({ name: contact.profile_name, phone, status: 'skipped', reason: 'Já enviado ou não elegível' });
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

        await supabase.from('whatsapp_contacts')
          .update({
            tags: tags.includes(SENT_TAG) ? tags : [...tags, SENT_TAG],
            last_message_at: now,
            updated_at: now,
          })
          .eq('id', contact.id);

        results.push({ name: contact.profile_name, phone, status: 'sent', messageId });
      } catch (error) {
        results.push({
          name: contact.profile_name,
          phone,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Falha no envio',
          code: error?.code || null,
        });
      }
    }

    return Response.json({
      ok: true,
      templateStatus: tpl.status,
      total: results.length,
      sent: results.filter((x) => x.status === 'sent').length,
      skipped: results.filter((x) => x.status === 'skipped').length,
      failed: results.filter((x) => x.status === 'failed').length,
      results,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no disparo.',
      code: error?.code || null,
    }, { status: 500 });
  }
}
