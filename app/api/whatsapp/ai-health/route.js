import { classifyBeginner } from '../beginner-flow.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// redeploy-gemini-main
// health-check-gemini-ready

export async function GET(request) {
  // Static synthetic probe only: no lead data, contacts or WhatsApp sends.
  if (request && new URL(request.url).searchParams.get('flow') === 'beginner') {
    try {
      const result = await classifyBeginner('Equipe: Você está começando do zero ou já tentou vender?\nLead: Nunca vendi e ainda estou procurando um produto para começar.');
      const ok = result.intent === 'answer' && result.profile === 'zero' && result.product === 'searching' && result.confidence >= 0.8;
      return Response.json({ ok, flow: 'beginner', classification: result }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ ok: false, flow: 'beginner', error: 'A classificação não está disponível; o fluxo encaminha para atendimento humano.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();

  if (geminiKey) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': geminiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Responda somente OK.' }] }],
            generationConfig: { maxOutputTokens: 20, thinkingConfig: { thinkingLevel: 'low' } },
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20000),
        }
      );
      const payload = await response.json().catch(() => ({}));
      return Response.json({
        ok: response.ok,
        provider: 'gemini',
        auth: true,
        status: response.status,
        answer: payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || null,
        error: payload?.error?.message || null,
      }, { status: response.ok ? 200 : 502 });
    } catch (error) {
      return Response.json({ ok: false, provider: 'gemini', auth: true, error: error?.message || 'Falha no teste.' }, { status: 500 });
    }
  }

  const token = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
  if (!token) {
    return Response.json({
      ok: false,
      auth: false,
      provider: null,
      hasGeminiKey: false,
      hasAiGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
      hasVercelOidc: Boolean(process.env.VERCEL_OIDC_TOKEN),
      error: 'Nenhum provedor de IA configurado.'
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
      provider: 'vercel',
      auth: true,
      status: response.status,
      answer: payload?.choices?.[0]?.message?.content || null,
      error: payload?.error?.message || null,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return Response.json({ ok: false, provider: 'vercel', auth: true, error: error?.message || 'Falha no teste.' }, { status: 500 });
  }
}
