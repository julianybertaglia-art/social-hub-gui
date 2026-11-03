// Disposable HTTP fixture for local GitHub Actions only.
// Never opens a public listener or contacts Gemini.
import {createServer} from 'node:http';

const host='127.0.0.1',port=39751;
const server=createServer(async(request,response)=>{
 if(request.method!=='POST'||request.url!=='/generate'){
  response.writeHead(404);response.end('Not found');return;
 }
 let body='';
 for await(const chunk of request){body+=chunk; if(body.length>40000){response.writeHead(413);response.end();return;}}
 let input;
 try{input=JSON.parse(body);}catch{response.writeHead(400);response.end();return;}
 if(request.headers['x-goog-api-key']!=='ci-only-mock-key-not-valid-for-gemini'){
  response.writeHead(401);response.end();return;
 }
 if(!Array.isArray(input.contents)||!input.system_instruction?.parts?.[0]?.text){
  response.writeHead(400);response.end();return;
 }
 // Assert that the server-side redaction stage already masked this sample PII.
 if(/ci\.client@example\.invalid|5511999998888|Bearer ci-not-for-log/i.test(body)){
  response.writeHead(422,{'Content-Type':'application/json'});
  response.end(JSON.stringify({error:'Unredacted fake contact detected'}));return;
 }
 if(body.includes('CI_MOCK_FORCE_FAILURE')){
  response.writeHead(503,{'Content-Type':'application/json'});
  response.end(JSON.stringify({error:{message:'Fake Gemini outage'}}));return;
 }
 const last=input.contents.at(-1)?.parts?.[0]?.text||'';
 response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
 response.end(JSON.stringify({candidates:[{content:{parts:[{
  text:'Resposta do Gemini simulado em CI: '+last.slice(0,90),
 }]}}]}));
});
server.listen(port,host,()=>console.log('Local mock Gemini HTTP available at '+host+':'+port));
process.on('SIGTERM',()=>server.close());
