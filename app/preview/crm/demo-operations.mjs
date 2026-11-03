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


// Deterministic mock response: no inference, tokens, or HTTP requests.
export function demoMiaReply({action,conversation,messages=[],counts}={}){
  const sample=conversation||null;
  const inbound=[...(Array.isArray(messages)?messages:[])].reverse().find(item=>Array.isArray(item)&&item[0]==='in');
  const lastText=inbound?String(inbound[1]||'').trim().slice(0,180):'Não há mensagem recebida registrada.';
  if(action==='Resumir atendimento'){
    if(!sample)return 'Selecione uma conversa fictícia antes de solicitar o resumo.';
    return 'Resumo simulado de '+sample.name+': setor '+sample.queue+', situação '+sample.status+'. Última dúvida do cliente: '+lastText+' Próximo passo: conferir os detalhes antes de responder.';
  }
  if(action==='Sugerir resposta'){
    if(!sample)return 'Selecione uma conversa fictícia para receber uma sugestão.';
    return 'Olá! Recebemos sua mensagem. Vou confirmar as informações da sua solicitação e retorno com uma orientação. Você pode me informar mais detalhes?';
  }
  if(action==='Próxima ação'){
    if(!sample)return 'Selecione uma conversa fictícia para ver a próxima ação.';
    return sample.status==='Concluído'
      ?'Esta conversa fictícia está concluída. Acompanhe somente se chegar uma nova solicitação.'
      :'Confirme a dúvida mais recente, verifique as informações disponíveis e responda pelo setor '+sample.queue+'.';
  }
  if(action==='Consultar indicadores'){
    const metrics=counts||{total:0,pending:0,active:0,resolved:0};
    return 'Indicadores fictícios das filas permitidas: '+metrics.total+' conversas, '+metrics.pending+' aguardando, '+metrics.active+' em andamento e '+metrics.resolved+' concluídas. Não são dados reais.';
  }
  return 'Esta é uma demonstração sem Gemini. Use os quatro atalhos para observar respostas simuladas baseadas nas conversas fictícias.';
}
