'use client';
const queues=[{queue_code:'varejo_nv',display_name:'Varejo Nuvemshop',color:'#327fc2'}];
const contacts=[{id:'demo-1',name:'Cliente de exemplo',phone:'(11) 99999-0000',queue:'varejo_nv',preview:'Olá! Tenho uma dúvida sobre minha compra.',status:'open',updatedAt:'2026-11-11T12:00:00Z',replyWindowOpen:true}];
export async function api(path){
 const url=new URL(path,'http://example.test');
 if(url.searchParams.has('contact'))return {contact:contacts[0],messages:[{id:1,direction:'inbound',body:'Olá! Tenho uma dúvida sobre minha compra.',at:'2026-11-11T12:00:00Z'},{id:2,direction:'outbound',body:'Olá! Como posso ajudar você?',at:'2026-11-11T12:01:00Z'}]};
 return {role:'owner',queues,transferDestinations:queues,counters:{total:1,pending:0,open:1,closed:0,unassigned:0,queues:{varejo_nv:1}},conversations:contacts,hasMore:false,readOnly:false,canReply:true};
}
