/**
 * Copiar este arquivo para o BACKEND do Argo (Node.js 18+).
 * Nunca importar do frontend: os tokens ficam em variáveis de ambiente do Argo.
 * O Argo deve usar seu login real para decidir qual atendente é o solicitante.
 */
export function createTidePlaceVitalClient({ agent, token, baseUrl='https://social-hub-gui.vercel.app' }) {
  if(!['andrey','vitor'].includes(agent))throw new Error('Agente inválido');
  if(!token||!token.startsWith('argo_v1_'))throw new Error('Credencial Argo ausente');
  const origin=new URL(baseUrl);
  if(origin.protocol!=='https:')throw new Error('Use HTTPS para a integração');
  const endpoint=origin.origin+'/api/integrations/argo/v1';

  async function call(path,{method='GET',body,idempotencyKey}={}){
    const headers={Authorization:'Bearer '+token,Accept:'application/json'};
    if(body)headers['Content-Type']='application/json';
    if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
    const result=await fetch(endpoint+path,{
      method,headers, ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(20000),cache:'no-store'
    });
    const payload=await result.json().catch(()=>({}));
    if(!result.ok){
      const error=new Error(payload.error||'Erro API TidePlace: '+result.status);
      error.status=result.status;
      error.details=payload;
      throw error;
    }
    return payload;
  }

  const safePhone=phone=>{
    const digits=String(phone||'');
    if(!/^\d{8,15}$/.test(digits))throw new Error('WhatsApp inválido. Utilize DDI+DDD+número.');
    return digits;
  };
  return Object.freeze({
    agent,
    health:()=>call('/health'),
    list:({page=1,limit=30}={})=>call('/conversations?page='+Number(page)+'&limit='+Number(limit)),
    history:(phone,{after,limit=100}={})=>
      call('/conversations/'+safePhone(phone)+'/messages?limit='+Number(limit)+
        (after?'&after='+encodeURIComponent(after):'')),
    reply:(phone,text,idempotencyKey)=>{
      if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(idempotencyKey||'')))
        throw new Error('Informe um Idempotency-Key único e persistente para cada mensagem.');
      return call('/conversations/'+safePhone(phone)+'/messages',{
        method:'POST',body:{text},idempotencyKey
      });
    },
    status:(phone,status)=>call('/conversations/'+safePhone(phone)+'/actions',{
      method:'POST',body:{action:'status',status}
    }),
    transfer:(phone,to)=>call('/conversations/'+safePhone(phone)+'/actions',{
      method:'POST',body:{action:'transfer',to}
    }),
  });
}

/* Exemplo no BACKEND Argo:
import { randomUUID } from 'node:crypto';
const key=authenticatedArgoUser.id===ANDREY_ID
  ? process.env.TIDEPLACE_ARGO_ANDREY_KEY
  : process.env.TIDEPLACE_ARGO_VITOR_KEY;
const tide=createTidePlaceVitalClient({agent:authenticatedArgoUser.agent,token:key});
const inbox=await tide.list();
const messageId=randomUUID(); // Salvar junto à mensagem no Argo antes de enviar
const reply=await tide.reply('5511999999999','Olá, como posso ajudar?',messageId);
*/
