import {fail} from '../api/vital-connections/helpers.mjs';
import {crmMemberAccess} from './crm-authorization.mjs';

export function resolveVitalCrmMemberAccess({userId,organization,member,queueGrants=[],staffEnabled=false}={}) {
  if(!userId)throw fail('Entre com um login autorizado.',401);
  if(!organization||!member||member.user_id!==userId||member.status!=='active')
    throw fail('Sua conta não está autorizada para o CRM da Vital.',403);
  if(member.role==='owner'&&organization.owner_user_id!==userId)
    throw fail('Permissão de proprietário inválida.',403);
  if(member.role!=='owner'&&!staffEnabled)
    throw fail('Acesso dos funcionários ainda não liberado para atendimento.',403);
  const sectors=(queueGrants||[]).map(grant=>grant.queue_code).filter(Boolean);
  if(member.role!=='owner'&&!sectors.length)
    throw fail('Sua conta não possui filas autorizadas.',403);
  const access=crmMemberAccess({role:member.role,status:member.status,sectors,canTransfer:member.can_transfer});
  if(!access)throw fail('Acesso não autorizado.',403);
  return {access,member:{displayName:member.display_name||null}};
}
