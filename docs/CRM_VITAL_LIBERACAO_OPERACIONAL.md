# Vital Decor CRM — operacionalização e liberação

Estado em 2026-10-28: **implementado em branch, banco atualizado, equipe DESLIGADA; não publicar sem QA.**

## Integração com a operação existente
- Uma única conexão WhatsApp Vital para todas as filas; a Vivi original permanece ativa.
- `VITAL_QUEUE_ORDER` em `app/lib/vital-crm-queues.mjs` define as nove filas.
- Seleções vistas de verdade nas sessões da Vivi: `Produtos Vital Decor`, `Revenda`, `Pós-venda · Mercado Livre`. Outras seleções previstas no mapeamento só serão automáticas depois que a Vivi as oferecer e persistir em `selection`.
- A fila `pos_venda` original não indica marketplace. Não atribua para Andrey ou Vitor por aproximação; deixar pendente para Juliany.
- Transferências `/api/crm/vital/live` alteram **a fila interna**, não sobrescrevem a atribuição do Argo. A API de resposta bloqueia atendimento TidePlace se houver agente Argo responsável ativo para não gerar duplicidade.
- Fluxo de publicação esperado: `/crm/vital` para a administradora; atendentes recebem o portal restrito somente após ativação de flag.

## Controles já implementados
- Separação por organização, membro ativo e lista de filas. Funcionários nunca montam a interface administrativa do TidePlace.
- Login administrativo depende da propriedade de `crm_organizations` e associação `owner`, nunca de `content_items`.
- APIs protegidas pelo resolver `getVitalCrmMember`; `VITAL_CRM_STAFF_ENABLED !== 'true'` = **nenhum funcionário acessa APIs**, mesmo com membership existente.
- Transferência por `crm_vital_transfer_atomic`: confirma permissão, bloqueia concorrência, altera fila e grava auditoria na **mesma transação**.
- Conclusão por `crm_vital_set_status_atomic`: confirma origem e permissão e grava estado/auditoria atômicos; nova mensagem posterior reabre logicamente o atendimento.
- Envio de texto pela Meta verifica fila, membro, janela de 24h, conexão Vital e agente Argo. Ao responder, ativa handoff manual da Vivi.
- Convites individuais em **rascunho**: Andrey (2 filas), Vitor (4), Guilherme (9 supervisor). A interface `/crm/vital/equipe` permite editar filas propostas, mas **não envia e-mails nem ativa logins**.
- Futuro instalador não pode acessar conversas.

## Testes de banco executados (transações revertidas)
1. Simulação autenticada com apenas Pós-venda Shopee: visibilidade da fila própria = 1, outra fila = 0, rascunhos privados.
2. Transferência fictícia de proprietária: 1 atribuição e 1 auditoria; após ROLLBACK ambos = 0.
3. Status concluído fictício: 1 estado e 1 auditoria; após ROLLBACK ambos = 0.
4. Função de transferência: EXECUTE para `service_role` = sim; para `authenticated` e `anon` = não.
5. Ainda 0 membros ativos fora proprietária, 0 permissões reais concedidas, 0 conversas reais transferidas.

## Bloqueio externo verificado
- Vercel responde `402 api-deployments-free-per-day` devido a mais de 100 builds no plano atual; ação manual de criação de preview também rejeitada.
- Ambientes preview não possuem `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY`. **Não copiar os segredos de produção para um preview compartilhável.**
- Workflow GitHub Action incluído; nenhum resultado de build de Next validado até agora.

## Checklist para a liberação (obrigatório)
1. Aguardar limite Vercel liberar. Compilar Next 16 e executar `npm test`/`npm run build`, corrigir quaisquer erros.
2. Validar rotas `/api/auth/access-scope`, `/api/crm/vital/live`, `/api/crm/vital/reply`, `/api/crm/vital/status`, `/api/crm/vital/team` com credenciais adequadas (nunca vazar service-role).
3. QA negativa: usuário sem associação, usuário suspenso, usuário da outra organização, setor alheio, contato passado manualmente, setor alterado no meio da sessão, tentar obter Gui via APIs antigas.
4. QA funcional: Vivi → identificação de fila → abrir histórico → resposta de teste na janela Meta → handoff Vivi → transferir fila → verificar que origem perde acesso → destino recebe; marcar concluído → nova mensagem reabre.
5. Verificar Argo antes de alterar responsabilidades externas. Atribuição do Argo não é o mesmo que fila CRM.
6. Confirmar que a UI administrativa está usando Vital Decor e que nenhuma tela de Gui pode ser aberta por equipe.
7. Somente após revisão, criar convites reais e filiações, conceder filas e ligar `VITAL_CRM_STAFF_ENABLED=true` **com autorização da proprietária**. Não ativar automaticamente.

Não usar um deploy antigo da Vercel como prova de que o novo CRM compilou. Não fazer merge em produção sem checklist.
