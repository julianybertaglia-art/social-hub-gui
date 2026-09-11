import { sendWhatsAppText } from '../lib';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ruleMatchesText(rule, text) {
  const haystack = normalizeText(text);
  const triggerType = rule?.trigger_type || 'contains';
  const keywords = Array.isArray(rule?.keywords)
    ? rule.keywords.map(normalizeText).filter(Boolean)
    : [];

  if (triggerType === 'any') return Boolean(haystack);
  if (!haystack || !keywords.length) return false;

  if (triggerType === 'exact') return keywords.some((keyword) => haystack === keyword);
  if (triggerType === 'starts_with') return keywords.some((keyword) => haystack.startsWith(keyword));
  return keywords.some((keyword) => haystack.includes(keyword));
}

async function claimAutomationRun(supabase, ruleId, inboundMessageId) {
  const { data, error } = await supabase
    .from('whatsapp_automation_runs')
    .insert({
      rule_id: ruleId,
      inbound_message_id: inboundMessageId,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error?.code === '23505') return null;
  if (error) throw error;
  return data;
}

async function markRun(supabase, id, patch) {
  const { error } = await supabase
    .from('whatsapp_automation_runs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function saveOutboundMessage(supabase, { contactId, body, metaPayload }) {
  const metaMessageId = metaPayload?.messages?.[0]?.id || null;
  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: metaMessageId,
    contact_id: contactId,
    direction: 'outbound',
    message_type: 'text',
    body,
    status: 'sent',
    raw_payload: metaPayload,
    sent_at: now,
  });
  if (error) throw error;
  return { metaMessageId, sentAt: now };
}

async function applyContactActions(supabase, contact, rule, lastMessageAt) {
  const patch = {
    last_message_at: lastMessageAt,
    updated_at: new Date().toISOString(),
  };

  if (rule?.set_stage) patch.stage = String(rule.set_stage).slice(0, 80);

  const currentTags = Array.isArray(contact?.tags) ? contact.tags : [];
  const ruleTags = Array.isArray(rule?.add_tags) ? rule.add_tags : [];
  if (ruleTags.length) {
    patch.tags = [...new Set([...currentTags, ...ruleTags].map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20);
  }

  const { error } = await supabase
    .from('whatsapp_contacts')
    .update(patch)
    .eq('id', contact.id);
  if (error) throw error;
}

export async function applyWhatsAppAutomations({
  supabase,
  contact,
  inboundMessageId,
  inboundBody,
}) {
  if (!supabase || !contact?.id || !inboundMessageId || !normalizeText(inboundBody)) return [];

  const { data: rules, error } = await supabase
    .from('whatsapp_automation_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;

  const results = [];
  for (const rule of rules || []) {
    if (!ruleMatchesText(rule, inboundBody)) continue;

    const run = await claimAutomationRun(supabase, rule.id, inboundMessageId);
    if (!run) continue;

    try {
      const reply = String(rule.reply_text || '').trim();
      if (!reply) throw new Error('Regra de automação sem resposta configurada.');

      const metaPayload = await sendWhatsAppText({ to: contact.wa_id, text: reply });
      const outbound = await saveOutboundMessage(supabase, {
        contactId: contact.id,
        body: reply,
        metaPayload,
      });

      await applyContactActions(supabase, contact, rule, outbound.sentAt);
      await markRun(supabase, run.id, {
        status: 'sent',
        outbound_meta_message_id: outbound.metaMessageId,
        error: null,
      });

      results.push({ ruleId: rule.id, status: 'sent', messageId: outbound.metaMessageId });
      if (rule.stop_after_match !== false) break;
    } catch (automationError) {
      await markRun(supabase, run.id, {
        status: 'failed',
        error: automationError instanceof Error ? automationError.message.slice(0, 1000) : 'Falha desconhecida',
      }).catch(() => {});
      results.push({ ruleId: rule.id, status: 'failed' });
    }
  }

  return results;
}
