import { publicPage, publicHtmlResponse } from '../../lib/tideplace-public.mjs';

export const dynamic = 'force-static';

export async function GET() {
  const body = [
    '<article class="panel">',
    '<p class="tag">TIDEPLACE · DOCUMENTOS LEGAIS</p>',
    '<h1>Termos de Uso</h1>',
    '<p class="updated">Versão de 27 de outubro de 2026.</p>',
    '<p>Estes Termos de Uso disciplinam o acesso e o uso do TidePlace, plataforma web de planejamento de conteúdo, gestão operacional de redes sociais e integrações com serviços de terceiros. O serviço é administrado por Juliany Bertaglia, contato <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>.</p>',
    '<h2>1. Quem pode usar</h2>',
    '<p>O acesso ao painel do TidePlace é restrito a usuários e equipes expressamente autorizados. O usuário deve fornecer dados corretos, manter suas credenciais de acesso protegidas e ter autorização legítima para conectar e operar as contas sociais sob sua gestão.</p>',
    '<h2>2. O que a plataforma oferece</h2>',
    '<p>O TidePlace oferece ferramentas de organização de conteúdo, automação e relacionamento, conforme a disponibilidade técnica de cada integração. Algumas funcionalidades estão em desenvolvimento, teste ou dependem de revisão, permissões e limites impostos por provedores externos.</p>',
    '<h2>3. Autorização de redes sociais</h2>',
    '<p>As conexões com TikTok, Instagram, WhatsApp, YouTube e outros serviços, quando disponíveis, dependem de autenticação e consentimento pelas interfaces oficiais dessas plataformas. O usuário escolhe quais permissões concede e pode revogá-las nos controles do respectivo provedor. Algumas integrações podem exigir aprovação prévia da própria plataforma.</p>',
    '<p>O TidePlace não é afiliado nem endossado pelo TikTok, Meta, Google ou YouTube. A utilização desses serviços continua sujeita aos termos, políticas e limites definidos por seus respectivos responsáveis.</p>',
    '<h2>4. Conteúdo e publicações</h2>',
    '<p>O usuário é responsável pela titularidade ou pelas licenças necessárias para utilizar textos, imagens, vídeos, músicas e demais conteúdos que inserir ou publicar. Também é responsável por conferir títulos, legendas, destinatários e opções de privacidade antes de confirmar qualquer publicação. Recursos de postagem somente operam após autorização e quando disponíveis.</p>',
    '<h2>5. Uso adequado</h2>',
    '<p>É proibido utilizar o TidePlace para acessos não autorizados, spam, fraude, violação de direitos de terceiros, uso abusivo de dados ou qualquer atividade incompatível com a legislação e com as políticas das plataformas integradas. A administração poderá restringir o acesso em caso de uso indevido ou risco de segurança.</p>',
    '<h2>6. Disponibilidade e limitações</h2>',
    '<p>O funcionamento do TidePlace depende de conexões de internet, provedores de hospedagem, APIs externas e permissões que podem mudar sem aviso prévio. Poderão ocorrer interrupções, atrasos, restrições de cota ou suspensão de funcionalidades por motivos técnicos ou por decisão das plataformas externas. Não há garantia de alcance, engajamento, conversão ou resultados comerciais.</p>',
    '<h2>7. Proteção de dados</h2>',
    '<p>O tratamento de dados pessoais é descrito na <a href="/tideplace/privacidade">Política de Privacidade do TidePlace</a>, que integra estes Termos. O titular pode solicitar informações, correções ou exclusão, nos limites previstos em lei, pelo e-mail de contato.</p>',
    '<h2>8. Suspensão, encerramento e mudanças</h2>',
    '<p>O acesso poderá ser suspenso ou encerrado mediante solicitação do usuário, descontinuação do serviço ou violação destes Termos. Estes Termos podem ser atualizados para refletir mudanças técnicas e legais; a versão atual permanece acessível nesta página, com indicação de sua data.</p>',
    '<h2>9. Lei aplicável e contato</h2>',
    '<p>Estes Termos são interpretados segundo a legislação brasileira, inclusive a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), quando aplicável, sem prejuízo de direitos legais dos titulares e consumidores.</p>',
    '<p>Dúvidas e solicitações: <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>.</p>',
    '</article>'
  ].join('');
  return publicHtmlResponse(publicPage({
    title:'Termos de Uso',
    description:'Termos de uso do TidePlace, plataforma de gestão de redes sociais, publicações e integrações autorizadas.',
    canonical:'/termos',
    body,
  }));
}
