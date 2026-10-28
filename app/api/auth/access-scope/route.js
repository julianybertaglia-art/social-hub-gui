import { getSupabaseAdmin } from '../../whatsapp/lib';
import { bearerToken, fail } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

// The client never decides whether it is admin. This endpoint is the single
// session-scope preflight before rendering/syncing the legacy admin console.
export async function GET(request) {
  try {
    const db = getSupabaseAdmin();
    const token = bearerToken(request);
    const { data: session, error } = await db.auth.getUser(token);
    const user = session?.user;
    if (error || !user?.id || user.is_anonymous) throw fail('Sessão inválida.', 401);

    // Existing admin accounts retain the behavior they already have. Regular
    // employees have no SOCIAL_HUB_STATE row and cannot create one through RLS.
    const { data: adminState, error: adminError } = await db.from('content_items')
      .select('id').eq('title', '__SOCIAL_HUB_STATE__')
      .eq('user_id', user.id).limit(1).maybeSingle();
    if (adminError) throw fail('Não foi possível verificar a conta administradora.', 503);
    if (adminState) return Response.json({ scope: 'admin', portalEnabled: true }, { headers });

    const { data: members, error: memberError } = await db.from('crm_organization_members')
      .select('organization_id,role,status').eq('user_id', user.id).eq('status', 'active');
    if (memberError) throw fail('Não foi possível verificar as permissões.', 503);
    if (!members?.length) throw fail('Você não possui acesso autorizado ao TidePlace.', 403);

    const { data: orgs, error: orgError } = await db.from('crm_organizations')
      .select('id,workspace_code').in('id', members.map(item => item.organization_id))
      .eq('workspace_code', 'vital-decor');
    if (orgError) throw fail('Não foi possível verificar a empresa.', 503);
    const member = members.find(item => orgs?.some(org => org.id === item.organization_id));
    if (!member || !['supervisor', 'agent', 'installer'].includes(member.role))
      throw fail('Acesso não autorizado.', 403);

    // Until appointment-scoped APIs exist, installers have no portal access.
    if (member.role === 'installer')
      return Response.json({ scope: 'installer_pending', portalEnabled: false }, { headers });
    return Response.json({ scope: 'staff', portalEnabled: true }, { headers });
  } catch (e) {
    return Response.json({ error: e.status ? e.message : 'Não foi possível validar seu login.' },
      { status: e.status || 503, headers });
  }
}
