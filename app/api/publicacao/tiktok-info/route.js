import {
  publicationAuth,sameOrigin,publishError,NO_STORE
} from '../../../lib/multichannel-publisher.mjs';
import {queryTikTokCreatorInfo} from '../../../lib/tiktok-posting.mjs';

export const dynamic='force-dynamic';

export async function GET(request){
  try{
    sameOrigin(request);
    const {db,ownerId}=await publicationAuth(request);
    const creator=await queryTikTokCreatorInfo({db,ownerId});
    const note=creator.canDirectPost?'':creator.publicAccount&&!creator.audited
      ?'Antes da auditoria, o TikTok só permite Direct Post em contas privadas. Mude a privacidade da conta ou use o fluxo de rascunho.'
      :'O TikTok não liberou “Somente eu” para esta conta. Use o fluxo de rascunho até a auditoria do app.';
    return Response.json({...creator,note},{headers:NO_STORE});
  }catch(error){
    return publishError(null,error,'Não foi possível consultar as configurações atuais do criador no TikTok.');
  }
}
