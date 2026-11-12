# Painel de marketing Vital Decor — ativação controlada

Branch de proposta: codex/vital-analytics-panel-20261112 (base: codex/crm-chat-live-20261111).
**Não publicar antes de conferir o deployment de produção e testar com sessão real.**

## Escopo
- Aba "Tráfego e comportamento" dentro de Loja Vital Decor.
- API somente leitura \`GET /api/crm/vital/insights\`, com a mesma checagem de organização e pessoa permitida da Nuvemshop: proprietária e usuário de Guilherme explicitamente configurado.
- GA4: últimos 30 dias completos: sessões, usuários, visualizações, compras e receita de compras reportada pelo GA4.
- Clarity: últimas 72 horas (UTC): sessões, bots e dispositivos. Não infere dados individuais nem cruza sessões com conversas.
- Nenhuma migração, credencial, contato, fila ou automação alterada.

## Pré-requisitos — Vercel Production (Secrets de servidor)
**NUNCA colar tokens, chaves privadas ou arquivos JSON no GitHub, no chat ou em NEXT_PUBLIC_*.**
1. Conferir o projeto, commit e domínio de produção.
2. Verificar que as envs atuais de Nuvemshop já funcionam e que o backend foi validado com login da proprietária e Guilherme.
3. Google Cloud: habilitar **Google Analytics Data API**; criar uma conta de serviço com acesso apenas de leitura à propriedade GA4 da Vital. No GA4, adicionar o e-mail da conta de serviço como Viewer à propriedade. Configurar:
   - \`VITAL_GA4_PROPERTY_ID\` = ID da propriedade (não ID de medição). A interface visitada apontava para 563675653; verificar no GA4 antes de salvar.
   - \`VITAL_GA4_SERVICE_EMAIL\` = e-mail da conta de serviço.
   - \`VITAL_GA4_PRIVATE_KEY\` = chave privada da conta de serviço, apenas como Secret de servidor (string PEM com quebras de linha ou \\n).
   - Nunca usar a chave como parâmetro da URL nem em logs.
4. No Clarity da Vital (identificador observado \`zbz6wxna0q\`): Settings > Data Export > gerar token de API com usuário administrador. Salvar como Secret \`VITAL_CLARITY_EXPORT_TOKEN\`. **Atenção:** no máximo 10 consultas por projeto por dia; até 3 dias e 1000 linhas; a aplicação usa cache de 12h em fetch + instância, mas instâncias/regiões isoladas podem consumir mais requisições; para uso intenso, criar cache global transacional.
5. **Só após testes de login e fontes**, habilitar \`VITAL_INSIGHTS_ENABLED=true\` no ambiente pretendido. Quando desligado, retorna 503 e não chama GA4 nem Clarity.
6. Nenhuma das novas variáveis muda a integração com a Nuvemshop, a Vivi ou a Argoplace.

## Testes de aceite
- \`node --test tests/vital-insights.test.mjs\`; \`npm test\`; \`npm run build\`.
- Usuário sem sessão => 401; pessoa de outra organização ou agente não autorizado => 403. Confirmar ausência de quaisquer dados no corpo/console.
- Propriedade GA4 e Clarity corretas, dados reais somente para a Vital. Para falha ou ausência de token, UI informa indisponibilidade, não inventa números.
- A aba Nuvemshop continua listando clientes/pedidos/produtos/checkouts; a aba atendimento abre e menu recolhe/expande em desktop e celular.
- Não enviar mensagens WhatsApp/Direct, não usar cliente real como massa de testes.
- Conferir pós-publicação versionamento, logs sem PII e perfil do Guilherme.
- Em particular, não mesclar automaticamente PRs #97–#102 ou branches temporárias sem reconciliar sua base com o deployment efetivo.

## Fontes
- GA4 Data API \`properties.runReport\`: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Clarity Data Export API: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
