import crypto from 'node:crypto';
import { saveWebhookDirect } from '../direct/store.mjs';
import { after } from 'next/server';
import { extractTestMessages, processAudioTests } from '../audio-test/service';
import { processFlowComments, processFlowSelections } from '../flow-automations/service.js';
import { processMentoriaDirectKeywords, processConsultoriaDirectKeywords } from '../flow-automations/direct.mjs';
import { serverClient } from '../audio-automation/service.js';
import { processVitalInstagramDirect } from '../../vital-connections/instagram/direct.mjs';
import { processVitalMarmoreComments, processVitalJardimComments } from '../../vital-connections/instagram/marmore.mjs';
import { GUI_INSTAGRAM_ID } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

async function isValidSignature(rawBody, signatureHeader) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signatureHeader || '')) return false;
  const receivedBuffer = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const legacySecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  const vitalDirectSecret = process.env.META_VITAL_IG_APP_SECRET;
  function matches(secret) {
    if (!secret) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();
    return expected.length === receivedBuffer.length && crypto.timingSafeEqual(expected, receivedBuffer);
  }
  // Leave all existing Gui/Facebook webhook behavior unchanged.
  if (matches(legacySecret)) return true;
  if (!matches(vitalDirectSecret)) return false;
  // The native Instagram app has its own account-scoped ID. Accept signed
  // native events only when the exact authorized Vital connection saved this
  // ID; NEVER take an arbitrary ID from an inbound webhook as authorization.
  try {
    const payload = JSON.parse(rawBody);
    if (payload?.object !== 'instagram' || !Array.isArray(payload.entry) ||
        payload.entry.length === 0) return false;
    const db = serverClient();
    const { data, error } = await db.from('workspace_meta_connections')
      .select('external_account_id,username,auth_provider')
      .eq('workspace_id', 'vital-decor').eq('platform', 'instagram')
      .eq('state', 'connected').eq('auth_provider', 'instagram_login')
      .maybeSingle();
    if (error || !data || String(data.username || '').toLowerCase() !== 'vitaldecor_') return false;
    const accountId = String(data.external_account_id || '');
    return /^[0-9]{5,40}$/.test(accountId) && accountId !== GUI_INSTAGRAM_ID &&
      payload.entry.every((entry) => String(entry?.id || '') === accountId);
  } catch { return false; }
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    return Response.json({ ok: false, error: 'META_WEBHOOK_VERIFY_TOKEN ainda não configurado.' }, { status: 503 });
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return Response.json({ ok: false, error: 'Verificação recusada.' }, { status: 403 });
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const signatureValid = await isValidSignature(rawBody, signature);

  let previewPayload = {};
  try { previewPayload = JSON.parse(rawBody); } catch {}
  try {
    const entries = Array.isArray(previewPayload?.entry) ? previewPayload.entry : [];
    const changes = entries.flatMap((entry) => Array.isArray(entry?.changes) ? entry.changes : []);
    const fieldName = String(changes[0]?.field || '').slice(0, 80) || null;
    const db = serverClient();
    await db.from('instagram_webhook_ingress').insert({
      signature_present: Boolean(signature),
      signature_valid: signatureValid,
      object_name: String(previewPayload?.object || '').slice(0, 80) || null,
      field_name: fieldName,
      event_count: entries.length,
    });
  } catch {}

  if (!signatureValid) {
    return Response.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
  }

  // Mantemos somente o teste técnico de áudio. Todas as automações antigas
  // (ARGO, MENTORIA e regras fixas) foram retiradas do runtime para recomeçar
  // com o novo construtor visual da TidePlace.
  if (extractTestMessages(payload).length) {
    after(async () => {
      try { await processAudioTests(payload); }
      catch (error) {
        console.error('Teste de áudio: falha ao processar.', error instanceof Error ? error.message : String(error));
      }
    });
  }

  // Persist private inbox messages independently of all existing automation flows.
  after(async () => {
    try { await saveWebhookDirect(payload, serverClient()); }
    catch (error) { console.error('TIDEPLACE:DIRECT: failed to persist webhook event',String(error?.code||'unknown')); }
  });

  after(async () => {
    try {
      // The Gui's keyword/comment flows must never intercept Vital Decor conversations.
      const guiPayload = { ...payload, entry: (payload.entry || [])
        .filter((entry) => String(entry?.id || '') === GUI_INSTAGRAM_ID) };
      const db = serverClient();
      const senders = [...new Set(guiPayload.entry.flatMap(entry =>
        (entry.messaging || []).map(event => String(event?.sender?.id || ''))
      ).filter(id => /^\d{5,40}$/.test(id)))];
      let paused = new Set();
      if (senders.length) {
        const { data, error } = await db.from('instagram_direct_threads')
          .select('sender_id').eq('account_id', GUI_INSTAGRAM_ID)
          .eq('automation_paused', true).in('sender_id', senders);
        if (!error) paused = new Set((data || []).map(item => String(item.sender_id)));
      }
      // Inbound messages are persisted from the original payload. Only the
      // automation executor is filtered after a human takes ownership.
      const automationPayload = { ...guiPayload, entry: guiPayload.entry.map(entry => ({
        ...entry, messaging: (entry.messaging || []).filter(event =>
          !paused.has(String(event?.sender?.id || '')))
      })) };
      const [comments, selections, mentoriaDirect, consultoriaDirect, vitalDirect, vitalMarmore, vitalJardim] = await Promise.all([
        processFlowComments(guiPayload),
        processFlowSelections(automationPayload, db),
        processMentoriaDirectKeywords(automationPayload, db),
        processConsultoriaDirectKeywords(automationPayload, db),
        processVitalInstagramDirect(payload, db),
        processVitalMarmoreComments(payload, db),
        processVitalJardimComments(payload, db),
      ]);
      if (comments || selections || mentoriaDirect || consultoriaDirect || vitalDirect || vitalMarmore || vitalJardim) {
        console.info('TIDEPLACE:FLOW', { comments, selections, mentoriaDirect, consultoriaDirect, vitalDirect, vitalMarmore, vitalJardim });
      }
    } catch (error) {
      console.error('TIDEPLACE:FLOW: falha no processamento', error instanceof Error ? error.message : String(error));
    }
  });

  return Response.json({ ok: true, status: 'EVENT_RECEIVED', engine: 'tideplace-flow-v1' });
}

