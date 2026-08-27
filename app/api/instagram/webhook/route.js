import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_VERSION = 'v26.0';
const KEYWORD = 'IMERSAO';
const PRIVATE_MESSAGE =
  'Fala! Vi que você comentou IMERSÃO no vídeo 👊\n\nQuer que eu te mande as informações da Imersão Ecommerce?';
const PUBLIC_REPLY = 'Te chamei no Direct 👊';

function isValidSignature(rawBody, signatureHeader) {
  const appSecret = process.env.META_APP_SECRET;

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isKeywordComment(value) {
  return normalizeText(value).includes(KEYWORD);
}

async function metaPost(path, body) {
  const accessToken = process.env.META_INSTAGRAM_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('META_INSTAGRAM_ACCESS_TOKEN não configurado.');
  }

  const response = await fetch(
    `https://graph.instagram.com/${API_VERSION}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = result?.error?.message || `Erro Meta HTTP ${response.status}`;
    throw new Error(message);
  }

  return result;
}

async function sendPrivateReply(igUserId, commentId) {
  return metaPost(`${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text: PRIVATE_MESSAGE },
  });
}

async function sendPublicReply(commentId) {
  return metaPost(`${commentId}/replies`, {
    message: PUBLIC_REPLY,
  });
}

function extractCommentEvents(payload) {
  if (!Array.isArray(payload?.entry)) return [];

  return payload.entry.flatMap((entry) => {
    if (entry?.field === 'comments' && entry?.value) {
      return [{ igUserId: entry.id, value: entry.value }];
    }

    if (Array.isArray(entry?.changes)) {
      return entry.changes
        .filter((change) => change?.field === 'comments' && change?.value)
        .map((change) => ({ igUserId: entry.id, value: change.value }));
    }

    return [];
  });
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

  const commentEvents = extractCommentEvents(payload);

  for (const event of commentEvents) {
    const commentId = event?.value?.id;
    const text = event?.value?.text;
    const username = event?.value?.from?.username;

    if (!commentId || !event.igUserId || !isKeywordComment(text)) continue;

    if (String(username || '').toLowerCase() === 'gui_nonato') continue;

    try {
      const privateResult = await sendPrivateReply(event.igUserId, commentId);

      console.info('IMERSAO: Direct enviado', {
        commentId,
        username,
        messageId: privateResult?.message_id || null,
      });
    } catch (error) {
      console.error('IMERSAO: falha ao enviar Direct', {
        commentId,
        username,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const publicResult = await sendPublicReply(commentId);

      console.info('IMERSAO: resposta pública enviada', {
        commentId,
        username,
        replyId: publicResult?.id || null,
      });
    } catch (error) {
      console.error('IMERSAO: falha na resposta pública', {
        commentId,
        username,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    ok: true,
    status: 'EVENT_RECEIVED',
    commentEvents: commentEvents.length,
  });
}
