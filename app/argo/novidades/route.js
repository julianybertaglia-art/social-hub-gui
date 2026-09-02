import { serverClient } from '../../api/instagram/audio-automation/service.js';
import { signupHtml } from './html.js';
import { saveContact, validateContact } from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(options, status = 200) {
  return new Response(signupHtml(options), {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

export async function GET() {
  return html({});
}

async function boundedForm(request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    throw Object.assign(new Error('Use o formulário abaixo para fazer seu cadastro.'), { status: 415 });
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
    if (bytes > 8192) {
      await reader.cancel();
      throw Object.assign(new Error('O cadastro excedeu o tamanho permitido. Confira os campos.'), { status: 413 });
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return html({ error: 'Abra esta página e preencha o formulário para continuar.' }, 403);
  }
  let values = {};
  try {
    values = await boundedForm(request);
    if (values.company_site) return html({ success: true });
    const contact = validateContact(values);
    await saveContact(serverClient(), contact);
    return html({ success: true });
  } catch (error) {
    return html({
      values,
      error: error?.status ? error.message : 'Não foi possível concluir seu cadastro. Tente novamente em instantes.',
    }, error?.status || 503);
  }
}
