export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// redeploy-ai-gateway

export async function GET() {
  const token = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
  if (!token) {
    return Response.json({
      ok: false,
      auth: false,
      hasAiGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
      hasVercelOidc: Boolean(process.env.VERCEL_OIDC_TOKEN),
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      error: 'AI Gateway sem credencial.'
    }, { status: 503 });
  }

  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.5',
        messages: [
          { role: 'system', content: 'Responda somente com a palavra OK.' },
          { role: 'user', content: 'Teste de conexão.' },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    return Response.json({
      ok: response.ok,
      auth: true,
      status: response.status,
      model: payload?.model || null,
      answer: payload?.choices?.[0]?.message?.content || null,
      error: payload?.error?.message || null,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return Response.json({ ok: false, auth: true, error: error?.message || 'Falha no teste.' }, { status: 500 });
  }
}
