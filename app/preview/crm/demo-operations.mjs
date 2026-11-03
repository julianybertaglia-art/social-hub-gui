// In-memory demo rules. Never use this module for authorization or live data.
export const DEMO_STATUS=Object.freeze(['Aguardando','Em andamento','Concluído']);
export function canViewDemoConversation(profile,conversation){
  return Boolean(profile&&conversation&&
    (!profile.queues||profile.queues.includes(conversation.queue)));
}
export function canReplyDemo(profile,conversation){
  return canViewDemoConversation(profile,conversation)&&profile.role!=='Supervisor';
}
export function canChangeDemoStatus(profile,conversation){
  return canReplyDemo(profile,conversation);
}
export function canTransferDemo(profile,conversation){
  // Production must additionally check server-side persisted transfer grants.
  return canViewDemoConversation(profile,conversation)&&profile.role==='Administradora';
}
export function changeDemoStatus(profile,conversation,nextStatus){
  if(!canChangeDemoStatus(profile,conversation))throw new Error('Perfil sem permissão para alterar status na simulação.');
  if(!DEMO_STATUS.includes(nextStatus))throw new Error('Status não reconhecido.');
  return {...conversation,status:nextStatus};
}
export function transferDemoConversation(profile,conversation,targetQueue,knownQueues){
  if(!canTransferDemo(profile,conversation))throw new Error('Perfil sem permissão para transferir na simulação.');
  if(!knownQueues.includes(targetQueue))throw new Error('Fila de destino inexistente.');
  return {...conversation,queue:targetQueue};
}
export function countDemoConversations(profile,conversations){
  const available=conversations.filter(conversation=>canViewDemoConversation(profile,conversation));
  return {
    total:available.length,
    pending:available.filter(conversation=>conversation.status==='Aguardando').length,
    active:available.filter(conversation=>conversation.status==='Em andamento').length,
    resolved:available.filter(conversation=>conversation.status==='Concluído').length,
  };
}
