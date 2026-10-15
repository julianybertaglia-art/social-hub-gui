// Single navigation model for the TidePlace shell and command palette.
// UI metadata only. No CRM, Meta or automation business rules are changed.
export const NAV_GROUPS = [
  {
    label: 'VISÃO GERAL',
    items: [
      { href: '/', label: 'Painel', icon: 'grid', section: 'dashboard', description: 'Resumo e prioridades' },
      { href: '/?section=tasks', label: 'Tarefas', icon: 'check', section: 'tasks', description: 'Pendências e organização' },
    ],
  },
  {
    label: 'INSTAGRAM',
    items: [
      { href: '/?section=metrics', label: 'Métricas', icon: 'chart', section: 'metrics', description: 'Desempenho do Instagram' },
      { href: '/automacoes', label: 'Automações', icon: 'instagram', description: 'Direct e comentários do Instagram' },
      { href: '/?section=goals', label: 'Metas', icon: 'target', section: 'goals', description: 'Metas da conta do Instagram' },
      { href: '/?section=calendar', label: 'Calendário', icon: 'calendar', section: 'calendar', description: 'Calendário editorial' },
      { href: '/?section=ideas', label: 'Ideias', icon: 'sparkle', section: 'ideas', description: 'Banco de ideias de conteúdo' },
    ],
  },
  {
    label: 'CRIAÇÃO DE CONTEÚDO',
    items: [
      { href: '/previa-radar.html', label: 'Radar de conteúdo', icon: 'sparkle', description: 'Tendências, referências e ideias por marca' },
      { href: '/conteudo/ia', label: 'Roteiros com IA', icon: 'sparkle', description: 'Criar conteúdo por marca com inteligência artificial' },
      { href: '/criar-post', label: 'Criar post', icon: 'layers', description: 'Editor de carrosséis, fotos, textos e exportação' },
    ],
  },
  {
    label: 'CRM · WHATSAPP',
    items: [
      { href: '/crm', label: 'Funil e indicadores', icon: 'chart', description: 'Oportunidades e atendimento por setor' },
      { href: '/whatsapp', label: 'Caixa de entrada', icon: 'chat', only: ['gui-nonato'], description: 'CRM e mensagens do Gui' },
      { href: '/whatsapp', label: 'Caixa geral', icon: 'chat', only: ['vital-decor'], description: 'Todas as mensagens da Vital Decor' },
      { href: '/whatsapp/setores', label: 'Meus setores', icon: 'users', only: ['vital-decor'], description: 'Conversas atribuídas ao seu atendimento' },
      { href: '/whatsapp/automacoes', label: 'Automações', icon: 'flow', description: 'Fluxos e respostas automáticas do WhatsApp' },
      { href: '/whatsapp/campanha', label: 'Campanhas', icon: 'send', only: ['gui-nonato'], description: 'Reengajamento e envios' },
    ],
  },
  {
    label: 'MAIS FERRAMENTAS',
    items: [
      { href: '/tiktok/afiliados', label: 'Afiliados TikTok', icon: 'tiktok', description: 'Parcerias e qualificação' },
      { href: '/whatsapp/integracao-argo', label: 'Setores e Argo', icon: 'layers', only: ['vital-decor'], description: 'Configuração de responsáveis e integração Argo' },
      { href: '/whatsapp/grupos', label: 'Grupos', icon: 'users', only: ['gui-nonato'], description: 'Gestão de grupos' },
      { href: '/whatsapp/gato', label: 'Envios rápidos', icon: 'send', only: ['gui-nonato'], description: 'Ferramentas pontuais' },
      { href: '/whatsapp/diagnostico', label: 'Diagnóstico WhatsApp', icon: 'shield', only: ['gui-nonato'], description: 'Verificação da integração Meta' },
      { href: '/conexoes/vital-decor', label: 'Conexões Vital Decor', icon: 'plug', only: ['vital-decor'], description: 'Gerenciar canais e autorizações' },
      { href: '/admin/conexoes', label: 'Central de Controle', icon: 'shield', description: 'Mapa e saúde das conexões' },
    ],
  },
];

export function visibleNavGroups(workspaceId = 'gui-nonato') {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.only || item.only.includes(workspaceId)).map((item) =>
      item.href === '/previa-radar.html' ? { ...item, href: `${item.href}?marca=${workspaceId}` } : item
    ),
  })).filter((group) => group.items.length > 0);
}

export function matchesNavigation(item, pathname, section = 'dashboard') {
  if (item.section) return pathname === '/' && section === item.section;
  if (item.href === '/whatsapp') return pathname === '/whatsapp';
  if (item.href === '/automacoes') return pathname === '/automacoes';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function searchNavigation(query, workspaceId = 'gui-nonato') {
  const normalized = String(query || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const results = visibleNavGroups(workspaceId).flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label }))
  );
  if (!normalized) return results;
  return results.filter((item) => (item.label + ' ' + item.description + ' ' + item.group)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalized));
}
