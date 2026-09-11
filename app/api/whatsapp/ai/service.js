const ALLOWED_STAGES = ['Novo lead', 'Conversando', 'Interessado', 'Link enviado', 'Venda', 'Perdido'];

function aiError(message, status = 500) {
  return Object.assign(new Error(message), { status });
}

function outputText(response) {
  return (response?.output || [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

function compact(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function loadAgent(db, userId) {
  const { data, error } = await db
    .from('whatsapp_ai_agents')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw aiError('Não foi possível carregar a configuração da IA.', 503);
  if (!data) throw aiError('A IA ainda não foi configurada para esta conta.', 404);
  return data;
}

async function loadKnowledge(db, userId) {
  const { data, error } = await db
    .from('whatsapp_ai_knowledge')
    .select('category,title,content,priority')
    .eq('user_id', userId)
    .eq('active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(80);

  if (error) throw aiError('Não foi possível carregar a base de conhecimento da IA.', 503);
  return data || [];
}

async function loadConversation(db, contactId) {
  const { data: contact, error: contactError } = await db
    .from('whatsapp_contacts')
    .select('id,wa_id,profile_name,source,stage,tags,notes,last_message_at')
    .eq('id', contactId)
    .maybeSingle();

  if (contactError) throw aiError('Não foi possível carregar o lead.', 503);
  if (!contact) throw aiError('Lead não encontrado.', 404);

  const { data: recent, error: messagesError } = await db
    .from('whatsapp_messages')
    .select('id,direction,message_type,body,sent_at')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })
    .limit(30);

  if (messagesError) throw aiError('Não foi possível carregar a conversa.', 503);

  const messages = (recent || []).reverse();
  const lastInbound = [...messages].reverse().find((message) => message.direction === 'inbound') || null;
  return { contact, messages, lastInbound };
}

function buildInstructions(agent, knowledge) {
  const knowledgeText = knowledge
    .map((item) => `[${compact(item.category, 80)}] ${compact(item.title, 140)}\n${compact(item.content, 1800)}`)
    .join('\n\n');

  return [
    `Você é ${compact(agent.assistant_name, 120)}, copiloto de atendimento comercial no WhatsApp da equipe do Gui Nonato.`,
    `Tom: ${compact(agent.tone, 500)}`,
    compact(agent.instructions, 2000),
    'Sua função agora é SUGERIR uma resposta para um humano revisar. Não envie mensagens e não finja ser o Gui.',
    'Use somente fatos presentes na conversa ou na base de conhecimento abaixo. Se faltar informação, admita a limitação e recomende atendimento humano quando necessário.',
    'Não invente preço, desconto, prazo, disponibilidade, política, garantia, resultado ou condição comercial.',
    'Evite respostas genéricas de chatbot. Seja natural, curta e contextual. Faça no máximo uma pergunta por vez quando precisar qualificar o lead.',
    'Classifique a intenção e temperatura do lead apenas com base no que está visível. Confidence é sua confiança de 0 a 1 na sugestão.',
    `Etapas válidas do CRM: ${ALLOWED_STAGES.join(', ')}.`,
    'BASE DE CONHECIMENTO:',
    knowledgeText || 'Nenhuma informação adicional cadastrada.',
  ].filter(Boolean).join('\n\n');
}

function buildConversationInput(contact, messages) {
  const lines = messages.map((message) => {
    const speaker = message.direction === 'outbound' ? 'Equipe' : 'Lead';
    return `${speaker}: ${compact(message.body || `[${message.message_type}]`, 1200)}`;
  });

  return [
    `LEAD\nNome: ${compact(contact.profile_name || 'não informado', 120)}\nOrigem: ${compact(contact.source || 'WhatsApp', 120)}\nEtapa atual: ${compact(contact.stage || 'Novo lead', 80)}\nTags: ${(contact.tags || []).map((tag) => compact(tag, 60)).join(', ') || 'nenhuma'}\nObservações internas: ${compact(contact.notes || 'nenhuma', 1000)}`,
    'CONVERSA RECENTE',
    lines.join('\n') || 'Sem mensagens salvas.',
    'Gere a melhor próxima resposta da equipe para este lead e a classificação correspondente.',
  ].join('\n\n');
}

async function callOpenAI({ model, instructions, input }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw aiError('A chave da OpenAI ainda não foi configurada no Hub.', 503);

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      instructions,
      input,
      max_output_tokens: 900,
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'whatsapp_lead_reply',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reply_text: { type: 'string' },
              intent: { type: 'string' },
              lead_temperature: { type: 'string', enum: ['frio', 'morno', 'quente'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              should_escalate: { type: 'boolean' },
              escalation_reason: { type: 'string' },
              suggested_stage: { type: 'string', enum: ALLOWED_STAGES },
              suggested_tags: { type: 'array', items: { type: 'string' } },
            },
            required: [
              'reply_text', 'intent', 'lead_temperature', 'confidence', 'should_escalate',
              'escalation_reason', 'suggested_stage', 'suggested_tags',
            ],
          },
        },
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = compact(payload?.error?.message, 300);
    throw aiError(detail ? `A OpenAI recusou a solicitação: ${detail}` : 'Não foi possível consultar a IA.', 502);
  }

  const text = outputText(payload);
  if (!text) throw aiError('A IA não retornou uma resposta utilizável.', 502);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw aiError('A IA retornou uma resposta em formato inesperado.', 502);
  }

  return { parsed, responseId: payload.id || null, model: payload.model || model };
}

export async function getAiStatus(db, userId) {
  const agent = await loadAgent(db, userId);
  const { count, error } = await db
    .from('whatsapp_ai_knowledge')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('active', true);

  if (error) throw aiError('Não foi possível verificar a base da IA.', 503);
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    mode: agent.mode,
    model: agent.model,
    assistantName: agent.assistant_name,
    knowledgeItems: count || 0,
  };
}

export async function suggestReply(db, userId, contactId) {
  const [agent, knowledge, conversation] = await Promise.all([
    loadAgent(db, userId),
    loadKnowledge(db, userId),
    loadConversation(db, contactId),
  ]);

  if (!conversation.lastInbound) throw aiError('Ainda não há mensagem recebida deste lead para a IA responder.', 422);

  const requestedModel = process.env.OPENAI_WHATSAPP_MODEL || agent.model || 'gpt-5.6-terra';
  const result = await callOpenAI({
    model: requestedModel,
    instructions: buildInstructions(agent, knowledge),
    input: buildConversationInput(conversation.contact, conversation.messages),
  });

  const suggestion = result.parsed;
  const tags = Array.isArray(suggestion.suggested_tags)
    ? suggestion.suggested_tags.map((tag) => compact(tag, 60)).filter(Boolean).slice(0, 8)
    : [];

  const row = {
    user_id: userId,
    contact_id: contactId,
    inbound_message_id: conversation.lastInbound.id,
    model: result.model,
    reply_text: compact(suggestion.reply_text, 4000),
    intent: compact(suggestion.intent, 200),
    lead_temperature: suggestion.lead_temperature,
    confidence: Math.max(0, Math.min(1, Number(suggestion.confidence) || 0)),
    should_escalate: Boolean(suggestion.should_escalate),
    escalation_reason: compact(suggestion.escalation_reason, 500),
    suggested_stage: ALLOWED_STAGES.includes(suggestion.suggested_stage) ? suggestion.suggested_stage : conversation.contact.stage,
    suggested_tags: tags,
  };

  const { data, error } = await db
    .from('whatsapp_ai_suggestions')
    .insert(row)
    .select('*')
    .single();

  if (error) throw aiError('A resposta foi gerada, mas não foi possível salvar o aprendizado.', 503);
  return data;
}

export async function saveSuggestionFeedback(db, userId, { suggestionId, used, finalText }) {
  const id = String(suggestionId || '').trim();
  if (!id) throw aiError('Sugestão não informada.', 400);

  const patch = {
    used: Boolean(used),
    final_text: compact(finalText, 4000) || null,
    feedback_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('whatsapp_ai_suggestions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id,used,final_text,feedback_at')
    .maybeSingle();

  if (error) throw aiError('Não foi possível salvar o feedback da IA.', 503);
  if (!data) throw aiError('Sugestão não encontrada.', 404);
  return data;
}
