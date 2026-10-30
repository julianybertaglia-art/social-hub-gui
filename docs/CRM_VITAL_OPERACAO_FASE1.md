# CRM Vital Decor — primeira liberação com dados reais

## Já preparado
Dashboard de nove filas, histórico e filtros de mensagens reais do WhatsApp.
Somente a proprietária da Vital pode entrar no CRM nesta fase.
Equipe apenas para consulta: três convites permanecem rascunhos e nenhum funcionário foi ativado.

## Bloqueios intencionais
O envio, a transferência de conversa, a conclusão do atendimento e a edição da equipe permanecem bloqueados quando VITAL_CRM_WRITES_ENABLED não é true. Não ativar essa configuração antes de testar a convivência com Vivi/Argo. A API de leitura do CRM só aceita owner nesta fase, independentemente da configuração de staff.

## Banco de dados
Em 30/10/2026, confirmamos nove filas, uma conexão WhatsApp conectada, 813 mensagens armazenadas, três convites em rascunho e zero atendentes ativos.
A conta service_role não tinha SELECT nas tabelas privadas do CRM; esse bloqueio foi corrigido por GRANT SELECT em crm_organizations, crm_organization_members, crm_organization_member_sectors, crm_vital_queues, crm_vital_member_queues, crm_vital_queue_assignments, crm_vital_conversation_states, crm_vital_invite_drafts e crm_vital_invite_draft_queues.
Reverificamos SELECT verdadeiro para service_role em todas elas, RLS habilitado e nenhum SELECT para anon.
Nenhuma mensagem ou permissão de usuário foi modificada.

## O que ainda depende de testes reais
Envio dentro da janela de 24h da Meta; handoff da Vivi; consistência de atribuições e transferências com Argo; autenticação de funcionários por setor; teste dos canais de Instagram; sincronização com pedidos da Nuvemshop.

## Lançamento
Testar e compilar no GitHub Actions, depois publicar manualmente somente o commit aprovado do TidePlace. Preserve o site existente e não publique o protótipo fictício como CRM.
