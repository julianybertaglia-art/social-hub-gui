import { BRANDS, TEMPLATES, MAX_SLIDES, brandId, newProject, newSlide, parseOutline, validateProject, missingImages, filename, safeUrl, clamp } from './model.mjs';
import { saveProject, getProject, listProjects, saveAsset, getAsset, listAssets } from './store.mjs';
import { renderSlide, fontsReady, clearPhotoCache } from './render.mjs';
import { zip } from './zip.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const params = new URL(location.href).searchParams;
const state = { workspace: brandId(params.get('marca')), project: null, index: 0, tab: 'text', assets: [], history: [], redo: [], busy: false, uploadTarget: 'image', rendering: 0 };
let saving = Promise.resolve(), sequence = 0, toastTimer, paintTimer, lastFocus, lastGeometry, drag, ready = false;
let changingWorkspace = false, desiredWorkspace = state.workspace;
const urls = new Map();
if (params.get('embedded') === '1') document.body.classList.add('embedded');
const slide = () => state.project?.slides[state.index];
const ideas = () => { try { const list = JSON.parse(localStorage.getItem('tideplace-radar-preview-v1:' + state.workspace) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500); }
function status(message, error = false) { $('save-status').textContent = message; $('save-status').classList.toggle('error', error); }
function imageUrl(id) {
  if (!id) return '';
  const key = state.workspace + ':' + id, asset = state.assets.find(a => a.id === id);
  if (!asset) return '';
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(asset.file));
  return urls.get(key);
}
function releaseUrls() { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); clearPhotoCache(); }
function persist() {
  if (!state.project) return saving;
  const snapshot = structuredClone(state.project), n = ++sequence;
  status('Salvando…');
  saving = saving.catch(() => {}).then(() => saveProject(snapshot)).then(() => {
    if (n === sequence) status('Salvo neste navegador · ' + new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(new Date()));
  }).catch(error => {
    if (n === sequence) status('Falha ao salvar · baixe uma cópia do projeto', true);
    throw error;
  });
  // Keep the rejection handled while preserving it for explicit save/brand changes.
  saving.catch(() => {}); return saving;
}
function commit(mutator, rerenderPanel = false) {
  if (!state.project || state.busy || changingWorkspace) return;
  state.history.push(structuredClone(state.project)); if (state.history.length > 60) state.history.shift();
  state.redo = []; mutator(state.project); state.project.updatedAt = new Date().toISOString();
  state.index = Math.min(state.index, state.project.slides.length - 1);
  void persist(); syncChrome(); schedulePaint(); renderStrip(); if (rerenderPanel) renderPanel();
}
function restore(direction) {
  const from = direction === 'undo' ? state.history : state.redo, to = direction === 'undo' ? state.redo : state.history;
  if (!from.length || state.busy) return;
  to.push(structuredClone(state.project)); state.project = from.pop(); state.project.updatedAt = new Date().toISOString();
  state.index = Math.min(state.index, state.project.slides.length - 1); void persist(); render();
}
function updateSlide(values, panel = false) { commit(p => Object.assign(p.slides[state.index], values), panel); }
function setSlide(index) { state.index = clamp(index, 0, state.project.slides.length - 1); render(); }
function syncChrome() {
  if (!state.project) return;
  if (document.activeElement !== $('project-title')) $('project-title').value = state.project.title;
  $('workspace').value = state.workspace; $('workspace').disabled = state.busy;
  $('account-avatar').textContent = BRANDS[state.workspace].initials; $('account-handle').textContent = BRANDS[state.workspace].handle;
  $('brand-description').textContent = state.workspace === 'gui-nonato' ? 'Suas fotos. Montserrat. Caixa branca. O padrão do Gui.' : 'Fotos reais, composições da Vital e liberdade para criar.';
  $('slide-position').textContent = `SLIDE ${String(state.index + 1).padStart(2,'0')} / ${String(state.project.slides.length).padStart(2,'0')}`;
  $('slide-count').textContent = state.project.slides.length + (state.project.slides.length === 1 ? ' slide' : ' slides');
  $('undo').disabled = !state.history.length || state.busy; $('redo').disabled = !state.redo.length || state.busy;
  $('export-all').disabled = state.busy; $('export-all').textContent = state.busy ? 'Preparando…' : '↓ Baixar slides';
  document.querySelectorAll('[data-action="add"],[data-action="duplicate"]').forEach(b => { b.disabled = state.project.slides.length >= MAX_SLIDES || state.busy; });
  document.querySelector('[data-action="remove"]').disabled = state.project.slides.length === 1 || state.busy;
  document.querySelector('[data-action="move-left"]').disabled = state.index === 0 || state.busy;
  document.querySelector('[data-action="move-right"]').disabled = state.index === state.project.slides.length - 1 || state.busy;
  const url = safeUrl(state.project.sourceUrl); $('source-note').hidden = !url;
  if (url) $('source-note').innerHTML = `Ideia adaptada para ${BRANDS[state.workspace].name}. <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Ver referência original ↗</a>`;
  document.querySelectorAll('[data-radar-link]').forEach(a => { a.href = '/previa-radar.html?marca=' + state.workspace + (a.dataset.hot ? '&aba=em-alta' : ''); });
}
function renderPanel() {
  if (!slide()) return;
  const s = slide(), gui = state.workspace === 'gui-nonato';
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); b.tabIndex = b.dataset.tab === state.tab ? 0 : -1; });
  $('editor-panel').setAttribute('aria-labelledby', 'tab-' + state.tab);
  if (state.tab === 'text') $('editor-panel').innerHTML = `
    <h3>Texto do slide ${state.index + 1}</h3><p class="intro">Uma mensagem por slide. Destaque só o que precisa chamar atenção.</p>
    <div class="field-row"><label class="field" for="slide-text">Texto sobre a foto</label><button class="format-bold" data-action="bold" aria-label="Destacar seleção em negrito" title="Selecione um trecho para destacar">B</button></div>
    <textarea id="slide-text" rows="7" maxlength="2500" placeholder="Escreva o gancho, a dica ou a chamada deste slide…">${esc(s.text)}</textarea>
    <p class="hint">Selecione um trecho e clique em <b>B</b>, ou use **negrito**. A fonte é sempre Montserrat.</p>
    <button class="secondary full" data-action="outline">Colar o roteiro completo</button>
    <button class="text-button full" data-action="ideas">Escolher uma ideia do radar ↗</button>`;
  if (state.tab === 'photos') $('editor-panel').innerHTML = `
    <h3>Suas fotos</h3><p class="intro">Escolha a imagem deste slide ou repita a mesma base no carrossel inteiro.</p>
    <button class="upload-zone" data-action="upload"><span>↑</span><strong>Adicionar fotos</strong><small>JPG, PNG ou WebP · até 20 MB por foto</small></button>
    ${s.image ? `<button class="secondary full" data-action="repeat-photo">Usar esta foto em todos os slides</button>` : ''}
    ${s.layout === 'comparacao' ? '<button class="secondary full" data-action="upload-before">Escolher foto do ANTES</button><p class="hint">A foto principal aparece no DEPOIS. Envie duas fotos reais do mesmo ambiente e enquadramento.</p>' : ''}
    <div class="photo-gallery">${state.assets.map(a => `<button class="photo-tile ${a.id === s.image ? 'selected' : ''}" data-action="choose-photo" data-id="${esc(a.id)}" aria-label="Usar ${esc(a.name)} neste slide"><img src="${esc(imageUrl(a.id))}" alt="${esc(a.name)}"></button>`).join('')}</div>
    <label class="field" for="photo-fit">Enquadramento</label><select id="photo-fit"><option value="cover" ${s.fit === 'cover' ? 'selected' : ''}>Preencher a área da foto</option><option value="contain" ${s.fit === 'contain' ? 'selected' : ''}>Mostrar a imagem inteira</option></select>
    <div class="split"><div><label class="field" for="focal-x">Horizontal</label><input type="range" id="focal-x" min="0" max="100" value="${s.focalX}"></div><div><label class="field" for="focal-y">Vertical</label><input type="range" id="focal-y" min="0" max="100" value="${s.focalY}"></div></div>`;
  if (state.tab === 'layout') $('editor-panel').innerHTML = `
    <h3>${gui ? 'O padrão do Gui' : 'Composição deste slide'}</h3><p class="intro">${gui ? 'Foto como base, caixa branca com cantos retos e texto em Montserrat.' : 'Escolha o modelo que valoriza a foto e a mensagem.'}</p>
    ${!gui ? TEMPLATES.map(t => `<button class="template ${s.layout === t.id ? 'selected' : ''}" data-action="template" data-template="${t.id}" aria-pressed="${s.layout === t.id}"><span class="template-preview ${t.id}" aria-hidden="true"></span><span><strong>${t.name}</strong><small>${t.detail}</small></span></button>`).join('') : ''}
    <label class="field" for="post-format">Formato do carrossel</label><select id="post-format"><option value="square" ${state.project.format === 'square' ? 'selected' : ''}>Quadrado · 1080 × 1080</option><option value="portrait" ${state.project.format === 'portrait' ? 'selected' : ''}>Vertical · 1080 × 1350</option></select>
    <div class="field-row"><label class="field" for="font-size">Tamanho do texto</label><output id="font-output">${s.fontSize} px</output></div><input id="font-size" type="range" min="20" max="96" value="${s.fontSize}">
    <label class="field" for="text-align">Alinhamento</label><select id="text-align">${[['left','À esquerda'],['center','Centralizado'],['right','À direita']].map(([v,l]) => `<option value="${v}" ${s.align === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${['gui','ambiente'].includes(s.layout) ? `<label class="field" for="box-width">Largura da caixa</label><input id="box-width" type="range" min="45" max="94" value="${s.box.width}"><div class="presets"><button data-action="position" data-y="8">Em cima</button><button data-action="position" data-y="37">No meio</button><button data-action="position" data-y="75">Embaixo</button></div><div class="split"><div><label class="field" for="box-x">Posição horizontal</label><input id="box-x" type="range" min="2" max="55" value="${s.box.x}"></div><div><label class="field" for="box-y">Posição vertical</label><input id="box-y" type="range" min="2" max="90" value="${s.box.y}"></div></div>` : ''}
    ${!gui ? `<label class="field" for="slide-label">Categoria ou título curto</label><input id="slide-label" maxlength="80" value="${esc(s.label)}" style="width:100%;padding:10px;border:1px solid #d7cfd5;border-radius:7px"><label class="check-label"><input id="show-logo" type="checkbox" ${s.logo ? 'checked' : ''}> Mostrar logo da Vital</label>` : ''}
    <button class="secondary full" data-action="repeat-style">Aplicar este layout em todos</button>
    ${!gui ? '<p class="template-note">Paleta da Vital: neutros, preto e dourado discreto. Use fotos e informações reais dos seus produtos.</p>' : ''}`;
  if (state.tab === 'caption') $('editor-panel').innerHTML = `
    <h3>Legenda do post</h3><p class="intro">Revise a chamada e a próxima ação antes de publicar.</p><label class="field" for="caption">Legenda</label>
    <textarea id="caption" rows="12" maxlength="12000" placeholder="Escreva a legenda deste carrossel…">${esc(state.project.caption)}</textarea>
    <p id="caption-count" class="hint">${state.project.caption.length} caracteres</p><button class="secondary full" data-action="copy-caption">Copiar legenda</button><p class="hint">A legenda também acompanha o arquivo ZIP dos slides.</p>`;
}
function renderStrip() {
  if (!state.project) return;
  $('slide-strip').innerHTML = state.project.slides.map((s, i) => `<button class="slide-thumb ${i === state.index ? 'active' : ''}" data-action="select-slide" data-index="${i}" aria-label="Editar slide ${i+1}" aria-pressed="${i === state.index}"><span class="thumb-visual">${s.image && imageUrl(s.image) ? `<img src="${esc(imageUrl(s.image))}" alt="">` : ''}<span class="thumb-text">${esc(s.text.replace(/\*\*/g,'') || 'Seu texto aqui')}</span></span><span>${String(i+1).padStart(2,'0')} · ${i === 0 ? 'Capa' : i === state.project.slides.length-1 ? 'Fechamento' : 'Conteúdo'}</span>${!s.image ? '<i class="needs-photo" title="Escolha uma foto"></i>' : ''}</button>`).join('');
}
function schedulePaint() { clearTimeout(paintTimer); paintTimer = setTimeout(() => { void paint(); }, 30); }
async function paint() {
  if (!state.project) return;
  const token = ++state.rendering, project = structuredClone(state.project), s = project.slides[state.index];
  try {
    const buffer = document.createElement('canvas'), geometry = await renderSlide(buffer, s, project, getAsset);
    if (token !== state.rendering) return;
    const canvas = $('preview'); canvas.width = buffer.width; canvas.height = buffer.height; canvas.getContext('2d').drawImage(buffer, 0, 0);
    lastGeometry = geometry; canvas.classList.toggle('draggable', !!geometry.box);
    canvas.setAttribute('aria-label', `Prévia do slide ${state.index+1}: ${s.text.replace(/\*\*/g,'') || 'sem texto'}. ${geometry.box ? 'Use as setas do teclado ou os controles de layout para mover a caixa.' : 'Use os controles para editar.'}`);
    $('canvas-format').textContent = `${geometry.width} × ${geometry.height} px`;
    $('preview-tip').textContent = geometry.box ? 'Arraste a caixa de texto para posicionar.' : 'Ajuste a composição na aba Layout.';
    $('render-warning').hidden = !geometry.overflow;
    $('render-warning').textContent = 'Este texto está grande demais para o modelo. Reduza o conteúdo, divida em mais slides ou escolha outro layout antes de baixar.';
  } catch (e) { if (token === state.rendering) { $('render-warning').hidden = false; $('render-warning').textContent = e.message; } }
}
function render() { syncChrome(); renderPanel(); renderStrip(); schedulePaint(); }
function updateAddress() {
  const next = new URL(location.href); next.searchParams.set('marca',state.workspace); next.searchParams.set('projeto',state.project.id);
  next.searchParams.delete('referencia'); next.searchParams.delete('ideia'); history.replaceState(null,'',next);
}
async function selectProject(project) {
  if (!validateProject(project, state.workspace)) throw new Error('Não consegui abrir este projeto nesta marca.');
  state.project = project; state.index = 0; state.history = []; state.redo = []; render(); updateAddress();
  await persist();
}
async function switchWorkspace(value) {
  desiredWorkspace = brandId(value);
  if (changingWorkspace || state.busy || desiredWorkspace === state.workspace) return;
  changingWorkspace = true;
  try {
    while (desiredWorkspace !== state.workspace) {
      const id = desiredWorkspace;
      try { await persist(); } catch { desiredWorkspace = state.workspace; toast('Seu último rascunho não foi salvo. Baixe o projeto antes de trocar de marca.'); $('workspace').value = state.workspace; return; }
      const [assets, projects] = await Promise.all([listAssets(id), listProjects(id)]);
      closeModal(); state.rendering++; releaseUrls(); state.workspace = id; state.assets = assets;
      await selectProject(projects.find(p => validateProject(p,id)) || newProject(id));
    }
  } finally { changingWorkspace = false; }
}
function seedFromIdea(idea) {
  const ref = idea.reference, editorial = ref?.editorial || {};
  const texts = idea.outline ? parseOutline(idea.outline) : Array.isArray(editorial.slides) ? [...editorial.slides] : [];
  // The briefing labels this field as the cover hook, so keep its edits on the cover too.
  if (idea.title || editorial.hook) texts[0] = idea.title || editorial.hook;
  return { title: idea.title || editorial.hook, slides: texts, sourceUrl: idea.sourceUrl || ref?.url,
    sourceHandle: idea.handle || ref?.handle,
    caption: (texts || [idea.title || '']).join('\n\n').replace(/\*\*/g,'').replace(/^(capa|cta)\s*:\s*/gim,'').slice(0,2200) };
}
async function seedFromReference(id) {
  const response = await fetch('/radar-research.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não consegui abrir as ideias do radar agora.');
  const data = await response.json(), post = data.posts?.find(p => p.id === id && p.workspace === state.workspace);
  if (!post?.editorial) throw new Error('Esta referência não está mais na coleta desta marca. Escolha outra ideia no radar.');
  return seedFromIdea({ title: post.editorial.hook, reference: post, sourceUrl: post.url, handle:post.handle });
}
function modal(title, body, foot = '') {
  lastFocus = document.activeElement;
  $('modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-top"><span class="eyebrow">ESTÚDIO · ${BRANDS[state.workspace].name.toUpperCase()}</span><button class="icon-button" data-action="close" aria-label="Fechar">×</button></div><h2 id="modal-title">${esc(title)}</h2>${body}${foot ? '<div class="modal-foot">'+foot+'</div>' : ''}</section></div>`;
  document.body.style.overflow = 'hidden'; $('modal-root').querySelector('button,input,textarea')?.focus();
}
function closeModal() { $('modal-root').innerHTML = ''; document.body.style.overflow = ''; lastFocus?.focus(); }
async function showDrafts() {
  const projects = await listProjects(state.workspace);
  modal('Seus rascunhos', `<p class="intro">Projetos de ${BRANDS[state.workspace].name}, salvos neste navegador.</p>${projects.map(p => `<button class="draft-card" data-action="open-project" data-id="${esc(p.id)}"><strong>${esc(p.title)}</strong><small>${p.slides.length} slides · ${esc(new Date(p.updatedAt).toLocaleString('pt-BR'))}${p.id === state.project.id ? ' · aberto agora' : ''}</small></button>`).join('') || '<div class="empty">Seus próximos carrosséis vão aparecer aqui.</div>'}`, '<button class="secondary" data-action="import">Abrir projeto baixado</button><button class="primary" data-action="new">+ Novo carrossel</button>');
}
function showIdeas() {
  const list = ideas();
  modal('Comece por uma boa ideia', `<p class="intro">Escolha um roteiro salvo no radar de ${BRANDS[state.workspace].name}. As fotos serão escolhidas por você.</p>${list.map(i => `<button class="draft-card" data-action="use-idea" data-id="${esc(i.id)}"><strong>${esc(i.title)}</strong><small>${i.kind === 'reference' ? 'Referência salva' : 'Roteiro editável'} ${i.handle ? '· @'+esc(i.handle) : ''}</small></button>`).join('') || `<div class="empty">Salve uma ideia no radar e volte para montar suas artes.<br><a href="/previa-radar.html?marca=${state.workspace}">Explorar referências ↗</a></div>`}`);
}
function showOutline() {
  modal('Cole o roteiro completo', `<p class="intro">Separe os slides com uma linha em branco. O roteiro pode ter até ${MAX_SLIDES} slides. Suas fotos e os ajustes dos slides existentes serão mantidos nas mesmas posições.</p><label class="field" for="outline">Um bloco por slide</label><textarea id="outline" maxlength="30000" placeholder="Gancho da capa\n\nPrimeira ideia\n\nPróxima ideia\n\nChamada para ação">${esc(state.project.slides.map(s=>s.text).join('\n\n'))}</textarea>`, '<button class="secondary" data-action="close">Voltar</button><button class="primary" data-action="apply-outline">Montar slides</button>');
}
async function decoded(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 20*1024*1024) throw new Error('Use uma foto JPG, PNG ou WebP de até 20 MB.');
  const url = URL.createObjectURL(file), img = new Image();
  try { img.src = url; await img.decode(); if (img.naturalWidth * img.naturalHeight > 64000000) throw new Error('Esta foto é grande demais. Envie uma versão com até 64 megapixels.'); }
  catch (e) { throw new Error(e.message.includes('megapixels') ? e.message : 'Não consegui abrir esta foto. Salve-a como JPG, PNG ou WebP.'); }
  finally { URL.revokeObjectURL(url); }
}
async function upload(files, target = 'image') {
  const workspace = state.workspace, projectId = state.project.id, slideId = slide().id;
  const added = [], errors = [];
  for (const file of [...files].slice(0,20)) {
    try { await decoded(file); added.push(await saveAsset(workspace,file)); } catch (e) { errors.push(e.message); }
  }
  if (state.workspace !== workspace || state.project.id !== projectId) return;
  state.assets = await listAssets(workspace);
  if (added.length) {
    commit(p => { const s = p.slides.find(s=>s.id === slideId); if (s) s[target] = added[0].id; }, true);
    toast(`${added.length} foto${added.length === 1 ? '' : 's'} adicionada${added.length === 1 ? '' : 's'}.` + (errors.length ? ' ' + errors[0] : ''));
  } else if (errors.length) toast(errors[0]);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.hidden = true; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function png(canvas) { return new Promise((resolve,reject)=>canvas.toBlob(b=>b ? resolve(b) : reject(new Error('Não consegui exportar este slide.')), 'image/png')); }
async function exportSlides(single = false) {
  if (state.busy) return;
  const project = structuredClone(state.project), selectedIndex = state.index;
  const selected = single ? [{ s: project.slides[selectedIndex], i: selectedIndex }] : project.slides.map((s,i)=>({s,i}));
  const missing = missingImages({ slides: selected.map(v=>v.s) });
  if (missing.length) { toast(single ? 'Escolha as fotos deste slide antes de baixar.' : 'Escolha as fotos dos slides '+missing.join(', ')+' antes de baixar.'); state.tab = 'photos'; renderPanel(); return; }
  state.busy = true; syncChrome();
  try {
    const files = [], name = filename(project.title);
    for (const {s,i} of selected) {
      const canvas = document.createElement('canvas'), result = await renderSlide(canvas,s,project,getAsset,{placeholder:false});
      if (result.overflow) throw new Error(`O texto do slide ${i+1} está grande demais. Divida o conteúdo ou ajuste o layout.`);
      files.push({ name: `${String(i+1).padStart(2,'0')}-${name}.png`, blob: await png(canvas) });
      canvas.width = canvas.height = 1;
    }
    if (single) download(files[0].blob,files[0].name);
    else { files.push({ name:'legenda.txt',text:project.caption }); download(await zip(files), name+'.zip'); }
    toast(single ? 'Slide pronto em PNG.' : 'Slides e legenda prontos no ZIP.');
  } catch (e) { toast(e.message); } finally { state.busy = false; syncChrome(); }
}
const asDataUrl = file => new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(file); });
async function backup() {
  if (state.busy) return;
  state.busy = true; syncChrome();
  try {
    const project = structuredClone(state.project), ids = [...new Set(project.slides.flatMap(s=>[s.image,s.beforeImage]).filter(Boolean))], assets=[];
    for (const id of ids) { const a=await getAsset(id,project.workspace); if (!a) throw new Error('Uma foto não foi encontrada. Selecione-a novamente antes de salvar a cópia.'); assets.push({id,name:a.name,dataUrl:await asDataUrl(a.file)}); }
    download(new Blob([JSON.stringify({type:'tideplace-project',schemaVersion:1,project,assets})],{type:'application/json'}), filename(project.title)+'.tide.json'); toast('Cópia editável baixada com textos e fotos.');
  } catch (e) { toast(e.message); } finally { state.busy = false; syncChrome(); }
}
async function importProject(file) {
  if (!file || state.busy) return;
  if (file.size > 150*1024*1024) throw new Error('O projeto deve ter até 150 MB.');
  const bundle = JSON.parse(await file.text()), workspace = state.workspace;
  if (bundle.type !== 'tideplace-project' || bundle.schemaVersion !== 1 || !validateProject(bundle.project,workspace) || !Array.isArray(bundle.assets) || bundle.assets.length > 40)
    throw new Error('Projeto inválido ou de outra marca. Selecione a marca correta para abri-lo.');
  const required = new Set(bundle.project.slides.flatMap(s=>[s.image,s.beforeImage]).filter(Boolean)), parsed=[], seen=new Set();
  for (const a of bundle.assets) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(a.dataUrl);
    if (typeof a.id !== 'string' || seen.has(a.id) || !match || match[2].length > 28*1024*1024) throw new Error('Este projeto contém uma foto inválida.');
    seen.add(a.id); const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
    const photoFile=new File([bytes],String(a.name || 'foto').slice(0,180),{type:match[1]}); await decoded(photoFile); parsed.push({id:a.id,file:photoFile});
  }
  if ([...required].some(id=>!seen.has(id))) throw new Error('O projeto está sem uma das fotos.');
  const ids=new Map(); for (const a of parsed) ids.set(a.id,(await saveAsset(workspace,a.file)).id);
  const project=bundle.project; project.id=crypto.randomUUID(); project.createdAt=new Date().toISOString();
  project.sourceUrl=safeUrl(project.sourceUrl); project.slides.forEach(s=>{s.id=crypto.randomUUID();s.image=ids.get(s.image)||null;s.beforeImage=ids.get(s.beforeImage)||null;});
  state.assets=await listAssets(workspace); closeModal(); await selectProject(project); toast('Projeto aberto com textos e fotos.');
}

async function action(el) {
  const a=el.dataset.action;
  if (a === 'close') return closeModal();
  if (!state.project || state.busy || changingWorkspace) return;
  if (a === 'undo' || a === 'redo') return restore(a);
  if (a === 'start') return modal('Por onde vamos começar?', '<p class="intro">Comece com um tema seu ou transforme uma ideia salva no radar em artes.</p><button class="draft-card" data-action="new"><strong>+ Começar do zero</strong><small>Escolher fotos e escrever o conteúdo.</small></button><button class="draft-card" data-action="ideas"><strong>Usar uma ideia do radar ↗</strong><small>Trazer o roteiro para o editor.</small></button><button class="text-button" data-action="import">Abrir projeto baixado</button>');
  if (a === 'new') { await persist(); closeModal(); return selectProject(newProject(state.workspace)); }
  if (a === 'drafts') return showDrafts();
  if (a === 'open-project') { const p=await getProject(el.dataset.id); await persist(); closeModal(); return selectProject(p); }
  if (a === 'ideas') return showIdeas();
  if (a === 'use-idea') { const idea=ideas().find(i=>i.id===el.dataset.id); if (!idea) return; await persist(); closeModal(); return selectProject(newProject(state.workspace,seedFromIdea(idea))); }
  if (a === 'save') { await persist(); toast('Rascunho salvo neste navegador.'); return; }
  if (a === 'select-slide') return setSlide(Number(el.dataset.index));
  if (a === 'add' || a === 'duplicate') {
    if (state.project.slides.length >= MAX_SLIDES) return toast('Este carrossel já tem 20 slides.');
    return commit(p=>{ const s=a === 'duplicate' ? structuredClone(slide()) : {...structuredClone(slide()),text:''}; s.id=crypto.randomUUID(); p.slides.splice(state.index+1,0,s); state.index++; },true);
  }
  if (a === 'remove') { if (state.project.slides.length > 1) commit(p=>p.slides.splice(state.index,1),true); return; }
  if (a === 'move-left' || a === 'move-right') {
    const next=state.index+(a==='move-left'?-1:1); if(next<0||next>=state.project.slides.length)return;
    return commit(p=>{ const [s]=p.slides.splice(state.index,1);p.slides.splice(next,0,s);state.index=next; },true);
  }
  if (a === 'outline') return showOutline();
  if (a === 'apply-outline') {
    const raw=$('outline').value, blocks=raw.split(/\n\s*\n/).filter(s=>s.trim());
    if (!blocks.length) return toast('Escreva pelo menos um slide.');
    if (blocks.length>MAX_SLIDES || blocks.some(s=>s.length>2500)) return toast('Use até 20 slides e no máximo 2.500 caracteres em cada um.');
    const texts=parseOutline(raw); commit(p=>{p.slides=texts.map((text,i)=>({...structuredClone(p.slides[i] || p.slides[0] || newSlide(state.workspace)),id:p.slides[i]?.id||crypto.randomUUID(),text}));},true);
    closeModal(); return toast('Roteiro distribuído nos slides. Você pode desfazer esta alteração.');
  }
  if (a === 'bold') {
    const area=$('slide-text'), start=area.selectionStart,end=area.selectionEnd;
    if(start===end)return toast('Selecione o trecho que deseja destacar.');
    const value=area.value, text=value.slice(0,start)+'**'+value.slice(start,end)+'**'+value.slice(end);
    if(text.length>2500)return toast('O texto atingiu o limite deste slide.');
    updateSlide({text}); area.value=text;area.focus();area.setSelectionRange(start+2,end+2);return;
  }
  if (a === 'upload' || a === 'upload-before') { state.uploadTarget=a==='upload-before'?'beforeImage':'image';$('photo-input').value='';$('photo-input').click();return; }
  if (a === 'choose-photo') return updateSlide({image:el.dataset.id},true);
  if (a === 'repeat-photo') { if(!slide().image)return;const id=slide().image;commit(p=>p.slides.forEach(s=>{s.image=id;}));return toast('A mesma foto está em todos os slides.'); }
  if (a === 'position') return updateSlide({box:{...slide().box,y:Number(el.dataset.y)}},true);
  if (a === 'template') { if(!TEMPLATES.some(t=>t.id===el.dataset.template))return;updateSlide({layout:el.dataset.template},true);return; }
  if (a === 'repeat-style') { const s=structuredClone(slide());commit(p=>p.slides.forEach(x=>Object.assign(x,{layout:s.layout,fontSize:s.fontSize,align:s.align,box:{...s.box},logo:s.logo})));return toast('Layout aplicado a todos. Textos e fotos foram mantidos.'); }
  if (a === 'copy-caption') { await navigator.clipboard.writeText(state.project.caption);return toast('Legenda copiada.'); }
  if (a === 'export' || a === 'current-png') return exportSlides(a==='current-png');
  if (a === 'backup') return backup();
  if (a === 'import') { $('project-input').value='';$('project-input').click();return; }
}
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-tab]');if(tab&&ready){state.tab=tab.dataset.tab;renderPanel();return;}
  const el=event.target.closest('[data-action]');if(el)void action(el).catch(e=>toast(e.message || 'Não foi possível concluir esta ação.'));
  else if(event.target.classList.contains('modal-backdrop'))closeModal();
});
document.addEventListener('input',event=>{
  if(!ready||state.busy)return;const el=event.target, id=el.id;
  if(id==='project-title'){commit(p=>{p.title=el.value.slice(0,200);});return;}
  if(id==='slide-text')return updateSlide({text:el.value.slice(0,2500)});
  if(id==='caption'){commit(p=>{p.caption=el.value.slice(0,12000);});$('caption-count').textContent=el.value.length+' caracteres';return;}
  if(id==='slide-label')return updateSlide({label:el.value.slice(0,80)});
  if(id==='font-size'){$('font-output').textContent=el.value+' px';return updateSlide({fontSize:clamp(el.value,20,96)});}
  if(['box-width','box-x','box-y'].includes(id)){const key={'box-width':'width','box-x':'x','box-y':'y'}[id];return updateSlide({box:{...slide().box,[key]:Number(el.value)}});}
  if(id==='focal-x'||id==='focal-y')return updateSlide({[id==='focal-x'?'focalX':'focalY']:clamp(el.value,0,100)});
});
document.addEventListener('change',event=>{
  if(!ready)return; const el=event.target;
  if(el.id==='workspace')void switchWorkspace(el.value).catch(e=>toast(e.message));
  if(el.id==='photo-input')void upload(el.files,state.uploadTarget).catch(e=>toast(e.message));
  if(el.id==='project-input')void importProject(el.files[0]).catch(e=>toast(e instanceof SyntaxError?'Este arquivo não é um projeto válido.':e.message));
  if(el.id==='photo-fit')updateSlide({fit:el.value});
  if(el.id==='post-format')commit(p=>{p.format=el.value;});
  if(el.id==='text-align')updateSlide({align:el.value});
  if(el.id==='show-logo')updateSlide({logo:el.checked});
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')return closeModal();
  const dialog=document.querySelector('.modal');
  if(event.key==='Tab'&&dialog){const nodes=[...dialog.querySelectorAll('button,a,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return;}
  const tab=event.target.closest('[data-tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    const list=[...document.querySelectorAll('[data-tab]')],i=list.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?3:(i+(event.key==='ArrowLeft'?-1:1)+4)%4;
    event.preventDefault();state.tab=list[next].dataset.tab;renderPanel();list[next].focus();return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void persist().then(()=>toast('Rascunho salvo neste navegador.')).catch(()=>toast('Não foi possível salvar. Baixe uma cópia do projeto.'));}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!/^(INPUT|TEXTAREA)$/.test(event.target.tagName)){event.preventDefault();restore(event.shiftKey?'redo':'undo');}
  if(event.target.id==='preview'&&lastGeometry?.box&&event.key.startsWith('Arrow')){
    event.preventDefault();const dx=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0,dy=event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0;
    updateSlide({box:{...slide().box,x:clamp(slide().box.x+dx,2,94-slide().box.width),y:clamp(slide().box.y+dy,2,90)}},state.tab==='layout');
  }
});
const canvas=$('preview');
canvas.addEventListener('pointerdown',event=>{
  if(!lastGeometry?.box||state.busy)return;
  const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*canvas.width/r.width,y=(event.clientY-r.top)*canvas.height/r.height,b=lastGeometry.box;
  if(x<b.x||x>b.x+b.w||y<b.y||y>b.y+b.h)return;
  drag={x,y,b:{...b},original:structuredClone(state.project)};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');event.preventDefault();
});
canvas.addEventListener('pointermove',event=>{
  if(!drag)return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*canvas.width/r.width,y=(event.clientY-r.top)*canvas.height/r.height;
  slide().box.x=clamp((drag.b.x+x-drag.x)/canvas.width*100,2,(canvas.width-drag.b.w-24)/canvas.width*100);
  slide().box.y=clamp((drag.b.y+y-drag.y)/canvas.height*100,2,(canvas.height-drag.b.h-24)/canvas.height*100);schedulePaint();
});
function endDrag(){if(!drag)return;state.history.push(drag.original);state.redo=[];drag=null;canvas.classList.remove('dragging');state.project.updatedAt=new Date().toISOString();void persist();syncChrome();if(state.tab==='layout')renderPanel();}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
const dropArea=document.querySelector('.canvas-wrap');
dropArea.addEventListener('dragover',e=>{e.preventDefault();dropArea.classList.add('drop-active');});
dropArea.addEventListener('dragleave',()=>dropArea.classList.remove('drop-active'));
dropArea.addEventListener('drop',e=>{e.preventDefault();dropArea.classList.remove('drop-active');if(ready&&!state.busy)void upload(e.dataTransfer.files).catch(e=>toast(e.message));});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==='tideplace:workspace'&&ready)void switchWorkspace(event.data.workspace).catch(e=>toast(e.message));});
if (typeof ResizeObserver !== 'undefined' && window.parent !== window) {
  new ResizeObserver(() => window.parent.postMessage({type:'tideplace:creator-height',height:document.querySelector('main').scrollHeight+40},location.origin)).observe(document.querySelector('main'));
}
async function init(){
  try{
    await fontsReady();state.assets=await listAssets(state.workspace);
    let project;
    if(params.get('ideia')){const idea=ideas().find(i=>i.id===params.get('ideia'));if(idea)project=newProject(state.workspace,seedFromIdea(idea));else toast('Esta ideia não foi encontrada neste navegador.');}
    if(!project&&params.get('referencia')){try{project=newProject(state.workspace,await seedFromReference(params.get('referencia')));}catch(e){toast(e.message);}}
    if(!project&&params.get('projeto')){const candidate=await getProject(params.get('projeto'));if(validateProject(candidate,state.workspace))project=candidate;}
    if(!project){const projects=await listProjects(state.workspace);project=projects.find(p=>validateProject(p,state.workspace))||newProject(state.workspace);}
    ready=true;await selectProject(project);
    if(window.parent!==window)window.parent.postMessage({type:'tideplace:creator-ready'},location.origin);
  }catch(e){ready=true;state.project=state.project||newProject(state.workspace);render();status('Não foi possível preparar o salvamento',true);toast(e.message || 'Verifique se o navegador permite armazenamento de arquivos.');}
}
void init();
