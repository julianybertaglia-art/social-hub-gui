import {
  sendWhatsAppCtaUrl,
  sendWhatsAppInteractiveList,
  sendWhatsAppText,
} from './lib.js';
import { sendWhatsAppReplyButtons } from './reply-buttons.js';

export const WHATSAPP_MENU_ROWS = [
  {
    id: 'topic_imersao',
    title: 'Imersão Ecommerce',
    description: 'Informações e ingressos do evento',
  },
  {
    id: 'topic_mercado_livre',
    title: 'Mercado Livre',
    description: 'Quero começar a vender online',
  },
  {
    id: 'topic_importacao',
    title: 'Importação',
    description: 'Quero entender como importar',
  },
  {
    id: 'topic_mentoria',
    title: 'Aplicação Mentoria',
    description: 'Já vendo online e quero saber sobre a mentoria',
  },
  {
    id: 'topic_influencer',
    title: 'Afiliado TikTok Vital',
    description: 'Quero divulgar produtos da Vital Decor',
  },
  {
    id: 'topic_other',
    title: 'Outro assunto',
    description: 'Preciso falar sobre outro tema',
  },
];

export const WELCOME_MENU_BUTTON_GROUPS = [
  [
    { id: 'topic_imersao', title: 'Imersão Ecommerce' },
    { id: 'topic_mercado_livre', title: 'Mercado Livre' },
    { id: 'topic_mentoria', title: 'Já vendo | Mentoria' },
  ],
  [
    { id: 'topic_importacao', title: 'Importação' },
    { id: 'topic_influencer', title: 'Afiliado TikTok' },
    { id: 'topic_other', title: 'Outro assunto' },
  ],
];

export const AD_IMERSAO_ROWS = [
  {
    id: 'ad_imersao_seller',
    title: 'Já vendo',
    description: 'Já vendo no Mercado Livre',
  },
  {
    id: 'ad_imersao_beginner',
    title: 'Ainda não vendo',
    description: 'Ainda estou começando',
  },
];

export const AD_IMERSAO_NEXT_ACTIONS = [
  { id: 'ad_imersao_buy', title: 'Garantir ingresso' },
  { id: 'ad_imersao_question', title: 'Tirar uma dúvida' },
];

const AD_IMERSAO_RESPONSES = {
  ad_imersao_seller: {
    tag: 'Imersão: Já vende',
    text: 'Perfeito! A Imersão é bem prática e foi pensada para quem quer profissionalizar a operação e crescer no Mercado Livre.\n\nDurante o dia, o Gui vai falar sobre operação, anúncios, análise de mercado, importação, margem, escala e estratégias que ele aplica nas próprias operações e com os mentorados.\n\nQuais são seus principais objetivos e desafios hoje?',
  },
  ad_imersao_beginner: {
    tag: 'Imersão: Iniciante',
    text: 'Perfeito! Mesmo para quem ainda não vende, a Imersão vai te ajudar a entender como o Mercado Livre funciona na prática e quais são os primeiros passos.\n\nAlém disso, você recebe acesso ao Destravando o Mercado Livre, pensado para quem está começando.\n\nVocê já tem algum conhecimento nessa área ou seria seu primeiro contato com esse mercado?',
  },
};

const TOPICS = {
  topic_imersao: {
    topic: 'Imersão',
    tag: 'Interesse — Imersão',
    text: 'Claro! A Imersão Ecommerce Mercado Livre Pro acontece no dia 26/09, no Tatuapé, em São Paulo. É um dia inteiro com o Gui, focado em operação e escala, análise de mercado, importação, estratégias para Mercado Livre e networking.\n\nAntes de eu te passar o ingresso, me conta: você já vende no Mercado Livre hoje ou ainda está começando?',
  },
  topic_mercado_livre: {
    topic: 'Mercado Livre',
    tag: 'Interesse — Começar no Mercado Livre',
    text: 'Que bom! Para eu te direcionar melhor, me conta em uma frase: você já tem um produto para vender ou ainda está procurando por onde começar?',
  },
  topic_importacao: {
    topic: 'Importação',
    tag: 'Interesse — Importação',
    text: 'A importação costuma fazer mais sentido para quem já tem um produto validado. Me conte: você já vende algum produto e tem capital disponível para uma primeira operação?',
  },
  topic_mentoria: {
    topic: 'Mentoria',
    tag: 'Interesse — Mentoria',
    text: 'Perfeito. Para eu verificar se a mentoria faz sentido para o seu momento, me responda: o que você vende, quanto fatura por mês hoje e qual é o seu maior gargalo?',
  },
  topic_other: {
    topic: 'Outro assunto',
    tag: 'Atendimento — Outro assunto',
    text: 'Pode me contar em uma frase o que você precisa? Assim eu encaminho para a pessoa certa da equipe.',
  },
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function interactiveSelectionId(message) {
  return String(
    message?.interactive?.list_reply?.id
      || message?.interactive?.button_reply?.id
      || message?.button?.payload
      || ''
  ).trim();
}

export function requestsMainMenu(message) {
  const text = normalizeText(message?.text?.body || message?.button?.text || '');
  return ['menu', 'inicio', 'iniciar', 'comecar', 'atendimento'].includes(text);
}

export function cameFromAd(message) {
  return Boolean(message?.referral)
    || normalizeText(message?.referral?.source_type) === 'ad'
    || Boolean(message?.referral?.ctwa_clid);
}

export function isReplyToBusiness(message) {
  return Boolean(message?.context?.id || message?.context?.from);
}

export function isAdImersaoSelection(selectionId) {
  return Object.prototype.hasOwnProperty.call(AD_IMERSAO_RESPONSES, String(selectionId || ''));
}

export function isAdImersaoNextAction(selectionId) {
  return AD_IMERSAO_NEXT_ACTIONS.some((item) => item.id === String(selectionId || ''));
}

export function shouldSendInitialMenu({ message, messageCount }) {
  if (interactiveSelectionId(message)) return false;
  if (Number(messageCount) !== 1) return false;
  if (cameFromAd(message)) return false;
  if (isReplyToBusiness(message)) return false;
  return true;
}

async function saveOutboundMessage(supabase, contact, result, body, messageType) {
  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: contact.id,
    direction: 'outbound',
    message_type: messageType,
    body,
    status: 'sent',
    raw_payload: result,
    sent_at: now,
  });
  if (error && error.code !== '23505') throw error;

  await supabase.from('whatsapp_contacts')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', contact.id);
}

async function sendAndStoreText(supabase, contact, text) {
  const result = await sendWhatsAppText({ to: contact.wa_id, text });
  await saveOutboundMessage(supabase, contact, result, text, 'text');
  return result;
}

async function sendAndStoreReplyButtons(supabase, contact, text, buttons) {
  const result = await sendWhatsAppReplyButtons({
    to: contact.wa_id,
    body: text,
    buttons,
  });
  await saveOutboundMessage(supabase, contact, result, text, 'interactive');
  return result;
}

async function sendAndStoreFormButton(supabase, contact, text, url) {
  const result = await sendWhatsAppCtaUrl({
    to: contact.wa_id,
    body: text,
    buttonText: 'Preencher formulário',
    url,
  });
  await saveOutboundMessage(supabase, contact, result, text, 'interactive');
  return result;
}

async function sendMainMenu(supabase, contact, { welcome = true } = {}) {
  const firstBody = welcome
    ? 'Oi! Eu sou a Juliany, da equipe do Gui Nonato e da Vital Decor 👋\n\nPara eu te direcionar mais rápido, escolha abaixo o assunto que você quer falar:'
    : 'Claro! Escolha abaixo o assunto que você quer falar:';

  await sendAndStoreReplyButtons(
    supabase,
    contact,
    firstBody,
    WELCOME_MENU_BUTTON_GROUPS[0]
  );
  await sendAndStoreReplyButtons(
    supabase,
    contact,
    '👇',
    WELCOME_MENU_BUTTON_GROUPS[1]
  );

  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id,
    state: 'menu_sent',
    menu_sent_at: now,
    last_interaction_at: now,
    updated_at: now,
  }, { onConflict: 'contact_id' });
  if (error) throw error;
}

async function sendAdImersaoQualification(supabase, contact) {
  const body = 'Oi! Tudo bem? 😊\nEu sou a Juliany, da equipe do Gui Nonato. Vi que você veio pelo anúncio da Imersão Ecommerce.\n\nPra eu conseguir te orientar melhor, me conta: você já vende no Mercado Livre ou ainda está começando?';
  const result = await sendWhatsAppInteractiveList({
    to: contact.wa_id,
    body,
    button: 'Selecionar opção',
    sections: [{ title: 'Seu momento hoje', rows: AD_IMERSAO_ROWS }],
  });
  await saveOutboundMessage(supabase, contact, result, body, 'interactive');
  await tagContact(supabase, contact, 'Interesse — Imersão');

  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id,
    current_topic: 'Imersão',
    state: 'ad_imersao_waiting_profile',
    last_interaction_at: now,
    updated_at: now,
  }, { onConflict: 'contact_id' });
  if (error) throw error;
}

async function getAutomationSession(supabase, contactId) {
  const { data, error } = await supabase.from('whatsapp_automation_sessions')
    .select('contact_id,current_topic,state,last_interaction_at')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function markAwaitingHuman(supabase, contact) {
  const now = new Date().toISOString();
  await tagContact(supabase, contact, 'Aguardando atendimento');

  const { error: contactError } = await supabase.from('whatsapp_contacts')
    .update({
      stage: 'Aguardando atendimento',
      updated_at: now,
    })
    .eq('id', contact.id);
  if (contactError) throw contactError;

  const { error: sessionError } = await supabase.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id,
    current_topic: 'Imersão',
    state: 'awaiting_human',
    last_interaction_at: now,
    updated_at: now,
  }, { onConflict: 'contact_id' });
  if (sessionError) throw sessionError;
}

async function handleAdImersaoSelection(supabase, contact, selectionId) {
  const response = AD_IMERSAO_RESPONSES[selectionId];
  if (!response) return false;

  const session = await getAutomationSession(supabase, contact.id);
  if (session?.state !== 'ad_imersao_waiting_profile') return false;

  await tagContact(supabase, contact, response.tag);
  await sendAndStoreReplyButtons(
    supabase,
    contact,
    response.text + '\n\nSe preferir, você também pode escolher uma das opções abaixo.',
    AD_IMERSAO_NEXT_ACTIONS
  );

  const now = new Date().toISOString();
  const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id,
    current_topic: 'Imersão',
    state: 'ad_imersao_waiting_next_action',
    last_interaction_at: now,
    updated_at: now,
  }, { onConflict: 'contact_id' });
  if (error) throw error;
  return true;
}

async function handleAdImersaoNextAction(supabase, contact, selectionId) {
  if (!isAdImersaoNextAction(selectionId)) return false;

  const session = await getAutomationSession(supabase, contact.id);
  if (session?.state !== 'ad_imersao_waiting_next_action') return false;

  if (selectionId === 'ad_imersao_buy') {
    const text = 'Perfeito! 😊 Você pode garantir seu ingresso por aqui:';
    const result = await sendWhatsAppCtaUrl({
      to: contact.wa_id,
      body: text,
      buttonText: 'Garantir ingresso',
      url: 'https://imersao.guinonato.com/',
    });
    await saveOutboundMessage(supabase, contact, result, text, 'interactive');
    await tagContact(supabase, contact, 'Link de ingresso enviado');

    const now = new Date().toISOString();
    const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
      contact_id: contact.id,
      current_topic: 'Imersão',
      state: 'purchase_link_sent',
      last_interaction_at: now,
      updated_at: now,
    }, { onConflict: 'contact_id' });
    if (error) throw error;
    return true;
  }

  if (selectionId === 'ad_imersao_question') {
    await sendAndStoreText(supabase, contact, 'Claro! Pode me contar sua dúvida por aqui 😊');
    await markAwaitingHuman(supabase, contact);
    return true;
  }

  return false;
}

async function tagContact(supabase, contact, tag) {
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const nextTags = tags.includes(tag) ? tags : [...tags, tag];
  const { error } = await supabase.from('whatsapp_contacts')
    .update({ tags: nextTags, updated_at: new Date().toISOString() })
    .eq('id', contact.id);
  if (error) throw error;
  contact.tags = nextTags;
}

async function influencerApplicationLink(supabase, contact, origin) {
  const { data: existing, error: readError } = await supabase
    .from('influencer_applications')
    .select('id,public_token')
    .eq('contact_id', contact.id)
    .maybeSingle();
  if (readError) throw readError;

  let application = existing;
  if (!application) {
    const { data, error } = await supabase.from('influencer_applications').insert({
      contact_id: contact.id,
      wa_id: contact.wa_id,
      profile_name: contact.profile_name || null,
      source: 'whatsapp_menu',
    }).select('id,public_token').single();
    if (error) throw error;
    application = data;
  }

  const url = new URL('/parcerias/vital-influenciadores', origin);
  url.searchParams.set('token', application.public_token);
  return { id: application.id, url: url.toString() };
}

async function selectTopic(supabase, contact, selectionId, origin) {
  const now = new Date().toISOString();

  if (selectionId === 'topic_influencer') {
    await tagContact(supabase, contact, 'Influenciador TikTok — Vital');
    const application = await influencerApplicationLink(supabase, contact, origin);
    const text = 'Que legal ter você por aqui! 💛\n\nPara avaliarmos a parceria com a Vital Decor, preencha o formulário abaixo. Ele leva cerca de 3 minutos.\n\nDepois do envio, seu perfil entra automaticamente na nossa triagem.';
    await sendAndStoreFormButton(supabase, contact, text, application.url);
    const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
      contact_id: contact.id,
      current_topic: 'Influenciador TikTok — Vital',
      state: 'awaiting_influencer_form',
      influencer_application_id: application.id,
      last_interaction_at: now,
      updated_at: now,
    }, { onConflict: 'contact_id' });
    if (error) throw error;
    return true;
  }

  const topic = TOPICS[selectionId];
  if (!topic) return false;
  await tagContact(supabase, contact, topic.tag);
  await sendAndStoreText(supabase, contact, topic.text);
  const { error } = await supabase.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id,
    current_topic: topic.topic,
    state: 'routed',
    last_interaction_at: now,
    updated_at: now,
  }, { onConflict: 'contact_id' });
  if (error) throw error;
  return true;
}

async function claimEvent(supabase, contactId, messageId) {
  const { error } = await supabase.from('whatsapp_automation_events').insert({
    message_id: messageId,
    contact_id: contactId,
    status: 'processing',
  });
  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

async function finishEvent(supabase, messageId, status, errorMessage = null) {
  await supabase.from('whatsapp_automation_events').update({
    status,
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
  }).eq('message_id', messageId);
}

export async function processWhatsAppAutomation(supabase, {
  contact,
  message,
  origin,
}) {
  const messageId = String(message?.id || '').trim();
  if (!messageId || !contact?.id || !contact?.wa_id) return { handled: false, reason: 'invalid_event' };
  if (!await claimEvent(supabase, contact.id, messageId)) return { handled: false, reason: 'duplicate' };

  try {
    const selectionId = interactiveSelectionId(message);

    if (isAdImersaoNextAction(selectionId) && await handleAdImersaoNextAction(supabase, contact, selectionId)) {
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: selectionId };
    }

    if (isAdImersaoSelection(selectionId) && await handleAdImersaoSelection(supabase, contact, selectionId)) {
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: selectionId };
    }

    if (selectionId && await selectTopic(supabase, contact, selectionId, origin)) {
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: selectionId };
    }

    const { count, error: countError } = await supabase.from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contact.id);
    if (countError) throw countError;

    const session = await getAutomationSession(supabase, contact.id);
    if (session?.state === 'ad_imersao_waiting_next_action' && message?.type === 'text') {
      await markAwaitingHuman(supabase, contact);
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: 'ad_imersao_human_answer' };
    }

    if (cameFromAd(message)) {
      await sendAdImersaoQualification(supabase, contact);
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: 'ad_imersao_qualification' };
    }

    if (requestsMainMenu(message)) {
      await sendMainMenu(supabase, contact, { welcome: false });
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: 'menu_requested' };
    }

    if (shouldSendInitialMenu({ message, messageCount: count })) {
      await sendMainMenu(supabase, contact, { welcome: true });
      await finishEvent(supabase, messageId, 'processed');
      return { handled: true, action: 'welcome_menu' };
    }

    await finishEvent(supabase, messageId, 'ignored');
    return { handled: false, reason: 'ongoing_conversation' };
  } catch (error) {
    await finishEvent(supabase, messageId, 'failed', String(error?.message || 'Falha na automação').slice(0, 500));
    throw error;
  }
}
