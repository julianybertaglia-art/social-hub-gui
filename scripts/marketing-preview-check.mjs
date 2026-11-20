const key=process.env.GEMINI_API_KEY||'';
console.log('DIAG key-present='+Boolean(key)+' quoted=' + /^["']/.test(key.trim()) + ' assignment='+/^GEMINI_API_KEY=/.test(key.trim())+' gateway-present='+Boolean(process.env.AI_GATEWAY_API_KEY));
const checks=['gemini-3.6-flash','gemini-2.5-flash','gemini-2.5-flash-lite'].map(async model=>{
 const start=Date.now();
 try{
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
   method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
   body:JSON.stringify({contents:[{parts:[{text:'Responda apenas OK'}]}],generationConfig:{maxOutputTokens:50}}),
   signal:AbortSignal.timeout(16000)});
  const body=await r.json().catch(()=>({}));
  const text=(body.candidates?.[0]?.content?.parts||[]).some(p=>!p.thought&&p.text);
  console.log('DIAG model='+model+' status='+r.status+' elapsed='+ (Date.now()-start)+'ms text='+text+' errorCode='+(body.error?.status||'none'));
 } catch(e){ console.log('DIAG model='+model+' error='+e.name+' elapsed='+(Date.now()-start)+'ms'); }
});
await Promise.all(checks);
