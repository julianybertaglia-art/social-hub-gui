import { serverClient } from '../../api/instagram/audio-automation/service.js';
import { influencerFormHtml } from './html.js';
import {
  loadApplicationByToken,
  saveInfluencerApplication,
  validateInfluencerApplication,
} from './service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function html(options, status = 200) {
  return new Response(influencerFormHtml(options), {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function invalidLinkResponse() {
  return new Response(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Link inválido · Vital Decor</title>
  <style>
    :root{color-scheme:light;--ink:#171714;--muted:#69655d;--line:#ddd8cc;--paper:#fff;--bg:#f2efe8;--gold:#b9924d}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#ede8dc 0,#f7f5ef 48%,#eee9df 100%);color:var(--ink);font-family:Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}
    .card{width:min(620px,100%);background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:34px;box-shadow:0 16px 50px rgba(31,27,20,.08);text-align:center}
    .brand{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:900;letter-spacing:.12em}.brand i{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--gold);color:#15130f;font-style:normal;font-size:11px}
    h1{font-family:Georgia,serif;font-size:34px;font-weight:500;margin:26px 0 12px}p{color:var(--muted);line-height:1.6;margin:0 auto;max-width:500px}.hint{margin-top:18px;font-size:12px;font-weight:700;color:#4f4b43}
  </style>
</head>
<body><main class="card"><div class="brand"><i>VD</i> VITAL DECOR</div><h1>Este link não está válido.</h1><p>Para sua inscrição ficar vinculada corretamente ao WhatsApp, use o link individual enviado pela nossa equipe.</p><p class="hint">Volte para a conversa no WhatsApp e solicite um novo link.</p></main></body>
</html>`, {
    status: 404,
    headers: RESPONSE_HEADERS,
  });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    const application = await loadApplicationByToken(serverClient(), token);
    if (!application) return invalidLinkResponse();
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
    return invalidLinkResponse();
  }

  let values = {};
  try {
    values = await boundedForm(request);
    if (values.company_site) return html({ success: true });

    const linkedApplication = await loadApplicationByToken(serverClient(), values.token || '');
    if (!linkedApplication) return invalidLinkResponse();

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
