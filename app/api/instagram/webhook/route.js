import crypto from 'node:crypto';
import { saveWebhookDirect } from '../direct/store.mjs';
import { after } from 'next/server';
import { extractTestMessages, processAudioTests } from '../audio-test/service';
import { processFlowComments, processFlowSelections } from '../flow-automations/service.js';
import { processMentoriaDirectKeywords } from '../flow-automations/direct.mjs';
import { serverClient } from '../audio-automation/service.js';
import { processVitalInstagramDirect } from '../../vital-connections/instagram/direct.mjs';
import { GUI_INSTAGRAM_ID } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
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
  const signatureValid = isValidSignature(rawBody, signature);

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
      const [comments, selections, mentoriaDirect, vitalDirect] = await Promise.all([
        processFlowComments(guiPayload),
        processFlowSelections(automationPayload, db),
        processMentoriaDirectKeywords(automationPayload, db),
        processVitalInstagramDirect(payload, db),
      ]);
      if (comments || selections || mentoriaDirect || vitalDirect) {
        console.info('TIDEPLACE:FLOW', { comments, selections, mentoriaDirect, vitalDirect });
      }
    } catch (error) {
      console.error('TIDEPLACE:FLOW: falha no processamento', error instanceof Error ? error.message : String(error));
    }
  });

  return Response.json({ ok: true, status: 'EVENT_RECEIVED', engine: 'tideplace-flow-v1' });
}
