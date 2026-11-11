import test from 'node:test';
import assert from 'node:assert/strict';
import {projectNuvemshop} from '../app/lib/server/nuvemshop-project.mjs';

test('only CRM fields are returned; identifiers, addresses and sensitive links are stripped',()=>{
  const secret='never-display-this';
  const customer=projectNuvemshop('customers',[{
    id:4,name:'Exemplo',email:'person@example.test',phone:'5511000000000',accepts_marketing:true,
    identification:secret,default_address:{address:secret},token:secret,
  }]);
  assert.equal(customer[0].name,'Exemplo');
  assert.equal(customer[0].acceptsMarketing,true);
  assert.equal(JSON.stringify(customer).includes(secret),false);
  const checkout=projectNuvemshop('checkouts',[{id:7,contact_name:'Exemplo',abandoned_checkout_url:secret,contact_identification:secret}]);
  assert.equal(checkout[0].name,'Exemplo');
  assert.equal(JSON.stringify(checkout).includes(secret),false);
  const order=projectNuvemshop('orders',[{id:8,customer:{name:'Exemplo',identification:secret},shipping_address:secret,products:[{name:'Produto',quantity:1}]}]);
  assert.equal(order[0].products[0].name,'Produto');
  assert.equal(JSON.stringify(order).includes(secret),false);
});
test('known resources tolerate omitted optional fields without inventing values',()=>{
  const product=projectNuvemshop('products',[{id:1,name:{pt:'Produto'}}]);
  assert.equal(product[0].name,'Produto');
  assert.equal(product[0].published,null);
  assert.deepEqual(product[0].variants,[]);
  assert.throws(()=>projectNuvemshop('unknown',[{}]),/não permitido/);
});
