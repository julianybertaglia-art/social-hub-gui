import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewDemoConversation,canReplyDemo,canChangeDemoStatus,canTransferDemo,
  changeDemoStatus,transferDemoConversation,countDemoConversations,
} from '../app/preview/crm/demo-operations.mjs';

const owner={role:'Administradora',queues:null};
const agent={role:'Atendente',queues:['pos_shopee','pos_tiktok']};
const supervisor={role:'Supervisor',queues:null};
const shopee={id:'demo-1',queue:'pos_shopee',status:'Aguardando'};
const atacado={id:'demo-2',queue:'atacado',status:'Em andamento'};
const queues=['pos_shopee','pos_tiktok','atacado'];

test('demo employee sees and can reply only to assigned queues',()=>{
 assert.equal(canViewDemoConversation(agent,shopee),true);
 assert.equal(canViewDemoConversation(agent,atacado),false);
 assert.equal(canReplyDemo(agent,shopee),true);
 assert.equal(canReplyDemo(agent,atacado),false);
 assert.throws(()=>changeDemoStatus(agent,atacado,'Concluído'),/sem permissão/);
});

test('demo supervisor can read all queues but cannot reply, edit status or transfer',()=>{
 assert.equal(canViewDemoConversation(supervisor,atacado),true);
 assert.equal(canReplyDemo(supervisor,atacado),false);
 assert.equal(canChangeDemoStatus(supervisor,atacado),false);
 assert.equal(canTransferDemo(supervisor,atacado),false);
 assert.throws(()=>changeDemoStatus(supervisor,atacado,'Concluído'),/sem permissão/);
 assert.throws(()=>transferDemoConversation(supervisor,atacado,'pos_shopee',queues),/sem permissão/);
});

test('demo owner can transfer and resolve a fake conversation without mutating input',()=>{
 const moved=transferDemoConversation(owner,atacado,'pos_shopee',queues);
 assert.equal(moved.queue,'pos_shopee');
 const resolved=changeDemoStatus(owner,moved,'Concluído');
 assert.equal(resolved.status,'Concluído');
 assert.equal(atacado.queue,'atacado');
 assert.equal(atacado.status,'Em andamento');
 assert.throws(()=>transferDemoConversation(owner,atacado,'missing_queue',queues),/Fila de destino inexistente/);
 assert.throws(()=>changeDemoStatus(owner,atacado,'Outro'),/Status não reconhecido/);
});

test('demo counters reflect sector permissions and in-memory state transitions',()=>{
 const original=[shopee,atacado,{id:'demo-3',queue:'pos_tiktok',status:'Concluído'}];
 assert.deepEqual(countDemoConversations(agent,original),{total:2,pending:1,active:0,resolved:1});
 assert.deepEqual(countDemoConversations(supervisor,original),{total:3,pending:1,active:1,resolved:1});
 const updated=[changeDemoStatus(agent,shopee,'Em andamento'),...original.slice(1)];
 assert.deepEqual(countDemoConversations(agent,updated),{total:2,pending:0,active:1,resolved:1});
});

test('demo role restrictions remain denied for null identity and unrecognized queues',()=>{
 assert.equal(canViewDemoConversation(null,shopee),false);
 assert.equal(canReplyDemo(null,shopee),false);
 assert.equal(canReplyDemo(agent,{...shopee,queue:'unknown'}),false);
 assert.equal(canTransferDemo(agent,shopee),false);
});
