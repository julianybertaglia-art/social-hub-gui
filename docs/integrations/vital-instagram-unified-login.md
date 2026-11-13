# Login Unificado do Instagram — Vital Decor

Este fluxo usa exclusivamente a configuração Meta de Instagram da Vital Decor, **sem escopos legados** e sem alterações no WhatsApp.

- App Meta: `1975149819862842`
- Instagram: `@vitaldecor_` (ID `17841439121395170`)
- Portfólio Meta: `1055955574784532`
- Instagram Unified Login `config_id`: `1510934544177267`
- OAuth redirect exato: `https://social-hub-gui.vercel.app/api/vital-connections/instagram/unified/callback`

## Passos necessários na Meta, uma única vez

1. Acessar **Meta for Developers → App 1975149819862842 → Casos de uso → Instagram → API setup with Unified login**.
2. Na configuração `1510934544177267`, **registrar como URL adicional** o OAuth redirect listado acima. **Não remover** a URL antiga `https://social-hub-gui.vercel.app/whatsapp`.
3. Conferir que o portfólio Vital Decor e `@vitaldecor_` estão selecionáveis e que a configuração permite `instagram_basic`, `instagram_manage_messages` e `instagram_manage_comments`. Os outros canais não devem ser alterados.
4. Depois da publicação aprovada, abrir `https://social-hub-gui.vercel.app/conexoes/vital-decor` e selecionar **Conectar/Reautorizar Instagram**. O usuário será levado à janela da Meta com `config_id`, sem `scope`.
5. Na Meta, escolher **Vital Decor** e **@vitaldecor_**, autorizar, retornar ao TidePlace. A conexão só é substituída se o token, negócio, perfil e assinaturas Meta tiverem sido confirmados.
6. Testar de outra conta própria: uma mensagem de Direct e um comentário contendo **MARMORE** em post da Vital Decor. Não usar contatos/clientes reais para testes.

## Segurança e operação

- O fluxo começa com sessão autenticada de proprietário, verifica Origin e usa sessão de uso único com validade de 8 minutos e cookie HttpOnly Secure SameSite=Lax.
- O backend recebe o código do OAuth e troca usando `META_APP_SECRET` **no servidor**. Nenhuma credencial é enviada ao navegador ou à URL final.
- O retorno rejeita negócios e contas diferentes da Vital, valida o token do aplicativo e confirma as assinaturas `messages` e `comments`.
- Em caso de falha, a conexão antiga da Vital e todas as conexões de WhatsApp são preservadas.
- A autorização usa o domínio de produção cadastrado na Meta; não iniciar OAuth em uma URL de preview.
- O PR não altera o banco em produção, não habilita funcionários e não realiza envio de mensagens durante o deploy. Os envios ocorrem somente após a autorização real e gatilhos legítimos.
- Caso a Meta retorne `account_not_shared`, verificar a seleção da conta no portfólio. Existem registros públicos de comportamentos inconsistentes no endpoint `/me/assigned_instagram_accounts` para algumas contas; não forçar a gravação se vier vazio.

## Publicação

Este documento não autoriza merge nem publicação automática. Revisar os testes e aprovar a publicação antes de alterar `main` ou o domínio oficial.
