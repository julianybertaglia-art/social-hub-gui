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

function clean(value, min, max, label) {
  if (typeof value !== 'string') throw applicationError('Confira ' + label + '.');
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < min || text.length > max) throw applicationError('Confira ' + label + '.');
  return text;
}

export function validateConsultoria(values) {
  const name = clean(values.name, 1, 120, 'seu nome');
  let phone = clean(values.phone, 10, 30, 'seu WhatsApp com DDD').replace(/\D/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  if (!/^55[1-9]\d\d{8,9}$/.test(phone) || /^(\d)\1+$/.test(phone.slice(4))) throw applicationError('Informe um WhatsApp brasileiro válido com DDD.');
  let instagram = clean(values.instagram, 1, 160, 'seu Instagram');
  instagram = instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(instagram)) throw applicationError('Informe seu @ do Instagram.');
  if (!Object.hasOwn(EXPERIENCE, values.experience)) throw applicationError('Conte se você já vende no Mercado Livre.');
  if (!Object.hasOwn(REVENUE, values.revenue)) throw applicationError('Escolha sua faixa de faturamento.');
  if (values.experience === 'zero' && values.revenue !== 'none') throw applicationError('Se você ainda não vende, selecione “Ainda não faturo”.');
  const product = clean(values.product, 1, 300, 'seu produto ou nicho');
  const challenge = clean(values.challenge, 1, 1500, 'o problema que você gostaria de analisar');
  if (!Object.hasOwn(RECORDING, values.recording)) throw applicationError('Responda à pergunta sobre os trechos da consultoria.');
  if (values.consent !== 'yes') throw applicationError('Autorize a análise dos dados e o contato sobre sua candidatura.');
  let storeUrl = String(values.storeUrl || '').trim();
  if (storeUrl) {
    let parsed;
    try { parsed = new URL(storeUrl); } catch { throw applicationError('Confira o link da sua loja ou deixe o campo em branco.'); }
    if (storeUrl.length > 500 || parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !['mercadolivre.com.br', 'mercadolivre.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
      throw applicationError('Use um link https do Mercado Livre ou deixe o campo em branco.');
    }
    parsed.hash = ''; storeUrl = parsed.toString();
  }
  return { name, phone, instagram: instagram.toLowerCase(), experience: values.experience, revenue: values.revenue,
    product, store_url: storeUrl || null, challenge, recording: values.recording, consent_text: CONSULTORIA_CONSENT,
    marketing_opt_in: values.marketing === 'yes', segment: values.experience === 'zero' ? 'beginner' : 'seller' };
}
