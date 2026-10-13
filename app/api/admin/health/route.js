import { getSupabaseAdmin, getMetaCredentials, WHATSAPP_API_VERSION, isWhatsAppCoexistenceReady } from '../../whatsapp/lib';
import { bearerToken, connectionOwner } from '../../vital-connections/helpers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noCache = { 'Cache-Control': 'private, no-store, max-age=0' };
const now = () => new Date().toISOString();
const cutoff = (hours) => Date.now() - hours * 3600000;

function node(id, workspace, name, group, status, detail, action, href, extra = {}) {
  return { id, workspace, name, group, status, detail, action, href, ...extra };
}

function apiProblem(error) {
  const code = Number(error?.code || error?.status || 0);
  if (code === 190 || code === 401) return 'offline';
  if (code === 10 || code === 200 || code === 403) return 'warning';
  return 'unknown'; // timeout, rate limit and outage are NOT proof of disconnection
}

async function graph(host, path, token) {
  const response = await fetch('https://' + host + '/' + WHATSAPP_API_VERSION + '/' + path, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(9000),
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    const error = new Error('Não foi possível confirmar a comunicação com a Meta.');
    error.code = Number(json?.error?.code || response.status);
    error.status = response.status;
    throw error;
  }
  return json;
}

async function guiInstagram() {
  const token = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  const href = '/automacoes';
  if (!token) return [
    node('gui-instagram', 'gui', 'Instagram @gui_nonato', 'Meta', 'offline',
      'Credencial do Instagram não configurada.', 'Reconectar a conta Instagram na Meta.', href),
    node('gui-direct', 'gui', 'Webhooks do Instagram', 'Automações', 'unknown',
      'Sem autenticação para consultar assinaturas de comentários e Direct.', 'Corrigir primeiro o acesso ao Instagram.', href),
  ];
  let profile;
  try {
    profile = await graph('graph.instagram.com', 'me?fields=user_id,username', token);
  } catch (error) {
    const status = apiProblem(error);
    return [
      node('gui-instagram', 'gui', 'Instagram @gui_nonato', 'Meta', status,
        status === 'offline' ? 'A Meta rejeitou a credencial do Instagram.' : 'A Meta não confirmou a autenticação agora.',
        'Revisar autorização e permissões da Meta.', href),
      node('gui-direct', 'gui', 'Webhooks do Instagram', 'Automações', 'unknown',
        'Não foi possível validar assinaturas sem autenticação confirmada.', 'Verificar conexão do Instagram.', href),
    ];
  }
  const username = String(profile.username || '').toLowerCase();
  const correct = username === 'gui_nonato';
  let subscription;
  try {
    const id = String(profile.user_id || profile.id || '');
    if (!/^\d{5,40}$/.test(id)) throw new Error('Identificador inválido');
    const result = await graph('graph.instagram.com', id + '/subscribed_apps', token);
    const fields = (result.data || []).flatMap((entry) => entry.subscribed_fields || []);
    subscription = ['comments', 'messages', 'messaging_postbacks'].every((field) => fields.includes(field));
  } catch {
    subscription = null;
  }
  return [
    node('gui-instagram', 'gui', 'Instagram @gui_nonato', 'Meta', correct ? 'online' : 'warning',
      correct ? 'Autenticação confirmada para @gui_nonato.' : 'O token autenticou outra conta: @' + (username || 'desconhecida') + '.',
      correct ? 'Abrir automações do Instagram.' : 'Reconectar o perfil correto.', href),
    node('gui-direct', 'gui', 'Comentários e Direct', 'Automações',
      subscription === true ? 'online' : subscription === false ? 'warning' : 'unknown',
      subscription === true ? 'Assinaturas de comentários, mensagens e botões confirmadas. Isso não comprova que cada resposta foi entregue.' :
      subscription === false ? 'Há assinaturas de eventos da Meta ausentes.' : 'Não foi possível confirmar as assinaturas dos eventos.',
      'Conferir permissões e testar uma mensagem real.', href),
  ];
}

async function guiWhatsApp() {
  const href = '/whatsapp/conectar';
  let meta;
  try { meta = await getMetaCredentials(); } catch { meta = null; }
  if (!meta?.accessToken || !meta?.phoneNumberId) return [
    node('gui-whatsapp', 'gui', 'WhatsApp de atendimento', 'Meta', 'offline',
      'Número ou autorização oficial ausente.', 'Conectar novamente o WhatsApp pela Meta.', href),
    node('gui-wa-webhook', 'gui', 'Webhook WhatsApp', 'Automações', 'unknown',
      'Não é possível verificar eventos sem a conexão principal.', 'Reconectar o WhatsApp.', href),
  ];
  const appSecret = Boolean(process.env.META_WHATSAPP_APP_SECRET || process.env.META_APP_SECRET);
  const verifyToken = Boolean(process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN);
  let phone;
  try {
    phone = await graph('graph.facebook.com',
      encodeURIComponent(meta.phoneNumberId) + '?fields=id,display_phone_number,verified_name,status,is_on_biz_app,platform_type',
      meta.accessToken);
  } catch (error) {
    const status = apiProblem(error);
    return [
      node('gui-whatsapp', 'gui', 'WhatsApp de atendimento', 'Meta', status,
        status === 'offline' ? 'A Meta rejeitou a autorização do WhatsApp.' : 'A Meta não confirmou o estado do número agora.',
        'Conferir a autorização oficial e a coexistência.', href),
      node('gui-wa-webhook', 'gui', 'Webhook WhatsApp', 'Automações', 'unknown',
        'Sem confirmação de acesso ao número.', 'Verificar conexão antes de testar automações.', '/whatsapp/diagnostico'),
    ];
  }
  const coexistenceReady = isWhatsAppCoexistenceReady(phone);
  let subscribed = null;
  if (meta.wabaId) {
    try {
      const response = await graph('graph.facebook.com', encodeURIComponent(meta.wabaId) + '/subscribed_apps', meta.accessToken);
      subscribed = (response.data || []).length > 0;
    } catch { subscribed = null; }
  }
  const webhookStatus = !appSecret || !verifyToken ? 'warning' : subscribed === true ? 'online' : subscribed === false ? 'warning' : 'unknown';
  return [
    node('gui-whatsapp', 'gui', 'WhatsApp de atendimento', 'Meta', coexistenceReady ? 'online' : 'offline',
      coexistenceReady ? 'Número ' + (phone.display_phone_number || meta.displayPhoneNumber || '') + ' com Cloud API e coexistência confirmadas.' :
        'O número respondeu pela Meta, mas a coexistência com WhatsApp Business não está pronta.',
      coexistenceReady ? 'Abrir CRM.' : 'Reconectar a coexistência oficial sem apagar o número.', coexistenceReady ? '/whatsapp' : href),
    node('gui-wa-webhook', 'gui', 'Webhook WhatsApp', 'Automações', webhookStatus,
      !appSecret || !verifyToken ? 'Chave de verificação ou segredo do aplicativo está ausente.' :
        subscribed === true ? 'Aplicativo inscrito para receber eventos. A entrega de mensagens exige teste adicional.' :
        subscribed === false ? 'Nenhuma assinatura do aplicativo encontrada na WABA.' : 'Não foi possível verificar as assinaturas da WABA.',
      'Revisar webhook e assinaturas na Meta.', '/whatsapp/diagnostico'),
  ];
}

async function vitalConnections(db, ownerId) {
  const href = '/conexoes/vital-decor';
  const { data, error } = await db.from('workspace_meta_connections')
    .select('platform,external_account_id,access_token,username,display_name,display_phone_number,state')
    .eq('workspace_id', 'vital-decor').eq('owner_user_id', ownerId);
  if (error) return ['instagram', 'whatsapp'].map((platform) => node(
    'vital-' + platform, 'vital', platform === 'instagram' ? 'Instagram Vital Decor' : 'WhatsApp Vital Decor',
    'Meta', 'unknown', 'A consulta das conexões não respondeu.', 'Abrir painel da Vital Decor.', href,
  ));
  return Promise.all(['instagram', 'whatsapp'].map(async (platform) => {
    const row = (data || []).find((item) => item.platform === platform);
    const name = platform === 'instagram' ? 'Instagram Vital Decor' : 'WhatsApp Vital Decor';
    if (!row) return node('vital-' + platform, 'vital', name, 'Meta', 'warning',
      'Esta conta ainda não foi vinculada ao workspace.', 'Conectar pela Meta.', href);
    if (row.state !== 'connected') return node('vital-' + platform, 'vital', name, 'Meta', 'warning',
      'Autorização pendente na plataforma.', 'Concluir a autorização oficial.', href);
    try {
      const fields = platform === 'instagram' ? 'id,username' : 'id,display_phone_number,verified_name,status';
      const data = await graph('graph.facebook.com', encodeURIComponent(row.external_account_id) + '?fields=' + fields, row.access_token);
      const matches = String(data.id || '') === String(row.external_account_id);
      const active = platform === 'whatsapp' ? ['CONNECTED', 'APPROVED'].includes(String(data.status || '').toUpperCase()) : matches;
      return node('vital-' + platform, 'vital', name, 'Meta', matches && active ? 'online' : 'warning',
        matches && active ? 'Credenciais válidas para ' + (row.username ? '@' + row.username : row.display_phone_number || row.display_name || name) + '.' :
          'A Meta respondeu, mas não confirmou o status esperado da conta.',
        'Revisar dados e permissões da conexão.', href);
    } catch (error) {
      const status = apiProblem(error);
      return node('vital-' + platform, 'vital', name, 'Meta', status,
        status === 'offline' ? 'Token expirado ou rejeitado pela Meta.' : 'Não foi possível confirmar esta conexão agora.',
        'Reautorizar a conta se o problema persistir.', href);
    }
  }));
}

async function automationChecks(db, ownerId) {
  const [waEvents, igEvents, ingress] = await Promise.all([
    db.from('whatsapp_automation_events').select('status,error_message,created_at,processed_at')
      .order('created_at', { ascending: false }).limit(1),
    db.from('instagram_automation_events').select('public_status,private_status,created_at')
      .order('created_at', { ascending: false }).limit(1),
    db.from('instagram_webhook_ingress').select('created_at,signature_valid')
      .order('created_at', { ascending: false }).limit(1),
  ]);
  const w = waEvents.data?.[0];
  const i = igEvents.data?.[0];
  const ingressLatest = ingress.data?.[0];
  const recentWa = w && Date.parse(w.created_at || w.processed_at || '') >= cutoff(24);
  const failedWa = recentWa && /error|fail|failed/i.test(String(w.status || ''));
  const failedIg = i && Date.parse(i.created_at || '') >= cutoff(24)
    && /error|fail|failed/i.test([i.public_status, i.private_status].join(' '));
  return [
    node('gui-wa-automation', 'gui', 'Fluxos e menu WhatsApp', 'Automações',
      waEvents.error ? 'unknown' : failedWa ? 'warning' : 'unknown',
      waEvents.error ? 'Não foi possível consultar os registros de automação.' :
      failedWa ? 'O último processamento registrou um erro. Verifique o atendimento.' :
      w ? 'Último evento registrado: ' + (w.status || 'sem status') + '. É necessário testar o menu para confirmar o funcionamento atual.' :
      'Nenhum processamento registrado para confirmar o funcionamento.',
      'Conferir logs e enviar uma mensagem de teste.', '/whatsapp/automacoes',
      { lastEventAt: w?.created_at || null }),
    node('gui-ig-automation', 'gui', 'Respostas automáticas Instagram', 'Automações',
      igEvents.error ? 'unknown' : failedIg ? 'warning' : 'unknown',
      igEvents.error ? 'Não foi possível consultar os registros das respostas.' :
      failedIg ? 'Uma resposta recente apresentou erro.' :
      i ? 'Existem registros de respostas, mas é preciso testar um comentário e um Direct para confirmar novas entregas.' :
      'Não há registros suficientes para comprovar novas entregas.',
      'Testar comentário e Direct no Instagram.', '/automacoes',
      { lastEventAt: i?.created_at || null }),
    node('gui-ig-ingress', 'gui', 'Recebimento de eventos Instagram', 'Webhook',
      ingress.error ? 'unknown' : ingressLatest?.signature_valid === false && Date.parse(ingressLatest.created_at || '') >= cutoff(24) ? 'warning' : 'unknown',
      ingress.error ? 'Não foi possível conferir os registros de entrada.' :
      ingressLatest ? 'Último webhook recebido: ' + new Date(ingressLatest.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Ausência de novos eventos não comprova falha.' :
      'Nenhum evento de entrada encontrado. Um teste real é necessário.',
      'Verificar entrega no painel da Meta.', '/automacoes',
      { lastEventAt: ingressLatest?.created_at || null }),
  ];
}

async function argoCheck(db, ownerId) {
  const result = await db.from('vital_whatsapp_argo_keys')
    .select('agent,expires_at,revoked_at,last_used_at')
    .eq('owner_user_id', ownerId).is('revoked_at', null).gt('expires_at', now()).limit(10);
  if (result.error) return node('vital-argo', 'vital', 'Integração Argo', 'Integrações', 'unknown',
    'Não foi possível verificar as chaves de integração.', 'Abrir configuração do Argo.', '/whatsapp/integracao-argo');
  const keys = result.data || [];
  const latest = keys.map((entry) => Date.parse(entry.last_used_at || '')).filter(Number.isFinite);
  return node('vital-argo', 'vital', 'Integração Argo', 'Integrações',
    keys.length ? 'unknown' : 'warning',
    keys.length ? keys.length + ' chave(s) ativa(s). Isso confirma a autorização, não a disponibilidade do Argo.' :
      'Não há chaves ativas para conectar agentes ao Argo.',
    'Verificar conexões e executar teste de comunicação.', '/whatsapp/integracao-argo',
    { lastEventAt: latest.length ? new Date(Math.max(...latest)).toISOString() : null });
}

async function aiCheck(db) {
  const result = await db.from('whatsapp_ai_agents')
    .select('mode,updated_at').neq('mode', 'off').order('updated_at', { ascending: false }).limit(1);
  const credential = Boolean(process.env.GEMINI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  if (result.error) return node('gui-ai', 'gui', 'Assistente de IA', 'IA', 'unknown',
    'Não foi possível verificar a configuração do agente.', 'Abrir automações do WhatsApp.', '/whatsapp/automacoes');
  if (!(result.data || []).length) return node('gui-ai', 'gui', 'Assistente de IA', 'IA', 'paused',
    'Nenhum agente de IA ativo. Pode ser uma pausa intencional.', 'Revisar modo de atendimento.', '/whatsapp/automacoes');
  return node('gui-ai', 'gui', 'Assistente de IA', 'IA', credential ? 'unknown' : 'warning',
    credential ? 'Agente ativo e credencial configurada; funcionamento real ainda não testado.' :
      'Agente ativo, mas sem credencial de provedor configurada.',
    'Executar teste no diagnóstico de IA.', '/whatsapp/automacoes');
}

export async function GET(request) {
  try {
    const db = getSupabaseAdmin();
    const ownerId = await connectionOwner(db, bearerToken(request));
    const calls = await Promise.allSettled([
      guiInstagram(), guiWhatsApp(), vitalConnections(db, ownerId),
      automationChecks(db, ownerId), argoCheck(db, ownerId), aiCheck(db),
    ]);
    const fallback = (id) => node(id, 'system', 'Verificação indisponível', 'Sistema', 'unknown',
      'Não foi possível concluir esta verificação.', 'Atualize a página para tentar novamente.', '/admin/conexoes');
    const nodes = calls.flatMap((r, index) => r.status === 'fulfilled'
      ? (Array.isArray(r.value) ? r.value : [r.value]) : [fallback('check-' + index)]);
    nodes.unshift(node('tideplace', 'system', 'TidePlace · Hub', 'Sistema', 'online',
      'API do Hub respondeu e sua sessão foi validada no banco de dados.',
      'Você está na Central de Controle.', '/admin/conexoes'));
    return Response.json({ ok: true, checkedAt: now(), nodes, mode: 'live_on_visit',
      caveat: 'Autenticação e assinaturas não garantem entrega. Fluxos precisam de mensagens de teste.' }, { headers: noCache });
  } catch (error) {
    const status = Number(error?.status) || (String(error?.message || '').includes('Supabase') ? 503 : 500);
    return Response.json({ ok: false, error: status === 401 || status === 403 ? error.message :
      'Não foi possível consultar a saúde do Hub. Verifique sua sessão e o banco de dados.' }, { status, headers: noCache });
  }
}
