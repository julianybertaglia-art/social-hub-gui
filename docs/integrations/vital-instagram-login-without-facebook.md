# Plano B: Instagram Login direto da Vital Decor (sem Facebook do Guilherme)

## Por quê
O Login Unificado do Facebook devolveu `account_not_shared` mesmo após a Meta mostrar @vitaldecor_ entre as contas selecionadas. A tela de **Usuários do sistema** exige autenticação de dois fatores da conta de Guilherme. **Não contorne essa proteção.** Este fluxo alternativo usa a API oficial **Instagram API with Instagram Login**, autenticando a conta profissional @vitaldecor_ diretamente no Instagram, e não o usuário do Facebook.

## Antes de publicar
1. No aplicativo Meta da Vital, configure o caso de uso **Instagram API — API setup with Instagram login / Business Login**. Não confundir com **API setup with Unified Login (Facebook Login for Business)**.
2. Na configuração específica do Instagram, registre o OAuth redirect exatamente:
   `https://social-hub-gui.vercel.app/api/vital-connections/instagram/instagram-login/callback`
3. Na Vercel, configure por meio de campos secretos de ambiente (não compartilhar em conversas):
   - `META_VITAL_IG_APP_ID`: **Instagram App ID**, o ID específico do produto Instagram Login — não usar o Facebook App ID automaticamente.
   - `META_VITAL_IG_APP_SECRET`: **Instagram App Secret**, também específico do Instagram Login, exclusivo do servidor.
   Esses dois campos podem ser distintos de `META_APP_SECRET` e não podem usar o segredo do WhatsApp.
4. Confira o acesso às permissões `instagram_business_basic`, `instagram_business_manage_messages` e `instagram_business_manage_comments`; a Meta pode exigir papéis de desenvolvedor/testador, verificação ou App Review dependendo do usuário.
5. Configure o webhook do novo produto/app para a rota existente:
   `https://social-hub-gui.vercel.app/api/instagram/webhook`
   com `META_WEBHOOK_VERIFY_TOKEN` já utilizado pelo projeto. Assinar os campos `messages` e `comments` para a conta Vital. A verificação de assinatura aceita o segredo específico do Instagram somente para entradas com o ID fixo da Vital; não aceita entradas do Gui com esse segredo.
6. Revisar e executar a migration `20261105191500_vital_instagram_direct_login_provider.sql` no momento aprovado (não executar automaticamente). Ela adiciona a coluna `auth_provider` para distinguir o token do Instagram Login do token legado do Facebook. WhatsApp permanece com `facebook`.
7. Só depois publicar essa atualização. O painel mostrará **Entrar direto pelo Instagram da Vital** se as duas credenciais estiverem presentes; sem elas, não exibe o botão.
8. A autenticação ocorre em `instagram.com` com a conta profissional @vitaldecor_ e pode solicitar **a segurança/2FA do próprio Instagram**, mas não requer o autenticador do Facebook de Guilherme. Somente alguém autorizado a administrar @vitaldecor_ pode concluir esse passo.

## Confirmação técnica
- O retorno troca o código por token na API `api.instagram.com`, tenta obter token de longa duração em `graph.instagram.com`, consulta `/me?fields=user_id,username`, exige ID da Vital e usuário `vitaldecor_` exatos e confirma assinatura `messages,comments`.
- Se alguma etapa falhar, preserva a conexão antiga.
- Mídia/Directs e comentários continuam somente na conta Vital; nunca tocar nas rotas do Gui ou nas credenciais do WhatsApp.
- O novo token de longa duração expira: antes de operar indefinidamente, incluir/validar renovação automática com os limites da Meta. A primeira conexão não prova entregabilidade sem **dois testes reais** com conta autorizada de teste: novo Direct e comentário MARMORE.
- **Nenhum deploy, alteração no banco em produção ou alteração nas permissões Meta deve ser feita enquanto este PR não for aprovado com todos os pré-requisitos.**

## Referência
Meta Instagram API with Instagram Login: coleção oficial da Meta no Postman, permissões `instagram_business_*` e host `graph.instagram.com`.
