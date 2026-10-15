import { authorize } from '../../vital-connections/service';
import { connectedInstagram } from '../../vital-connections/instagram/metrics.mjs';
import { fail, GUI_INSTAGRAM_ID } from '../../vital-connections/helpers.mjs';
import { periodRange, numberOrNull } from '../../../lib/operations.mjs';
export const dynamic='force-dynamic';export const maxDuration=120;
const cache=new Map();const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request){try{
 const {db,ownerId}=await authorize(request),url=new URL(request.url),workspace=url.searchParams.get('workspace');
 if(!['gui-nonato','vital-decor'].includes(workspace))throw fail('Marca inválida.',400);
 const range=periodRange(url.searchParams.get('days')),key=ownerId+':'+workspace+':'+range.days+':'+range.startDate;
 const hit=cache.get(key);if(hit&&Date.now()-hit.time<300000)return Response.json(hit.data,{headers});
 let token,accountId,host;
 if(workspace==='vital-decor'){const c=await connectedInstagram(db,ownerId);token=c.access_token;accountId=String(c.external_account_id);host='graph.facebook.com';}
 else{token=process.env.META_INSTAGRAM_ACCESS_TOKEN;accountId=GUI_INSTAGRAM_ID;host='graph.instagram.com';}
 if(!token)throw fail('A conexão do Instagram precisa ser configurada.',409);
 async function graph(path,query){const target=new URL('https://'+host+'/v26.0/'+path);for(const[k,v]of Object.entries(query))target.searchParams.set(k,String(v));const response=await fetch(target,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok||data.error)throw fail('A Meta não disponibilizou estes dados. Confira a conexão e as permissões.',502);return data;}
 const seconds=d=>Math.floor(Date.parse(d)/1000);
 async function totals(start,end){const query={period:'day',metric_type:'total_value',since:seconds(start),until:seconds(end)},result={reach:null,views:null,total_interactions:null};
  try{const data=await graph(accountId+'/insights',{...query,metric:Object.keys(result).join(',')});for(const row of data.data||[])if(row.name in result)result[row.name]=numberOrNull(row.total_value?.value);}
  catch{await Promise.all(Object.keys(result).map(async metric=>{try{const d=await graph(accountId+'/insights',{...query,metric});result[metric]=numberOrNull(d.data?.find(r=>r.name===metric)?.total_value?.value);}catch{}}));}return result;}
 const settled=await Promise.allSettled([
 graph(accountId,{fields:'id,username,followers_count,media_count,profile_picture_url'}),totals(range.start,range.end),totals(range.previousStart,range.start),
 graph(accountId+'/insights',{metric:'reach',period:'day',metric_type:'time_series',since:seconds(range.start),until:seconds(range.end)}),
 graph(accountId+'/media',{fields:'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count',limit:50})]);
 const value=i=>settled[i].status==='fulfilled'?settled[i].value:null;const profile=value(0);if(!profile||String(profile.id)!==accountId)throw fail('Não foi possível confirmar o perfil conectado.',502);
 const media=value(4)?.data||[],items=[];
 // Keep the sample bounded and isolate unsupported media metrics.
 for(let i=0;i<Math.min(media.length,12);i+=4){const batch=await Promise.all(media.slice(i,i+4).map(async p=>{let metrics={};try{const d=await graph(p.id+'/insights',{metric:'reach,views,total_interactions,saved,shares'});metrics=Object.fromEntries((d.data||[]).map(r=>[r.name,numberOrNull(r.total_value?.value??r.values?.[0]?.value)]));}catch{}return {id:p.id,caption:p.caption||'',type:p.media_product_type||p.media_type,url:p.permalink,timestamp:p.timestamp,thumbnail:p.thumbnail_url||p.media_url,likes:numberOrNull(p.like_count),comments:numberOrNull(p.comments_count),reach:metrics.reach??null,views:metrics.views??null,interactions:metrics.total_interactions??null};}));items.push(...batch);}
 const daily=(value(3)?.data?.find(r=>r.name==='reach')?.values||[]).map(v=>({date:new Date(Date.parse(v.end_time)-1).toISOString().slice(0,10),value:numberOrNull(v.value)}));
 const data={workspace,range,profile:{username:profile.username,followers:numberOrNull(profile.followers_count),picture:profile.profile_picture_url},current:value(1),previous:value(2),daily,items,mediaAvailable:value(4)!==null,sampleLimit:12,updatedAt:new Date().toISOString(),source:'Meta'};
 if(cache.size>50)cache.clear();cache.set(key,{time:Date.now(),data});return Response.json(data,{headers});
 }catch(e){return Response.json({error:e.status?e.message:'Não foi possível consultar o Instagram.'},{status:e.status||503,headers});}}
