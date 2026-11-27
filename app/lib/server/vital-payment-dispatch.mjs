import {createHash} from 'node:crypto';
import {recoveryPlan,recoveryMessage} from './vital-payment-recovery.mjs';

export async function dispatchRecoveryEmail({db,organizationId,storeId,orderId,readOrder,sendEmail,now=Date.now,enabled=false}){
 if(!enabled)return {state:'disabled'};
 const identity={organization_id:organizationId,store_id:String(storeId),order_id:String(orderId),stage:'pending_email'};
 const eligible=order=>String(order?.id)===String(orderId)&&recoveryPlan(order,now()).some(s=>s.channel==='email'&&s.due);
 let order=await readOrder();
 const address=o=>String(o?.contact_email||o?.customer?.email||'').trim();
 if(!eligible(order)||!/^\S+@\S+\.\S+$/.test(address(order)))return {state:'ineligible'};
 const {error}=await db.from('crm_vital_payment_recovery').insert({...identity,state:'sending'});
 if(error?.code==='23505')return {state:'duplicate'};
 if(error)throw Error('ledger_unavailable');
 const finish=async(state,id=null)=>{
  const result=await db.from('crm_vital_payment_recovery').update({state,provider_message_id:id,updated_at:new Date(now()).toISOString()}).match(identity).eq('state','sending').select('state').single();
  if(result.error||result.data?.state!==state)throw Error('ledger_update_unavailable');
  return {state};
 };
 // Re-fetch after claiming to avoid sending stale payment requests.
 try{order=await readOrder()}catch{return finish('uncertain')}
 if(!eligible(order)||!/^\S+@\S+\.\S+$/.test(address(order)))return finish('skipped');
 const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
 let receipt;
 try{receipt=await sendEmail({to:address(order),...recoveryMessage(order),key})}
 catch{return finish('uncertain')}
 if(!receipt?.id)return finish('uncertain');
 return finish('sent',String(receipt.id));
}

export function resendAdapter({apiKey,from,fetcher=fetch}){
 if(!apiKey||!/^Vital Decor <atendimento@vitaldecor\.com\.br>$/.test(from||''))throw Error('email_not_configured');
 return async ({to,subject,text,key})=>{
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from,to:[to],subject,text,reply_to:'atendimento@vitaldecor.com.br'}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('email_unconfirmed');
  const data=await response.json();
  if(!data?.id)throw Error('email_unconfirmed');
  return {id:data.id};
 };
}
