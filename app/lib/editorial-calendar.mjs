export const EDITORIAL_WORKSPACES = ['gui-nonato', 'vital-decor'];
export const EDITORIAL_FORMATS = ['Reel', 'Carrossel', 'Stories', 'Foto', 'Live'];
export const EDITORIAL_STATUSES = ['Ideia', 'Roteiro', 'Em criação', 'Aguardando aprovação', 'Pronto para publicar', 'Publicado'];

export function editorialError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function requireWorkspace(workspace) {
  if (!EDITORIAL_WORKSPACES.includes(workspace)) throw editorialError('Selecione uma conta válida.');
  return workspace;
}

export function titleKey(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calendarToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Preserve the original JSON, including numeric IDs, legacy date labels and briefings.
// An invalid backup must never be silently replaced with an empty calendar.
export function validateLegacyPosts(posts) {
  if (!Array.isArray(posts) || posts.length > 10000) throw editorialError('O planejamento antigo não pôde ser importado. A cópia original foi preservada.');
  for (const post of posts) {
    if (!post || typeof post !== 'object' || Array.isArray(post)
      || !['string', 'number'].includes(typeof post.id) || !String(post.id).trim()
      || typeof post.title !== 'string' || !post.title.trim()) {
      throw editorialError('Há um conteúdo antigo incompleto. A cópia original foi preservada para revisão.');
    }
  }
  return posts;
}

export function validatePost(post) {
  validateLegacyPosts([post]);
  if (String(post.id).length > 200 || post.title.length > 500) throw editorialError('O tema deve ter até 500 caracteres.');
  if (!isCalendarDate(post.date)) throw editorialError('Informe uma data válida para o conteúdo.');
  if (post.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(post.time)) throw editorialError('Informe um horário válido ou deixe em branco.');
  if (!EDITORIAL_FORMATS.includes(post.format) || !EDITORIAL_STATUSES.includes(post.status)) throw editorialError('Formato ou status inválido.');
  if (post.brief !== undefined && (!post.brief || typeof post.brief !== 'object' || Array.isArray(post.brief))) throw editorialError('Briefing inválido.');
  return post;
}

export function patchEditorialPost(current, patch) {
  const allowed = ['title', 'date', 'time', 'format', 'objective', 'status', 'brief'];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || Object.keys(patch).some(key => !allowed.includes(key))) throw editorialError('Alteração de conteúdo inválida.');
  const next = { ...current, ...patch };
  // Legacy dates remain intact when the user changes only the status or briefing.
  if ('date' in patch && !isCalendarDate(next.date)) throw editorialError('Informe uma data válida.');
  if ('status' in patch && !EDITORIAL_STATUSES.includes(next.status)) throw editorialError('Status inválido.');
  if ('format' in patch && !EDITORIAL_FORMATS.includes(next.format)) throw editorialError('Formato inválido.');
  if ('title' in patch && (typeof next.title !== 'string' || !next.title.trim() || next.title.length > 500)) throw editorialError('Informe um tema com até 500 caracteres.');
  if ('time' in patch && next.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.time)) throw editorialError('Horário inválido.');
  if ('brief' in patch && (!next.brief || typeof next.brief !== 'object' || Array.isArray(next.brief))) throw editorialError('Briefing inválido.');
  return next;
}

export function publicEditorialPost(row) {
  return { ...row.payload, _revision: row.revision, _updatedAt: row.updated_at };
}
