import { serverClient } from '../api/instagram/audio-automation/service.js';
import { validateConsultoria, applicationError } from '../lib/consultoria.mjs';
import { consultoriaHtml } from './html.mjs';
import { formTicket, verifyTicket, requestFingerprint } from './security.mjs';
import { saveConsultoria } from './service.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function html(options, status = 200) {
  return new Response(consultoriaHtml(options), { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  } });
}
export async function GET() {
  try { return html({ ticket: formTicket() }); }
  catch { return html({ unavailable: true }, 503); }
}
async function readForm(request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) throw applicationError('Envie os dados pelo formulário abaixo.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw applicationError('Preencha o formulário abaixo.');
  const decoder = new TextDecoder(); let raw = '', bytes = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 16000) { await reader.cancel(); throw applicationError('O formulário excedeu o tamanho permitido.', 413); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode(); return Object.fromEntries(new URLSearchParams(raw));
}
export async function POST(request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') return html({ error: 'Abra o formulário para enviar sua candidatura.' }, 403);
  let values = {};
  try {
    values = await readForm(request);
    if (values.company_site) return html({ success: true });
    const id = verifyTicket(values.ticket);
    const application = validateConsultoria(values);
    await saveConsultoria(serverClient(), application, { id, fingerprint: requestFingerprint(request) });
    return html({ success: true });
  } catch (error) {
    let ticket = ''; try { ticket = formTicket(); } catch {}
    return html({ values, ticket, error: error?.status ? error.message : 'Não foi possível enviar sua candidatura. Tente novamente.', unavailable: !ticket }, error?.status || 503);
  }
}
