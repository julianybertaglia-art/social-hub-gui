import { calculateInfluencerScore, INFLUENCER_CLASSIFICATIONS } from '../../lib/influencer-scoring.js';
import { sendWhatsAppText } from '../../api/whatsapp/lib.js';

export const INFLUENCER_APPLICATIONS_TABLE = 'influencer_applications';
export const INFLUENCER_CONSENT_TEXT = 'Autorizo a Vital Decor a analisar os dados e perfis informados para avaliar uma possível parceria.';

export function formError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function cleanText(value, { min = 0, max = 500, label = 'campo' } = {}) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) throw formError(`Confira o ${label}.`, 400);
  return text;
}

function integer(value, { min = 0, max, label }) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw formError(`Preencha ${label} usando apenas números.`, 400);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw formError(`Confira ${label}.`, 400);
  return parsed;
}

function socialUrl(value, network, required = true) {
  const raw = String(value || '').trim();
  if (!raw && !required) return null;
  if (!raw) throw formError(`Informe o seu perfil do ${network}.`, 400);

  let candidate = raw;
  if (raw.startsWith('@')) {
    candidate = network === 'TikTok'
      ? `https://www.tiktok.com/${raw}`
      : `https://www.instagram.com/${raw.slice(1)}/`;
  }

  let url;
  try { url = new URL(candidate); } catch { throw formError(`Informe um link válido do ${network}.`, 400); }
  const hostname = url.hostname.toLowerCase();
  const allowed = network === 'TikTok'
    ? hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')
    : hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  if (url.protocol !== 'https:' || !allowed) throw formError(`Informe um link válido do ${network}.`, 400);
  url.hash = '';
  return url.toString();
}

function optionalTikTokVideo(value) {
  const raw = String(value || '').trim();
  return raw ? socialUrl(raw, 'TikTok', true) : null;
}

export function validateInfluencerApplication(values) {
  const publicToken = String(values.token || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicToken)) {
    throw formError('Este link de inscrição não é válido. Solicite um novo link pelo WhatsApp.', 404);
  }

  const niche = String(values.niche || '').trim();
  const allowedNiches = new Set([
    'casa_decoracao', 'diy_reforma', 'organizacao', 'jardinagem',
    'lifestyle', 'maternidade', 'beleza', 'multinicho', 'outro',
  ]);
  if (!allowedNiches.has(niche)) throw formError('Escolha o principal tema do seu conteúdo.', 400);

  const affiliateExperience = String(values.affiliateExperience || '');
  const liveExperience = String(values.liveExperience || '');
  if (!['yes', 'no'].includes(affiliateExperience) || !['yes', 'no'].includes(liveExperience)) {
    throw formError('Responda às perguntas sobre sua experiência.', 400);
  }
  if (values.contentCommitment !== 'yes') throw formError('Confirme sua disponibilidade para produzir os conteúdos.', 400);
  if (values.consent !== 'yes') throw formError('Autorize a análise dos dados para enviar sua inscrição.', 400);

  const application = {
    publicToken,
    creatorName: cleanText(values.creatorName, { min: 2, max: 120, label: 'nome' }),
    email: cleanText(values.email, { min: 5, max: 160, label: 'e-mail' }).toLowerCase(),
    cityState: cleanText(values.cityState, { min: 3, max: 120, label: 'cidade e estado' }),
    tiktokUrl: socialUrl(values.tiktokUrl, 'TikTok'),
    instagramUrl: socialUrl(values.instagramUrl, 'Instagram', false),
    niche,
    followers: integer(values.followers, { min: 1, max: 1000000000, label: 'a quantidade de seguidores' }),
    averageViews: integer(values.averageViews, { min: 0, max: 1000000000, label: 'a média de visualizações' }),
    averageLikes: integer(values.averageLikes, { min: 0, max: 1000000000, label: 'a média de curtidas' }),
    averageComments: integer(values.averageComments, { min: 0, max: 1000000000, label: 'a média de comentários' }),
    postsPerWeek: integer(values.postsPerWeek, { min: 0, max: 100, label: 'a frequência de posts' }),
    brazilAudiencePercent: integer(values.brazilAudiencePercent, { min: 0, max: 100, label: 'a porcentagem de público brasileiro' }),
    affiliateExperience,
    liveExperience,
    contentCommitment: 'yes',
    topVideoUrls: [values.topVideo1, values.topVideo2, values.topVideo3].map(optionalTikTokVideo).filter(Boolean),
    motivation: null,
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) throw formError('Informe um e-mail válido.', 400);
  if (!application.topVideoUrls.length) throw formError('Envie pelo menos um vídeo do TikTok que represente seu conteúdo.', 400);

  return { ...application, ...calculateInfluencerScore(application) };
}

async function saveConfirmationMessage(db, application, result, text) {
  if (!application.contact_id) return;
  const messageId = result?.messages?.[0]?.id || null;
  const now = new Date().toISOString();
  await db.from('whatsapp_messages').insert({
    meta_message_id: messageId,
    contact_id: application.contact_id,
    direction: 'outbound',
    message_type: 'text',
    body: text,
    status: 'sent',
    raw_payload: result,
    sent_at: now,
  });
  await db.from('whatsapp_contacts').update({ last_message_at: now, updated_at: now }).eq('id', application.contact_id);
}

export async function loadApplicationByToken(db, publicToken) {
  if (!/^[0-9a-f-]{36}$/i.test(String(publicToken || ''))) return null;
  const { data, error } = await db.from(INFLUENCER_APPLICATIONS_TABLE)
    .select('id,public_token,status,submitted_at')
    .eq('public_token', publicToken)
    .maybeSingle();
  if (error) throw formError('O formulário está temporariamente indisponível.', 503);
  return data || null;
}

export async function saveInfluencerApplication(db, values) {
  const { data: current, error: readError } = await db.from(INFLUENCER_APPLICATIONS_TABLE)
    .select('id,contact_id,wa_id,profile_name,status,public_token')
    .eq('public_token', values.publicToken)
    .maybeSingle();
  if (readError) throw formError('Não foi possível abrir sua inscrição agora.', 503);
  if (!current) throw formError('Este link de inscrição não é válido. Solicite um novo link pelo WhatsApp.', 404);
  if (current.status === 'submitted') return { alreadySubmitted: true, classification: null };

  const now = new Date().toISOString();
  const { data, error } = await db.from(INFLUENCER_APPLICATIONS_TABLE).update({
    creator_name: values.creatorName,
    email: values.email,
    city_state: values.cityState,
    tiktok_url: values.tiktokUrl,
    instagram_url: values.instagramUrl,
    niche: values.niche,
    followers: values.followers,
    average_views: values.averageViews,
    average_likes: values.averageLikes,
    average_comments: values.averageComments,
    posts_per_week: values.postsPerWeek,
    brazil_audience_percent: values.brazilAudiencePercent,
    affiliate_experience: values.affiliateExperience === 'yes',
    live_experience: values.liveExperience === 'yes',
    content_commitment: true,
    top_video_urls: values.topVideoUrls,
    motivation: null,
    score: values.score,
    score_breakdown: values.breakdown,
    qualification: values.classification,
    status: 'submitted',
    consent_text: INFLUENCER_CONSENT_TEXT,
    consented_at: now,
    submitted_at: now,
    updated_at: now,
  }).eq('id', current.id).select('*').single();
  if (error) throw formError('Não foi possível salvar sua inscrição. Tente novamente.', 503);

  if (current.contact_id) {
    const { data: contact } = await db.from('whatsapp_contacts').select('tags,notes').eq('id', current.contact_id).maybeSingle();
    const label = INFLUENCER_CLASSIFICATIONS[values.classification]?.label || 'Revisar';
    const tags = Array.isArray(contact?.tags) ? contact.tags : [];
    const nextTags = [...new Set([...tags, 'Influenciador TikTok — Vital', `Influenciador — ${label}`])];
    const note = `Triagem automática: ${values.score}/100 · ${label}.`;
    await db.from('whatsapp_contacts').update({
      tags: nextTags,
      notes: contact?.notes ? `${contact.notes}\n${note}`.slice(0, 5000) : note,
      stage: values.classification === 'prequalified' ? 'Interessado' : 'Novo lead',
      updated_at: now,
    }).eq('id', current.contact_id);
    await db.from('whatsapp_automation_sessions').update({
      state: 'influencer_form_submitted',
      last_interaction_at: now,
      updated_at: now,
    }).eq('contact_id', current.contact_id);
  }

  const confirmation = 'Recebi seu formulário! 💛 Agora nossa equipe vai analisar seu perfil e seus conteúdos. Se houver aderência com as campanhas da Vital Decor, entramos em contato.';
  try {
    const result = await sendWhatsAppText({ to: current.wa_id, text: confirmation });
    await saveConfirmationMessage(db, current, result, confirmation);
  } catch (sendError) {
    console.warn('Influencer form WhatsApp confirmation:', sendError);
  }

  return { application: data, classification: values.classification, alreadySubmitted: false };
}

export async function listInfluencerApplications(db) {
  const { data, error } = await db.from(INFLUENCER_APPLICATIONS_TABLE)
    .select('id,contact_id,profile_name,creator_name,email,city_state,tiktok_url,instagram_url,niche,followers,average_views,average_likes,average_comments,posts_per_week,brazil_audience_percent,affiliate_experience,live_experience,content_commitment,top_video_urls,motivation,score,score_breakdown,qualification,status,review_status,review_notes,submitted_at,created_at,updated_at')
    .order('score', { ascending: false, nullsFirst: false })
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(250);
  if (error) throw formError('Não foi possível carregar os influenciadores.', 503);
  return data || [];
}
