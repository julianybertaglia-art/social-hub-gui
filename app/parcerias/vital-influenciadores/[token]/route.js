import { serverClient } from '../../../api/instagram/audio-automation/service.js';
import { influencerFormHtml } from '../html.js';
import { loadApplicationByToken } from '../service.js';

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

function withOfficialVitalBrand(markup) {
  return String(markup || '')
    .replaceAll(
      '<div class="brand"><i>VD</i> VITAL DECOR</div>',
      '<div class="brand brand-logo"><img src="/vital-decor-logo.png" alt="Vital Decor"></div>'
    )
    .replace(
      '</style>',
      '.brand-logo{display:inline-flex;align-items:center}.brand-logo img{display:block;width:190px;max-width:55vw;height:auto}</style>'
    );
}

function html(options, status = 200) {
  return new Response(withOfficialVitalBrand(influencerFormHtml(options)), {
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

export async function GET(request, context) {
  const params = await context.params;
  const token = String(params?.token || '').trim();

  try {
    const application = await loadApplicationByToken(serverClient(), token);
    if (!application) return invalidLinkResponse();
    return html({ token, alreadySubmitted: application.status === 'submitted' });
  } catch (error) {
    return html({
      token,
      error: error?.status ? error.message : 'O formulário está temporariamente indisponível.',
    }, error?.status || 503);
  }
}
