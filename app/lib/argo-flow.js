export const ARGO_KEYWORD = 'ARGO';

export const ARGO_MENU_MESSAGE = 'Como você quer continuar? 👇\n\nSe não puder participar da Imersão, você também pode receber as novidades do Argo.';

export const ARGO_MENU_BUTTONS = [
  { type: 'web_url', title: 'Conhecer a Imersão', url: 'https://imersao.guinonato.com/' },
  { type: 'web_url', title: 'Só novidades do Argo', url: 'https://social-hub-gui.vercel.app/argo/novidades' },
  { type: 'web_url', title: 'Falar com a equipe', url: 'https://wa.me/5511923990244?text=Oi%21%20Vim%20pelo%20Direct%20do%20Gui%20e%20quero%20mais%20informa%C3%A7%C3%B5es%20sobre%20o%20Argo.' },
];

export function isArgoKeyword(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() === ARGO_KEYWORD;
}
