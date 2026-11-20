import {verifyNuvemshopSignature,parseNuvemshopOrderEvent,readNuvemshopOrder,notificationFromVerifiedOrder,notificationIdempotencyKey} from '../../../../lib/server/vital-order-preflight.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// A safe webhook rehearsal endpoint: does not persist events, does not send messages,
// and must not be subscribed until the partner app secret and signatures are verified.
export async function POST(request){
 const secret=process.env.NUVEMSHOP_VITAL_APP_CLIENT_SECRET;
 const token=process.env.NUVEMSHOP_VITAL_ACCESS_TOKEN;
 const storeId=process.env.NUVEMSHOP_VITAL_STORE_ID;
 // This endpoint is intentionally unavailable until partner credentials are configured.
 if(!secret||!token||!storeId)return reply({status:'disabled'},503);
 try{
  if(Number(request.headers.get('content-length')||0)>10000)return reply({error:'payload_too_large'},413);
  const raw=await request.text();
  if(raw.length>10000)return reply({error:'payload_too_large'},413);
  const signature=request.headers.get('x-linkedstore-hmac-sha256');
  if(!verifyNuvemshopSignature(raw,signature,secret))return reply({error:'invalid_signature'},401);
  let payload;try{payload=JSON.parse(raw)}catch{return reply({error:'invalid_payload'},400)}
  const event=parseNuvemshopOrderEvent(payload,storeId);
  if(!event.valid)return reply({status:'ignored',reason:event.reason},200);
  const order=await readNuvemshopOrder({storeId:event.storeId,orderId:event.orderId,token});
  const notice=notificationFromVerifiedOrder({event:event.event,order});
  const key=notice.eligible?notificationIdempotencyKey({storeId:event.storeId,orderId:event.orderId,stage:notice.stage}):null;
  // No phone, addresses, identifiers, tokens, or message bodies returned to webhook sender.
  // Real dispatch needs a persisted idempotency ledger, opt-in, template approval, and cost review.
  return reply({status:'dry_run',eligible:notice.eligible,stage:notice.stage||null,
   reason:notice.reason||null,dedupeKey:key});
 }catch{
  return reply({error:'verification_unavailable'},503);
 }
}
