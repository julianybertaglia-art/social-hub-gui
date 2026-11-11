'use client';
const queues=[{queue_code:'varejo_nv',display_name:'Varejo Nuvemshop',color:'#327fc2'}];
const contacts=[{id:'demo-1',name:'Cliente de exemplo',phone:'(11) 99999-0000',queue:'varejo_nv',preview:'Olá! Tenho uma dúvida sobre minha compra.',status:'open',updatedAt:'2026-11-11T12:00:00Z',replyWindowOpen:true}];
export async function api(path){
 const url=new URL(path,'http://example.test');
 const gui=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('role')==='gui';
 const resource=url.searchParams.get('resource');
 if(resource==='access')return {available:true,storeOnly:gui};
 if(path.includes('/store')){
  const rows={customers:{id:1,name:'Cliente da loja de teste',email:'cliente@example.test',phone:'11999999999',acceptsMarketing:true},orders:{id:1,number:111,customer:{name:'Cliente da loja de teste'},total:'99.00',currency:'BRL',paymentStatus:'paid',createdAt:'2026-11-01'},products:{id:1,name:'Produto de teste',published:true,variants:[{price:'99.00',stock:10}]},checkouts:{id:1,name:'Checkout de teste',email:'cliente@example.test',phone:'11999999999',total:'99.00',createdAt:'2026-11-01'}};
  return {resource,items:rows[resource]?[rows[resource]]:[]};
 }
 if(gui)throw new Error('Acesso restrito à loja de exemplo.');
 if(url.searchParams.has('contact'))return {contact:contacts[0],messages:[{id:1,direction:'inbound',body:'Olá! Tenho uma dúvida sobre minha compra.',at:'2026-11-11T12:00:00Z'},{id:2,direction:'outbound',body:'Olá! Como posso ajudar você?',at:'2026-11-11T12:01:00Z'}]};
 return {role:'owner',queues,transferDestinations:queues,counters:{total:1,pending:0,open:1,closed:0,unassigned:0,queues:{varejo_nv:1}},conversations:contacts,hasMore:false,readOnly:false,canReply:true};
}
