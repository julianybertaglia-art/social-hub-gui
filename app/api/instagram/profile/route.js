import { verifiedGuiInstagram, verifiedGuiGraph } from '../../../lib/gui-instagram-meta.mjs';
import { matchesGuiInstagramProfile, GUI_INSTAGRAM_ACCOUNT_ID } from '../../../lib/gui-instagram-connection.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function GET() {
  const headers = {'Cache-Control':'private, no-store'};
  try {
    const connection = await verifiedGuiInstagram();
    const basic = connection.profile;
    if (!matchesGuiInstagramProfile(basic)) throw Object.assign(new Error('Conta do Gui não confirmada.'),{status:502});
    let profile = basic;
    if (profile.followers_count == null || !profile.profile_picture_url) {
      try {
        const details = await verifiedGuiGraph(connection,GUI_INSTAGRAM_ACCOUNT_ID,{fields:'id,username,followers_count,media_count,profile_picture_url'});
        if (matchesGuiInstagramProfile(details)) profile = {...basic,...details};
      } catch { /* A autorização pode permitir identidade, mas não dados adicionais. */ }
    }
    return Response.json({
      id:String(profile.id),username:profile.username,name:profile.name || 'Gui Nonato',
      profilePictureUrl:profile.profile_picture_url || '',
      followersCount:profile.followers_count == null ? null : Number(profile.followers_count),
      mediaCount:profile.media_count == null ? null : Number(profile.media_count),
      accountType:'Instagram Business',connected:true,source:'Meta API',updatedAt:new Date().toISOString()
    },{headers});
  } catch(error) {
    return Response.json({
      error:'Não foi possível verificar @gui_nonato pela Meta.',
      code:error?.code || 'META_UNAVAILABLE',
      detail:'Confira a autorização e as permissões do Instagram na Central de Controle.'
    },{status:error?.status || 503,headers});
  }
}
