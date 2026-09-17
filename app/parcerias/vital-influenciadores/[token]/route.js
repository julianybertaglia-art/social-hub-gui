import { serverClient } from '../../../api/instagram/audio-automation/service.js';
import { influencerFormHtml } from '../html.js';
import {
  loadApplicationByToken,
  saveInfluencerApplication,
  validateInfluencerApplication,
} from '../service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withOfficialVitalBrand(markup, actionPath = '') {
  let result = String(markup || '')
    .replaceAll(
      '<div class="brand"><i>VD</i> VITAL DECOR</div>',
      '<div class="brand brand-logo"><img src="/vital-decor-logo.png" alt="Vital Decor"></div>'
    )
    .replace(
      '</style>',
      '.brand-logo{display:inline-flex;align-items:center}.brand-logo img{display:block;width:190px;max-width:55vw;height:auto}</style>'
    );

  if (actionPath) {
    result = result.replace(
      'action="/parcerias/vital-influenciadores"',
      `action="${actionPath}"`
    );
  }

  return result;
}

function html(options, status = 200, actionPath = '') {
  return new Response(withOfficialVitalBrand(influencerFormHtml(options), actionPath), {
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
    :root{color-scheme:light;--ink:#171714;--muted:#69655d;--line:#ddd8cc;--paper:#fff}
    *{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#ede8dc 0,#f7f5ef 48%,#eee9df 100%);color:var(--ink);font-family:Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:20px}
    .card{width:min(620px,100%);background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:34px;box-shadow:0 16px 50px rgba(31,27,20,.08);text-align:center}
    .brand img{display:block;width:190px;max-width:55vw;height:auto;margin:0 auto}h1{font-family:Georgia,serif;font-size:34px;font-weight:500;margin:26px 0 12px}p{color:var(--muted);line-height:1.6;margin:0 auto;max-width:500px}
  </style>
</head>
<body><main class="card"><div class="brand"><img src="/vital-decor-logo.png" alt="Vital Decor"></div><h1>Este link não está válido.</h1><p>Volte para a conversa no WhatsApp e solicite um novo link.</p></main></body>
</html>`, { status: 404, headers: RESPONSE_HEADERS });
}

function tokenFromContext(context) {
  return Promise.resolve(context.params)
    .then((params) => String(params?.token || '').trim());
}

function actionPath(token) {
  return `/parcerias/vital-influenciadores/${encodeURIComponent(token)}`;
}

export async function GET(request, context) {
  const token = await tokenFromContext(context);
  const action = actionPath(token);

  try {
    const application = await loadApplicationByToken(serverClient(), token);
    if (!application) return invalidLinkResponse();
    return html({ token, alreadySubmitted: application.status === 'submitted' }, 200, action);
  } catch (error) {
    return html({
      token,
      error: error?.status ? error.message : 'O formulário está temporariamente indisponível.',
    }, error?.status || 503, action);
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

export async function POST(request, context) {
  const token = await tokenFromContext(context);
  const action = actionPath(token);
  const origin = request.headers.get('origin');

  // Mantém a checagem de origem, mas não usa Sec-Fetch-Site como bloqueio isolado,
  // porque WebViews do WhatsApp podem reportar esse cabeçalho de forma inconsistente.
  if (origin && origin !== 'null' && origin !== new URL(request.url).origin) {
    return invalidLinkResponse();
  }

  let values = {};

  try {
    const linkedApplication = await loadApplicationByToken(serverClient(), token);
    if (!linkedApplication) return invalidLinkResponse();

    values = await boundedForm(request);
    if (values.company_site) return html({ success: true }, 200, action);

    values.token = token;

    const application = validateInfluencerApplication(values);
    const saved = await saveInfluencerApplication(serverClient(), application);
    return html({ success: true, alreadySubmitted: saved.alreadySubmitted }, 200, action);
  } catch (error) {
    return html({
      token,
      values,
      error: error?.status ? error.message : 'Não foi possível enviar sua inscrição. Tente novamente.',
    }, error?.status || 503, action);
  }
}
