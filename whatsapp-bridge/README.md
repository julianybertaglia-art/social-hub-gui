# Lynna WhatsApp Bridge

Serviço separado do Next.js que mantém uma sessão persistente do WhatsApp Web usando Baileys.

## O que ele faz

- Gera QR Code para parear uma conta comum do WhatsApp.
- Salva credenciais e chaves em /data/auth.
- Mantém uma conexão única por instância.
- Reconecta com backoff quando a conexão cai.
- Expõe envio de texto, áudio, mídia e consulta de grupos.
- Entrega mensagens recebidas ao endpoint do Lynna.
- Mantém cache TTL de mensagens recentes para getMessage.

## Hospedagem no Railway

O repositório possui um `railway.json` na raiz. Crie um serviço a partir deste repositório, gere um domínio público e anexe um volume em `/data`.

Configure no serviço:

- `BRIDGE_API_TOKEN`: token longo e aleatório usado pelo Lynna.
- `BRIDGE_WEBHOOK_URL`: `https://social-hub-gui.vercel.app/api/whatsapp/bridge/webhook`.
- `BRIDGE_WEBHOOK_TOKEN`: o mesmo valor de `BRIDGE_API_TOKEN`.
- `AUTH_DIR`: `/data/auth`.
- `MESSAGE_CACHE_FILE`: `/data/message-cache.json`.
- `SESSION_LOCK_FILE`: `/data/bridge.lock`.
- `AUTO_CONNECT`: `true`.
- `LOG_LEVEL`: `warn`.

No projeto do Lynna na Vercel, configure:

- `WHATSAPP_PROVIDER`: `baileys`.
- `WHATSAPP_BRIDGE_URL`: domínio público HTTPS do serviço Railway.
- `WHATSAPP_BRIDGE_TOKEN`: o mesmo valor de `BRIDGE_API_TOKEN`.
- `WHATSAPP_BRIDGE_WEBHOOK_TOKEN`: o mesmo valor de `BRIDGE_API_TOKEN`.

O frontend Next.js/Vercel não deve hospedar o socket Baileys, porque funções serverless podem ser encerradas e perder a sessão.

## Execução local

Copie .env.example para .env, preencha os tokens e execute:

    npm install
    npm start

Ou use Docker Compose:

    docker compose up -d --build

## Variáveis

- BRIDGE_API_TOKEN: token usado pelo Lynna para chamar a ponte.
- BRIDGE_WEBHOOK_URL: URL pública de /api/whatsapp/bridge/webhook no Lynna.
- BRIDGE_WEBHOOK_TOKEN: token aceito pelo webhook do Lynna.
- AUTH_DIR: diretório persistente das credenciais.
- MESSAGE_CACHE_FILE: arquivo persistente do cache recente.
- SESSION_LOCK_FILE: lock persistente que impede duas instâncias na mesma sessão.
- AUTO_CONNECT: reconecta automaticamente após reinício.
- PORT: porta HTTP do serviço.

## Segurança e operação

Não publique os arquivos da pasta /data, não comite .env e não compartilhe o QR Code. Use uma conta dedicada ao atendimento e respeite as políticas do WhatsApp. Baileys é uma biblioteca não oficial para WhatsApp Web; ela não substitui a API oficial da Meta.
