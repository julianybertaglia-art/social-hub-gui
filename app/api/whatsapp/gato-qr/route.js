export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCESS_TOKEN = 'gato-reconnect-20260917-4f8d2a';

function bridgeCredentials() {
  const baseUrl = String(process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/+$/, '');
  const token = String(process.env.WHATSAPP_BRIDGE_TOKEN || '');
  if (!baseUrl || !token) throw new Error('WhatsApp Gato não configurado.');
  return { baseUrl, token };
}

async function bridgeRequest(path, options = {}) {
  const { baseUrl, token } = bridgeCredentials();
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Falha ao consultar o WhatsApp Gato.');
  return data;
}

function html(body) {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconectar WhatsApp Gato</title><style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;min-height:100vh;display:grid;place-items:center;color:#111}.card{background:#fff;max-width:440px;width:calc(100% - 32px);padding:28px;border-radius:18px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center}img{width:min(320px,100%);height:auto}.ok{font-size:22px;font-weight:700;color:#128c7e}.muted{color:#666;line-height:1.5}</style></head><body><div class="card">${body}</div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== ACCESS_TOKEN) return new Response('Not found', { status: 404 });

  try {
    let status = await bridgeRequest('/status');
    if (!status?.connected && !status?.qrDataUrl) {
      status = await bridgeRequest('/connect', { method: 'POST', body: '{}' });
    }

    if (status?.connected) {
      return html('<div class="ok">WhatsApp Gato conectado ✅</div><p class="muted">Pode voltar para o ChatGPT. A conexão já está pronta.</p>');
    }

    if (status?.qrDataUrl) {
      return html('<h2>Reconectar WhatsApp Gato</h2><p class="muted">No celular do WhatsApp Gato, abra <b>Aparelhos conectados</b> e escaneie este QR.</p><img src="' + status.qrDataUrl + '" alt="QR Code"><p class="muted">Depois de escanear, atualize esta página. Quando aparecer “conectado”, pode voltar para o ChatGPT.</p>');
    }

    return html('<h2>QR ainda não disponível</h2><p class="muted">Atualize esta página em alguns segundos.</p>');
  } catch (error) {
    return html('<h2>Não consegui carregar o QR</h2><p class="muted">' + String(error?.message || 'Falha de conexão') + '</p>');
  }
}
