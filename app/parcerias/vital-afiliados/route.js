import { getSupabaseAdmin } from '../../api/whatsapp/lib.js';
import { influencerFormHtml } from '../vital-influenciadores/html.js';
import { validateInfluencerApplication } from '../vital-influenciadores/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TABLE = 'vital_whatsapp_affiliate_applications';
const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
function html(opts, status = 200) {
  return new Response(influencerFormHtml(opts), { status, headers: HEADERS });
}
async function linkedApplication(db, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token || ''))) return null;
  const { data, error } = await db.from(TABLE)
    .select('id,public_token,status,connection_id,owner_user_id,contact_wa_id')
    .eq('public_token', token).maybeSingle();
  if (error) throw new Error('Falha ao consultar inscrição');
  return data || null;
}
export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    const app = await linkedApplication(getSupabaseAdmin(), token);
    if (!app) return html({ token: '', error: 'Seu link é inválido. Solicite um novo link no WhatsApp da Vital Decor.' }, 404);
    return html({ token, alreadySubmitted: app.status === 'submitted' });
  } catch {
    return html({ error: 'Formulário temporariamente indisponível.' }, 503);
  }
}
export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null' && origin !== new URL(request.url).origin)
    return html({ error: 'Origem não autorizada.' }, 403);
  const type = String(request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return html({ error: 'Envie pelo formulário.' }, 415);
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 4400000) return html({ error: 'Print de vendas acima do tamanho permitido (4 MB).' }, 413);
  let form = {};
  try {
    form = Object.fromEntries((await request.formData()).entries());
    if (form.company_site) return html({ success: true });
    const db = getSupabaseAdmin();
    const record = await linkedApplication(db, form.token);
    if (!record) return html({ error: 'Link inválido. Solicite outro no WhatsApp.' }, 404);
    if (record.status === 'submitted') return html({ alreadySubmitted: true });
    const v = validateInfluencerApplication(form);
    let proofPath = null;
    if (v.salesProof) {
      const extension = v.salesProof.type === 'image/png' ? 'png' : v.salesProof.type === 'image/webp' ? 'webp' : 'jpg';
      proofPath = 'vivi-' + record.id + '/' + Date.now() + '.' + extension;
      const { error: uploadError } = await db.storage.from('influencer-sales-proof')
        .upload(proofPath, new Uint8Array(await v.salesProof.arrayBuffer()), {
          contentType: v.salesProof.type, upsert: false,
        });
      if (uploadError) throw new Error('Não foi possível salvar seu print. Tente novamente.');
    }
    const now = new Date().toISOString();
    const { error: saveError } = await db.from(TABLE).update({
      creator_name: v.creatorName, email: v.email, city_state: v.cityState,
      tiktok_url: v.tiktokUrl, instagram_url: v.instagramUrl, niche: v.niche,
      followers: v.followers, average_views: v.averageViews, average_likes: v.averageLikes,
      average_comments: v.averageComments, posts_per_week: v.postsPerWeek,
      brazil_audience_percent: v.brazilAudiencePercent,
      affiliate_experience: v.affiliateExperience,
      live_experience: v.liveExperience,
      sales_last_30d_range: v.salesLast30dRange,
      sales_orders_last_30d: v.salesOrdersLast30d,
      sales_proof_path: proofPath, sales_proof_uploaded_at: proofPath ? now : null,
      top_video_urls: v.topVideoUrls, score: v.score, qualification: v.classification,
      status: 'submitted', submitted_at: now, updated_at: now,
    }).eq('id', record.id).eq('connection_id', record.connection_id).eq('status', 'pending');
    if (saveError) throw new Error('Falha ao salvar inscrição. Tente novamente.');
    // No Gui Nonato contact or sender is touched.
    return html({ success: true });
  } catch (error) {
    return html({ token: String(form.token || ''), values: {
      ...form, salesProof: undefined,
    }, error: error?.status ? error.message : String(error?.message || 'Falha no formulário.') }, error?.status || 503);
  }
}
