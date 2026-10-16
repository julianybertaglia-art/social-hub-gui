import { matchesGuiInstagramProfile, GUI_INSTAGRAM_ACCOUNT_ID } from './gui-instagram-connection.mjs';

const GRAPH_VERSION = 'v26.0';
const EXPECTED_ID = GUI_INSTAGRAM_ACCOUNT_ID;
let memo = null;
const TIMEOUT_MS = 8500;

function candidates() {
  const access = String(process.env.META_INSTAGRAM_ACCESS_TOKEN || '').trim();
  const insights = String(process.env.META_INSTAGRAM_INSIGHTS_ACCESS_TOKEN || '').trim();
  const result = [
    {host:'graph.instagram.com',token:access,source:'Instagram Login'},
    {host:'graph.instagram.com',token:insights,source:'Instagram Insights'},
    {host:'graph.facebook.com',token:insights,source:'Facebook Insights'},
    {host:'graph.facebook.com',token:access,source:'Facebook Login'},
  ].filter(c=>c.token);
  return result.filter((c,i)=>result.findIndex(x=>x.host===c.host&&x.token===c.token)===i);
}
async function graphRead(candidate,path,query={}) {
  const url = new URL('https://' + candidate.host + '/' + GRAPH_VERSION + '/' + path);
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,String(value));
  const response = await fetch(url,{headers:{Authorization:'Bearer ' + candidate.token},cache:'no-store',signal:AbortSignal.timeout(TIMEOUT_MS)});
  const payload = await response.json().catch(()=>({}));
  if(!response.ok || payload.error) {
    const error = new Error('Meta request failed');
    error.code = Number(payload?.error?.code || response.status);
    error.httpStatus = response.status;
    throw error;
  }
  return payload;
}
function normalizeProfile(result) {
  if(!result || typeof result!=='object')return null;
  const id = String(result.user_id || result.id || '');
  const username = String(result.username || '').trim().replace(/^@/,'').toLowerCase();
  return { ...result, id, username };
}
async function probe(candidate){
  const paths = candidate.host==='graph.instagram.com' ? [
    ['me',{fields:'user_id,username,followers_count,media_count,profile_picture_url'}],
    ['me',{fields:'user_id,username'}],
    [EXPECTED_ID,{fields:'id,username,followers_count,media_count,profile_picture_url'}],
    [EXPECTED_ID,{fields:'id,username'}],
  ] : [
    [EXPECTED_ID,{fields:'id,username,followers_count,media_count,profile_picture_url'}],
    [EXPECTED_ID,{fields:'id,username'}],
  ];
  for(const [path,query] of paths){
    let payload;
    try{payload=await graphRead(candidate,path,query);}catch{continue;}
    const profile=normalizeProfile(payload);
    if(matchesGuiInstagramProfile(profile)){
      // A minimal identity request may omit followers. Missing metrics stay null.
      return {host:candidate.host,token:candidate.token,source:candidate.source,profile};
    }
    // A valid authenticated identity belonging to a different Instagram account
    // must not be represented as Gui, even when another credential is configured.
    if(profile?.username && profile.username!=='gui_nonato')return null;
  }
  return null;
}
export async function verifiedGuiInstagram(){
  if(memo && Date.now()-memo.time<60000)return memo.connection;
  const list=candidates();
  if(!list.length)throw Object.assign(new Error('Nenhuma credencial do Instagram configurada.'),{status:409,code:'META_CREDENTIAL_MISSING'});
  // Prioritize the regular token; try remaining credentials if it is invalid
  // or belongs to a different account. All results must verify BOTH id and username.
  const first=await probe(list[0]);
  let connection=first;
  if(!connection && list.length>1){
    const checks=await Promise.all(list.slice(1).map(probe));
    connection=checks.find(Boolean)||null;
  }
  if(!connection)throw Object.assign(new Error('A Meta não confirmou o perfil @gui_nonato. Verifique a autorização ou as permissões das credenciais.'),{status:502,code:'META_IDENTITY_UNVERIFIED'});
  memo={connection,time:Date.now()};
  return connection;
}
export async function verifiedGuiGraph(connection,path,query={}){
  if(!connection?.token || !matchesGuiInstagramProfile(connection.profile))throw Object.assign(new Error('Perfil de destino não confirmado.'),{status:403});
  return graphRead(connection,path,query);
}
