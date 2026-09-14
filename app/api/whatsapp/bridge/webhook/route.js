export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return Response.json({
    ok: false,
    provider: 'meta',
    state: 'disabled',
    error: 'O webhook da ponte antiga foi desativado.',
  }, { status: 410 });
}
