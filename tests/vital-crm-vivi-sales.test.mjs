import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Vital retail CRM offers Vivi sales shortcuts only in the Vital Decor retail queue',()=>{
 const ui=source('app/VitalCRMReal.js');
 const css=source('app/vital-crm-real.module.css');
 assert.match(ui,/detail\.contact\.queue==='varejo_nv'/);
 assert.match(ui,/VIVI_SALES_CATEGORIES\.map/);
 assert.match(ui,/onClick=\{\(\)=>prepareSalesReply\(category\.id\)\}/);
 assert.match(ui,/Revise a resposta antes de enviar/);
 assert.match(ui,/setDraft\(`Oi!/);
 assert.match(ui,/getViviSalesLink\(categoryId\)/);
 assert.match(css,/\.salesAssistantOptions/);
});

test('CRM sales helper fills a draft and leaves sending to the operator',()=>{
 const ui=source('app/VitalCRMReal.js');
 const helper=ui.slice(ui.indexOf('function prepareSalesReply'),ui.indexOf('async function setResolution'));
 assert.match(helper,/setDraft\(/);
 assert.doesNotMatch(helper,/await api\(|fetch\(|requestSubmit\(|\.click\(/);
});
