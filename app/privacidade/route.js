export const dynamic = 'force-static';

export async function GET() {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Política de Privacidade | Gui Social Hub</title>
  <style>
    :root{color-scheme:light;--bg:#f4f3ef;--card:#fff;--text:#171717;--muted:#6f6b64;--border:#e4dfd5;--gold:#8e6b30}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:Arial,Helvetica,sans-serif;line-height:1.65}
    main{width:min(860px,calc(100% - 32px));margin:48px auto;padding:42px;border:1px solid var(--border);border-radius:18px;background:var(--card);box-shadow:0 14px 40px rgba(30,27,21,.06)}
    .eyebrow{margin:0 0 8px;color:var(--gold);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    h1,h2{font-family:Georgia,'Times New Roman',serif;font-weight:500} h1{margin:0 0 8px;font-size:44px;letter-spacing:-.03em} h2{margin:30px 0 8px;font-size:24px}
    p,li{color:var(--muted)} .updated{font-size:13px} ul{padding-left:22px}
    a{color:var(--gold)}
    @media(max-width:640px){main{margin:20px auto;padding:26px}h1{font-size:34px}}
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">GUI SOCIAL HUB</p>
    <h1>Política de Privacidade</h1>
    <p class="updated">Última atualização: 27 de agosto de 2026.</p>

    <p>Esta Política de Privacidade descreve como o Gui Social Hub trata informações obtidas por meio das integrações oficiais da Meta e do Instagram para apoiar a gestão de conteúdo, comentários, mensagens e relacionamento com a audiência do perfil conectado.</p>

    <h2>1. Informações tratadas</h2>
    <p>Quando autorizado pelo titular da conta profissional do Instagram, o Gui Social Hub pode receber e processar dados disponibilizados pela API oficial, como identificadores de conta, nome de usuário, comentários, mensagens, informações básicas de mídia e dados necessários para executar automações configuradas pelo administrador da conta.</p>

    <h2>2. Finalidades</h2>
    <p>Os dados são utilizados exclusivamente para operar funcionalidades autorizadas, incluindo:</p>
    <ul>
      <li>receber e organizar comentários e mensagens;</li>
      <li>responder a interações conforme regras configuradas pelo administrador;</li>
      <li>registrar leads e histórico de atendimento;</li>
      <li>apresentar métricas e informações de gestão dentro do Hub.</li>
    </ul>

    <h2>3. Compartilhamento</h2>
    <p>O Gui Social Hub não vende dados pessoais. As informações podem ser processadas pelos provedores técnicos necessários ao funcionamento do serviço, como Meta/Instagram, Vercel e Supabase, sempre dentro da finalidade de operação da plataforma.</p>

    <h2>4. Armazenamento e segurança</h2>
    <p>Tokens, chaves e credenciais de integração são armazenados em variáveis de ambiente protegidas e não são exibidos publicamente. São aplicadas medidas razoáveis de segurança para limitar o acesso às informações processadas pelo sistema.</p>

    <h2>5. Retenção e exclusão</h2>
    <p>As informações são mantidas apenas pelo período necessário para a operação das funcionalidades e podem ser removidas quando a integração for desconectada ou quando houver solicitação válida do titular ou administrador responsável.</p>

    <h2>6. Direitos e solicitações</h2>
    <p>Solicitações relacionadas a acesso, correção ou exclusão de dados podem ser feitas pelos canais oficiais do perfil <strong>@gui_nonato</strong>.</p>

    <h2>7. Alterações</h2>
    <p>Esta política pode ser atualizada para refletir mudanças técnicas, legais ou de funcionamento do Gui Social Hub. A versão vigente ficará disponível permanentemente neste endereço.</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
