import { serverClient } from '../../api/instagram/audio-automation/service.js';
import { influencerFormHtml } from './html.js';
import {
  loadApplicationByToken,
  saveInfluencerApplication,
  validateInfluencerApplication,
} from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(options, status = 200) {
  return new Response(influencerFormHtml(options), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    const application = await loadApplicationByToken(serverClient(), token);
    if (!application) {
      return html({ token, error: 'Este link não é válido. Solicite um novo link pelo WhatsApp.' }, 404);
    }
    return html({ token, alreadySubmitted: application.status === 'submitted' });
  } catch (error) {
    return html({ token, error: error?.status ? error.message : 'O formulário está temporariamente indisponível.' }, error?.status || 503);
  }
}

async function boundedForm(request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    throw Object.assign(new Error('Use o formulário abaixo para enviar sua inscrição.'), { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let raw = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32768) {
      await reader.cancel();
      throw Object.assign(new Error('O formulário excedeu o tamanho permitido.'), { status: 413 });
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return html({ error: 'Abra o link recebido no WhatsApp para preencher o formulário.' }, 403);
  }

  let values = {};
  try {
    values = await boundedForm(request);
    if (values.company_site) return html({ success: true });
    const application = validateInfluencerApplication(values);
    const saved = await saveInfluencerApplication(serverClient(), application);
    return html({ success: true, alreadySubmitted: saved.alreadySubmitted });
  } catch (error) {
    return html({
      token: values.token || '',
      values,
      error: error?.status ? error.message : 'Não foi possível enviar sua inscrição. Tente novamente.',
    }, error?.status || 503);
  }
}
