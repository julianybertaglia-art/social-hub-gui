import test from 'node:test';
import assert from 'node:assert/strict';
import {TOPIC_DEFAULT,topicsFor,validTopic,inferredTopic,resolvedTopic} from '../app/lib/conversation-topics.mjs';
test('Gui and Vital expose only their own subjects',()=>{
 assert.deepEqual(topicsFor('gui-nonato').map(x=>x.label),['Mentoria','Iniciantes','Importação','Outros assuntos','Vendas finalizadas']);
 assert.deepEqual(topicsFor('vital-decor').map(x=>x.label),['Pós-venda','Varejo','Atacado','VTX','Bluetti','Outros assuntos','Vendas finalizadas']);
 assert.ok(validTopic('gui-nonato','mentoria'));
 assert.ok(!validTopic('vital-decor','mentoria'));
 assert.ok(!validTopic('gui-nonato','pos_venda'));
 assert.equal(new Set(topicsFor('vital-decor').map(x=>x.color)).size,7);
});
test('structured hints only; subject never overrides sector or stage',()=>{
 assert.equal(inferredTopic('gui-nonato',{stage:'Venda'}),'vendas_finalizadas');
 assert.equal(inferredTopic('gui-nonato',{notes:'Já pagou',stage:'Interessado'}),TOPIC_DEFAULT);
 assert.equal(inferredTopic('gui-nonato',{tags:['Iniciante']}),'iniciantes');
 assert.equal(inferredTopic('gui-nonato',{smart_categories:['Importação']}),'importacao');
 assert.equal(inferredTopic('gui-nonato',{category:'beginners'},'instagram'),'iniciantes');
 assert.equal(inferredTopic('vital-decor',{sector:'pos_venda'}),'pos_venda');
 assert.equal(inferredTopic('vital-decor',{sector:'bluetti'}),'bluetti');
 assert.equal(inferredTopic('vital-decor',{sector:'comercial_vital'}),'varejo');
});
test('explicit manual subject beats inferred labels',()=>{
 const contact={id:'some-id',stage:'Venda',tags:['Mentoria']};
 assert.equal(resolvedTopic('gui-nonato',contact,{'some-id':'importacao'}),'importacao');
 assert.equal(resolvedTopic('gui-nonato',contact,{}),'vendas_finalizadas');
 assert.equal(resolvedTopic('vital-decor',{id:'55',sector:'atacado'},{'55':'outros'}),'outros');
});
