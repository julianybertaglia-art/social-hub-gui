const VITAL_STORE_ORIGIN = 'https://vitaldecor.com.br';

export const VIVI_SALES_CATEGORIES = Object.freeze([
  {
    id: 'vivi_sales_garden',
    title: 'Jardim vertical',
    query: 'jardim vertical',
    keywords: ['jardim vertical', 'buchinho', 'samambaia', 'eucalipto', 'floresta viva', 'amazonas', 'selva tropical', 'muro ingles'],
  },
  {
    id: 'vivi_sales_grass',
    title: 'Grama sintética',
    query: 'grama sintetica',
    keywords: ['grama sintetica', 'gramado', 'grama'],
  },
  {
    id: 'vivi_sales_3d',
    title: 'Placas 3D em PVC',
    query: 'placas pvc 3d',
    keywords: ['placa 3d', 'placas 3d', 'pvc 3d', 'petala', 'estrelar', 'viena'],
  },
  {
    id: 'vivi_sales_adhesive',
    title: 'Adesivos e mármores',
    query: 'placa adesiva marmore',
    keywords: ['adesivo', 'marmore', 'carrara', 'calacata', 'revestimento adesivo'],
  },
  {
    id: 'vivi_sales_plants',
    title: 'Plantas artificiais',
    query: 'plantas artificiais',
    keywords: ['plantas artificiais', 'planta artificial', 'pendente', 'corrente de rosas'],
  },
]);

export const VIVI_SALES_HUMAN_ID = 'vivi_sales_human';
export const VIVI_SALES_OPTIONS = Object.freeze([
  ...VIVI_SALES_CATEGORIES.map(({ id, title }) => ({ id, title })),
  { id: VIVI_SALES_HUMAN_ID, title: 'Falar com atendente' },
]);

const HUMAN_REQUESTS = [
  'atendente', 'atendimento humano', 'falar com pessoa', 'falar com alguem',
  'falar com a equipe', 'falar com vendedor', 'consultor', 'consultora',
  'quero falar com', 'representante',
];

export function normalizeSalesText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function matchViviSalesIntent(value) {
  const text = normalizeSalesText(value);
  if (!text) return null;
  if (text === VIVI_SALES_HUMAN_ID || HUMAN_REQUESTS.some(phrase => text.includes(phrase))) {
    return VIVI_SALES_HUMAN_ID;
  }
  const exact = VIVI_SALES_CATEGORIES.find(category => category.id === text);
  if (exact) return exact.id;
  return VIVI_SALES_CATEGORIES.find(category =>
    category.keywords.some(keyword => text.includes(normalizeSalesText(keyword))),
  )?.id || null;
}

export function getViviSalesCategory(id) {
  return VIVI_SALES_CATEGORIES.find(category => category.id === id) || null;
}

export function getViviSalesLink(id) {
  const category = getViviSalesCategory(id);
  if (!category) return null;
  const url = new URL('/search/', VITAL_STORE_ORIGIN);
  url.searchParams.set('q', category.query);
  return url.toString();
}

export function buildViviSalesMessage(id) {
  const category = getViviSalesCategory(id);
  const url = getViviSalesLink(id);
  if (!category || !url) return '';
  return `Perfeito! 💜 Confira as opções de ${category.title} no catálogo oficial da Vital Decor:\n\n🛍️ ${url}\n\nOs preços e a disponibilidade aparecem atualizados na loja. Se quiser ajuda para escolher, me conte qual ambiente você quer transformar e as medidas aproximadas. 😊\n\nSe preferir falar com uma pessoa, escreva *ATENDENTE*.`;
}
