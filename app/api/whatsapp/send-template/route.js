import {
  getMetaCredentials,
  getSupabaseAdmin,
  normalizeWaId,
  sendWhatsAppTemplate,
  WHATSAPP_API_VERSION,
} from '../lib.js';
import { isSimpleApprovedWhatsAppTemplate } from '../service-window.js';
import { bearerToken, connectionOwner } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function approvedTemplate(meta, name, language) {
  if (!meta?.accessToken || !meta?.wabaId) {
    throw Object.assign(new Error('A conexão da Meta ainda precisa ser confirmada.'), { status: 503 });
  }

  let url = 'https://graph.facebook.com/' + WHATSAPP_API_VERSION
    + '/' + encodeURIComponent(meta.wabaId)
    + '/message_templates?fields=name,status,language,category,components&limit=100';
  for (let page = 0; page < 5 && url; page += 1) {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + meta.accessToken },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw Object.assign(new Error('A Meta não permitiu consultar os modelos aprovados.'), { status: 503 });
    }
    const chosen = (payload.data || []).find((template) =>
      template.name === name && template.language === language && isSimpleApprovedWhatsAppTemplate(template)
    );
    if (chosen) return chosen;
    const next = payload.paging?.next || '';
    // Never follow an untrusted pagination URL to another host.
    if (!next || new URL(next).hostname !== 'graph.facebook.com') break;
    url = next;
  }
  throw Object.assign(new Error('Este modelo não está aprovado ou precisa de campos personalizados. Escolha outro modelo.'), { status: 422 });
}

export async function POST(request) {
  const input = await request.json().catch(() => ({}));
  const to = normalizeWaId(input?.to);
  const name = String(input?.templateName || '').trim();
  const language = String(input?.templateLanguage || '').trim();

  if (!/^\d{10,15}$/.test(to) || !/^[a-z][a-z0-9_]{0,511}$/.test(name) || !/^[a-z]{2,3}_[A-Z]{2}$/.test(language)) {
    return Response.json({ ok: false, error: 'Número ou modelo inválido.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    await connectionOwner(supabase, bearerToken(request));
    const { data: contact, error: contactError } = await supabase.from('whatsapp_contacts')
      .select('id,wa_id').eq('wa_id', to).maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return Response.json({ ok: false, error: 'Esse contato não está no CRM do Gui.' }, { status: 404 });
    const meta = await getMetaCredentials();
    const template = await approvedTemplate(meta, name, language);
    const result = await sendWhatsAppTemplate({ to, name, language });
    const messageId = result?.messages?.[0]?.id || null;
    if (!messageId) throw new Error('A Meta não confirmou o recebimento do envio.');

    const now = new Date().toISOString();
    const text = template.components.find((item) => item.type === 'BODY')?.text || name;
    const { error } = await supabase.from('whatsapp_messages').insert({
      meta_message_id: messageId,
      contact_id: contact.id,
      direction: 'outbound',
      message_type: 'template',
      body: text,
      status: 'sent',
      raw_payload: { ...result, template_name: name, template_language: language, template_category: template.category },
      sent_at: now,
    });
    if (error && error.code !== '23505') throw error;
    return Response.json({ ok: true, messageId });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || 'Falha ao enviar modelo pela Meta.' },
      { status: error?.status || 502 });
  }
}
