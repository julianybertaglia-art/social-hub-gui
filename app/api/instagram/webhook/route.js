import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;

  // Enquanto o segredo ainda não foi configurado, não aceitamos eventos reais.
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

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
    return Response.json(
      { ok: false, error: 'META_WEBHOOK_VERIFY_TOKEN ainda não configurado.' },
      { status: 503 }
    );
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

  if (!isValidSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
  }

  // Nesta primeira versão apenas recebemos o evento com segurança.
  // O processamento da palavra-chave MENTORIA será adicionado depois
  // que a conta e o token oficial estiverem conectados.
  console.info('Instagram webhook recebido', {
    object: payload?.object,
    entries: Array.isArray(payload?.entry) ? payload.entry.length : 0,
    receivedAt: new Date().toISOString(),
  });

  return Response.json({ ok: true, status: 'EVENT_RECEIVED' });
}
