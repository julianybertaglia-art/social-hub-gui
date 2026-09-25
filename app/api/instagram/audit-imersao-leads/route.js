import { metaRequest } from '../audio-automation/service.js';
import { instagramIdentity } from '../comment-automations/recovery.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const STRONG = ['imersao','imersão','ingresso','26/09','26-09','tatuape','tatuapé'];
const EVENT = ['evento','vaga','vagas','sabado','sábado','participar','presenca','presença','cupom'];
const INTEREST = ['tenho interesse','mais informacoes','mais informações','quero','valor','quanto','onde','como funciona'];

function norm(v='') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function hits(text, words) {
  const n = norm(text);
  return words.filter((w) => n.includes(norm(w)));
}

function clip(text) {
  return String(text || '').replace(/\s+/g,' ').trim().slice(0,280);
}

async function profileFor(participant) {
  const base = {
    id: String(participant?.id || ''),
    username: participant?.username || '',
    name: participant?.name || '',
  };
  if (base.username || base.name || !/^\d+$/.test(base.id)) return base;
  try {
    const p = await metaRequest(`${base.id}?fields=id,username,name`);
    return { ...base, ...p };
  } catch {
    return base;
  }
}

async function conversationMessages(id) {
  const payload = await metaRequest(
    `${id}/messages?fields=id,message,from,to,created_time&limit=20`
  );
  return payload?.data || [];
}

export async function GET() {
  try {
    const identity = await instagramIdentity();
    const payload = await metaRequest(
      `${identity.accountId}/conversations?fields=id,participants{id,username,name},updated_time&limit=100`
    );
    const conversations = payload?.data || [];
    const cutoff = Date.now() - LOOKBACK_MS;
    const recent = conversations.filter((c) => {
      const t = Date.parse(c?.updated_time || '');
      return Number.isFinite(t) && t >= cutoff;
    });

    const results = [];
    for (const conv of recent.slice(0, 80)) {
      const participant = (conv?.participants?.data || []).find(
        (p) => String(p?.id || '') !== identity.accountId
      );
      if (!participant?.id) continue;

      const profile = await profileFor(participant);
      let messages = [];
      try { messages = await conversationMessages(conv.id); } catch { continue; }

      const ordered = [...messages].sort((a,b) => Date.parse(a.created_time||0) - Date.parse(b.created_time||0));
      const corpus = ordered.map((m) => m.message || '').join(' ');
      const strongHits = hits(corpus, STRONG);
      const eventHits = hits(corpus, EVENT);
      const interestHits = hits(corpus, INTEREST);

      const accountMentionedEvent = ordered.some((m) => {
        const fromId = String(m?.from?.id || '');
        if (fromId !== identity.accountId) return false;
        const text = m?.message || '';
        return hits(text, [...STRONG, 'evento']).length > 0;
      });
      const inbound = ordered.filter((m) => String(m?.from?.id || '') !== identity.accountId);
      const inboundInterest = inbound.some((m) => hits(m?.message || '', [...STRONG, ...EVENT, ...INTEREST]).length > 0);

      const qualifies = strongHits.length > 0 || (accountMentionedEvent && inboundInterest);
      if (!qualifies) continue;

      results.push({
        user: profile.username || profile.name || profile.id,
        username: profile.username || null,
        name: profile.name || null,
        participantId: String(participant.id),
        updatedTime: conv.updated_time,
        strongHits: [...new Set(strongHits)],
        eventHits: [...new Set(eventHits)],
        interestHits: [...new Set(interestHits)],
        messages: ordered.slice(-10).map((m) => ({
          direction: String(m?.from?.id || '') === identity.accountId ? 'outbound' : 'inbound',
          at: m.created_time || null,
          text: clip(m.message),
        })).filter((m) => m.text),
      });
    }

    results.sort((a,b) => Date.parse(b.updatedTime||0)-Date.parse(a.updatedTime||0));

    return Response.json({
      ok: true,
      account: '@' + identity.username,
      conversationsScanned: recent.length,
      matched: results.length,
      results,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok:false,
      error:String(error?.message || error).slice(0,450)
    }, { status: Number(error?.status)||500 });
  }
}
