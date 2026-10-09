import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    const { data: connection, error: connError } = await db.from('workspace_meta_connections')
      .select('id').eq('owner_user_id', ownerId).eq('workspace_id', 'vital-decor')
      .eq('platform', 'whatsapp').maybeSingle();
    if (connError || !connection) throw fail('Conecte a conta Vital Decor.', 409);
    const { data, error } = await db.from('vital_whatsapp_affiliate_applications')
      .select('id,contact_wa_id,status,creator_name,email,city_state,tiktok_url,instagram_url,niche,followers,average_views,posts_per_week,brazil_audience_percent,affiliate_experience,sales_last_30d_range,sales_orders_last_30d,top_video_urls,score,qualification,submitted_at')
      .eq('connection_id', connection.id).eq('owner_user_id', ownerId)
      .order('created_at', { ascending: false }).limit(250);
    if (error) throw fail('Não foi possível consultar inscrições.', 503);
    return Response.json({ workspace: 'vital-decor', applications: data || [] }, { headers });
  } catch (e) {
    return Response.json({ error: e.status ? e.message : 'Falha ao carregar afiliados da Vital.' },
      { status: e.status || 503, headers });
  }
}
