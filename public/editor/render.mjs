import { clamp, wrapText } from './model.mjs';
let fontPromise;
export function fontsReady() {
  if (typeof FontFace === 'undefined') return Promise.resolve();
  if (!fontPromise) fontPromise = Promise.all([
    new FontFace('Montserrat', 'url(/editor/fonts/Montserrat-Regular.ttf)', { weight: '400' }).load(),
    new FontFace('Montserrat', 'url(/editor/fonts/Montserrat-Bold.ttf)', { weight: '700' }).load(),
  ]).then(fonts => { fonts.forEach(f => document.fonts.add(f)); });
  return fontPromise;
}
const photoCache = new Map();
export function clearPhotoCache() { for (const item of photoCache.values()) item.then(x => URL.revokeObjectURL(x.url)).catch(() => {}); photoCache.clear(); }
export async function photo(id, workspace, readAsset) {
  if (!id) return null;
  const key = workspace + ':' + id;
  if (!photoCache.has(key)) photoCache.set(key, (async () => {
    const asset = await readAsset(id, workspace);
    if (!asset) throw new Error('Uma foto deste projeto não está disponível. Selecione-a novamente.');
    const url = URL.createObjectURL(asset.file), img = new Image();
    try { img.src = url; await img.decode(); return { img, url, name: asset.name }; }
    catch { URL.revokeObjectURL(url); photoCache.delete(key); throw new Error('Não consegui abrir esta imagem. Use JPG, PNG ou WebP.'); }
  })());
  return photoCache.get(key);
}
export function drawPhoto(ctx, img, rect, slide) {
  const { x, y, w, h } = rect;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#eae5df'; ctx.fillRect(x, y, w, h);
  if (!img) {
    ctx.strokeStyle = '#d4cbc2'; ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 70) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke(); }
    ctx.fillStyle = '#726a64'; ctx.font = '400 26px Montserrat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Escolha sua foto', x + w / 2, y + h / 2); ctx.restore(); return;
  }
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const ratio = slide.fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * ratio, dh = ih * ratio;
  ctx.drawImage(img, x + (w - dw) * clamp(slide.focalX, 0, 100) / 100,
    y + (h - dh) * clamp(slide.focalY, 0, 100) / 100, dw, dh);
  ctx.restore();
}
function fittedText(ctx, text, size, width, maxHeight) {
  let actual = clamp(size, 20, 96), lines;
  do { lines = wrapText(ctx, text, actual, width); if (lines.length * actual * 1.3 <= maxHeight || actual <= 20) break; actual -= 1; } while (actual >= 20);
  return { lines, size: actual, height: lines.length * actual * 1.3, overflow: lines.length * actual * 1.3 > maxHeight };
}
function drawText(ctx, data, x, y, width, align, color = '#0e0e0e') {
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = color;
  data.lines.forEach((line, i) => {
    const lineWidth = line.reduce((sum, run) => { ctx.font = `${run.bold ? 700 : 400} ${data.size}px Montserrat`; return sum + ctx.measureText(run.text).width; }, 0);
    let cursor = x + (align === 'center' ? (width - lineWidth) / 2 : align === 'right' ? width - lineWidth : 0);
    for (const run of line) {
      ctx.font = `${run.bold ? 700 : 400} ${data.size}px Montserrat`;
      ctx.fillText(run.text, cursor, y + i * data.size * 1.3); cursor += ctx.measureText(run.text).width;
    }
  });
}
let logoPromise;
async function logo() {
  if (!logoPromise) logoPromise = (async () => { const img = new Image(); img.src = '/editor/vital-logo.png'; await img.decode(); return img; })();
  return logoPromise;
}
export async function renderSlide(canvas, slide, project, readAsset, { placeholder = true } = {}) {
  await fontsReady();
  const [current, before] = await Promise.all([photo(slide.image, project.workspace, readAsset), slide.layout === 'comparacao' ? photo(slide.beforeImage, project.workspace, readAsset) : null]);
  const W = 1080, H = project.format === 'portrait' ? 1350 : 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4ede3'; ctx.fillRect(0, 0, W, H);
  let area = { x: 0, y: 0, w: W, h: H }, panel = null, labelY = null, logoArea = null;
  const isGui = project.workspace === 'gui-nonato', layout = isGui ? 'gui' : slide.layout;
  if (layout === 'produto') {
    area.h = Math.round(H * .65); panel = { x: 48, y: area.h + 35, w: W - 96, h: H - area.h - 90 };
    labelY = panel.y; panel.y += slide.label ? 56 : 16; panel.h -= slide.label ? 56 : 16;
    logoArea = { x: W - 240, y: H - 70, w: 190, h: 48 };
  } else if (layout === 'dicas') {
    area = { x: W * .46, y: 0, w: W * .54, h: H };
    panel = { x: 48, y: 145, w: W * .46 - 96, h: H - 285 };
    labelY = 60; logoArea = { x: 48, y: H - 100, w: 260, h: 65 };
  } else if (layout === 'comparacao') {
    const photoHeight = Math.round(H * .81);
    drawPhoto(ctx, before?.img, { x: 0, y: 0, w: W / 2 - 2, h: photoHeight }, slide);
    drawPhoto(ctx, current?.img, { x: W / 2 + 2, y: 0, w: W / 2 - 2, h: photoHeight }, slide);
    for (const [label, x] of [['ANTES', 35], ['DEPOIS', W / 2 + 35]]) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 35, 185, 55);
      ctx.fillStyle = '#0e0e0e'; ctx.font = '700 25px Montserrat'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(label, x + 20, 51);
    }
    panel = { x: 45, y: photoHeight + 30, w: W - 90, h: H - photoHeight - 100 };
    logoArea = { x: W - 225, y: H - 60, w: 180, h: 43 };
  }
  if (layout !== 'comparacao') drawPhoto(ctx, current?.img, area, slide);
  let box = null, textResult = null;
  const text = slide.text || (placeholder ? 'Escreva o texto deste slide' : '');
  if (layout === 'gui' || layout === 'ambiente') {
    if (text) {
      const width = W * clamp(slide.box.width, 45, 94) / 100, padding = 36;
      textResult = fittedText(ctx, text, slide.fontSize, width - padding * 2, H * .73 - padding * 2);
      const height = Math.min(H * .73, textResult.height + padding * 2 + (layout === 'ambiente' ? 22 : 0));
      const x = clamp(W * slide.box.x / 100, 24, W - width - 24), y = clamp(H * slide.box.y / 100, 24, H - height - 24);
      box = { x, y, w: width, h: height };
      ctx.fillStyle = layout === 'gui' ? '#ffffff' : '#f4ede3'; ctx.fillRect(x, y, width, height);
      if (layout === 'ambiente') { ctx.fillStyle = '#9c7a1c'; ctx.fillRect(x + padding, y + 25, 72, 3); }
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
      drawText(ctx, textResult, x + padding, y + padding + (layout === 'ambiente' ? 22 : 0), width - padding * 2, slide.align); ctx.restore();
    }
    if (layout === 'ambiente') logoArea = { x: W - 245, y: H - 90, w: 200, h: 55 };
  } else {
    ctx.fillStyle = '#9c7a1c'; ctx.fillRect(panel.x, labelY === null ? panel.y - 16 : labelY + (slide.label ? 38 : 0), 72, 3);
    if (slide.label && labelY !== null) {
      ctx.font = '700 23px Montserrat'; ctx.fillStyle = '#9c7a1c'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText(slide.label.toUpperCase(), panel.x, labelY, panel.w);
    }
    if (text) {
      textResult = fittedText(ctx, text, slide.fontSize, panel.w, panel.h);
      ctx.save(); ctx.beginPath(); ctx.rect(panel.x, panel.y, panel.w, panel.h); ctx.clip();
      drawText(ctx, textResult, panel.x, panel.y, panel.w, slide.align); ctx.restore();
    }
  }
  if (!isGui && slide.logo && logoArea) {
    const img = await logo();
    // Crop only the empty outer black margin of the official source asset.
    const source = { x: 65, y: 205, w: 675, h: 355 };
    const ratio = Math.min(logoArea.w / source.w, logoArea.h / source.h);
    const w = source.w * ratio, h = source.h * ratio;
    // Keep the official proportions and colors. Give the mark a neutral base.
    ctx.fillStyle = '#f4ede3'; ctx.fillRect(logoArea.x - 10, logoArea.y - 6, w + 20, h + 12);
    ctx.drawImage(img, source.x, source.y, source.w, source.h, logoArea.x, logoArea.y, w, h);
  }
  return { box, overflow: textResult?.overflow || false, fontSize: textResult?.size || slide.fontSize, width: W, height: H };
}
