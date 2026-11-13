import { authorize, APP_ID } from '../../service';
import { WHATSAPP_API_VERSION } from '../../../whatsapp/lib';
import { diagnoseVitalInstagram } from '../connection-diagnostic.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only the owner can request a diagnosis; this endpoint only performs GETs.
export async function GET(request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { db, ownerId } = await authorize(request);
    const { data, error } = await db.from('workspace_meta_connections')
      .select('workspace_id,platform,state,username,external_account_id,page_id,access_token,auth_provider,automatic_replies_enabled')
      .eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'instagram').maybeSingle();
    if (error) throw new Error('connection_lookup_failed');
    const diagnostic = await diagnoseVitalInstagram(data, {
      facebookAppId: APP_ID,
      instagramAppId: process.env.META_VITAL_IG_APP_ID,
      facebookApiVersion: WHATSAPP_API_VERSION,
    });
    return Response.json(diagnostic, { headers });
  } catch (error) {
    return Response.json({ error: error?.status === 401 || error?.status === 403
      ? 'Entre no TidePlace para verificar a conexão.'
      : 'Não foi possível verificar a conexão agora.' },
    { status: error?.status === 401 || error?.status === 403 ? error.status : 503, headers });
  }
}
