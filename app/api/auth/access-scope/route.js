import { getSupabaseAdmin } from '../../whatsapp/lib';
import { bearerToken, fail } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

export async function GET(request) {
  try {
    const db = getSupabaseAdmin();
    const { data: result, error: authError } = await db.auth.getUser(bearerToken(request));
    const user = result?.user;
    if (authError || !user?.id || user.is_anonymous) throw fail('Sessão inválida.', 401);

    // A staff membership always takes precedence over any legacy admin
    // state row. A future employee must never self-promote with local data.
    const {data:members,error:membersError} = await db.from('crm_organization_members')
      .select('organization_id,role,status').eq('user_id',user.id);
    if (membersError) throw fail('Não foi possível conferir sua equipe.',503);
    if (members?.length) {
      const {data:orgs,error:orgsError} = await db.from('crm_organizations')
        .select('id,workspace_code,owner_user_id')
        .in('id',members.map(member=>member.organization_id))
        .eq('workspace_code','vital-decor');
      if (orgsError) throw fail('Não foi possível conferir a empresa.',503);
      const membership=members.find(item=>(orgs||[]).some(org=>org.id===item.organization_id));
      const organization=(orgs||[]).find(org=>org.id===membership?.organization_id);
      if (membership && organization) {
        if (membership.status !== 'active') throw fail('Sua conta está suspensa.',403);
        if (['agent','supervisor'].includes(membership.role))
          return Response.json({scope:'staff',portalEnabled:true},{headers});
        if (membership.role==='installer')
          return Response.json({scope:'installer_pending',portalEnabled:false},{headers});
        if (membership.role==='owner' && organization.owner_user_id!==user.id)
          throw fail('Conta proprietária inválida.',403);
      }
    }

    // Preserve existing administrator access, and only that.
    const {data:adminState,error:adminError}=await db.from('content_items')
      .select('id').eq('title','__SOCIAL_HUB_STATE__')
      .eq('user_id',user.id).limit(1).maybeSingle();
    if (adminError) throw fail('Não foi possível verificar a conta administradora.',503);
    if (adminState) return Response.json({scope:'admin',portalEnabled:true},{headers});
    throw fail('Sua conta não possui acesso autorizado ao TidePlace.',403);
  } catch (e) {
    return Response.json({error:e.status?e.message:'Não foi possível validar seu login.'},
      {status:e.status||503,headers});
  }
}
