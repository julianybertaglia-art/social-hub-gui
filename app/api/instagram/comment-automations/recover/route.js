import crypto from 'node:crypto';
import { serverClient } from '../../audio-automation/service.js';
import { STATE_TITLE } from '../service.js';
import { instagramIdentity, recoverLatestMediaComments } from '../recovery.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AUDIENCE = 'social-hub-instagram-recovery';
const REPOSITORY = 'julianybertaglia-art/social-hub-gui';

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function verifyGitHubToken(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  const parts = token?.split('.') || [];
  if (parts.length !== 3) return false;

  let header;
  let claims;
  try {
    header = decodeJson(parts[0]);
    claims = decodeJson(parts[1]);
  } catch {
    return false;
  }
  if (header.alg !== 'RS256' || !header.kid) return false;

  const response = await fetch('https://token.actions.githubusercontent.com/.well-known/jwks', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return false;
  const jwks = await response.json();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return false;

  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return verified
    && claims.iss === 'https://token.actions.githubusercontent.com'
    && audiences.includes(AUDIENCE)
    && claims.repository === REPOSITORY
    && claims.ref === 'refs/heads/main'
    && ['push', 'schedule', 'workflow_dispatch'].includes(claims.event_name)
    && Number(claims.exp) > now
    && Number(claims.nbf || 0) <= now + 30;
}

export async function POST(request) {
  try {
    if (!await verifyGitHubToken(request)) {
      return Response.json({ ok: false, error: 'Não autorizado.' }, { status: 401 });
    }

    const db = serverClient();
    const { data: state, error } = await db.from('content_items')
      .select('user_id')
      .eq('title', STATE_TITLE)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !state?.user_id) throw error || new Error('Estado do Hub não encontrado.');

    const identity = await instagramIdentity();
    const recovery = await recoverLatestMediaComments(db, state.user_id, identity);
    console.info('AUTOMACAO:SCHEDULED_RECOVERY', recovery);
    return Response.json({ ok: true, recovery });
  } catch (error) {
    console.error('AUTOMACAO:SCHEDULED_RECOVERY: falha', error instanceof Error ? error.message : String(error));
    return Response.json({ ok: false, error: 'Não foi possível recuperar os comentários.' }, { status: 500 });
  }
}
