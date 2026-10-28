# TidePlace · CRM Vital Decor — Passo 1: controle de acesso

Status: **fundação aplicada ao Supabase**, sem permitir acesso de colaboradores.

## Estrutura
- `crm_organizations`: uma empresa/tenant, atualmente apenas Vital Decor. A seleção visual Gui/Vital permanece inalterada.
- `crm_organization_members`: um usuário Supabase Auth por funcionário e um papel: `owner`, `supervisor`, `agent`, `installer`.
- `crm_organization_sectors`: setores cadastrados, inicialmente Comercial Vital, Atacado, Pós-venda, VTX, Bluetti, Afiliados.
- `crm_organization_member_sectors`: permissões de cada usuário para os setores, vinculadas à mesma empresa via chaves estrangeiras compostas.
- `app/lib/crm-authorization.mjs`: regras explícitas de autorização por papel, status e setor; padrão negar acesso.
- `app/lib/vital-crm-access.mjs`: verifica identidade pelo Supabase Auth e consulta associações somente da Vital.
- `GET /api/crm/my-access`: responde apenas cargo, empresa e setores **do usuário autenticado**; `portalEnabled:false`.

## Regras de segurança
- O acesso administrador foi concedido apenas à conta já identificada como proprietária da conexão WhatsApp Vital e do estado administrativo do TidePlace.
- As novas tabelas têm RLS e leitura condicionada ao usuário autenticado. O navegador não tem permissão de escrita nelas.
- Atendentes e supervisores só podem consultar conversas de setores autorizados. Somente proprietários podem ver todos os setores; supervisores precisam de autorização explícita de setor.
- Instaladores não podem ler conversas comerciais, nem agendamentos neste passo. Uma futura estrutura de serviços/agendamentos deverá permitir acesso **somente aos atendimentos explicitamente atribuídos**.
- Assunto da conversa (`pos_venda`, `varejo`, etc.) NÃO é autorização. O acesso deriva da atribuição de setor registrada em `vital_whatsapp_assignments`.
- O WhatsApp mantém número único e integrações existentes; nenhum novo número ou token Meta é criado.
- **NÃO** habilitar convites, login de empregados ou nova área de funcionário antes de proteger todos os endpoints existentes que consultam e enviam mensagens. Muitos endpoints atuais foram escritos para a única administradora e alguns não verificam permissões por setor.
- Sempre filtrar no servidor por empresa, `connection_id`, conversa e setor, verificando autorização antes de retornar texto e dados pessoais.
- Não oferecer acesso direto à tabela `workspace_meta_messages` ou usar `service_role` no navegador.

## Próxima etapa (separada do passo 1)
1. Auditar endpoints legados e criar endpoints exclusivos para atendentes, com checagem de setor a cada leitura, resposta e transferência.
2. Criar login e portal restritos, sem renderizar as ferramentas administrativas nem executar sincronizações de dados de admin para funcionários.
3. Criar convites individuais, suspensão e gerenciamento de membros, somente por ações de administradora devidamente verificadas.
4. Testar por usuário com: próprio setor permitido; setor alheio negado; Gui negado; transferência indevida negada; conta suspensa negada.
5. Serviço de instalações: construir modelo `service_requests`/`appointments` vinculado ao pedido e ao prestador apenas quando o fluxo comercial estiver definido.

## Validações realizadas em 2026-10-28
- 1 empresa Vital, 1 proprietária ativa, 6 setores.
- Nenhum funcionário criado, nenhuma concessão de setor concedida.
- RLS ativo em todas as 4 tabelas; políticas de leitura individuais, 0 privilégios de escrita para `authenticated`.
- Simulação de usuário desconhecido (JWT autenticado fictício): 0 registros visíveis em cada tabela.
- Simulação do usuário proprietário atual: 1 organização, 1 associação de proprietário, 6 setores visíveis.
- Conselho de segurança Supabase: nenhum alerta nas quatro novas tabelas; há avisos legados em outras estruturas que devem ser auditados antes de liberar funcionários.
