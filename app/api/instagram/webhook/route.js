import crypto from 'node:crypto';
import { after } from 'next/server';
import { extractTestMessages, processAudioTests } from '../audio-test/service';
import { processFlowComments, processFlowSelections } from '../flow-automations/service.js';
import { serverClient } from '../audio-automation/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;
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

  after(async () => {
    try {
      const [comments, selections] = await Promise.all([
        processFlowComments(payload),
        processFlowSelections(payload),
      ]);
      if (comments || selections) {
        console.info('TIDEPLACE:FLOW', { comments, selections });
      }
    } catch (error) {
      console.error('TIDEPLACE:FLOW: falha no processamento', error instanceof Error ? error.message : String(error));
    }
  });

  return Response.json({ ok: true, status: 'EVENT_RECEIVED', engine: 'tideplace-flow-v1' });
}
