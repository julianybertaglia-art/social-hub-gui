import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../../whatsapp/lib.js';
import { fail } from '../../../vital-connections/helpers.mjs';

export const BRIDGE_WORKSPACE = 'vital-decor';
export const AGENTS = ['andrey','vitor'];
export const ASSIGNEES = ['tide',...AGENTS];
export const SECTORS = ['comercial_vital','bluetti','vtx','pos_venda','atacado','afiliados'];
export const HEADER_OPTIONS = { 'Cache-Control':'private, no-store', Vary:'Authorization' };

export function sectorFromStage(stage, selection) {
  if (stage === 'affiliate_form' || /Afiliado TikTok/i.test(selection || '')) return 'afiliados';
  if (/Pós-venda/i.test(selection || '')) return 'pos_venda';
  if (/Revenda/i.test(selection || '')) return 'atacado';
  if (/BLUETTI/i.test(selection || '')) return 'bluetti';
  if (/VTX/i.test(selection || '')) return 'vtx';
  return 'comercial_vital';
}
export function createBridgeSecret() {
  const prefix = crypto.randomBytes(5).toString('hex');
  const token = 'argo_v1_' + prefix + '_' + crypto.randomBytes(32).toString('base64url');
  return { prefix, token, digest:crypto.createHash('sha256').update(token).digest('hex') };
}
export function checkAgentTokenFormat(token) {
  return /^argo_v1_[a-f0-9]{10}_[A-Za-z0-9_-]{43}$/.test(token || '');
}
export function secureEqual(a,b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x,y);
}
export function readBridgeToken(request) {
  const raw = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] || '';
  if (!checkAgentTokenFormat(raw)) throw fail('Chave de integração ausente ou inválida.',401);
  return raw;
}
export async function authorizeAgent(request) {
  const token = readBridgeToken(request);
  const prefix = token.split('_')[2];
  const db = getSupabaseAdmin();
  const { data:key, error } = await db.from('vital_whatsapp_argo_keys')
    .select('id,connection_id,owner_user_id,agent,secret_hash,expires_at,revoked_at')
    .eq('prefix',prefix).maybeSingle();
  if (error) throw fail('Não foi possível validar o acesso ao Argo.',503);
  const actual = crypto.createHash('sha256').update(token).digest('hex');
  if (!key || !secureEqual(actual,key.secret_hash) || key.revoked_at ||
    !(new Date(key.expires_at).getTime() > Date.now())) throw fail('Chave revogada ou expirada.',401);
  const { data:connection, error:connError } = await db.from('workspace_meta_connections')
    .select('id,owner_user_id,state,workspace_id,platform,external_account_id,access_token')
    .eq('id',key.connection_id).eq('owner_user_id',key.owner_user_id)
    .eq('workspace_id',BRIDGE_WORKSPACE).eq('platform','whatsapp').eq('state','connected').maybeSingle();
  if (connError) throw fail('Falha ao verificar a conta Vital.',503);
  if (!connection) throw fail('WhatsApp Vital não está conectado.',409);
  return { db,connection,agent:key.agent,keyId:key.id,ownerId:key.owner_user_id };
}
export async function vitalConnection(db,ownerId) {
  const { data, error } = await db.from('workspace_meta_connections').select('id,owner_user_id,state')
    .eq('workspace_id',BRIDGE_WORKSPACE).eq('platform','whatsapp')
    .eq('owner_user_id',ownerId).eq('state','connected').maybeSingle();
  if(error) throw fail('Não foi possível consultar WhatsApp Vital.',503);
  if(!data)throw fail('WhatsApp Vital não conectado.',409);
  return data;
}
export async function assignedContact(ctx,phone) {
  if(!/^\d{8,15}$/.test(String(phone||''))) throw fail('Contato inválido.',400);
  const {data,error}=await ctx.db.from('vital_whatsapp_assignments')
    .select('contact_wa_id,sector,assigned_to,status,updated_at')
    .eq('connection_id',ctx.connection.id).eq('owner_user_id',ctx.ownerId)
    .eq('contact_wa_id',phone).eq('assigned_to',ctx.agent).neq('status','closed').maybeSingle();
  if(error)throw fail('Falha ao consultar conversa.',503);
  if(!data)throw fail('Conversa não atribuída a este atendente.',404);
  return data;
}
export function replyError(error) {
  return Response.json({error:error?.status?error.message:'Falha na integração Argo ↔ TidePlace.'},
    {status:error?.status||503,headers:HEADER_OPTIONS});
}
export function noCacheJson(body,status=200){return Response.json(body,{status,headers:HEADER_OPTIONS});}
export function requireSameOrigin(request) {
  const origin=request.headers.get('origin');
  const target=new URL(request.url);
  if(!origin||origin!==target.origin)throw fail('Origem não autorizada.',403);
}
export async function routeViviConversation(db,connection,contact,stage,selection) {
  if(!/^\d{8,15}$/.test(String(contact||'')))return;
  if(stage==='menu'){
    // A new MENU request returns the conversation to Tide triage, not to an old Argo assignee.
    const {error}=await db.from('vital_whatsapp_assignments').update({
      assigned_to:'tide',status:'closed',updated_at:new Date().toISOString()
    }).eq('connection_id',connection.id).eq('contact_wa_id',contact);
    if(error)throw error;
    return;
  }
  if(!['await_human','affiliate_form'].includes(stage))return;
  const sector=sectorFromStage(stage,selection);
  const {data:setting,error:settingErr}=await db.from('vital_whatsapp_sector_settings')
    .select('default_assignee').eq('connection_id',connection.id).eq('sector',sector).maybeSingle();
  if(settingErr)throw settingErr;
  const now=new Date().toISOString();
  const assignee=ASSIGNEES.includes(setting?.default_assignee)?setting.default_assignee:'tide';
  const {error}=await db.from('vital_whatsapp_assignments').upsert({
    connection_id:connection.id,owner_user_id:connection.owner_user_id,contact_wa_id:contact,
    sector,assigned_to:assignee,status:'open',updated_at:now,assigned_at:now,
  },{onConflict:'connection_id,contact_wa_id'});
  if(error)throw error;
}
