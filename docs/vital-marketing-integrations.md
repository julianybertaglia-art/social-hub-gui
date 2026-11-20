# Marketing da Vital: integrações de leitura

Esta versão reaproveita o painel de GA4/Clarity das PRs #103 e #110 sobre o commit de produção `5d9902c`, confirmado na Vercel em 17/11. Os arquivos antigos de atendimento e da Vivi não foram transplantados. Ela **ainda não conecta contas nem ativa a coleta**. Antes de publicar, confirmar novamente o commit e testar sessões e fontes, sem sobrescrever atualizações posteriores.

## O que já está implementado

- Área **CRM Vital Decor → Marketing e anúncios**, mantendo o controle de acesso da loja: somente a proprietária e Guilherme individualmente autorizado, com sessão e vínculo válidos.
- **Meta Ads:** consulta somente leitura de investimento, impressões e cliques no link. Os totais vêm da conta e a tabela lista até 25 campanhas com atividade; se a Meta indicar mais páginas, a interface informa a limitação. O total pode incluir campanhas que não levam ao site. Um campo ausente aparece como indisponível, não zero. A coleta por campanha pode falhar independentemente do total da conta.
- **GA4:** totais dos 30 dias completos anteriores, até dez combinações de origem/mídia e campanha ordenadas por sessões e os eventos de visualização de produto, adição ao carrinho, início de checkout e compra que o GA4 retornar. São contagens de disparos, não pessoas únicas nem uma taxa de conversão de funil; eventos ausentes não são tratados como zero. Se as consultas de origens ou eventos falharem, o total continua disponível. A moeda vem do relatório e receita líquida pode ser negativa em caso de reembolso.
- **Clarity:** tráfego e dispositivos nas últimas 72 horas. Mapas de calor e gravações permanecem no Clarity; não há identificação automática de clientes.
- **GTM:** consulta exclusivamente a identificação e a versão de contêiner publicada na API do Tag Manager. Não retorna código de tags e não cria, edita nem publica nada. Uma versão publicada não prova que uma tag disparou na loja.
- **Nuvemshop:** pedidos continuam na área própria do CRM da loja. Não foi implementado cruzamento individual com anúncios. Não foram implementadas automações de mensagens, CAPI, CAC nem ROAS por campanha.

## Conectar com credenciais somente de servidor

A flag `VITAL_INSIGHTS_ENABLED` permanece desligada por padrão: o painel mostra fontes aguardando configuração e nenhuma API externa é chamada. Não salvar tokens ou chaves em Git, variáveis `NEXT_PUBLIC_*`, URLs, logs ou mensagens. Identificadores e credenciais deverão ser confirmados pelos administradores das contas corretas da Vital; nenhum deles foi validado nesta implementação.

### Meta Ads

1. Um administrador da conta de anúncios precisa fornecer ao aplicativo/usuário de serviço autorizado a permissão de leitura `ads_read` e o acesso à conta correta da Vital. A validade e as permissões do token dependem da configuração da Meta.
2. Configurar `VITAL_META_AD_ACCOUNT_ID` como ID numérico (com ou sem prefixo `act_`) e `VITAL_META_ADS_READ_TOKEN` como segredo no servidor. O padrão de API é `v26.0`; `VITAL_META_GRAPH_VERSION` pode ajustar a versão após validação de compatibilidade.
3. Com a flag habilitada apenas em um ambiente de validação seguro, comparar o período exibido, moeda, investimento e cliques com o Gerenciador de Anúncios na mesma conta e período. A conta pode conter campanhas além do site.

#### Alternativa: Windsor.ai

Quando a conexão direta não estiver disponível, a proprietária pode autorizar a conta oficial da Vital Decor no Windsor.ai. O conector pode solicitar permissões amplas na Meta; confira a tela de autorização e limite a conexão à conta desejada. No servidor, defina `VITAL_META_PROVIDER=windsor` e `VITAL_META_AD_ACCOUNT_ID` com o ID da conta, e configure `VITAL_WINDSOR_API_KEY` como Secret de produção. Se não existir uma chave dedicada, o servidor usa a `WINDSOR_API_KEY` já existente. O painel usa apenas consultas GET à API da Windsor e verifica se todas as linhas retornadas pertencem à conta configurada.

A Windsor exige a chave na URL da chamada de servidor. Não registre URLs, erros ou respostas completas dessa chamada em logs, e bloqueie redirecionamentos. A chave nunca deve ir ao navegador ou ao repositório. O período usado é `last_30d`, sem o dia atual; os totais e a lista são consultas independentes. Dados ausentes não viram zero. A lista mostra no máximo 25 campanhas e informa se há mais. Compare os números e o período no Gerenciador de Anúncios antes de liberar; a fonte pode usar cache e ser atualizada com atraso. Sem a autorização, a chave correta e uma chamada real validada, esta alternativa não deve ser apresentada como conectada.

### GA4

Siga `docs/vital-analytics-runbook.md`: habilitar a Google Analytics Data API, conceder acesso de leitura à conta de serviço na propriedade correta e guardar `VITAL_GA4_PROPERTY_ID`, `VITAL_GA4_SERVICE_EMAIL` e `VITAL_GA4_PRIVATE_KEY` exclusivamente no servidor. Verificar a moeda e os eventos de compra. Os dados do GA4 podem divergir dos pedidos realmente pagos e das métricas da Meta.

### GTM

1. Habilitar a Tag Manager API no projeto Google Cloud e conceder acesso de leitura à mesma conta de serviço no contêiner correto do GTM. O código usa escopo `tagmanager.readonly`.
2. Configurar `VITAL_GTM_ACCOUNT_ID` e `VITAL_GTM_CONTAINER_ID`: são os IDs **numéricos da API**, não o ID público `GTM-XXXXXXX`. A conta de serviço usa `VITAL_GA4_SERVICE_EMAIL` e `VITAL_GA4_PRIVATE_KEY`.
3. Comparar a versão exibida com a publicada no GTM. Validar o disparo das tags separadamente com ferramentas de diagnóstico; uma resposta positiva da API não prova a instalação ou o disparo no site.

### Clarity

Seguir o runbook existente para `VITAL_CLARITY_EXPORT_TOKEN`, selecionando o projeto correto. A API tem limite reduzido de consultas por dia; o cache atual é por instância e pelo mecanismo de cache do Next. Instâncias e regiões diferentes podem ultrapassar esse limite: antes de uso intenso, adicionar cache compartilhado com controle transacional. As gravações e mapas de calor não estão embutidos no painel.

## Validação antes de ligar

1. Confirmar o deployment de produção, base de código e banco corretos. Conciliar alterações posteriores sem reverter Vivi, atendimento ou loja.
2. Executar `npm test` e `npm run build`, além de testar a interface desktop e celular com fontes simuladas.
3. Com a flag desativada, nenhum provedor deve ser consultado. Sem sessão ou com usuários não autorizados, nenhuma métrica ou segredo deve ser revelado.
4. Em ambiente seguro, ativar a flag e testar separadamente cada fonte com credenciais de leitura e o projeto correto. Comparar as métricas nas respectivas plataformas; validar datas, fusos e moeda.
5. Testar sessões reais individuais da proprietária e de Guilherme e bloqueio dos demais. A conexão com Meta/GA4/Clarity/GTM é independente da conexão Nuvemshop.
6. Antes de associar clientes ou calcular CAC/ROAS por campanha, definir captura de origem e IDs, deduplicação, critérios de atribuição, consentimento, eventos corretos e reconciliação com pedidos pagos; não inferir identidade individual a partir de sessões agregadas.

## Documentação oficial

- Meta Marketing API Insights e permissão: https://developers.facebook.com/docs/marketing-api/insights/
- GA4 API (dimensões e métricas): https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- GTM versão publicada: https://developers.google.com/tag-platform/tag-manager/api/reference/rest/v2/accounts.containers.versions/live
- Clarity export: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
