# TidePlace · Fase 2: Portal restrito Vital Decor (prévia de segurança)

## Separação de acesso
- O login atual é mantido pelo Supabase Auth.
- `GET /api/auth/access-scope` verifica a identidade e decide, no servidor, se o usuário é **administrador**, **atendente/supervisor Vital** ou **sem acesso**.
- `CloudGate` aguarda o escopo verificado antes de iniciar sincronizações do painel administrativo.
- Somente administrador monta `HubFrame`, sistema de publicações e integrações.
- Atendente/supervisor recebe `StaffPortal`, sem menus administrativos e sem sincronização de estado local do admin.
- O prestador de serviços (**installer**) permanece sem acesso, até a fase futura de agendamentos individuais.

## Consultas da equipe
- `GET /api/crm/staff/conversations`: lista paginada apenas de conversas cujo setor esteja autorizado na tabela `crm_organization_member_sectors`.
- `GET /api/crm/staff/conversations?contact=...`: verifica a **atribuição atual** antes de buscar as mensagens. Trocar setor revoga o acesso na leitura seguinte.
- A consulta utiliza sempre a conexão WhatsApp Vital de propriedade da organização; não consulta a conta do Gui.
- Resposta não devolve `raw_payload`, credenciais da Meta, dados da empresa, nem registros de outros setores.
- Envio, transferência e convites permanecem desligados na UI da equipe.

## Estado
- Código em ramificação separada: **não publicado em produção**.
- Zero funcionários criados ou convidados.
- Não libera APIs de terceiros, Meta, Argo, nem comandos de administração para operadores.
- A prévia Vercel pode não ter as variáveis privadas do Supabase. Não habilitar funcionários sem completar a validação em ambiente autenticado.

## Próximos testes obrigatórios antes do primeiro convite
1. Testar usuário real descartável em uma conta específica da Vital e um setor de exemplo.
2. Consultar o setor permitido e negar setor diferente, número direto e acesso ao Gui.
3. Tentar abrir rotas antigas da administração e chamadas diretas às APIs legadas.
4. Verificar suspensão imediata e revogação de permissões durante a sessão.
5. Implementar envio seguro pelo endpoint restrito do CRM, validando janela de atendimento da Meta.
6. Criar área de convites/suspensão somente para proprietária.
7. Integrar as telas visuais do CRM da PR #51 após aprovação; esta fase é separada da atualização visual.

**Acesso externo permanece não liberado até a conclusão dos testes acima.**
