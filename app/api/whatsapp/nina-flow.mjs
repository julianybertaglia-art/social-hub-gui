import { sendWhatsAppInteractiveList, sendWhatsAppText } from './lib.js';
import { sendWhatsAppReplyButtons } from './reply-buttons.js';

const MENTORIA = 'Mentoria';
const OUTROS = 'Outro assunto';
const START_MENTORIA = 'nina_mentoria_nome';
const START_OUTROS = 'nina_outros_detalhes';

const OPERACAO = [
  { id: 'nina_operacao_sim', title: 'Sim, já vendo' },
  { id: 'nina_operacao_nao', title: 'Quero começar' },
];
const CAPITAL = [
  { id: 'nina_capital_sim', title: 'Sim, tenho capital' },
  { id: 'nina_capital_nao', title: 'Ainda não tenho' },
];
const COLABORADORES = [
  { id: 'nina_colab_0', title: 'Somente eu' },
  { id: 'nina_colab_1a2', title: '1 a 2 pessoas' },
  { id: 'nina_colab_3a5', title: '3 a 5 pessoas' },
  { id: 'nina_colab_6mais', title: '6 ou mais' },
];
const FATURAMENTO = [
  { id: 'nina_fat_ate20', title: 'Até R$ 20 mil' },
  { id: 'nina_fat_20a50', title: 'R$ 20 a 50 mil' },
  { id: 'nina_fat_50a100', title: 'R$ 50 a 100 mil' },
  { id: 'nina_fat_100a300', title: 'R$ 100 a 300 mil' },
  { id: 'nina_fat_300mais', title: 'Acima de R$ 300 mil' },
  { id: 'nina_fat_nao', title: 'Prefiro não informar' },
];
const INVESTIMENTO = [
  { id: 'nina_inv_ate20', title: 'Até R$ 20 mil' },
  { id: 'nina_inv_20a50', title: 'R$ 20 a 50 mil' },
  { id: 'nina_inv_50a100', title: 'R$ 50 a 100 mil' },
  { id: 'nina_inv_100mais', title: 'Acima de R$ 100 mil' },
  { id: 'nina_inv_nao', title: 'Prefiro não informar' },
];

export const NINA_MENTORIA_OPTIONS = Object.freeze({
  operacao: OPERACAO, colaboradores: COLABORADORES, faturamento: FATURAMENTO,
  capital: CAPITAL, investimento: INVESTIMENTO,
});

function textOf(message) {
  return String(message?.text?.body || message?.button?.text || '').trim();
}
function selectionOf(message) {
  return String(message?.interactive?.list_reply?.id
    || message?.interactive?.button_reply?.id
    || message?.button?.payload || '').trim();
}
function timestamp() { return new Date().toISOString(); }
function stateFor(step) { return 'nina_mentoria_' + step; }
function choose(options, message) {
  const id = selectionOf(message);
  return options.find((option) => option.id === id) || null;
}
function shortInput(message, minLength = 2, maxLength = 500) {
  const input = textOf(message).replace(/\s+/g, ' ').slice(0, maxLength).trim();
  return input.length >= minLength ? input : null;
}

async function send(db, contact, body, options = null) {
  let result;
  let messageType = 'text';
  if (options?.type === 'buttons') {
    result = await sendWhatsAppReplyButtons({ to: contact.wa_id, body, buttons: options.items });
    messageType = 'interactive';
  } else if (options?.type === 'list') {
    result = await sendWhatsAppInteractiveList({
      to: contact.wa_id, body, button: 'Selecionar opção',
      sections: [{ title: options.title || 'Escolha uma opção', rows: options.items }],
    });
    messageType = 'interactive';
  } else {
    result = await sendWhatsAppText({ to: contact.wa_id, text: body });
  }
  const now = timestamp();
  const { error } = await db.from('whatsapp_messages').insert({
    meta_message_id: result?.messages?.[0]?.id || null, contact_id: contact.id,
    direction: 'outbound', message_type: messageType, body,
    status: 'sent', raw_payload: { ...result, tide_nina: true }, sent_at: now,
  });
  if (error && error.code !== '23505') throw error;
  const { error: contactError } = await db.from('whatsapp_contacts')
    .update({ last_message_at: now, updated_at: now }).eq('id', contact.id);
  if (contactError) throw contactError;
}

async function setState(db, contact, topic, state) {
  const now = timestamp();
  const { error } = await db.from('whatsapp_automation_sessions').upsert({
    contact_id: contact.id, current_topic: topic, state,
    last_interaction_at: now, updated_at: now,
  }, { onConflict: 'contact_id' });
  if (error) throw error;
}

async function saveField(db, contact, prefix, answer, extra = {}) {
  const clean = String(answer || '').trim().slice(0, 240);
  const tags = (Array.isArray(contact.tags) ? contact.tags : [])
    .filter((tag) => !String(tag).startsWith(prefix + ': '));
  const updated = [...tags, prefix + ': ' + clean];
  const now = timestamp();
  const patch = { tags: updated, updated_at: now, ...extra };
  const { error } = await db.from('whatsapp_contacts').update(patch).eq('id', contact.id);
  if (error) throw error;
  Object.assign(contact, patch);
}

async function start(db, contact, topic, state, message) {
  await setState(db, contact, topic, state);
  await send(db, contact, message);
}
export async function startNinaMentoria(db, contact) {
  const cameFromTraining = (contact.tags || []).includes('Interesse — Treinamento');
  const knownName = cameFromTraining ? String(contact.profile_name || '').trim() : '';
  const cleanTags = (contact.tags || []).filter((tag) =>
    !String(tag).startsWith('Mentoria · ') && tag !== 'Mentoria · Aplicação concluída');
  const { error: resetError } = await db.from('whatsapp_contacts').update({
    tags: cleanTags, stage: 'Conversando', updated_at: timestamp(),
  }).eq('id', contact.id);
  if (resetError) throw resetError;
  contact.tags = cleanTags;
  contact.stage = 'Conversando';
  await saveField(db, contact, 'Interesse', 'Mentoria');
  if (knownName) {
    await saveField(db, contact, 'Mentoria · Nome', knownName);
    await setState(db, contact, MENTORIA, stateFor('operacao'));
    await send(db, contact, 'Vamos seguir com sua aplicação para a Mentoria Ultra! 🚀\n\nVocê já tem uma operação de vendas?', { type: 'buttons', items: OPERACAO });
    return;
  }
  await start(db, contact, MENTORIA, START_MENTORIA,
    'Que bom que você tem interesse na *Mentoria Ultra do Gui Nonato*! 🚀\n\n' +
    'A mentoria é um acompanhamento estratégico para quem já tem uma operação e deseja crescer, ' +
    'ou para quem tem capital disponível e quer começar seu negócio com mais previsibilidade.\n\n' +
    'Para entendermos melhor seu momento e avaliarmos como o Gui pode te ajudar, vamos fazer uma breve aplicação.\n\n' +
    'São algumas perguntinhas rápidas e, ao final, nossa equipe dará continuidade ao seu atendimento. 😊\n\n' +
    '*Pra começar, qual é o seu nome?*');
}
export async function startNinaOther(db, contact) {
  const cleanTags = (contact.tags || []).filter((tag) => !String(tag).startsWith('Outro assunto · '));
  const { error: resetError } = await db.from('whatsapp_contacts').update({
    tags: cleanTags, stage: 'Conversando', updated_at: timestamp(),
  }).eq('id', contact.id);
  if (resetError) throw resetError;
  contact.tags = cleanTags;
  contact.stage = 'Conversando';
  await saveField(db, contact, 'Interesse', 'Outro assunto');
  await start(db, contact, OUTROS, START_OUTROS,
    'Claro! 😊\n\nPara que nossa equipe possa te ajudar da melhor forma, me conta:\n\n' +
    '*Qual é o seu nome e sobre qual assunto gostaria de falar?*\n\n' +
    'Assim que você me passar essas informações, vou encaminhar sua mensagem para nossa equipe, ' +
    'e alguém dará continuidade ao seu atendimento por aqui em breve! 💛');
}

async function ask(db, contact, step, question, options = null) {
  await setState(db, contact, MENTORIA, stateFor(step));
  await send(db, contact, question, options);
}

async function finish(db, contact, topic, summary, fields = []) {
  const now = timestamp();
  const existingNotes = String(contact.notes || '').trim();
  const append = '[Nina · ' + topic + ' · ' + now.slice(0, 10) + ']\n' + summary;
  const notes = (existingNotes ? existingNotes + '\n\n' : '') + append;
  const tags = [...new Set([...(contact.tags || []), 'Aguardando atendimento',
    topic === MENTORIA ? 'Mentoria · Aplicação concluída' : 'Outro assunto · Encaminhado',
    ...fields])];
  const { error } = await db.from('whatsapp_contacts').update({
    notes: notes.slice(-5000), tags, stage: 'Aguardando atendimento', updated_at: now,
  }).eq('id', contact.id);
  if (error) throw error;
  contact.notes = notes.slice(-5000);
  contact.tags = tags;
  contact.stage = 'Aguardando atendimento';
  await setState(db, contact, topic, 'nina_awaiting_human');
  const nameTag = tags.find((tag) => tag.startsWith((topic === MENTORIA ? 'Mentoria' : 'Outro assunto') + ' · Nome: '));
  const name = nameTag?.split(': ').slice(1).join(': ') || contact.profile_name || '';
  const greeting = name ? ', ' + name.split(' ')[0] : '';
  await send(db, contact, topic === MENTORIA
    ? 'Perfeito' + greeting + '! 🚀\n\nSua aplicação para a *Mentoria Ultra* foi registrada. ' +
      'Vou encaminhar suas respostas para a Juliany, responsável pelo atendimento da mentoria. ' +
      'Ela vai analisar seu momento e dar continuidade por aqui assim que estiver disponível. 💛'
    : 'Obrigada por contar' + greeting + '! 😊 Já encaminhei sua mensagem para nossa equipe. ' +
      'Alguém dará continuidade ao atendimento por aqui assim que estiver disponível. 💛');
}

async function finishMentoria(db, contact) {
  const answerTags = (contact.tags || []).filter((tag) => tag.startsWith('Mentoria · '));
  const lines = answerTags.filter((tag) => !tag.includes('Aplicação concluída'));
  await finish(db, contact, MENTORIA, lines.join('\n'));
}

async function handleMentoria(db, contact, message, state) {
  const step = state.replace(/^nina_mentoria_/, '');
  const text = shortInput(message);
  if (step === 'nome') {
    if (!text || text.length > 80 || /\n/.test(text)) {
      await send(db, contact, 'Pra eu registrar sua aplicação, como posso te chamar? 😊');
      return true;
    }
    const name = text.replace(/^(me chamo|meu nome é|pode me chamar de|sou a |sou o )\s*/i, '').trim().slice(0, 80);
    if (!name || name.length > 60) {
      await send(db, contact, 'Pode me dizer apenas seu nome, por favor? 😊');
      return true;
    }
    await saveField(db, contact, 'Mentoria · Nome', name, { profile_name: name });
    await ask(db, contact, 'operacao', 'Pra começar, você já tem uma operação de vendas?', { type: 'buttons', items: OPERACAO });
    return true;
  }
  if (step === 'operacao') {
    const answer = choose(OPERACAO, message);
    if (!answer) {
      await send(db, contact, 'Escolha uma das opções para continuarmos a aplicação. 👇', { type: 'buttons', items: OPERACAO });
      return true;
    }
    await saveField(db, contact, 'Mentoria · Operação', answer.title);
    if (answer.id === 'nina_operacao_sim') {
      await ask(db, contact, 'colaboradores', 'Quantos colaboradores fazem parte da sua operação hoje?', { type: 'list', title: 'Equipe', items: COLABORADORES });
    } else {
      await send(db, contact, 'A mentoria é mais indicada para quem já tem uma operação, ou para quem tem capital disponível e quer começar de forma estruturada com o Gui. 😊');
      await ask(db, contact, 'capital', 'Você já tem capital reservado para investir no seu negócio?', { type: 'buttons', items: CAPITAL });
    }
    return true;
  }
  if (step === 'colaboradores') {
    const answer = choose(COLABORADORES, message);
    if (!answer) {
      await send(db, contact, 'Selecione a faixa que melhor representa sua equipe. 👇', { type: 'list', title: 'Equipe', items: COLABORADORES });
      return true;
    }
    await saveField(db, contact, 'Mentoria · Colaboradores', answer.title);
    await ask(db, contact, 'estado', 'Em qual estado fica sua operação? Pode me dizer o nome ou a sigla. 😊');
    return true;
  }
  if (step === 'capital') {
    const answer = choose(CAPITAL, message);
    if (!answer) {
      await send(db, contact, 'Pode selecionar uma das opções abaixo? 👇', { type: 'buttons', items: CAPITAL });
      return true;
    }
    await saveField(db, contact, 'Mentoria · Capital reservado', answer.title);
    if (answer.id === 'nina_capital_sim') {
      await ask(db, contact, 'investimento', 'Qual faixa de capital você pretende destinar ao negócio?', { type: 'list', title: 'Capital inicial', items: INVESTIMENTO });
    } else {
      await ask(db, contact, 'estado_iniciante', 'Em qual estado você pretende começar sua operação?');
    }
    return true;
  }
  if (step === 'investimento') {
    const answer = choose(INVESTIMENTO, message);
    if (!answer) {
      await send(db, contact, 'Escolha a faixa mais próxima da sua previsão. 👇', { type: 'list', title: 'Capital inicial', items: INVESTIMENTO });
      return true;
    }
    await saveField(db, contact, 'Mentoria · Investimento previsto', answer.title);
    await ask(db, contact, 'estado_iniciante', 'Em qual estado você pretende começar sua operação?');
    return true;
  }
  if (step === 'estado' || step === 'estado_iniciante') {
    if (!text || text.length > 60) {
      await send(db, contact, 'Você pode me informar o estado (por exemplo, SP ou São Paulo)? 😊');
      return true;
    }
    await saveField(db, contact, 'Mentoria · Estado', text);
    if (step === 'estado_iniciante') {
      await ask(db, contact, 'objetivo', 'Qual é seu principal objetivo ao começar essa operação? Pode me contar com suas palavras.');
    } else {
      await ask(db, contact, 'faturamento', 'Qual é o faturamento médio mensal da sua operação?', { type: 'list', title: 'Faturamento mensal', items: FATURAMENTO });
    }
    return true;
  }
  if (step === 'faturamento') {
    const answer = choose(FATURAMENTO, message);
    if (!answer) {
      await send(db, contact, 'Escolha a faixa de faturamento mais próxima, ou “Prefiro não informar”. 👇', { type: 'list', title: 'Faturamento mensal', items: FATURAMENTO });
      return true;
    }
    await saveField(db, contact, 'Mentoria · Faturamento', answer.title);
    await ask(db, contact, 'objetivo', 'Pra finalizar: qual é o seu principal objetivo ou desafio com o negócio hoje?');
    return true;
  }
  if (step === 'objetivo') {
    if (!text) {
      await send(db, contact, 'Me conta com suas palavras qual objetivo ou desafio mais importa pra você neste momento. 😊');
      return true;
    }
    await saveField(db, contact, 'Mentoria · Objetivo/desafio', text);
    await finishMentoria(db, contact);
    return true;
  }
  return true;
}

function parseNameAndSubject(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(?:me chamo|meu nome é|sou a |sou o |sou )\s+([^,.;\n]{2,55})[,.;\n]\s*(.+)$/i)
    || value.match(/^nome\s*:\s*([^,;\n]{2,55})[,;\n]\s*(?:assunto\s*:\s*)?(.+)$/i);
  if (match) return { name: match[1].trim(), subject: match[2].trim() };
  const pair = value.split(/\s+[-–—]\s+/);
  if (pair.length === 2 && pair[0].split(' ').length <= 4 && pair[1].length > 3) {
    return { name: pair[0].trim(), subject: pair[1].trim() };
  }
  return { name: null, subject: value };
}

async function handleOutros(db, contact, message, state) {
  const text = shortInput(message);
  if (!text) {
    await send(db, contact, 'Pode escrever seu nome e o assunto para eu encaminhar à equipe? 😊');
    return true;
  }
  if (state === START_OUTROS) {
    const parsed = parseNameAndSubject(text);
    if (parsed.name && parsed.subject) {
      await saveField(db, contact, 'Outro assunto · Nome', parsed.name, { profile_name: parsed.name });
      await saveField(db, contact, 'Outro assunto · Solicitação', parsed.subject);
      await finish(db, contact, OUTROS, 'Nome: ' + parsed.name + '\nAssunto: ' + parsed.subject);
    } else if (text.split(' ').length <= 3 && text.length < 45 && !/[.!?]/.test(text)) {
      await saveField(db, contact, 'Outro assunto · Nome', text, { profile_name: text });
      await setState(db, contact, OUTROS, 'nina_outros_assunto');
      await send(db, contact, 'Obrigada! 😊 E sobre qual assunto você gostaria de falar com a equipe?');
    } else {
      await saveField(db, contact, 'Outro assunto · Solicitação', text);
      await setState(db, contact, OUTROS, 'nina_outros_nome');
      await send(db, contact, 'Entendi! E como posso te chamar? Assim já encaminho tudo para a equipe. 😊');
    }
    return true;
  }
  if (state === 'nina_outros_nome') {
    await saveField(db, contact, 'Outro assunto · Nome', text, { profile_name: text });
    const subject = (contact.tags || []).find((tag) => tag.startsWith('Outro assunto · Solicitação: ')) || '';
    await finish(db, contact, OUTROS, 'Nome: ' + text + '\n' + subject);
    return true;
  }
  if (state === 'nina_outros_assunto') {
    await saveField(db, contact, 'Outro assunto · Solicitação', text);
    const name = (contact.tags || []).find((tag) => tag.startsWith('Outro assunto · Nome: ')) || '';
    await finish(db, contact, OUTROS, name + '\nAssunto: ' + text);
    return true;
  }
  return true;
}

export async function processNinaFlow(db, { contact, message, session }) {
  if (!session || !['Mentoria', 'Outro assunto'].includes(session.current_topic)) return false;
  if (!String(session.state || '').startsWith('nina_')) return false;
  if (session.state === 'nina_awaiting_human' || session.state === 'nina_human') return true;

  // A response by an actual team member permanently pauses the assistant for this application.
  const { data: lastMessages, error } = await db.from('whatsapp_messages')
    .select('direction,raw_payload,sent_at').eq('contact_id', contact.id)
    .order('sent_at', { ascending: false }).limit(25);
  if (error) throw error;
  const lastOutbound = (lastMessages || []).find((row) => row.direction === 'outbound');
  if (lastOutbound && !lastOutbound.raw_payload?.tide_nina) {
    await setState(db, contact, session.current_topic, 'nina_human');
    return true;
  }
  if (session.current_topic === MENTORIA) return handleMentoria(db, contact, message, session.state);
  return handleOutros(db, contact, message, session.state);
}

export async function pauseNinaFlow(db, contactId) {
  const { data: session, error: readError } = await db.from('whatsapp_automation_sessions')
    .select('state,current_topic').eq('contact_id', contactId).maybeSingle();
  if (readError) throw readError;
  if (!session || !['Mentoria', 'Outro assunto'].includes(session.current_topic)
    || !String(session.state || '').startsWith('nina_')
    || ['nina_human', 'nina_awaiting_human'].includes(session.state)) return false;
  const { error } = await db.from('whatsapp_automation_sessions')
    .update({ state: 'nina_human', updated_at: timestamp() })
    .eq('contact_id', contactId).eq('state', session.state);
  if (error) throw error;
  return true;
}
