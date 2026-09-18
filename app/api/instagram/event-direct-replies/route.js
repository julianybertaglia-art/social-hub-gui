import { metaRequest, serverClient } from '../audio-automation/service.js';
import { instagramIdentity } from '../comment-automations/recovery.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUN_PREFIX = 'instagram-event-direct-20260918-v1';
const EXPECTED_KINDS = ['info', 'want', 'date'];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function targetFor(profile) {
  const username = normalize(profile?.username);
  const name = normalize(profile?.name);

  if (username === 'thami__mayara') return 'info';
  if (name === 'renata dilys' || username === 'renata dilys') return 'want';
  if (name === 'clarissa simara' || username === 'clarissa simara') return 'date';
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

async function scanTargets() {
  const identity = await instagramIdentity();
  const payload = await metaRequest(
    `${identity.accountId}/conversations?fields=id,participants,updated_time&limit=50`
  );
  const conversations = payload?.data || [];

  const candidates = await Promise.all(conversations.map(async (conversation) => {
    const participant = (conversation?.participants?.data || []).find(
      (item) => String(item?.id || '') !== identity.accountId
    );
    if (!participant?.id) return null;

    const profile = await participantProfile(participant);
    const kind = targetFor(profile);
    if (!kind) return null;
    return { participantId: String(participant.id), profile, kind };
  }));

  const byKind = new Map();
  for (const candidate of candidates.filter(Boolean)) {
    if (!byKind.has(candidate.kind)) byKind.set(candidate.kind, candidate);
  }
  const targets = EXPECTED_KINDS.map((kind) => byKind.get(kind)).filter(Boolean);
  return { identity, targets };
}

function publicTargets(targets, status = 'ready') {
  return targets.map(({ profile, kind }) => ({
    user: profile.username || profile.name,
    kind,
    status,
  }));
}

function errorResponse(error) {
  return Response.json({
    ok: false,
    error: String(error?.message || 'Falha ao preparar os directs.').slice(0, 450),
  }, {
    status: Number(error?.status) || 500,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  try {
    const { identity, targets } = await scanTargets();
    return Response.json({
      ok: targets.length === EXPECTED_KINDS.length,
      account: '@' + identity.username,
      matched: targets.length,
      results: publicTargets(targets),
    }, {
      status: targets.length === EXPECTED_KINDS.length ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const { identity, targets } = await scanTargets();
    if (targets.length !== EXPECTED_KINDS.length) {
      return Response.json({
        ok: false,
        matched: targets.length,
        results: publicTargets(targets),
        error: 'Os três destinatários exatos não foram localizados; nenhum direct foi enviado.',
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }

    const db = serverClient();
    const keys = targets.map(({ participantId }) => `${RUN_PREFIX}-${participantId}`);
    const { data: existingRows, error: existingError } = await db
      .from('instagram_manual_backfills')
      .select('key,status')
      .in('key', keys);
    if (existingError) throw Object.assign(new Error('Não foi possível validar o registro seguro dos envios.'), { status: 503 });

    const sentKeys = new Set((existingRows || [])
      .filter((row) => row.status === 'sent')
      .map((row) => row.key));
    const pending = targets.filter(({ participantId }) => !sentKeys.has(`${RUN_PREFIX}-${participantId}`));
    const now = new Date().toISOString();

    if (pending.length) {
      const { error: claimError } = await db.from('instagram_manual_backfills').upsert(
        pending.map(({ participantId, kind }) => ({
          key: `${RUN_PREFIX}-${participantId}`,
          status: 'running',
          detail: `event_direct_reply:${kind}`,
          updated_at: now,
        })),
        { onConflict: 'key' }
      );
      if (claimError) throw Object.assign(new Error('Não foi possível reservar os três envios com segurança.'), { status: 503 });
    }

    const results = [];
    for (const target of targets) {
      const { participantId, profile, kind } = target;
      const lockKey = `${RUN_PREFIX}-${participantId}`;
      const user = profile.username || profile.name || participantId;

      if (sentKeys.has(lockKey)) {
        results.push({ user, kind, status: 'already_sent' });
        continue;
      }

      try {
        const sent = await metaRequest(`${identity.accountId}/messages`, {
          recipient: { id: participantId },
          message: { text: reply(kind) },
        });
        const { error: saveError } = await db.from('instagram_manual_backfills').update({
          status: 'sent',
          detail: `event_direct_reply:${kind}:${String(sent?.message_id || '')}`,
          updated_at: new Date().toISOString(),
        }).eq('key', lockKey);
        if (saveError) throw new Error('Direct enviado, mas o recibo não foi salvo.');
        results.push({ user, kind, status: 'sent' });
      } catch (error) {
        await db.from('instagram_manual_backfills').update({
          status: 'failed',
          detail: String(error?.message || 'Falha no envio').slice(0, 450),
          updated_at: new Date().toISOString(),
        }).eq('key', lockKey);
        results.push({ user, kind, status: 'failed' });
      }
    }

    const completed = results.filter((item) => ['sent', 'already_sent'].includes(item.status)).length;
    return Response.json({
      ok: completed === EXPECTED_KINDS.length,
      account: '@' + identity.username,
      matched: targets.length,
      sent: results.filter((item) => item.status === 'sent').length,
      completed,
      results,
    }, { status: completed === EXPECTED_KINDS.length ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
