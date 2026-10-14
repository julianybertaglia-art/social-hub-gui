export const BRANDS = {
  'gui-nonato': { name: 'Gui Nonato', handle: '@gui_nonato', initials: 'GN' },
  'vital-decor': { name: 'Vital Decor', handle: '@vitaldecor_', initials: 'VD' },
};
export const TEMPLATES = [
  { id: 'produto', name: 'Produto em destaque', detail: 'Foto ampla e painel de texto na base.' },
  { id: 'ambiente', name: 'Ambiente decorado', detail: 'A fotografia ocupa toda a arte.' },
  { id: 'dicas', name: 'Dicas e inspirações', detail: 'Composição editorial com painel lateral.' },
  { id: 'comparacao', name: 'Antes e depois', detail: 'Duas fotos reais, lado a lado.' },
];
export const MAX_SLIDES = 20;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
export function brandId(value) { return BRANDS[value] ? value : 'gui-nonato'; }
export function newSlide(workspace, text = '') {
  return { id: crypto.randomUUID(), text, image: null, beforeImage: null,
    layout: workspace === 'gui-nonato' ? 'gui' : 'produto',
    fontSize: 46, align: 'left', box: { x: 7, y: 8, width: 86 },
    fit: 'cover', focalX: 50, focalY: 50, label: '', logo: workspace === 'vital-decor' };
}
export function parseOutline(text) {
  return String(text || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    .map(s => s.replace(/^(?:slide\s*\d+|capa|cta)\s*[:.\-–]\s*/i, '')).slice(0, MAX_SLIDES);
}
export function newProject(workspace, seed = {}) {
  const outline = Array.isArray(seed.slides) ? seed.slides : parseOutline(seed.outline);
  const texts = outline.length ? outline.map(t => String(t).replace(/^(capa|cta)\s*:\s*/i, '')) : ['', '', '', '', ''];
  return { schemaVersion: 1, id: crypto.randomUUID(), workspace: brandId(workspace),
    title: String(seed.title || seed.hook || 'Meu novo carrossel').slice(0, 200),
    caption: String(seed.caption || ''), format: 'square', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), sourceUrl: safeUrl(seed.sourceUrl),
    sourceHandle: String(seed.sourceHandle || ''), slides: texts.map(t => newSlide(workspace, t)) };
}
export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function validateProject(value, workspace) {
  if (!value || value.schemaVersion !== 1 || value.workspace !== workspace ||
    typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) ||
    typeof value.title !== 'string' || value.title.length > 200 ||
    typeof value.caption !== 'string' || value.caption.length > 12000 ||
    !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !['square', 'portrait'].includes(value.format) || !Array.isArray(value.slides) ||
    !value.slides.length || value.slides.length > MAX_SLIDES) return false;
  const ids = new Set();
  return value.slides.every(s => {
    if (!s || typeof s.id !== 'string' || ids.has(s.id) || typeof s.text !== 'string' || s.text.length > 2500 ||
      !['gui', ...TEMPLATES.map(t => t.id)].includes(s.layout) ||
      (workspace === 'gui-nonato' && s.layout !== 'gui') ||
      !['left', 'center', 'right'].includes(s.align) || !['cover', 'contain'].includes(s.fit) ||
      !Number.isFinite(s.fontSize) || s.fontSize < 20 || s.fontSize > 96 ||
      !s.box || ![s.box.x, s.box.y, s.box.width, s.focalX, s.focalY].every(Number.isFinite) ||
      s.box.width < 45 || s.box.width > 94 || typeof s.label !== 'string' || s.label.length > 80 ||
      ![s.image, s.beforeImage].every(i => i === null || typeof i === 'string' && /^[\w-]{1,80}$/.test(i))) return false;
    ids.add(s.id); return true;
  });
}
export function missingImages(project) {
  return project.slides.flatMap((s, i) => !s.image || s.layout === 'comparacao' && !s.beforeImage ? [i + 1] : []);
}
export function filename(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'carrossel';
}

// All text is plain data. Only paired ** markers change the font weight.
export function textRuns(text) {
  const runs = []; let bold = false;
  for (const [i, part] of String(text).split('**').entries()) {
    if (i) bold = !bold;
    if (part) runs.push({ text: part, bold });
  }
  return runs;
}
export function wrapText(ctx, text, size, maxWidth) {
  const lines = [[]]; let width = 0;
  function measure(text, bold) { ctx.font = `${bold ? 700 : 400} ${size}px Montserrat`; return ctx.measureText(text).width; }
  for (const run of textRuns(text)) {
    for (const token of run.text.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
      if (token === '\n') { lines.push([]); width = 0; continue; }
      const whitespace = /^\s+$/.test(token);
      if (whitespace && !lines.at(-1).length) continue;
      const tokenWidth = measure(token, run.bold);
      if (width + tokenWidth > maxWidth && lines.at(-1).length && !whitespace) {
        while (lines.at(-1).at(-1)?.text.match(/^\s+$/)) lines.at(-1).pop();
        lines.push([]); width = 0;
      }
      // Break long URLs and unspaced words to prevent horizontal clipping.
      if (tokenWidth > maxWidth) {
        for (const char of token) {
          const w = measure(char, run.bold);
          if (width + w > maxWidth && lines.at(-1).length) { lines.push([]); width = 0; }
          lines.at(-1).push({ text: char, bold: run.bold }); width += w;
        }
      } else if (!whitespace || width + tokenWidth <= maxWidth) {
        lines.at(-1).push({ text: token, bold: run.bold }); width += tokenWidth;
      }
    }
  }
  return lines;
}
