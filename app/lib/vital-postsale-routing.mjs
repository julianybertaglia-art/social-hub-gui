// Match only explicit menu selections. Unknown origin stays in TidePlace for triage.
export function isMarketplacePostSale(selection) {
  const normalized = String(selection || '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  return new Set([
    'pos-venda · shopee', 'pos-venda - shopee',
    'pos-venda · tiktok shop', 'pos-venda - tiktok shop',
    'pos-venda · mercado livre', 'pos-venda - mercado livre',
    'pos-venda · amazon', 'pos-venda - amazon',
  ]).has(normalized);
}

// For marketplace after-sales, the Andrey route must be enabled and have a live key.
// A generic pos_venda rule must never transfer a Nuvemshop/site or unknown order.
export function mayRouteToArgo({sector, selection, setting, keyAvailable}) {
  if (!setting?.routing_enabled || !['andrey','vitor'].includes(setting?.default_assignee) || !keyAvailable)
    return false;
  return sector !== 'pos_venda' ||
    (setting.default_assignee === 'andrey' && isMarketplacePostSale(selection));
}
