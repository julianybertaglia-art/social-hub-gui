# Integração TidePlace → Argo — Vital Decor (API v1)
**Responsável pelo Argo:** Andrey  
**Proprietário da conexão WhatsApp e automações:** TidePlace  
**Ambiente:** `https://social-hub-gui.vercel.app`  
**Base API:** `/api/integrations/argo/v1`

## O que está pronto no TidePlace
- Acesso seguro por **duas chaves individuais** (Andrey e Vitor), criadas e revogadas pela administração no TidePlace.
- Cada chave vê **apenas** as conversas explicitamente atribuídas ao respectivo atendente.
- A Vivi classifica os contatos, escolhe o setor e encaminha conforme a configuração. **Padrão: todos os setores permanecem no TidePlace.**
- Envio das respostas pelo **mesmo número e token de WhatsApp** administrados no TidePlace. O Argo **NÃO** conecta WhatsApp, não recebe token Meta e não consulta Supabase diretamente.
- Proteção contra envio duplicado (`Idempotency-Key`), janela de atendimento de 24 horas, limites de 30 envios por minuto/atendente, transferência, suspensão da Vivi depois da passagem ao humano.
- Histórico sincronizado, incluindo mensagens enviadas pelo TidePlace.

## O que Andrey precisa fazer no Argo
1. Criar ou adaptar a área **Atendimento / WhatsApp Vital Decor** na interface do Argo.
2. Autenticar os usuários Andrey e Vitor **no Argo** e vincular cada sessão ao respectivo atendente; não aceite um `agent` arbitrário vindo do navegador.
3. No **backend** do Argo, guardar `TIDEPLACE_ARGO_ANDREY_KEY` e `TIDEPLACE_ARGO_VITOR_KEY` num cofre de segredos ou variáveis de ambiente protegidas. Nunca passar as chaves ao frontend, URL, logs ou GitHub.
4. Consultar a fila a cada 10–15 segundos, ou desenvolver sincronização própria. A primeira versão funciona com polling, sem webhook externo.
5. Consultar as mensagens por contato e responder pelo endpoint de envio. Cada tentativa de envio precisa de um `Idempotency-Key` único (UUID é recomendado) **reutilizado** apenas para retry seguro da mesma mensagem.
6. Mostrar status/transferência para TidePlace, Andrey ou Vitor.
7. Verificar erros de API (401 credencial, 404 não atribuída, 409 janela expirada ou idempotência, 429 limite, 502 Meta não confirmou).
8. Realizar testes com **contatos autorizados** antes de atender clientes reais.

## Autenticação
Todos os endpoints abaixo exigem:
```http
Authorization: Bearer <CHAVE_EXCLUSIVA_DO_ATENDENTE>
Accept: application/json
```
A chave é gerada **uma única vez** em TidePlace → Vital Decor → WhatsApp → Integração Argo. Tem validade de 90 dias e pode ser revogada imediatamente.

Todas as respostas contêm `Cache-Control: private, no-store`. Nunca consumir a API diretamente no browser do cliente.

## Endpoints

### 1. Health
`GET /api/integrations/argo/v1/health`

Retorna `{ "ok": true, "workspace": "vital-decor", "agent": "andrey", "assigned_conversations": 3, "capabilities": ["read","reply","poll"], "sender": "tideplace", "version":"1.0" }`.

### 2. Listar sua fila
`GET /api/integrations/argo/v1/conversations?limit=30&page=1`

Retorna:
```json
{
  "workspace":"vital-decor",
  "agent":"andrey",
  "page":1,
  "limit":30,
  "total":1,
  "conversations":[
    {
      "contact":"5511999999999",
      "sector":"pos_venda",
      "status":"open",
      "assigned_to":"andrey",
      "updated_at":"2026-10-09T17:00:00Z",
      "contact_name":"Cliente de exemplo",
      "last_message":{
        "body":"Preciso de ajuda com um pedido",
        "type":"text","direction":"inbound",
        "status":"received","sent_at":"2026-10-09T17:00:00Z"
      }
    }
  ]
}
```

Apenas conversas **abertas ou em espera** e atribuídas à chave usada. `total` permite paginar.

### 3. Histórico
`GET /api/integrations/argo/v1/conversations/{telefone}/messages?limit=100`

Para receber somente as mensagens posteriores a um timestamp:
`GET /api/integrations/argo/v1/conversations/{telefone}/messages?after=2026-10-09T17%3A00%3A00.000Z&limit=100`

```json
{
  "workspace":"vital-decor","contact":"5511999999999","sector":"pos_venda",
  "assignee":"andrey",
  "messages":[
    {"id":"uuid","meta_id":"wamid.exemplo","direction":"inbound",
     "type":"text","body":"Olá","status":"received",
     "sent_at":"2026-10-09T17:00:00Z"}
  ]
}
```
A API não expõe `raw_payload`, tokens Meta ou dados de outros workspaces.

### 4. Responder pelo WhatsApp
`POST /api/integrations/argo/v1/conversations/{telefone}/messages`

Headers:
```http
Authorization: Bearer <CHAVE_DO_ATENDENTE>
Content-Type: application/json
Idempotency-Key: <UUID_UNICO_DESTA_MENSAGEM>
```

Body:
```json
{"text":"Olá! Sou o Andrey, vou ajudar você com seu pedido."}
```

Resposta quando Meta confirmar:
```json
{"ok":true,"message_id":"wamid.exemplo","sent_at":"2026-10-09T17:02:00Z","warnings":[]}
```
Só pode enviar para contatos **atribuídos à própria chave**, com mensagem recebida nas últimas 24 horas. Nenhum envio em massa, primeiro contato ou template está habilitado nesta v1. Se a Meta não confirmar, confira o histórico antes de tentar com **nova** chave de idempotência para não duplicar.

### 5. Atualizar estado ou transferir
`POST /api/integrations/argo/v1/conversations/{telefone}/actions`

Para marcar pendente, concluído ou reabrir:
```json
{"action":"status","status":"waiting"}
```
Valores aceitos: `open`, `waiting`, `closed`.

Para transferir a conversa:
```json
{"action":"transfer","to":"vitor"}
```
Destinos: `tide`, `andrey`, `vitor`. A chave de origem perde imediatamente acesso à conversa após a transferência.

## Distribuição automática (configurada pela Vital no TidePlace)
| Escolha da Vivi | Setor |
|---|---|
| Produtos Vital Decor | `comercial_vital` |
| Geradores BLUETTI | `bluetti` |
| VTX Fitness | `vtx` |
| Pedido (Shopee, Mercado Livre, Amazon, TikTok, site) | `pos_venda` |
| Revenda e atacado | `atacado` |
| Afiliado TikTok Shop | `afiliados` |

**Atenção:** nenhum setor é repassado automaticamente ao Argo até o administrador selecionar Andrey ou Vitor no TidePlace. Conversas antigas podem ser transferidas manualmente por número.

## Recomendações de implementação para o Andrey
- API chamada **exclusivamente do backend** do Argo após login do atendente.
- Selecionar a chave a partir da identidade autenticada do usuário, nunca por parâmetro aceito do cliente.
- Não armazenar tokens no navegador ou transmitir chaves pela URL; não expor as chaves em logs.
- Não guardar credenciais Meta/WhatsApp no Argo.
- Consultar `/conversations` a cada 10–15 segundos e atualizar o chat aberto por `/messages?after=`.
- Exibir badge de responsável, assunto, fila, status e indicador de janela de atendimento (24h).
- Desabilitar o campo de resposta quando o status for `closed`, o servidor retornar 409, ou a conversa for transferida.
- Não tentar enviar automaticamente novamente em 502 (envio incerto).
- Media/anexos e templates aprovados ainda não estão incluídos nesta v1; textos e marcadores de mídia ficam disponíveis no histórico.
- Se precisar de webhook push, áudio, documentos ou templates, alinhar uma fase 2 para desenvolvimento no TidePlace.

## Checklist de homologação
- [ ] A chave Andrey não lê contatos atribuídos a Vitor, nem seu setor no TidePlace.
- [ ] A chave Vitor não lê contatos atribuídos a Andrey.
- [ ] Mensagem recebida aparece no Argo em 10–15 segundos.
- [ ] Resposta pelo Argo aparece no WhatsApp e no TidePlace.
- [ ] Repetir Idempotency-Key não envia duas mensagens.
- [ ] Transferência Andrey → Vitor remove imediatamente acesso do Andrey.
- [ ] A Vivi não interrompe o atendimento manual.
- [ ] Revogar chave no TidePlace bloqueia o acesso no Argo.

**Contato técnico:** a API é mantida no TidePlace. O Andrey trabalha somente no backend e na interface do Argo. Não solicitar token Meta, access token do Supabase ou conexão duplicada do WhatsApp.
