import test from 'node:test';
import assert from 'node:assert/strict';
import {routeViviConversation} from '../app/api/integrations/argo/v1/bridge.mjs';
import {isMarketplacePostSale} from '../app/lib/vital-postsale-routing.mjs';

function fakeDb(setting, keyCount=1) {
  const records=[];let keyQueries=0;
  const chain={
    select(){return this},eq(){return this},is(){return this},
    async gt(){keyQueries++;return {count:keyCount,error:null}},
    async maybeSingle(){return {data:setting,error:null}},
  };
  return {records,get keyQueries(){return keyQueries},from(table){
    if(table==='vital_whatsapp_assignments') return {async upsert(row){records.push(row);return {error:null}}};
    if(['vital_whatsapp_sector_settings','vital_whatsapp_argo_keys'].includes(table))return chain;
    throw new Error('unexpected database table: '+table);
  }};
}
const conn={id:'fake-connection',owner_user_id:'fake-owner'};
const settings={routing_enabled:true,default_assignee:'andrey'};

test('menu selections for known marketplaces route to Andrey only when enabled and connected',async()=>{
  for(const origin of ['Shopee','TikTok Shop','Mercado Livre','Amazon']){
    const db=fakeDb(settings);
    await routeViviConversation(db,conn,'5511999999999','await_human','Pós-venda · '+origin);
    assert.equal(db.records.length,1,origin);
    assert.equal(db.records[0].sector,'pos_venda',origin);
    assert.equal(db.records[0].assigned_to,'andrey',origin);
    assert.equal(db.keyQueries,1,origin);
  }
});

test('site/Nuvemshop and unrecognized origins remain in Tide even when marketplace routing is active',async()=>{
  for(const origin of ['Site Vital Decor','Nuvemshop','loja desconhecida','']){
    const db=fakeDb(settings);
    await routeViviConversation(db,conn,'5511999999999','await_human','Pós-venda · '+origin);
    assert.equal(db.records[0].assigned_to,'tide',origin);
    assert.equal(db.keyQueries,0,origin);
  }
});

test('the disabled rule or missing Andrey key never forwards a customer',async()=>{
  for(const [rule,keys] of [[{...settings,routing_enabled:false},1],[settings,0],[{...settings,default_assignee:'vitor'},1]]){
    const db=fakeDb(rule,keys);
    await routeViviConversation(db,conn,'5511999999999','await_human','Pós-venda · Mercado Livre');
    assert.equal(db.records[0].assigned_to,'tide');
  }
});

test('other business sectors retain their existing routing behavior',async()=>{
  const db=fakeDb({routing_enabled:true,default_assignee:'vitor'});
  await routeViviConversation(db,conn,'5511999999999','await_human','VTX Fitness');
  assert.equal(db.records[0].assigned_to,'vitor');
  assert.equal(isMarketplacePostSale('PÓS-VENDA — MERCADO LIVRE'),true);
  assert.equal(isMarketplacePostSale('Pós-venda · Site Vital Decor'),false);
});
