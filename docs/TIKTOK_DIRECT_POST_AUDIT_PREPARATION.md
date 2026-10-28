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
