# Pré-liberação segura — Tide CRM Vital + MIA Gemini

## Evidência automatizada — banco isolado (03/11/2026)

- **Aprovado:** [GitHub Actions: Postgres 17 descartável (mesma versão major do Supabase oficial)](https://github.com/julianybertaglia-art/social-hub-gui/actions/runs/41666344939). Não usou Supabase de produção, dados reais, chaves ou Vercel.
- Aplica migrations legadas de Meta, Vivi/Argo e CRM, a migration nova, e valida 9 filas, privilégios RLS, isolamento de organização, supervisor, limite da MIA, privacidade por usuário, leases simultâneos, transferências e auditoria.
- **Limitação do teste:** o schema de CI é um subconjunto representativo do Supabase real, com `auth.users` e `auth.uid()` simulados. Não substitui a validação integral num ambiente separado antes de aplicar na produção.
- **Aprovado:** os testes Node e a compilação do Next.js na mesma versão da PR (workflow [Verificar aplicativo](https://github.com/julianybertaglia-art/social-hub-gui/actions/runs/41666344750)).
- **Pendente:** teste autenticado de ponta a ponta com a chave Gemini real e persistência num Supabase de homologação. Não ativar no banco produtivo apenas porque os testes acima passaram.

## Estado verificado (03/11/2026)
- Após sincronização da PR: `codex/vital-crm-mia-phase1` está 0 commits atrás da `main`.
- Testes Postgres 17 e `Verificar aplicativo` concluídos com sucesso na execução da branch. Não equivalem a teste em Supabase Auth real.
- Supabase de homologação hospedado ainda não criado: plataforma solicita aceite de US$ 0,01344 por hora (sujeito à aprovação do usuário).
- PR de rascunho #74. **Não publicar nem mesclar** até validação real.
- O banco de produção `yjcrjoehpexddzqzafmc` tem as nove filas e as estruturas prévias do CRM; **não tem** `crm_vital_mia_threads`, `crm_vital_mia_messages`, `crm_vital_mia_request_log`, `crm_vital_conversation_notes`, `crm_vital_reply_locks` ou as RPCs de MIA.
- Os dados reais da Vital/WhatsApp continuam em uso. A chave `GEMINI_API_KEY` consta no projeto Vercel, mas o acesso real ao Gemini ainda não foi testado com conta autenticada.
- A migration SQL desta PR foi renomeada para `20261103150000_vital_crm_notes_reply_mia_security.sql`, **depois** da última migração registrada no banco (`20261103132945_consultoria_optional_answers`).
- Alterações de `can_transfer` para supervisor foram limitadas à organização `vital-decor`, evitando modificar outras organizações.
- Histórico passado e respostas do Gemini passam por `redactMiaPii` antes de sair para o provedor ou serem gravados/devolvidos.

## Checklist de implantação sem risco para a operação
1. Mantenha a PR como **draft**. Preserve `VITAL_CRM_STAFF_ENABLED` e quaisquer flags de escrita não aprovadas no estado atual.
2. Teste a migration em **Supabase local** ou em **branch de desenvolvimento**; uma branch hospedada pode gerar custo, exigindo consentimento prévio. **Não rode a migration diretamente na produção durante a revisão.**
3. Registre as contagens de filas, atendimentos, usuários, RLS e grants **antes** do teste. Faça backup e avalie rollback com cuidado: funções substituídas via `CREATE OR REPLACE` dependem de versões anteriores.
4. Em banco de teste, aplique a migration versionada. Confira tabela por tabela as novas colunas, índices, constraints, RLS, `anon`/ `authenticated` sem privilégios nas notas/MIA/locks, `service_role` com os privilégios exigidos e RPCs somente `service_role`.
5. Execute testes de concorrência para `crm_vital_claim_reply_atomic`, `crm_vital_release_reply_atomic`, `crm_vital_transfer_atomic` e `crm_vital_set_status_atomic`. Confirme que supervisor não altera status, agentes só atuam em filas concedidas e nenhum usuário vê histórico privado de outro.
6. Em prévia isolada com variáveis de ambiente do banco **de teste** (nunca credenciais de produção copiadas para um preview público), autentique a proprietária e um usuário-piloto. Envie uma **pergunta sem dados reais de clientes** para a MIA e confirme resposta, histórico próprio, isolamento entre usuários, limite de 20/h, erros de chave/modelo e estados de carregamento.
7. Teste um cenário de erro de Gemini e de banco: nenhuma resposta deve ser exibida como salva quando não persistida. Verifique o fluxo de sugestão: apenas preencher campo de resposta, jamais enviar WhatsApp automaticamente.
8. Somente após revisão de privacidade/LGPD e autorização explícita para alteração de banco de produção: aplicar a migration versionada numa janela controlada; validar RPCs/grants; realizar **um único deploy de prévia**; conferir acesso antes de liberar a equipe ou publicar a `main`.
9. Em produção, qualquer falha de histórico deve suspender a ativação da MIA; não remover políticas RLS para “fazer funcionar”. Não enviar mensagens reais ou ativar funcionários para testes sem aprovação.

## Pontos ainda pendentes
- **Sem teste real do Gemini**: a existência de `GEMINI_API_KEY` na Vercel não prova modelo autorizado, quota ou cobrança configurada.
- **Smoke test da migration aprovado num Postgres descartável (GitHub Actions)**; ainda falta homologar no Supabase completo, pois o schema de CI é representativo e não uma cópia integral.
- **Sem teste de perfis autenticados reais**: Andrey, Vitor e Guilherme permanecem sem acesso ativo.
- **Privacidade**: nomes, telefones e e-mails são mascarados por melhores esforços, não um processo infalível; só compartilhar dados de clientes com Gemini após avaliação da base legal, minimização e regras internas.
- **Prévia**: automática está desativada para economizar Vercel. Um único deploy manual deverá usar a branch revisada depois que o ambiente de teste estiver seguro.

## Evidências de consulta
- `supabase.list_migrations` mostra último registro `20261103132945`.
- `information_schema.columns` não retorna tabelas `crm_vital_mia_*` no banco conectado.
- `pg_policies` e `pg_proc` confirmaram RLS atual e RPCs anteriores.
- `supabase.get_advisors` apresenta avisos preexistentes de tabelas com RLS sem políticas; isso não equivale, por si só, a exposição pública.
