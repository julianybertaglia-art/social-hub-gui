import { authorize } from '../../vital-connections/service';
import { fail } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const BUCKET = 'vital-public-catalogs';
const CATALOG_PATH = 'bluetti/Catalogo_Vital_Decor_BLUETTI.pdf';
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
async function getConnection(db, ownerId) {
  const { data, error } = await db.from('workspace_meta_connections')
    .select('id,display_name,display_phone_number,state').eq('owner_user_id', ownerId)
    .eq('workspace_id', 'vital-decor').eq('platform', 'whatsapp').maybeSingle();
  if (error) throw fail('Falha ao consultar o WhatsApp da Vital.', 503);
  if (!data || data.state !== 'connected') throw fail('Conecte o WhatsApp da Vital Decor antes de ativar.', 409);
  return data;
}
async function config(db, connectionId) {
  const { data, error } = await db.from('vital_whatsapp_flow_configs')
    .select('enabled,bluetti_catalog_url,wholesale_catalog_url,updated_at')
    .eq('connection_id', connectionId).maybeSingle();
  if (error) throw fail('Falha ao consultar a Vivi.', 503);
  return data || { enabled: false, bluetti_catalog_url: null, wholesale_catalog_url: null };
}
async function update(db, connectionId, values) {
  const { error } = await db.from('vital_whatsapp_flow_configs')
    .upsert({ connection_id: connectionId, ...values, updated_at: new Date().toISOString() },
      { onConflict: 'connection_id' });
  if (error) throw fail('Falha ao salvar configuração da Vivi.', 503);
}
function checkOrigin(request) {
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  const host = request.headers.get('host');
  const expected = host ? requestUrl.protocol + '//' + host : requestUrl.origin;
  if (!origin || (origin !== requestUrl.origin && origin !== expected)) throw fail('Origem não autorizada.', 403);
}
async function catalogExists(db) {
  const { data, error } = await db.storage.from(BUCKET)
    .list('bluetti', { search: 'Catalogo_Vital_Decor_BLUETTI.pdf', limit: 10 });
  if (error) throw fail('Não foi possível verificar o catálogo enviado.', 503);
  return Boolean((data || []).some(f => f.name === 'Catalogo_Vital_Decor_BLUETTI.pdf' && f.id));
}

export async function GET(request) {
  try {
    const { db, ownerId } = await authorize(request);
    const connection = await getConnection(db, ownerId);
    const setting = await config(db, connection.id);
    return Response.json({ workspace: 'vital-decor', connected: true,
      enabled: setting.enabled, bluettiCatalogReady: Boolean(setting.bluetti_catalog_url),
      wholesaleCatalogReady: Boolean(setting.wholesale_catalog_url), phone: connection.display_phone_number,
    }, { headers });
  } catch (e) {
    return Response.json({ error: e.status ? e.message : 'Falha ao verificar automações.' },
      { status: e.status || 503, headers });
  }
}
export async function POST(request) {
  try {
    checkOrigin(request);
    const { db, ownerId } = await authorize(request);
    const connection = await getConnection(db, ownerId);
    const body = await request.json();
    const action = body?.action;
    if (action === 'prepare_bluetti_catalog') {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0 || size > 16000000 || body.mimeType !== 'application/pdf') {
        throw fail('Envie um catálogo PDF de até 16 MB.', 400);
      }
      const { data, error } = await db.storage.from(BUCKET)
        .createSignedUploadUrl(CATALOG_PATH, { upsert: true });
      if (error || !data?.token) throw fail('Não foi possível iniciar o envio do catálogo.', 503);
      return Response.json({ bucket: BUCKET, path: CATALOG_PATH, token: data.token },
        { headers });
    }
    if (action === 'confirm_bluetti_catalog') {
      if (!await catalogExists(db)) throw fail('O arquivo ainda não apareceu no armazenamento.', 409);
      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(CATALOG_PATH);
      const url = urlData?.publicUrl;
      if (!url?.startsWith('https://')) throw fail('Não foi possível gerar um link público do catálogo.', 503);
      // Activates only after the PDF is safely hosted.
      await update(db, connection.id, { enabled: true, bluetti_catalog_url: url });
      return Response.json({ ok: true, enabled: true, bluettiCatalogReady: true }, { headers });
    }
    if (action === 'pause' || action === 'activate') {
      const current = await config(db, connection.id);
      if (action === 'activate' && (!current.bluetti_catalog_url || !await catalogExists(db))) {
        throw fail('Envie o PDF BLUETTI antes de ativar a Vivi.', 409);
      }
      await update(db, connection.id, { enabled: action === 'activate' });
      return Response.json({ ok: true, enabled: action === 'activate' }, { headers });
    }
    throw fail('Ação inválida.', 400);
  } catch (e) {
    return Response.json({ error: e.status ? e.message : 'Falha ao configurar a Vivi.' },
      { status: e.status || 503, headers });
  }
}
