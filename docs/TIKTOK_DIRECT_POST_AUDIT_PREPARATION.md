# Preparação da auditoria do TikTok Direct Post

**Estado em 28 de outubro de 2026:** o fluxo Direct Post está sendo implementado no TidePlace. A auditoria ainda não foi enviada e o produto ainda não atende ao critério de público amplo descrito pelo TikTok.

## O que o código prepara

- OAuth solicita `video.publish` junto com `video.upload` e mantém o envio para rascunhos.
- O publicador consulta `creator_info/query` ao abrir as opções do TikTok e consulta novamente antes de enviar.
- A pessoa vê a conta conectada, escolhe uma opção de privacidade, controla comentários, Duet e Stitch, informa divulgação comercial e confirma a declaração de uso de música.
- O vídeo é enviado pelo endpoint Direct Post e o TidePlace consulta o endpoint de status.
- Antes da auditoria, o TidePlace limita o Direct Post a contas privadas e à opção `SELF_ONLY`. O limite indicado pelo TikTok é de até cinco pessoas em 24 horas para um cliente não auditado.
- `TIKTOK_DIRECT_POST_AUDITED` permanece `false` (ou ausente) até a aprovação formal do TikTok. Depois da aprovação, configure `true` na Vercel e faça novo deploy para liberar as opções que o TikTok devolver.

## Bloqueio atual de elegibilidade

O publicador está limitado ao workspace **Gui Nonato** e à conta administrada por essa equipe. As diretrizes do TikTok dizem que o Direct Post deve servir criadores autênticos e um público amplo; uma ferramenta destinada apenas às contas administradas pela pessoa desenvolvedora ou pela equipe não é aceita. Portanto, não envie a auditoria enquanto o produto continuar restrito a esse workspace.

Antes de pedir análise, o TidePlace precisa oferecer um caminho real de uso para criadores independentes, com acesso e conexão de suas próprias contas TikTok, termos e política de privacidade acessíveis, e uso real por pessoas fora da equipe. Os números de usuários e publicações enviados no formulário devem refletir atividade verificável; não estimar dados que ainda não existem.

## Restrições encontradas no código atual

O suporte a criadores independentes exige uma etapa de produto e segurança antes de liberar cadastro público:

- A tela de acesso hoje só oferece login por senha; não há cadastro ou onboarding para criadores.
- O seletor de workspaces e o publicador assumem `gui-nonato`.
- As migrações de publicações, conexões TikTok e conexões YouTube têm `workspace_id` limitado por constraint ao valor `gui-nonato`.
- O Instagram usa credenciais de servidor e valida o perfil `@gui_nonato`; não há OAuth de Instagram por criador.
- A moldura principal ainda mostra áreas internas do Gui/Vital. A sincronização do painel também consulta métricas globais do Instagram do Gui para toda sessão autenticada.

Por isso, não basta remover a constraint de workspace nem ativar cadastro. O novo fluxo precisa separar papéis e telas, bloquear APIs e métricas internas para contas de criador e guardar cada conexão sob o usuário que a autorizou. Só depois desse isolamento é seguro convidar criadores externos.

## Próxima sequência recomendada

1. Definir uma área de criador separada da operação interna e uma regra explícita de papel para usuários existentes e novos.
2. Criar onboarding com termos/privacidade, confirmação de conta e conexão/revogação da própria conta TikTok.
3. Tornar publicações e tokens de cada criador isolados por `owner_user_id`; manter as conexões atuais do Gui sem migração destrutiva.
4. Adicionar OAuth por criador para YouTube e Instagram antes de prometer publicação multicanal para contas externas.
5. Liberar beta para criadores independentes, registrar atividade real e então preparar a demonstração e o pedido de auditoria.

Essa ampliação é necessária para a elegibilidade, mas não pode ser substituída por contas de teste, números estimados ou uma simples configuração de ambiente.

## Preparação técnica e de produto

- [ ] No portal TikTok for Developers, habilitar a configuração Direct Post e pedir aprovação do escopo `video.publish` para o aplicativo correto.
- [ ] Confirmar `video.publish` concedido no Sandbox e em Production; `video.upload` deve continuar disponível para rascunhos.
- [ ] Testar com uma conta privada de Sandbox e confirmar que só `Somente eu` aparece antes da auditoria.
- [ ] Testar as opções de comentários, Duet, Stitch, divulgação comercial e bloqueio de conteúdo de marca com visibilidade privada.
- [ ] Demonstrar o preview, a escolha manual de privacidade, o consentimento explícito, o envio e a consulta automática de status.
- [ ] Confirmar que o arquivo enviado não recebe logotipo, marca d'água, texto promocional ou hashtags adicionadas pelo TidePlace.
- [ ] Abrir o fluxo para criadores independentes antes da auditoria e demonstrar esse uso real, sem se limitar à conta Gui Nonato.
- [ ] Preencher usuários ativos, criadores ativos e volume diário com dados reais. O TikTok define um limite de criadores por 24 horas com base na estimativa fornecida e também aplica limites de publicação por conta.
- [ ] Gravar uma demonstração do produto em uso real por um criador, cobrindo a autorização, tela de publicação, escolhas do criador e resultado/status.
- [ ] Enviar a auditoria pelo portal do TikTok e guardar o resultado da aprovação.
- [ ] Somente depois da aprovação, definir `TIKTOK_DIRECT_POST_AUDITED=true` nas variáveis Production da Vercel e fazer deploy.

## Informações públicas do TidePlace

- Aplicativo: `https://social-hub-gui.vercel.app`
- Redirect URI: `https://social-hub-gui.vercel.app/api/tiktok/callback`
- Termos: `https://social-hub-gui.vercel.app/tideplace/termos`
- Privacidade: `https://social-hub-gui.vercel.app/tideplace/privacidade`
- Portal de desenvolvedores: <https://developers.tiktok.com/portal/apps>

## Referências oficiais

- [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- [Direct Post API](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
- [Query Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
