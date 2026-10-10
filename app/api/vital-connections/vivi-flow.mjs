import { WHATSAPP_API_VERSION } from '../whatsapp/lib.js';
import { routeViviConversation } from '../integrations/argo/v1/bridge.mjs';

export const VIVI_MAIN = [
  { id: 'vivi_buy', title: 'Quero comprar', description: 'Conhecer produtos e receber atendimento' },
  { id: 'vivi_order', title: 'Meu pedido', description: 'Dúvidas, entrega ou pós-venda' },
  { id: 'vivi_wholesale', title: 'Quero revender', description: 'Compras no atacado' },
  { id: 'vivi_affiliate', title: 'Afiliado TikTok Shop', description: 'Parcerias com criadores' },
];
export const VIVI_PRODUCTS = [
  { id: 'vivi_product_vital', title: 'Produtos Vital Decor' },
  { id: 'vivi_product_bluetti', title: 'Geradores BLUETTI' },
  { id: 'vivi_product_vtx', title: 'Produtos VTX Fitness' },
];
export const VIVI_MARKETPLACES = [
  { id: 'vivi_order_shopee', title: 'Shopee' },
  { id: 'vivi_order_mercadolivre', title: 'Mercado Livre' },
  { id: 'vivi_order_tiktok', title: 'TikTok Shop' },
  { id: 'vivi_order_amazon', title: 'Amazon' },
  { id: 'vivi_order_site', title: 'Site Vital Decor' },
];

export const VIVI_WELCOME = 'Oi! 👋 Sou a Vivi, assistente virtual da Vital Decor.\n\nEstou aqui para te ajudar. Selecione abaixo sobre o que você gostaria de falar.\n\nVocê pode escrever MENU a qualquer momento para voltar ao início.';
export const VIVI_WHOLESALE = 'Que bom saber do seu interesse em revender nossos produtos! 🤝\n\nVocê pode combinar produtos de diferentes categorias no mesmo pedido. Nesse caso, o pedido mínimo é de R$ 25.000 no total.\n\nPara compras somente de grama sintética, o mínimo é 1.000 m². Para compras somente de placas de PVC 3D, o mínimo é R$ 3.000.\n\nA seguir, vou te enviar nosso catálogo interativo. Você escolhe os produtos, monta o pedido e solicita pelo WhatsApp.\n\nPara adiantar o atendimento, me diga seu nome, cidade/estado e quais itens procura. Nossa equipe comercial dará continuidade por aqui.';
export const VIVI_BLUETTI = 'Ótima escolha! 🔋 Um especialista da nossa equipe vai continuar seu atendimento por aqui.\n\nEnquanto isso, você pode conhecer os modelos em nosso catálogo BLUETTI. Para agilizar, me diga seu nome e qual modelo deseja conhecer ou qual é sua dúvida sobre o produto.';
export const VIVI_BLUETTI_NO_CATALOG = 'Ótima escolha! 🔋 Um especialista da nossa equipe vai continuar seu atendimento por aqui.\n\nPara agilizar, me diga seu nome e qual modelo BLUETTI deseja conhecer ou qual é sua dúvida. Nossa equipe também poderá compartilhar o catálogo.';
export const VIVI_ORDER_QUESTION = 'Para localizar seu pedido, me informe: seu nome completo, o número do pedido e sua dúvida. Nossa equipe de pós-venda vai conferir e continuar o atendimento por aqui. 😊';

export function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
export function extractChoice(message) {
  const listId = String(message?.interactive?.list_reply?.id || message?.interactive?.button_reply?.id || '').trim();
  if (listId) return listId;
  const text = normalizeText(message?.text?.body || message?.button?.text || '');
  return text === 'menu' ? 'vivi_menu' : text;
}
export function isVitalChoice(choice) {
  return choice === 'vivi_menu' || /^vivi_(buy|order|wholesale|affiliate|product_(vital|bluetti|vtx)|order_(shopee|mercadolivre|tiktok|amazon|site))$/.test(choice);
}

export async function metaSend(connection, to, message) {
  const url = 'https://graph.facebook.com/' + WHATSAPP_API_VERSION + '/' + connection.external_account_id + '/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + connection.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message }),
    cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || !payload.messages?.[0]?.id) {
    throw new Error('Meta recusou envio da Vivi: ' + String(payload.error?.code || response.status));
  }
  return payload.messages[0].id;
}
export async function sendAndLog(db, connection, to, message, display) {
  const messageId = await metaSend(connection, to, message);
  const { error } = await db.from('workspace_meta_messages').upsert({
    connection_id: connection.id, owner_user_id: connection.owner_user_id,
    meta_message_id: messageId, contact_wa_id: to, direction: 'outbound',
    message_type: message.type, body: display, status: 'sent', sent_at: new Date().toISOString(),
    raw_payload: { type: message.type, source: 'vivi_automation' },
  }, { onConflict: 'connection_id,meta_message_id', ignoreDuplicates: true });
  if (error) console.error('Vivi outbound log failed', error.code);
}
export async function sendText(db, connection, to, body) {
  return sendAndLog(db, connection, to,
    { type: 'text', text: { body, preview_url: false } }, body);
}
export async function sendList(db, connection, to, body, title, rows) {
  return sendAndLog(db, connection, to, {
    type: 'interactive', interactive: {
      type: 'list', body: { text: body }, action: {
        button: title, sections: [{ title: 'Escolha uma opção', rows }],
      },
    },
  }, body);
}
export async function sendDocument(db, connection, to, url, filename) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Catálogo precisa ter link HTTPS público');
  return sendAndLog(db, connection, to, {
    type: 'document', document: { link: parsed.toString(), filename },
  }, '[Catálogo em PDF: ' + filename + ']');
}
async function setSession(db, connection, to, state) {
  const { error } = await db.from('vital_whatsapp_flow_sessions').upsert({
    connection_id: connection.id, owner_user_id: connection.owner_user_id, contact_wa_id: to,
    stage: state.stage, selection: state.selection || null,
    human_handoff: Boolean(state.human_handoff),
    manual_override: Boolean(state.manual_override),
    updated_at: new Date().toISOString(), last_interaction_at: new Date().toISOString(),
  }, { onConflict: 'connection_id,contact_wa_id' });
  if (error) throw error;
  await routeViviConversation(db, connection, to, state.stage, state.selection);
}
async function mainMenu(db, connection, to) {
  await sendList(db, connection, to, VIVI_WELCOME, 'Escolher assunto', VIVI_MAIN);
  await setSession(db, connection, to, { stage: 'menu' });
}
async function application(db, connection, to) {
  const { data: existing, error: findError } = await db.from('vital_whatsapp_affiliate_applications')
    .select('public_token').eq('connection_id', connection.id).eq('contact_wa_id', to).maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.public_token;
  const { data, error } = await db.from('vital_whatsapp_affiliate_applications').insert({
    connection_id: connection.id, owner_user_id: connection.owner_user_id, contact_wa_id: to,
  }).select('public_token').single();
  if (error) throw error;
  return data.public_token;
}
export async function handleViviMessage(db, connection, message, origin) {
  if (!message?.id || !message.from) return;
  const to = String(message.from).replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(to)) return;
  const { data: config, error: configError } = await db.from('vital_whatsapp_flow_configs')
    .select('enabled,bluetti_catalog_url,wholesale_catalog_url').eq('connection_id', connection.id).maybeSingle();
  if (configError || !config?.enabled) return;

  const choice = extractChoice(message);
  const { data: session, error: sessionError } = await db.from('vital_whatsapp_flow_sessions')
    .select('stage,human_handoff,manual_override').eq('connection_id', connection.id)
    .eq('contact_wa_id', to).maybeSingle();
  if (sessionError) throw sessionError;
  if (choice !== 'vivi_menu' && (session?.human_handoff || session?.manual_override)) return;
  if (!session && choice !== 'vivi_menu') {
    const { data: previous, error: historyError } = await db.from('workspace_meta_messages')
      .select('id').eq('connection_id', connection.id).eq('contact_wa_id', to)
      .neq('meta_message_id', message.id).limit(1);
    if (historyError) throw historyError;
    if (previous?.length) return; // Never greet old or manually initiated conversations.
  }
  if (session && !isVitalChoice(choice) && choice !== 'vivi_menu') return;
  // Process every message id only once, even if Meta retries its webhook.
  const { error: claimError } = await db.from('vital_whatsapp_flow_events').insert({
    connection_id: connection.id, owner_user_id: connection.owner_user_id,
    meta_message_id: message.id,
  });
  if (claimError?.code === '23505') return;
  if (claimError) throw claimError;

  try {
    if (choice === 'vivi_menu' || !session) await mainMenu(db, connection, to);
    else if (choice === 'vivi_buy') {
      await sendList(db, connection, to, 'Claro! Qual linha de produtos você procura?', 'Ver produtos', VIVI_PRODUCTS);
      await setSession(db, connection, to, { stage: 'products' });
    } else if (choice === 'vivi_order') {
      await sendList(db, connection, to, 'Vamos te ajudar com o pedido! Onde você realizou sua compra?', 'Escolher loja', VIVI_MARKETPLACES);
      await setSession(db, connection, to, { stage: 'order_channel' });
    } else if (choice === 'vivi_wholesale') {
      await sendText(db, connection, to, VIVI_WHOLESALE);
      if (config.wholesale_catalog_url) await sendText(db, connection, to, '📲 Acesse nosso catálogo interativo de atacado e monte seu pedido:\n' + config.wholesale_catalog_url);
      await setSession(db, connection, to, { stage: 'await_human', selection: 'Revenda', human_handoff: true });
    } else if (choice === 'vivi_affiliate') {
      const token = await application(db, connection, to);
      const url = new URL('/parcerias/vital-afiliados', origin);
      url.searchParams.set('token', token);
      await sendAndLog(db, connection, to, {
        type: 'interactive',
        interactive: { type: 'cta_url', body: {
          text: 'Que legal ter você por aqui! 💛 Para avaliarmos uma parceria no TikTok Shop, preencha o formulário abaixo. Leva cerca de 3 minutos. Nossa equipe analisará o seu perfil e seus conteúdos.',
        }, action: { name: 'cta_url', parameters: { display_text: 'Preencher formulário', url: url.toString() } } },
      }, 'Inscrição de afiliado TikTok Shop: ' + url.toString());
      await setSession(db, connection, to, { stage: 'affiliate_form', selection: 'Afiliado TikTok', human_handoff: true });
    } else if (session?.stage === 'products' && VIVI_PRODUCTS.some(row => row.id === choice)) {
      const product = VIVI_PRODUCTS.find(row => row.id === choice)?.title;
      if (choice === 'vivi_product_bluetti') {
        await sendText(db, connection, to, config.bluetti_catalog_url ? VIVI_BLUETTI : VIVI_BLUETTI_NO_CATALOG);
        if (config.bluetti_catalog_url) await sendDocument(db, connection, to, config.bluetti_catalog_url, 'Catalogo_Vital_Decor_BLUETTI.pdf');
      } else {
        await sendText(db, connection, to,
          'Perfeito! Você escolheu ' + product + '. 😊 Me diga seu nome e qual produto procura. Nossa equipe comercial vai continuar seu atendimento por aqui.');
      }
      await setSession(db, connection, to, { stage: 'await_human', selection: product, human_handoff: true });
    } else if (session?.stage === 'order_channel' && VIVI_MARKETPLACES.some(row => row.id === choice)) {
      const channel = VIVI_MARKETPLACES.find(row => row.id === choice)?.title;
      await sendText(db, connection, to, 'Compra pela ' + channel + '. ' + VIVI_ORDER_QUESTION);
      await setSession(db, connection, to, { stage: 'await_human', selection: 'Pós-venda · ' + channel, human_handoff: true });
    }
    await db.from('vital_whatsapp_flow_events').update({ status: 'completed' })
      .eq('connection_id', connection.id).eq('meta_message_id', message.id);
  } catch (error) {
    await db.from('vital_whatsapp_flow_events').update({ status: 'failed' })
      .eq('connection_id', connection.id).eq('meta_message_id', message.id);
    throw error;
  }
}
