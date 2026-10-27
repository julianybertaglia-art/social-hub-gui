import { publicPage, publicHtmlResponse } from '../lib/tideplace-public.mjs';

export const dynamic = 'force-static';

export async function GET() {
  const body = [
    '<section aria-labelledby="title">',
    '<p class="tag">YOUR SOCIAL SPACE · TIDEPLACE</p>',
    '<h1 id="title">Tudo o que move sua audiência, em um só lugar.</h1>',
    '<p class="lead">O TidePlace é uma plataforma web de gestão de redes sociais que reúne planejamento de conteúdo, organização de conversas e integração com canais sociais autorizados. Flow with your audience.</p>',
    '<a class="cta" href="/">Acessar painel privado</a>',
    '<a class="cta secondary" href="/tideplace/privacidade">Como tratamos os dados</a>',
    '</section>',
    '<section aria-labelledby="recursos"><h2 id="recursos">O que fazemos</h2>',
    '<div class="tiles">',
      '<article class="tile"><b>Conteúdo e planejamento</b><p>Organização de ideias, roteiros, calendário editorial e materiais de publicação.</p></article>',
      '<article class="tile"><b>Gestão de relacionamentos</b><p>Organização operacional de interações, atendimento e acompanhamento de contatos autorizados.</p></article>',
      '<article class="tile"><b>Conexões com plataformas</b><p>Integrações oficiais mediante consentimento do titular da conta. Novas funções de publicação estão em implementação e testes.</p></article>',
    '</div></section>',
    '<section class="panel" aria-labelledby="autorizacao"><p class="tag">ACESSO E SEGURANÇA</p>',
    '<h2 id="autorizacao">Você controla suas contas</h2>',
    '<p>O TidePlace não solicita senhas das suas redes sociais. Quando uma integração é disponibilizada, a conexão utiliza o fluxo oficial de autorização da respectiva plataforma e apenas as permissões concedidas pelo titular. O acesso ao painel é restrito a pessoas autorizadas.</p>',
    '<p>O TidePlace é uma ferramenta independente, não afiliada ao TikTok, Google/YouTube ou Meta.</p>',
    '<p>Para informações sobre o tratamento de dados, leia nossa <a href="/tideplace/privacidade">Política de Privacidade</a> e nossos <a href="/tideplace/termos">Termos de Uso</a>.</p>',
    '</section>',
    '<section aria-labelledby="contato"><h2 id="contato">Contato</h2>',
    '<p>Dúvidas sobre acesso, segurança, dados pessoais ou funcionamento da plataforma: <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>.</p>',
    '<p class="pill">Acesso atualmente restrito a usuários autorizados</p>',
    '</section>'
  ].join('');
  return publicHtmlResponse(publicPage({
    title:'Plataforma de gestão de redes sociais',
    description:'TidePlace: plataforma web para planejamento de conteúdo, organização de relacionamentos e integrações com redes sociais autorizadas.',
    canonical:'',
    body,
  }));
}
