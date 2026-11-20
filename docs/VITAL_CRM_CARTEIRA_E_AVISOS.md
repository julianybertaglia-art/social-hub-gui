# Vital Decor · Carteira de leads e avisos de pedido

## Escopo da primeira entrega
- CRM mantém "Aguardando resposta", "Em andamento" e "Concluídas"; adiciona **Link enviado · sem retorno** como segmento sobreposto. Só conta quando a **última** mensagem da conversa é a resposta automática da Vivi, contém o link oficial da loja e está na fila de varejo. Não significa abertura de link nem compra.
- Ficha individual no atendimento: consulta **somente leitura** de pedidos da Nuvemshop dos últimos 365 dias e checkouts abandonados disponíveis dos últimos 30 dias; associa exclusivamente por telefone normalizado igual (não compara nomes nem endereço de entrega). Resultados incompletos ou indisponíveis são indicados.
- Recomendações iniciais são **baseadas em regras transparentes**, e não análises de IA generativa. Elas priorizam pós-venda quando há pedido e nunca indicam recuperação se existe pedido pago.
- Botão **Preparar atualização do pedido** copia um texto personalizado de status confirmado no campo de resposta. O usuário precisa revisar e enviar, e as mesmas restrições do chat valem: acesso, Argo e janela de 24h.
- O endpoint é exclusivo da proprietária autorizada do CRM Vital, não expõe documentos pessoais, endereços, token da loja nem pedidos de terceiros, e não faz writes.

## Principais referências
- Nuvemshop Admin API 2025-03 — orders: https://nuvemshop.dev/docs-api/resources/2025-03/order
- Nuvemshop — abandoned-checkout: https://nuvemshop.dev/en-US/api/resources/2025-03/abandoned-checkout
- Nuvemshop — webhook: https://nuvemshop.dev/api/resources/2025-03/webhook
- HubSpot — perfil CRM e histórico: https://knowledge.hubspot.com/properties/hubspots-default-contact-properties
- Klaviyo — perfil, atividades e jornada: https://help.klaviyo.com/hc/en-us/articles/115005247088
- Klaviyo — recuperação de checkout (confira compra antes de cada etapa): https://help.klaviyo.com/hc/en-us/articles/115002779411
- WhatsApp Business Policy: https://whatsappbusiness.com/policy/

## Futuro: histórico 360 e IA
1. Criar tabela de eventos CRM com origem, ID externo, carimbo de data e versionamento, sem copiar desnecessariamente dados sensíveis. Unificar mensagens, pedidos, checkouts, devoluções, tickets e alterações de envio.
2. Antes da análise por IA, mapear consentimento para contato, compras e marketing separadamente, e preferências/recusas. Notificar apenas clientes vinculados de forma confiável.
3. Scoring interpretável: etapa, intenção em mensagem, data da última interação, status da compra e risco de atendimento pendente. Treinar a IA para retornar hipótese + evidência + ação recomendada + quando + confiança, nunca "compra confirmada" sem evidência.
4. Permitir aprovar mensagem, dispensar, agendar (após autorização) e conferir histórico por contato. Não enviar oferta sem autorização/consentimento.

## Futuro: notificações WhatsApp de pedidos
Estado atual: **NÃO ATIVADO**, nenhuma nova mensagem automática foi criada.

Eventos propostos (após configuração e testes reais com números autorizados):
- order/paid -> pagamento confirmado, mas apenas se GET do pedido indicar payment_status=paid.
- order/packed ou order/in_preparation -> preparação do pedido, somente com status compatível.
- order/fulfilled ou fulfillment_order/tracking_event_created -> pedido enviado + rastreio, após confirmar a remessa real (preferir Fulfillment Orders para multi-volume).
- entrega confirmada -> aviso opcional de conclusão, sem declaração antecipada.
- cancelamento -> aviso de status verificado, sem inserir informações promocionais.

Segurança: validar assinatura/origem webhook, ID da loja, status de pedido consultando fonte oficial e telefone do comprador; deduplicar `store:order:event:version`, guardar resultado e ID Meta; não disparar se autorização, consentimento ou mapeamento estiver ausente; evitar envio duplicado pelas notificações nativas da Nuvemshop; respeitar janelas/Modelos Utility aprovados quando aplicável; avaliar habilitação oficial Meta Direct Send antes de desenhar fallback. Prever custos antes de habilitar.

**A implementação automática depende de verificação das assinaturas de webhook, modelos aprovados ou outro mecanismo Meta elegível, testes com número próprio e validação de custos.** Não iniciar envios aos clientes nesta PR.
