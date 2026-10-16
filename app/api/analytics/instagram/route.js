import { authorize } from '../../vital-connections/service';
import { connectedInstagram } from '../../vital-connections/instagram/metrics.mjs';
import { fail } from '../../vital-connections/helpers.mjs';
import { periodRange, numberOrNull } from '../../../lib/operations.mjs';
import { verifiedGuiInstagram, verifiedGuiGraph } from '../../../lib/gui-instagram-meta.mjs';
import { GUI_INSTAGRAM_ACCOUNT_ID } from '../../../lib/gui-instagram-connection.mjs';

export const dynamic='force-dynamic';
export const maxDuration=120;
const cache=new Map();
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};

export async function GET(request){
 try {
  const {db,ownerId}=await authorize(request);
  const url=new URL(request.url),workspace=url.searchParams.get('workspace');
  if(!['gui-nonato','vital-decor'].includes(workspace))throw fail('Marca inválida.',400);
  const range=periodRange(url.searchParams.get('days'));
  const key=ownerId+':'+workspace+':'+range.days+':'+range.startDate;
  const hit=cache.get(key);
  if(hit && Date.now()-hit.time<120000)return Response.json(hit.data,{headers});

  let connection=null,token=null,accountId=null,host=null,profile=null;
  if(workspace==='gui-nonato'){
    connection=await verifiedGuiInstagram({preferInsights:true});
    profile=connection.profile;
    accountId=GUI_INSTAGRAM_ACCOUNT_ID;
  } else {
    const saved=await connectedInstagram(db,ownerId);
    token=saved.access_token;
    accountId=String(saved.external_account_id);
    host='graph.facebook.com';
  }
  async function graph(path,query={}){
    if(connection)return verifiedGuiGraph(connection,path,query);
    const target=new URL('https://'+host+'/v26.0/'+path);
    for(const[k,v]of Object.entries(query))target.searchParams.set(k,String(v));
    const response=await fetch(target,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(12000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error)throw fail('A Meta não disponibilizou esta consulta.',502);
    return data;
  }
  // All ranges refer to the same Brasília-local start and exclusive end.
  const seconds=d=>Math.floor(Date.parse(d)/1000);
  async function totals(start,end){
    const query={period:'day',metric_type:'total_value',since:seconds(start),until:seconds(end)};
    const result={reach:null,views:null,total_interactions:null};
    try{
      const data=await graph(accountId+'/insights',{...query,metric:Object.keys(result).join(',')});
      for(const row of data.data||[])if(row.name in result)result[row.name]=numberOrNull(row.total_value?.value);
    }catch{
      // A permission may grant only individual metrics. Never invent missing values.
      await Promise.all(Object.keys(result).map(async metric=>{
        try{
          const d=await graph(accountId+'/insights',{...query,metric});
          result[metric]=numberOrNull(d.data?.find(r=>r.name===metric)?.total_value?.value);
        }catch{}
      }));
    }
    return result;
  }
  const settled=await Promise.allSettled([
    workspace==='gui-nonato'
      ? Promise.resolve(profile)
      : graph(accountId,{fields:'id,username,followers_count,media_count,profile_picture_url'}),
    totals(range.start,range.end),
    totals(range.previousStart,range.start),
    graph(accountId+'/insights',{metric:'reach',period:'day',metric_type:'time_series',since:seconds(range.start),until:seconds(range.end)}),
    graph(accountId+'/media',{fields:'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count',limit:30}),
  ]);
  const value=i=>settled[i].status==='fulfilled'?settled[i].value:null;
  profile=value(0);
  if(!profile||String(profile.id)!==String(accountId))throw fail('Não foi possível confirmar o perfil conectado.',502);
  const media=value(4)?.data||[],items=[];
  for(let i=0;i<Math.min(media.length,12);i+=4){
    const batch=await Promise.all(media.slice(i,i+4).map(async item=>{
      let metrics={};
      try{
        const d=await graph(item.id+'/insights',{metric:'reach,views,total_interactions,saved,shares'});
        metrics=Object.fromEntries((d.data||[]).map(row=>[row.name,numberOrNull(row.total_value?.value??row.values?.[0]?.value)]));
      }catch{}
      return {id:item.id,caption:item.caption||'',type:item.media_product_type||item.media_type,
        url:item.permalink,timestamp:item.timestamp,thumbnail:item.thumbnail_url||item.media_url,
        likes:numberOrNull(item.like_count),comments:numberOrNull(item.comments_count),
        reach:metrics.reach??null,views:metrics.views??null,interactions:metrics.total_interactions??null};
    }));
    items.push(...batch);
  }
  const daily=(value(3)?.data?.find(r=>r.name==='reach')?.values||[]).flatMap(v=>{
    const ms=Date.parse(v.end_time||'');
    return Number.isFinite(ms)?[{date:new Date(ms-1).toISOString().slice(0,10),value:numberOrNull(v.value)}]:[];
  });
  const current=value(1),previous=value(2);
  const partial=!current || Object.values(current).every(v=>v===null);
  const data={workspace,range,profile:{username:profile.username,followers:numberOrNull(profile.followers_count),picture:profile.profile_picture_url||null},
    current,previous,daily,items,mediaAvailable:value(4)!==null,sampleLimit:12,
    updatedAt:new Date().toISOString(),source:'Meta',
    profileVerified:true,partial,
    notice:partial?'Perfil confirmado, mas a Meta não disponibilizou os indicadores de alcance, interações e visualizações nesta consulta. Confira as permissões de insights.':null};
  if(cache.size>50)cache.clear();
  cache.set(key,{time:Date.now(),data});
  return Response.json(data,{headers});
 }catch(error){
  return Response.json({error:error.status?error.message:'Não foi possível consultar o Instagram.',code:error.code||'INSTAGRAM_METRICS_UNAVAILABLE'},
    {status:error.status||503,headers});
 }
}
