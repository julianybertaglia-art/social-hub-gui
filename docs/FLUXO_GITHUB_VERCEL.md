# TidePlace — desenvolvimento no GitHub, publicação manual na Vercel

## Regra de publicação
- Alterações no GitHub (incluindo `main` e branches de PR) **não devem iniciar deploy automático na Vercel**. O arquivo raiz `vercel.json` contém `git.deploymentEnabled: false`.
- As prévias automáticas também foram desabilitadas no projeto Vercel `social-hub-gui` para economizar cotas. Isso não muda o site atualmente publicado.
- O workflow `.github/workflows/build.yml` roda testes e compilação no GitHub Actions para PRs de **qualquer branch** e pushes na `main`. Ele **não faz deploy**.
- Branches e PRs ainda podem conter alterações experimentais. Uma PR em rascunho não autoriza merge ou publicação.

## Desenvolvimento
1. Criar uma branch para cada mudança ou usar a branch de uma PR em andamento.
2. Fazer commits pequenos; usar PR para revisão.
3. Conferir sucesso do workflow `Verificar aplicativo`, incluindo `npm test` e `npm run build`.
4. Para PRs que dependem umas das outras (por exemplo, CRM Vital #58 -> #59 -> #62), respeitar a ordem de integração, revisar conflitos e testar novamente na `main`.

## Publicação intencional (somente após autorização)
1. Confirmar quais PRs estão validadas e autorizadas para entrar em `main`; nunca juntar CRM sensível apenas para forçar publicação.
2. Registrar o SHA exato do commit aprovado e validar no GitHub Actions.
3. Acessar o projeto certo no painel da Vercel e criar manualmente um deploy a partir do Git ref aprovado (Deployments > Create Deployment). Conferir alvo *production*, ambiente e variáveis, sem publicar uma PR experimental.
4. Checar funcionamento e logs depois da publicação. Se necessário, fazer rollback para a última versão estável.
5. **Não reativar** deployments Git automáticos sem pedido explícito.

## Cuidados com CRM e canais
- O CRM Vital em rascunho #62 está atrás de `VITAL_CRM_STAFF_ENABLED` e depende de #58 e #59; não liberar funcionários sem testes de perfis, rotas, escrita e permissões.
- Os fluxos de Meta, WhatsApp, Supabase, Argo e publicação de vídeos precisam ser verificados com as credenciais e aprovações corretas antes de ativar em produção.
- Nunca copiar segredos de produção para previews públicos nem incluir tokens em commits.

## Referência
- Vercel Git Configuration: https://vercel.com/docs/project-configuration/git-configuration
- Criar deployment manual: https://vercel.com/docs/git
