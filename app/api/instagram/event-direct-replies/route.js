import { metaRequest, serverClient } from '../audio-automation/service.js';
import { instagramIdentity } from '../comment-automations/recovery.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUN_PREFIX = 'instagram-event-direct-20260918-v1';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function targetFor(profile, latestInbound) {
  const username = normalize(profile?.username);
  const name = normalize(profile?.name);
  const text = normalize(latestInbound?.message);

  if (username === 'thami__mayara') return 'info';
  if (name === 'renata dilys' || username === 'renata dilys') return 'want';
  if (name === 'clarissa simara' || username === 'clarissa simara') return 'date';

  // Only the three explicitly approved recipients may receive this message.

  return null;
}

function reply(kind) {
  if (kind === 'date') {
    return 'Oi! Por enquanto, a data confirmada da Imersão Ecommerce é 26/09, no Tatuapé em São Paulo. Aqui você consegue ver todas as informações e os ingressos: https://imersao.guinonato.com/';
  }
  if (kind === 'want') {
    return 'Perfeito! 😊 Aqui você consegue ver todas as informações da Imersão Ecommerce e garantir seu ingresso: https://imersao.guinonato.com/';
  }
  return 'Oi! Claro 😊 A Imersão Ecommerce acontece dia 26/09, no Tatuapé em São Paulo. Aqui você consegue ver todas as informações e garantir seu ingresso: https://imersao.guinonato.com/';
}

async function latestInboundMessage(conversationId, participantId) {
  const payload = await metaRequest(
    `${conversationId}?fields=messages.limit(20){id,created_time,from,to,message}`
  );
  const messages = payload?.messages?.data || [];
  return messages
    .filter((item) => String(item?.from?.id || '') === String(participantId || ''))
    .sort((a, b) => Date.parse(b.created_time || 0) - Date.parse(a.created_time || 0))[0] || null;
}

async function participantProfile(participant) {
  const base = {
    id: String(participant?.id || ''),
    username: participant?.username || '',
    name: participant?.name || '',
  };
  if (base.username || base.name || !/^\d+$/.test(base.id)) return base;
  try {
    const profile = await metaRequest(`${base.id}?fields=id,username,name`);
    return { ...base, ...profile };
  } catch {
    return base;
  }
}

export async function GET() {
  const db = serverClient();
  const identity = await instagramIdentity();

  const conversationsPayload = await metaRequest(
    `${identity.accountId}/conversations?fields=id,participants,updated_time&limit=50`
  );
  const conversations = conversationsPayload?.data || [];
  const results = [];

  for (const conversation of conversations) {
    const participant = (conversation?.participants?.data || []).find(
      (item) => String(item?.id || '') !== identity.accountId
    );
    if (!participant?.id) continue;

    const profile = await participantProfile(participant);
    const latestInbound = await latestInboundMessage(conversation.id, participant.id);
    const kind = targetFor(profile, latestInbound);
    if (!kind) continue;

    const lockKey = `${RUN_PREFIX}-${participant.id}`;
    const { data: existing } = await db
      .from('instagram_manual_backfills')
      .select('key,status,detail')
      .eq('key', lockKey)
      .maybeSingle();

    if (existing?.status === 'sent') {
      results.push({ user: profile.username || profile.name || participant.id, status: 'already_sent' });
      continue;
    }

    const text = reply(kind);
    const now = new Date().toISOString();
    await db.from('instagram_manual_backfills').upsert({
      key: lockKey,
      status: 'running',
      detail: `event_direct_reply:${kind}`,
      updated_at: now,
    }, { onConflict: 'key' });

    try {
      const sent = await metaRequest(`${identity.accountId}/messages`, {
        recipient: { id: String(participant.id) },
        message: { text },
      });

      await db.from('instagram_manual_backfills').update({
        status: 'sent',
        detail: `event_direct_reply:${kind}:${String(sent?.message_id || '')}`,
        updated_at: new Date().toISOString(),
      }).eq('key', lockKey);

      results.push({
        user: profile.username || profile.name || participant.id,
        kind,
        status: 'sent',
      });
    } catch (error) {
      await db.from('instagram_manual_backfills').update({
        status: 'failed',
        detail: String(error?.message || 'Falha no envio').slice(0, 450),
        updated_at: new Date().toISOString(),
      }).eq('key', lockKey);
      results.push({
        user: profile.username || profile.name || participant.id,
        kind,
        status: 'failed',
      });
    }
  }

  return Response.json({
    ok: true,
    account: '@' + identity.username,
    matched: results.length,
    sent: results.filter((item) => item.status === 'sent').length,
    results,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
