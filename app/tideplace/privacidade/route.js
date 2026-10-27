import { publicPage, publicHtmlResponse } from '../../lib/tideplace-public.mjs';

export const dynamic = 'force-static';

export async function GET() {
  const body = [
    '<article class="panel">',
    '<p class="tag">TIDEPLACE · DOCUMENTOS LEGAIS</p>',
    '<h1>Política de Privacidade</h1>',
    '<p class="updated">Versão de 27 de outubro de 2026.</p>',
    '<p>Esta Política descreve o tratamento de dados pessoais necessário ao funcionamento do TidePlace, plataforma web de gestão de redes sociais, conteúdo, atendimento e integrações com serviços de terceiros. Contato para questões de privacidade: <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>. A administração do aplicativo é realizada por Juliany Bertaglia.</p>',
    '<h2>1. Informações que podem ser tratadas</h2>',
    '<ul>',
      '<li><strong>Conta e acesso:</strong> endereço de e-mail, identificadores da conta, informações de sessão e registros técnicos de autenticação.</li>',
      '<li><strong>Contas sociais conectadas:</strong> identificadores de perfil ou canal, nome público, imagem e permissões concedidas pelo titular via fluxo oficial de autorização.</li>',
      '<li><strong>Conteúdo e atividades:</strong> publicações, legendas, vídeos enviados, planejamento editorial, métricas disponibilizadas pelas APIs, comentários e mensagens de contas legitimamente gerenciadas, conforme a função ativada.</li>',
      '<li><strong>Relacionamento e atendimento:</strong> registros de conversa e informações inseridas voluntariamente por administradores ou contatos em formulários ou canais integrados, quando essas ferramentas estiverem em uso.</li>',
      '<li><strong>Dados de funcionamento:</strong> eventos técnicos e dados necessários à segurança, correção de falhas e prevenção de abusos.</li>',
    '</ul>',
    '<p>As categorias acessadas variam conforme as funcionalidades ativadas e as permissões efetivamente concedidas. O TidePlace não solicita senhas pessoais do TikTok, Instagram ou YouTube para conectar essas contas.</p>',
    '<h2>2. Origem dos dados</h2>',
    '<p>Os dados são fornecidos diretamente pelo usuário, por pessoas que interagem com os canais autorizados ou pelas plataformas conectadas por meio de suas APIs oficiais, observadas as permissões e limitações de cada serviço.</p>',
    '<h2>3. Para que utilizamos os dados</h2>',
    '<ul>',
      '<li>autenticar administradores e manter sessões e preferências;</li>',
      '<li>conectar e identificar contas e canais previamente autorizados;</li>',
      '<li>planejar, preparar, enviar e acompanhar conteúdo quando a função de publicação estiver disponível;</li>',
      '<li>organizar comentários, mensagens, contatos, demandas e métricas relacionados às contas gerenciadas;</li>',
      '<li>executar automações expressamente configuradas pelo administrador, sujeitas às regras da plataforma integrada;</li>',
      '<li>proteger as contas, diagnosticar falhas técnicas, cumprir obrigações legais e atender solicitações dos titulares.</li>',
    '</ul>',
    '<h2>4. Bases legais e controle das integrações</h2>',
    '<p>O tratamento ocorre conforme a finalidade e a base legal aplicável, incluindo execução da relação de uso da plataforma, cumprimento de obrigações legais, legítimo interesse compatível com os direitos dos titulares e, quando exigido, consentimento. A autorização OAuth de cada rede social controla quais dados e operações aquela plataforma permite ao TidePlace; ela não substitui outras exigências legais de tratamento de dados.</p>',
    '<h2>5. Compartilhamento e fornecedores</h2>',
    '<p>Dados podem ser processados por serviços necessários à operação, incluindo provedores de infraestrutura e armazenamento (como Vercel e Supabase) e pelas próprias plataformas conectadas (como Meta/Instagram/WhatsApp, Google/YouTube e TikTok). O compartilhamento é limitado ao funcionamento, suporte, segurança e cumprimento de obrigações legais. Não comercializamos dados pessoais.</p>',
    '<h2>6. Armazenamento e segurança</h2>',
    '<p>Adotamos medidas técnicas e organizacionais de segurança compatíveis com os recursos da plataforma, como controle de acesso e proteção das credenciais de integração armazenadas no servidor. Nenhum sistema pode garantir segurança absoluta. Os serviços de infraestrutura e os provedores de redes sociais podem tratar dados em outros países, conforme suas condições e as regras legais aplicáveis.</p>',
    '<h2>7. Prazo de retenção e remoção</h2>',
    '<p>As informações são mantidas pelo período necessário às finalidades descritas, à prestação do serviço e ao cumprimento de exigências legais ou de segurança. A desconexão de uma rede pode interromper novos acessos, mas não remove automaticamente informações já compartilhadas com a própria rede social. Solicitações de eliminação e revogação serão analisadas observando obrigações legais e técnicas aplicáveis.</p>',
    '<h2>8. Cookies e dados de sessão</h2>',
    '<p>O site e o painel podem utilizar cookies, armazenamento local e recursos equivalentes necessários para autenticação, manutenção da sessão, segurança e preferências da interface. Serviços de terceiros envolvidos no funcionamento do site podem utilizar seus próprios mecanismos técnicos, segundo suas respectivas políticas.</p>',
    '<h2>9. Direitos de titulares</h2>',
    '<p>O titular pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, anonimização, bloqueio, exclusão quando cabível e demais direitos previstos na Lei Geral de Proteção de Dados Pessoais. Também é possível revogar permissões concedidas nas configurações da respectiva rede social.</p>',
    '<p>Para exercer seus direitos ou comunicar um incidente relacionado ao TidePlace, escreva para <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>, informando de forma suficiente sua relação com a conta ou com o dado envolvido. Podemos solicitar comprovação de legitimidade antes de atender pedidos que afetem informações de outras pessoas.</p>',
    '<h2>10. Crianças e adolescentes</h2>',
    '<p>O TidePlace é voltado a administradores e profissionais autorizados a gerenciar contas sociais. Não é um serviço direcionado a crianças. Qualquer tratamento de dados de menores deve respeitar a legislação aplicável e as regras específicas das plataformas integradas.</p>',
    '<h2>11. Alterações e contato</h2>',
    '<p>Esta Política poderá ser revisada quando houver mudanças nas funcionalidades, nos fornecedores ou na legislação. A versão vigente ficará disponível neste endereço. Para esclarecimentos: <a href="mailto:juliany.bertaglia@gmail.com">juliany.bertaglia@gmail.com</a>.</p>',
    '</article>'
  ].join('');
  return publicHtmlResponse(publicPage({
    title:'Política de Privacidade',
    description:'Saiba como o TidePlace trata dados pessoais e integrações autorizadas com Instagram, WhatsApp, YouTube e TikTok.',
    canonical:'/privacidade',
    body,
  }));
}
