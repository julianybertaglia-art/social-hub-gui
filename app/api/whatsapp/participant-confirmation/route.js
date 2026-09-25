import {
  getMetaCredentials,
  getSupabaseAdmin,
  normalizeWaId,
  upsertWhatsAppContact,
  WHATSAPP_API_VERSION,
} from '../lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'confirmacao-2609-9d7f31b2';
const TEMPLATE_NAME = 'imersao_confirmacao_26_09_v1';
const SENT_TAG = 'Confirmação presença enviada · 25/09';

const TEMPLATE_TEXT = `Olá! Esta é uma mensagem de confirmação para a Imersão Ecommerce de amanhã, 26/09.

📍 Rua Airi, 227 - Vila Gomes Cardim - São Paulo
18º andar | Unidade 02 | Espaço Atlas
⏰ Credenciamento: 9h
🚀 Início: 10h
🪪 Leve um documento com foto.

Por favor, confirme sua presença selecionando SIM ou NÃO abaixo.

⚠️ Se for participar, é indispensável preencher este link para liberação da sua entrada no prédio:
https://invenzi.page.link/nwX4AgmVWcCMospAA

Se houver acompanhante, ele também precisa preencher o link.`;

const PARTICIPANTS = [
  ['Alex Navarra', '11960826931'],
  ['Daniel Maestrelo Acomp.', '11915868822'],
  ['Alexander Miura', '11981015468'],
  ['Beatriz Campos', '11994832651'],
  ['Camila Palko', '11965786511'],
  ['Bruno Fernandes', '19998847256'],
  ['Carlos Alberto', '11991481705'],
  ['Lidiane Cavoli acom.', '11991481705'],
  ['Cecília Nkuansambu', '11962659732'],
  ['Claudia Furlan', '19991273521'],
  ['Richard Di Cillo', '19999156863'],
  ['Daiane Silva', '6492153297'],
  ['Marcos Silva acom.', '6492153297'],
  ['Rejane Conceição acom.', '6492153297'],
  ['Diogo Bernado', '11976990740'],
  ['Eduardo Dias (acomp)', '11974754077'],
  ['Edson Buzi', '11996310651'],
  ['Eduardo Nunes', '11949698456'],
  ['Thiago de Jesus', '11983753981'],
  ['Gabriel Cavalcantti', '11979613038'],
  ['Guilherme Sarmento', '119470044855'],
  ['Gustavo Palacios', '73991487382'],
  ['Gustavo Guimarães', '13997001617'],
  ['Damiela Sousa', '11934649136'],
  ['Gustavo Nonato', '11982500205'],
  ['Nicolas Acom.', '11982500205'],
  ['Pedro Henrique Acom.', '11982500205'],
  ['Heitor Bastos', '11987564478'],
  ['Jacqueline Nascimento', '11939601042'],
  ['Luciana Beltrame', '11987434434'],
  ['Carlos Daniel', '11989798092'],
  ['Marcos Vinícius', '11977668183'],
  ['Mary Verçosa', '11930621997'],
  ['Edivan Verçosa', '11930621997'],
  ['Matheus Moura', '13997780247'],
  ['Gabrielle Vitória Acom', '13988303400'],
  ['Otavio Augusto Fukuda', '11980964272'],
  ['Rafael Morais', '11913299658'],
  ['Rafael Quinalha', '11950435189'],
  ['Bruno Quinalha', '11994140573'],
  ['Renata Dilys', '11992589763'],
  ['Robert Vagner', '11991188687'],
  ['Bia (acomp. Robert)', '11931501019'],
  ['Rodolfo Sousa', '11960776143'],
  ['Edlayne Acom.', '11960776143'],
  ['Rodrigo Oliveira', '11976990740'],
  ['Sebastião Gonçalvez', '11949172528'],
  ['Thais Macedo', '92981701713'],
  ['Beatriz Mariano', '11977709268'],
  ['Vitoria Moura', '11951972289'],
  ['Francisca Costa Fonseca', '11951972289'],
  ['Wennedy Nogueira', '5511998791142'],
  ['Rafael Leony Acomp.', '11970475446'],
  ['William de Jesus', '5534992747210'],
  ['Getúlio de Jesus Acom.', '34999324560'],
];

function normalizeBrazilPhone(value) {
  const digits = normalizeWaId(value);
  if (!digits) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return null;
}

function dedupedParticipants() {
  const seen = new Set();
  const rows = [];
  for (const [name, rawPhone] of PARTICIPANTS) {
    const phone = normalizeBrazilPhone(rawPhone);
    const duplicateKey = phone || ('invalid:' + normalizeWaId(rawPhone));
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    rows.push({ name, rawPhone, phone });
  }
  return rows;
}

async function graphJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Meta HTTP ${response.status}`);
    error.code = payload?.error?.code || response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function getTemplate(meta) {
  const payload = await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.wabaId)}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}&fields=id,name,status,category,language,components&limit=10`,
    { headers: { Authorization: `Bearer ${meta.accessToken}` } }
  );
  return payload?.data?.[0] || null;
}

async function ensureTemplate(meta) {
  let template = await getTemplate(meta);
  if (template) return template;

  await graphJson(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.wabaId)}/message_templates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: TEMPLATE_NAME,
        language: 'pt_BR',
        category: 'UTILITY',
        allow_category_change: true,
        components: [
          { type: 'BODY', text: TEMPLATE_TEXT },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'SIM, vou participar' },
              { type: 'QUICK_REPLY', text: 'NÃO vou participar' },
            ],
          },
        ],
      }),
    }
  );

  template = await getTemplate(meta);
  return template;
}

export async function POST(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== KEY) {
    return Response.json({ ok: false }, { status: 404 });
  }

  try {
    const meta = await getMetaCredentials();
    if (!meta?.accessToken || !meta?.phoneNumberId || !meta?.wabaId) {
      return Response.json({ ok: false, error: 'Credenciais Meta indisponíveis.' }, { status: 503 });
    }

    const template = await ensureTemplate(meta);
    if (!template || template.status !== 'APPROVED') {
      const status = template?.status || 'PENDING';
      if (['REJECTED', 'DISABLED', 'PAUSED'].includes(status)) {
        return Response.json({
          ok: false,
          waitingApproval: false,
          templateStatus: status,
          template: TEMPLATE_NAME,
        }, { status: 409 });
      }
      return Response.json({
        ok: false,
        waitingApproval: true,
        templateStatus: status,
        template: TEMPLATE_NAME,
      }, { status: 202 });
    }

    const supabase = getSupabaseAdmin();
    const results = [];

    for (const participant of dedupedParticipants()) {
      if (!participant.phone) {
        results.push({
          name: participant.name,
          phone: participant.rawPhone,
          status: 'skipped',
          reason: 'Número inválido na planilha',
        });
        continue;
      }

      let contact = await upsertWhatsAppContact(supabase, {
        waId: participant.phone,
        profileName: participant.name,
        source: 'Imersão Ecommerce 26/09',
      });

      const tags = Array.isArray(contact.tags) ? contact.tags : [];
      if (tags.includes(SENT_TAG)) {
        results.push({
          name: participant.name,
          phone: participant.phone,
          status: 'skipped',
          reason: 'Já enviado',
        });
        continue;
      }

      try {
        const payload = await graphJson(
          `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${encodeURIComponent(meta.phoneNumberId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${meta.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to: participant.phone,
              type: 'template',
              template: {
                name: TEMPLATE_NAME,
                language: { code: 'pt_BR' },
              },
            }),
          }
        );

        const messageId = payload?.messages?.[0]?.id || null;
        const now = new Date().toISOString();

        const { error: messageError } = await supabase.from('whatsapp_messages').insert({
          meta_message_id: messageId,
          contact_id: contact.id,
          direction: 'outbound',
          message_type: 'template',
          body: TEMPLATE_TEXT,
          status: 'sent',
          raw_payload: payload,
          sent_at: now,
        });
        if (messageError) throw messageError;

        const nextTags = tags.includes(SENT_TAG) ? tags : [...tags, SENT_TAG];
        const { error: updateError } = await supabase.from('whatsapp_contacts')
          .update({
            tags: nextTags,
            last_message_at: now,
            updated_at: now,
          })
          .eq('id', contact.id);
        if (updateError) throw updateError;

        results.push({
          name: participant.name,
          phone: participant.phone,
          status: 'sent',
          messageId,
        });
      } catch (error) {
        results.push({
          name: participant.name,
          phone: participant.phone,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Falha no envio',
          code: error?.code || null,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return Response.json({
      ok: true,
      templateStatus: template.status,
      totalRowsInSheet: PARTICIPANTS.length,
      uniquePhones: dedupedParticipants().length,
      sent: results.filter((x) => x.status === 'sent').length,
      skipped: results.filter((x) => x.status === 'skipped').length,
      failed: results.filter((x) => x.status === 'failed').length,
      results,
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no disparo.',
      code: error?.code || null,
      meta: error?.payload || null,
    }, { status: 500 });
  }
}
