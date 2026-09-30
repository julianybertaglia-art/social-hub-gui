import { sendWhatsAppText, sendWhatsAppDocumentByUrl } from './lib.js';

const SALES_TOPICS = new Set(['Mentoria', 'Mercado Livre']);
const ALLOWED_STAGES = new Set(['Novo lead', 'Conversando', 'Interessado', 'Agendar com Gui', 'Link enviado', 'Venda', 'Perdido']);
const AI_SESSION_STATES = new Set(['routed', 'ai_waiting_call_availability', 'ai_waiting_call_confirmation']);
const MENTORIA_PRESENTATION_URL = String(
  process.env.MENTORIA_PRESENTATION_URL || 'https://social-hub-gui.vercel.app/mentoria-gui-nonato.pdf'
).trim();

const MENTORIA_CALL_INVITE = 'Antes de qualquer decisão, o Gui gosta de fazer uma call para entender melhor o momento da sua operação, tirar suas dúvidas, alinhar expectativas e já começar a desenhar um plano estratégico para os próximos meses.\n\nQue dia e período você teria disponibilidade para essa call? Pode me falar, por exemplo, terça à tarde ou quarta de manhã.';

const MENTORIA_PRICE_CONFIRMATION = 'Perfeito 😊 Antes de eu seguir com o agendamento, gosto de deixar o investimento bem transparente para você já entrar na call sabendo de tudo. Assim, a conversa com o Gui fica realmente focada na sua operação, nas suas dúvidas e em entender se faz sentido avançar.\n\nHoje o investimento na mentoria é de R$ 12.000 no Pix ou R$ 15.000 parcelado em até 10x.\n\nA call com o Gui é sem compromisso. Sabendo desses valores, podemos seguir com o agendamento?';

const MENTORIA_PRICE_ON_REQUEST = 'Claro. Hoje o investimento na mentoria é de R$ 12.000 no Pix ou R$ 15.000 parcelado em até 10x.';

function safeJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  throw new Error('A IA não retornou JSON válido.');
}

function clampConfidence(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
}

async function activeAgent(supabase) {
  const { data, error } = await supabase
    .from('whatsapp_ai_agents')
    .select('*')
    .neq('mode', 'off')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function currentSession(supabase, contactId) {
  const { data, error } = await supabase
    .from('whatsapp_automation_sessions')
    .select('current_topic,state,last_interaction_at')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function recentHistory(supabase, contactId) {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id,meta_message_id,direction,message_type,body,sent_at')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data || []).reverse();
}

async function knowledgeBase(supabase, userId) {
  const { data, error } = await supabase
    .from('whatsapp_ai_knowledge')
    .select('category,title,content,priority')
    .eq('user_id', userId)
    .eq('active', true)
    .order('priority', { ascending: false })
    .limit(40);
  if (error) throw error;
  return data || [];
}

function redactPersonalData(value) {
  return String(value || '')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[email oculto]')
    .replace(/(?<!\d)(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}(?!\d)/g, '[telefone oculto]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/g, '[CPF oculto]');
}

function formatHistory(rows) {
  return rows.map((row) => {
    const who = row.direction === 'outbound' ? 'Juliany' : 'Lead';
    return who + ': ' + redactPersonalData(String(row.body || '[' + row.message_type + ']').slice(0, 1800));
  }).join('\n');
}

function systemPrompt({ agent, topic, state, knowledge }) {
  const kb = knowledge.map((item) => '[' + item.category + ' — ' + item.title + '] ' + item.content).join('\n\n');
  return `Você é o copiloto comercial da Juliany no WhatsApp da equipe do Gui Nonato.

IDENTIDADE E TOM
- Escreva sempre como Juliany, nunca como Gui e nunca diga que é IA.
- Juliany faz o atendimento/comercial. O mentor é o Gui Nonato e é ELE quem dá a mentoria, conduz as reuniões e trabalha estrategicamente com a operação do mentorado.
- Ao falar sobre a Mentoria, fale sempre do Gui na terceira pessoa e no singular: "o Gui trabalha...", "o Gui acompanha...", "na mentoria o Gui vai analisar...".
- NUNCA use "a gente trabalha", "nós trabalhamos", "vamos trabalhar", "nosso acompanhamento" ou qualquer frase que dê a entender que Juliany/equipe ministra a mentoria junto com o Gui.
- "Nossa equipe" só pode ser usado para atendimento, suporte, organização ou agendamento — nunca para descrever a entrega estratégica da Mentoria.
- Português brasileiro natural de WhatsApp. Curto, humano, atento e comercial sem parecer script.
- Uma pergunta por vez. Use o que o lead acabou de dizer antes de fazer a próxima pergunta.
- Evite "entendi" repetitivo, textões, formalidade excessiva e excesso de emojis.
- Não use botões; a conversa depois da triagem é livre.

OBJETIVO
O assunto atual é: ${topic}.
O estado atual do fluxo é: ${state || 'routed'}.
Se for Mentoria: CONVERSE e VENDA antes de tentar agendar. Diagnostique, aprofunde a dor, demonstre que entendeu o cenário e conecte os problemas do lead a entregas específicas do Gui. Só depois de gerar percepção clara de valor apresente o PDF e conduza para uma call. EXCETO se a pessoa perguntar diretamente o preço.
Se for Mercado Livre/iniciante: entender contexto antes de oferecer o Destravando; se houver capital e perfil para acompanhamento estratégico, a Mentoria pode ser mais adequada.

MENTORIA
- 3 meses, altamente personalizada; não é conteúdo genérico.
- 12 reuniões estratégicas, acompanhamento via WhatsApp e onboarding presencial na operação do Gui.
- Pode trabalhar marketplaces, análise de mercado/concorrência, produtos, Ads, Full, processos, fiscal/tributário, importação e acesso ao Argo conforme a necessidade.
- Posicionamento: o Gui entra muito próximo da operação, quase como sócio estratégico nas decisões.
- VENDA CONSULTIVA: não despeje uma lista genérica de benefícios. Pegue o que o lead disse e traduza em valor concreto. Exemplo: se ele fala que fatura bem mas tem margem baixa, aprofunde onde a margem está vazando e explique que o Gui pode trabalhar análise de produto/concorrência, Ads, custos, importação, processos ou fiscal conforme o caso. Se fala que não escala, descubra o gargalo e conecte com processos, Full, anúncios, produto ou operação.
- Faça o lead sentir que a mentoria é personalizada para a operação DELE. Evite respostas que serviriam para qualquer pessoa.
- Você pode explicar entregáveis ao longo da conversa antes de enviar o PDF. O PDF é reforço visual, não substituto da venda.
- Não force a call. Primeiro faça o lead entender por que conversar com o Gui pode ser valioso para o cenário dele.
- Investimento atual: R$ 12.000 no Pix ou R$ 15.000 parcelado em até 10x.
- NÃO revele o investimento espontaneamente enquanto o estado for "routed".
- Exceção: se o lead perguntar diretamente preço, valor, investimento ou quanto custa, use next_action="answer_price_now".
- NÃO pule para apresentação/call só porque o lead informou faturamento + uma dor. Isso é qualificação mínima, não é venda.
- Antes de usar next_action="send_mentoria_presentation_and_ask_availability", a conversa precisa ter avançado de verdade. Em geral, você deve:
  1) entender o estágio/faturamento da operação;
  2) entender a principal dor ou objetivo;
  3) fazer pelo menos uma pergunta de aprofundamento relevante sobre essa dor (o que já tentou, onde trava, impacto, operação atual, margem, Ads, produto, fornecedor, processo etc.);
  4) responder ao que o lead contou com uma explicação específica de COMO O GUI poderia trabalhar aquele ponto dentro da mentoria;
  5) citar naturalmente pelo menos 2 entregas/áreas da Mentoria que façam sentido para o caso dele;
  6) perceber algum sinal de interesse em avançar, conhecer melhor, resolver o problema ou falar com o Gui.
- Só então use next_action="send_mentoria_presentation_and_ask_availability".
- Se ainda houver algo importante para entender ou oportunidade de demonstrar valor, continue a conversa com next_action="none" e faça UMA pergunta por vez.
- O objetivo não é fazer interrogatório. Alterne pergunta + comentário útil + conexão com a mentoria.
- Não use frases como "antes de mais nada, o Gui gosta de agendar uma call" cedo na conversa. A call é consequência de uma conversa bem conduzida, não o primeiro objetivo.
- O sistema enviará o PDF com os entregáveis e depois explicará a call somente quando a conversa já tiver criado contexto e valor.
- A call acontece ANTES de qualquer decisão: o Gui usa a conversa para entender o momento da operação, tirar dúvidas, alinhar expectativas e começar a desenhar um plano estratégico para os próximos meses.
- Quando o estado for "ai_waiting_call_availability" e o lead informar um dia, horário ou período em que pode fazer a call, use next_action="send_price_and_confirm_call".
- O preço deve ser apresentado depois da disponibilidade e antes da confirmação final do agendamento. A mensagem de preço será enviada pelo sistema.
- Quando o estado for "ai_waiting_call_confirmation" e o lead aceitar seguir sabendo do investimento, use next_action="escalate_agendamento", should_escalate=true e suggested_stage="Agendar com Gui".
- NUNCA confirme horário por conta própria. Juliany precisa alinhar a agenda com o Gui e confirmar manualmente.
- Nunca prometa retorno, faturamento, prazo de payback ou que o investimento "vai se pagar".
- Se a objeção for valor: reconheça que é um investimento alto, reforce personalização e avaliação do Gui; não dê desconto nem condição especial.

INICIANTE / DESTRAVANDO
- Preço: R$ 197 à vista ou 12x de R$ 20,37.
- Mais de 30 horas de aulas gravadas, do início até estratégias mais avançadas.
- Conteúdos podem incluir primeiros passos, produto e fornecedor, primeiras vendas, marca, Ads, Mercado Envios, importação, contabilidade para ecommerce etc.
- Link oficial: https://guilhermenonato.com.br/destravando-o-mercado-livre/
- Antes de ofertar, entenda objetivo, se trabalha CLT/tem negócio, se já fez curso e principal trava. Não faça interrogatório.
- Quando fizer sentido, apresente a oferta naturalmente. Se o lead pedir o link ou estiver pronto para comprar, envie o link e suggested_stage="Link enviado".

REGRAS DE SEGURANÇA COMERCIAL
- Nunca invente preço, desconto, bônus, garantia, vaga, prazo, disponibilidade do Gui ou condição.
- Nunca negocie desconto.
- Não trate cancelamento, reembolso, reclamação delicada ou tema jurídico/fiscal específico: escalone.
- Se faltar informação para responder com segurança, escale em vez de inventar.
- Provas sociais são exemplos reais, não garantias. Nunca diga que o lead terá o mesmo resultado.

BASE DE CONHECIMENTO
${kb}

Responda APENAS JSON válido neste formato:
{
  "reply_text": "texto que Juliany enviaria agora; deixe vazio quando next_action acionar uma mensagem padronizada do sistema",
  "next_action": "none|send_mentoria_presentation_and_ask_availability|send_price_and_confirm_call|answer_price_now|escalate_agendamento",
  "intent": "mentoria|iniciante|objecao_valor|compra_curso|agendamento|outro",
  "lead_temperature": "frio|morno|quente",
  "confidence": 0.0,
  "should_escalate": false,
  "escalation_reason": "",
  "suggested_stage": "Novo lead|Conversando|Interessado|Agendar com Gui|Link enviado|Venda|Perdido",
  "suggested_tags": ["tag curta"]
}`;
}

async function callAi({ model, system, history }) {
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();

  if (geminiKey) {
    const geminiModel = model && String(model).startsWith('gemini-')
      ? model
      : 'gemini-3.6-flash';

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModel) + ':generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: system }],
          },
          contents: [{
            role: 'user',
            parts: [{ text: 'Conversa até agora:\n' + history + '\n\nGere somente o JSON da próxima ação.' }],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 900,
            thinkingConfig: { thinkingLevel: 'low' },
          },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Gemini API HTTP ' + response.status);
    }
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('') || '';
    return safeJson(text);
  }

  const token = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || '').trim();
  if (!token) throw new Error('Nenhum provedor de IA configurado. Adicione GEMINI_API_KEY.');

  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'openai/gpt-5.5',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Conversa até agora:\n' + history + '\n\nGere somente o JSON da próxima ação.' },
      ],
      response_format: { type: 'json_object' },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'AI Gateway HTTP ' + response.status);
  }
  return safeJson(payload?.choices?.[0]?.message?.content || '');
}

async function saveSuggestion(supabase, {
  agent,
  contact,
  inboundId,
  decision,
}) {
  const { data, error } = await supabase.from('whatsapp_ai_suggestions').insert({
    user_id: agent.user_id,
    contact_id: contact.id,
    inbound_message_id: inboundId || null,
    model: agent.model || 'openai/gpt-5.5',
    reply_text: decision.reply_text || '',
    intent: decision.intent || null,
    lead_temperature: ['frio', 'morno', 'quente'].includes(decision.lead_temperature) ? decision.lead_temperature : null,
    confidence: clampConfidence(decision.confidence),
    should_escalate: Boolean(decision.should_escalate),
    escalation_reason: String(decision.escalation_reason || '').slice(0, 500) || null,
    suggested_stage: ALLOWED_STAGES.has(decision.suggested_stage) ? decision.suggested_stage : null,
    suggested_tags: normalizeTags(decision.suggested_tags),
    used: null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

async function updateContactFromDecision(supabase, contact, decision) {
  const patch = { updated_at: new Date().toISOString() };
  if (ALLOWED_STAGES.has(decision.suggested_stage)) patch.stage = decision.suggested_stage;

  const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
  const extraTags = normalizeTags(decision.suggested_tags);
  if (['frio', 'morno', 'quente'].includes(decision.lead_temperature)) {
    extraTags.push('IA · ' + decision.lead_temperature[0].toUpperCase() + decision.lead_temperature.slice(1));
  }
  patch.tags = [...new Set([...currentTags, ...extraTags])].slice(0, 20);

  const { error } = await supabase.from('whatsapp_contacts').update(patch).eq('id', contact.id);
  if (error) throw error;
  Object.assign(contact, patch);
}

async function sendAndStoreAiReply(supabase, contact, suggestion) {
  const text = String(suggestion.reply_text || '').trim();
  if (!text) return null;
  const result = await sendWhatsAppText({ to: contact.wa_id, text });
  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();

  const { error } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: 'text',
    body: text,
    status: 'sent',
    raw_payload: { ...result, tide_ai: true, suggestion_id: suggestion.id },
    sent_at: now,
  });
  if (error && error.code !== '23505') throw error;

  await supabase.from('whatsapp_ai_suggestions').update({
    used: true,
    final_text: text,
    feedback_at: now,
  }).eq('id', suggestion.id);

  await supabase.from('whatsapp_contacts').update({
    last_message_at: now,
    updated_at: now,
  }).eq('id', contact.id);

  return result;
}


async function sendAndStoreSystemText(supabase, contact, text, suggestionId = null) {
  const safeText = String(text || '').trim();
  if (!safeText) return null;

  const result = await sendWhatsAppText({ to: contact.wa_id, text: safeText });
  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();

  const { error } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: 'text',
    body: safeText,
    status: 'sent',
    raw_payload: { ...result, tide_ai: true, suggestion_id: suggestionId, standardized_flow: true },
    sent_at: now,
  });
  if (error && error.code !== '23505') throw error;

  await supabase.from('whatsapp_contacts').update({
    last_message_at: now,
    updated_at: now,
  }).eq('id', contact.id);

  return result;
}

async function sendAndStoreMentoriaPresentation(supabase, contact, suggestionId = null) {
  const filename = 'Apresentacao Mentoria Gui Nonato.pdf';
  const result = await sendWhatsAppDocumentByUrl({
    to: contact.wa_id,
    documentUrl: MENTORIA_PRESENTATION_URL,
    filename,
    caption: 'Separei uma apresentação rápida com os principais entregáveis da mentoria 👆',
  });
  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();

  const { error } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: 'document',
    body: filename,
    status: 'sent',
    raw_payload: {
      ...result,
      tide_ai: true,
      suggestion_id: suggestionId,
      standardized_flow: true,
      document_url: MENTORIA_PRESENTATION_URL,
    },
    sent_at: now,
  });
  if (error && error.code !== '23505') throw error;

  await supabase.from('whatsapp_contacts').update({
    last_message_at: now,
    updated_at: now,
  }).eq('id', contact.id);

  return result;
}

async function setAutomationState(supabase, contactId, state) {
  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_automation_sessions').update({
    state,
    last_interaction_at: now,
    updated_at: now,
  }).eq('contact_id', contactId);
  if (error) throw error;
}

async function markSuggestionUsed(supabase, suggestion, finalText) {
  const now = new Date().toISOString();
  await supabase.from('whatsapp_ai_suggestions').update({
    used: true,
    final_text: String(finalText || '').slice(0, 4000),
    feedback_at: now,
  }).eq('id', suggestion.id);
}

async function executeMentoriaAction(supabase, { contact, suggestion, decision }) {
  const action = String(decision?.next_action || 'none');

  if (action === 'send_mentoria_presentation_and_ask_availability') {
    await sendAndStoreMentoriaPresentation(supabase, contact, suggestion.id);
    await sendAndStoreSystemText(supabase, contact, MENTORIA_CALL_INVITE, suggestion.id);
    await setAutomationState(supabase, contact.id, 'ai_waiting_call_availability');
    await markSuggestionUsed(supabase, suggestion, '[PDF da mentoria enviado]\n\n' + MENTORIA_CALL_INVITE);
    return { handled: true, action: 'ai_mentoria_presentation_sent' };
  }

  if (action === 'send_price_and_confirm_call') {
    await sendAndStoreSystemText(supabase, contact, MENTORIA_PRICE_CONFIRMATION, suggestion.id);
    await setAutomationState(supabase, contact.id, 'ai_waiting_call_confirmation');
    await markSuggestionUsed(supabase, suggestion, MENTORIA_PRICE_CONFIRMATION);
    return { handled: true, action: 'ai_mentoria_price_sent' };
  }

  if (action === 'answer_price_now') {
    await sendAndStoreSystemText(supabase, contact, MENTORIA_PRICE_ON_REQUEST, suggestion.id);
    await sendAndStoreMentoriaPresentation(supabase, contact, suggestion.id);
    await sendAndStoreSystemText(supabase, contact, MENTORIA_CALL_INVITE, suggestion.id);
    await setAutomationState(supabase, contact.id, 'ai_waiting_call_availability');
    await markSuggestionUsed(
      supabase,
      suggestion,
      MENTORIA_PRICE_ON_REQUEST + '\n\n[PDF da mentoria enviado]\n\n' + MENTORIA_CALL_INVITE
    );
    return { handled: true, action: 'ai_mentoria_price_on_request_sent' };
  }

  if (action === 'escalate_agendamento') {
    const text = 'Perfeito 😊 Vou alinhar essa disponibilidade com o Gui e te confirmo o horário por aqui.';
    await sendAndStoreSystemText(supabase, contact, text, suggestion.id);
    await setAutomationState(supabase, contact.id, 'awaiting_human');
    await supabase.from('whatsapp_contacts').update({
      stage: 'Agendar com Gui',
      updated_at: new Date().toISOString(),
    }).eq('id', contact.id);
    await markSuggestionUsed(supabase, suggestion, text);
    return { handled: true, action: 'ai_mentoria_escalated' };
  }

  return null;
}

export async function processWhatsAppAi(supabase, { contact, message, automationResult }) {
  if (automationResult?.reason !== 'ongoing_conversation') return { handled: false, reason: 'automation_owned' };
  if (message?.type !== 'text') return { handled: false, reason: 'unsupported_message_type' };

  const agent = await activeAgent(supabase);
  if (!agent) return { handled: false, reason: 'ai_off' };

  const session = await currentSession(supabase, contact.id);
  if (!session || !AI_SESSION_STATES.has(session.state) || !SALES_TOPICS.has(session.current_topic)) {
    return { handled: false, reason: 'out_of_scope' };
  }

  const history = await recentHistory(supabase, contact.id);
  const inbound = history.slice().reverse().find((item) => item.meta_message_id === message.id) || null;

  if (inbound?.id) {
    const { data: existing, error: existingError } = await supabase
      .from('whatsapp_ai_suggestions')
      .select('id')
      .eq('inbound_message_id', inbound.id)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { handled: false, reason: 'already_suggested' };
  }

  const knowledge = await knowledgeBase(supabase, agent.user_id);
  const decision = await callAi({
    model: agent.model,
    system: systemPrompt({ agent, topic: session.current_topic, state: session.state, knowledge }),
    history: formatHistory(history),
  });

  const suggestion = await saveSuggestion(supabase, {
    agent,
    contact,
    inboundId: inbound?.id || null,
    decision,
  });

  await updateContactFromDecision(supabase, contact, decision);

  const confidence = clampConfidence(decision.confidence);
  const shouldEscalate = Boolean(decision.should_escalate);

  if (agent.mode === 'auto' && confidence >= Number(agent.auto_send_min_confidence || 0.9)) {
    if (session.current_topic === 'Mentoria') {
      const mentoriaAction = await executeMentoriaAction(supabase, {
        contact,
        suggestion,
        decision,
      });
      if (mentoriaAction) {
        return { ...mentoriaAction, suggestionId: suggestion.id, confidence };
      }
    }

    if (!shouldEscalate) {
      await sendAndStoreAiReply(supabase, contact, suggestion);
      return { handled: true, action: 'ai_auto_sent', suggestionId: suggestion.id };
    }
  }

  return {
    handled: true,
    action: shouldEscalate ? 'ai_escalated' : 'ai_suggested',
    suggestionId: suggestion.id,
    confidence,
  };
}
