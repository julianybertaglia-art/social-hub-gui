# Central de marketing da Vital Decor

## Referências da auditoria

- [HubSpot: análise de campanhas e recomendações](https://knowledge.hubspot.com/campaigns/analyze-campaign-performance): reunir indicadores e próximos passos por campanha.
- [HubSpot: relatórios de marketing](https://knowledge.hubspot.com/reports/use-marketing-reports-in-the-marketing-analytics-suite): comparar canais, tráfego e informações de contatos, com filtros e períodos claros.
- [Google Analytics: jornada de checkout](https://support.google.com/analytics/answer/14000977): um funil real acompanha usuários por etapas; a contagem agregada de eventos, isoladamente, não mede abandono de uma coorte.
- [Google Analytics: dimensões e métricas](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema): os indicadores de produtos são quantidades em eventos, não pessoas nem pedidos confirmados.
- [Microsoft Clarity: exportação de dados](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api): janela de 1 a 3 dias e limite de requisições. Os sinais servem para investigar interações; gravações e mapas de calor permanecem no Clarity.
- [Klaviyo: dados de segmentos e consentimento](https://help.klaviyo.com/hc/en-us/articles/57803734295963): segmentação deve considerar consentimento e supressões, além de eventos e compras.

## Implementação

O painel mostra prioridades com evidência e limitação, detalhes das campanhas, páginas de entrada, produtos do GA4 e sinais agregados de interação. Também permite marcar ações concluídas no navegador, baixar CSV, imprimir ou salvar PDF e pedir análise ao Gemini com métricas agregadas e rótulos limitados de produtos e campanhas.

As conversas recentes vêm da rota existente do CRM, que continua restrita à administradora. A seleção abre apenas a conversa já autorizada; nenhuma mensagem é enviada. O estado das ações é local ao navegador e não sincroniza entre dispositivos.

O redator de e-mail abre um rascunho sem destinatários no Gmail ou no aplicativo padrão. **Não há conta de envio conectada ao Tide, automação, lista de assinantes ou disparo em massa.** Uma conexão real exige escolher e autorizar um provedor de envio e implementar consentimento, cancelamento de inscrição, supressão e medição antes de usar campanhas.

Cada fonte informa seu período. A ausência de um evento não é convertida em zero, e pedidos gerais não são atribuídos automaticamente a campanhas. Os rótulos externos são tratados como dados; contatos e mensagens não são enviados ao modelo de IA.
