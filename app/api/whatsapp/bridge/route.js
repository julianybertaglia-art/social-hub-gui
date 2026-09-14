export const dynamic = 'force-dynamic';

function bridgeDisabled() {
  return Response.json({
    ok: false,
    provider: 'meta',
    state: 'disabled',
    error: 'A ponte antiga foi desvinculada. Use somente a conexão oficial da Meta.',
  }, { status: 410 });
}

export async function GET() {
  return bridgeDisabled();
}

export async function POST() {
  return bridgeDisabled();
}
