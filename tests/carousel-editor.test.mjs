import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newSlide, parseOutline, validateProject, textRuns, wrapText, missingImages, safeUrl, filename } from '../public/editor/model.mjs';
import { zip, crc32 } from '../public/editor/zip.mjs';

test('Gui uses its fixed design; photo references can be shared without altering the originals', () => {
  const p = newProject('gui-nonato', { slides: ['Capa: **Uma boa ideia**', 'Segundo slide'] });
  assert.equal(p.slides.length, 2); assert.equal(p.slides[0].layout, 'gui');
  assert.equal(p.slides[0].text, '**Uma boa ideia**'); assert.equal(p.format, 'square');
  assert.ok(validateProject(p, 'gui-nonato')); assert.equal(validateProject(p, 'vital-decor'), false);
  assert.deepEqual(missingImages(p), [1, 2]);
  p.slides.forEach(s => { s.image = 'shared-photo'; }); assert.deepEqual(missingImages(p), []);
  p.slides[1].layout = 'dicas'; assert.equal(validateProject(p, 'gui-nonato'), false);
});
test('before and after requires both original photos and validates imported slide data', () => {
  const p = newProject('vital-decor', { slides: ['Uma transformação real'] });
  p.slides[0].layout = 'comparacao'; p.slides[0].image = 'after';
  assert.deepEqual(missingImages(p), [1]); p.slides[0].beforeImage = 'before';
  assert.deepEqual(missingImages(p), []); assert.ok(validateProject(p, 'vital-decor'));
  p.slides[0].box.width = NaN; assert.equal(validateProject(p, 'vital-decor'), false);
  p.slides[0] = newSlide('vital-decor'); p.slides.push(structuredClone(p.slides[0]));
  assert.equal(validateProject(p, 'vital-decor'), false);
});
test('outline keeps manual line breaks and only separates slides on empty lines', () => {
  assert.deepEqual(parseOutline('Capa: Minha ideia\ncontinua aqui\n\nSlide 2: Meu exemplo\n\nCTA: Fale com a equipe'), ['Minha ideia\ncontinua aqui','Meu exemplo','Fale com a equipe']);
});
test('bold text, manual line breaks and long words stay within the available text width', () => {
  assert.deepEqual(textRuns('Uma **boa** ideia'), [{text:'Uma ',bold:false},{text:'boa',bold:true},{text:' ideia',bold:false}]);
  const ctx = { font: '', measureText: value => ({ width: value.length * 10 }) };
  const lines = wrapText(ctx, 'Uma **boa ideia**\nabcdefghijklmno', 40, 60);
  assert.ok(lines.every(line => line.reduce((sum, r) => sum + ctx.measureText(r.text).width, 0) <= 60));
  assert.equal(lines.flat().filter(r=>r.bold).map(r=>r.text).join(''), 'boaideia');
});
test('download names and reference URLs cannot become scripts or path traversal', () => {
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('http://example.com'), '');
  assert.equal(safeUrl('https://instagram.com/p/test'), 'https://instagram.com/p/test');
  assert.equal(filename('../../Minha inspiração!'), 'minha-inspiracao');
});
test('ZIP exports ordered PNGs and a UTF-8 caption with valid checksums and directory offsets', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const files = [{name:'01-capa.png',blob:new Blob([new Uint8Array([137,80,78,71])])},{name:'legenda.txt',text:'Decoração com personalidade.'}];
  const bytes = new Uint8Array(await (await zip(files)).arrayBuffer()), v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(0,true),0x04034b50);
  const end=bytes.length-22;assert.equal(v.getUint32(end,true),0x06054b50);assert.equal(v.getUint16(end+10,true),2);
  let directory = v.getUint32(end+16,true);
  for (const file of files) {
    assert.equal(v.getUint32(directory,true),0x02014b50); const offset=v.getUint32(directory+42,true);
    const nameLength=v.getUint16(offset+26,true), size=v.getUint32(offset+18,true), start=offset+30+nameLength;
    assert.equal(new TextDecoder().decode(bytes.slice(offset+30,start)),file.name);
    assert.equal(v.getUint32(directory+16,true),crc32(bytes.slice(start,start+size)));
    directory += 46 + v.getUint16(directory+28,true);
  }
});
