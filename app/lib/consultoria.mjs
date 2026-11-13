export const CONSULTORIA_OWNER = 'd3db0981-1179-459e-9449-9e97232f6632';
export const CONSULTORIA_CAMPAIGN = 'consultoria-20261022';
export const CONSULTORIA_URL = 'https://social-hub-gui.vercel.app/consultoria';
export const EXPERIENCE = { zero: 'Ainda não vendo', starting: 'Comecei recentemente', seller: 'Já tenho uma operação' };
export const REVENUE = {
  none: 'Ainda não faturo', up_to_10k: 'Até R$10 mil', '10k_50k': 'Acima de R$10 mil até R$50 mil',
  '50k_100k': 'Acima de R$50 mil até R$100 mil', '100k_500k': 'Acima de R$100 mil até R$500 mil',
  '500k_plus': 'Acima de R$500 mil',
};
export const RECORDING = { yes: 'Topo participar dos conteúdos', discuss: 'Prefiro conversar sobre isso antes' };
export const REVIEW_STATUS = {
  pending: 'A analisar', shortlisted: 'Pré-selecionado', selected: 'Selecionado', contacted: 'Contato feito',
  scheduled: 'Agendado', completed: 'Realizado', declined: 'Não selecionado',
};
export const CONSULTORIA_CONSENT = 'Autorizo a equipe do Gui Nonato a analisar os dados informados para a seleção e entrar em contato comigo pelo WhatsApp sobre esta candidatura.';
export const CONSULTORIA_DIRECT = 'Fala! 👊 Quer participar da seleção para uma consultoria individual e gratuita de 30 minutos comigo?\n\nPreencha o formulário para eu conhecer sua operação:\n' + CONSULTORIA_URL + '\n\nAs vagas são limitadas. O preenchimento do formulário não garante a vaga. Minha equipe vai entrar em contato com os selecionados pelo WhatsApp.';

export function applicationError(message, status = 400) { return Object.assign(new Error(message), { status }); }

function optionalText(value, max, label) {
  if (value == null) return null;
  if (typeof value !== 'string') throw applicationError('Confira ' + label + '.');
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (text.length > max) throw applicationError('Confira ' + label + '.');
  return text;
}

function optionalChoice(value, options, label) {
  const choice = optionalText(value, 40, label);
  if (!choice) return null;
  if (!Object.hasOwn(options, choice)) throw applicationError('Confira ' + label + '.');
  return choice;
}

export function validateConsultoria(values) {
  const name = optionalText(values.name, 120, 'seu nome');
  const rawPhone = optionalText(values.phone, 30, 'seu WhatsApp com DDD');
  let phone = null;
  if (rawPhone) {
    phone = rawPhone.replace(/\D/g, '');
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
    if (!/^55[1-9]\d\d{8,9}$/.test(phone) || /^(\d)\1+$/.test(phone.slice(4))) {
      throw applicationError('Confira seu WhatsApp com DDD ou deixe o campo em branco.');
    }
  }

  let instagram = optionalText(values.instagram, 160, 'seu Instagram');
  if (instagram) {
    instagram = instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '');
    if (!instagram) instagram = null;
    else if (!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(instagram)) {
      throw applicationError('Confira seu Instagram ou deixe o campo em branco.');
    } else instagram = instagram.toLowerCase();
  }

  const experience = optionalChoice(values.experience, EXPERIENCE, 'se você já vende no Mercado Livre');
  const revenue = optionalChoice(values.revenue, REVENUE, 'sua faixa de faturamento');
  if (experience === 'zero' && revenue && revenue !== 'none') {
    throw applicationError('Se você ainda não vende, selecione “Ainda não faturo” ou deixe a pergunta em branco.');
  }

  const product = optionalText(values.product, 300, 'seu produto ou nicho');
  let storeUrl = String(values.storeUrl || '').trim();
  if (storeUrl) {
    let parsed;
    try { parsed = new URL(storeUrl); } catch { throw applicationError('Confira o link da sua loja ou deixe o campo em branco.'); }
    if (storeUrl.length > 500 || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !['mercadolivre.com.br', 'mercadolivre.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
      throw applicationError('Use um link https do Mercado Livre ou deixe o campo em branco.');
    }
    parsed.hash = ''; storeUrl = parsed.toString();
  } else {
    storeUrl = null;
  }

  const challenge = optionalText(values.challenge, 1500, 'o problema que você gostaria de analisar');
  const recording = optionalChoice(values.recording, RECORDING, 'a pergunta sobre os trechos da consultoria');
  const hasConsent = values.consent === 'yes';
  const segment = experience ? (experience === 'zero' ? 'beginner' : 'seller') : null;

  return {
    name, phone, instagram, experience, revenue, product, store_url: storeUrl, challenge, recording,
    consent_text: hasConsent ? CONSULTORIA_CONSENT : null,
    consent_at: hasConsent ? new Date().toISOString() : null,
    marketing_opt_in: values.marketing === 'yes',
    segment,
  };
}
