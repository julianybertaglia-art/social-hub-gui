# Estúdio de carrosséis — primeira entrega

Prévia: `/criador-posts.html?marca=gui-nonato` ou `?marca=vital-decor`.
Integração com a navegação nativa: `/criar-post`. O iframe mantém a conta do shell usando mensagens com origem e janela verificadas.

O radar oferece entrada pelo menu, pelos cards, pelas ideias e pelo briefing revisado. Os parâmetros `referencia` e `ideia` buscam somente conteúdo do workspace escolhido. A foto da referência não é importada como arte; as imagens são escolhidas pela usuária.

## Conteúdo e identidade

- Gui: foto enviada, Montserrat regular/negrito e caixa branca com cantos retos. Ajustes de texto, caixa, alinhamento, posição e enquadramento. Uma foto pode ser compartilhada entre todos os slides.
- Vital: quatro composições (produto, ambiente, painel editorial e antes/depois), Montserrat, neutros, preto e dourado, logo oficial opcional. O comparativo requer duas fotos reais. Não há geração de ambientações ou especificações.
- Roteiro com blocos separados por linha em branco, 1 a 20 slides, formato quadrado por padrão e opção 4:5. Edição de legenda, ordem, adição, exclusão, duplicação e desfazer/refazer.

## Persistência e exportação

IndexedDB `tideplace-creator-v1`, stores `projects` e `assets`. Textos, referências às fotos e blobs são guardados por marca. O arquivo original não é regravado nem substituído pela renderização. Salvamento só é confirmado no término da transação; erros não são apresentados como sucesso.

Nesta prévia o armazenamento é local ao navegador e à origem. Não há sincronização com a conta, outro dispositivo ou domínio de produção. A cópia `.tide.json` contém projeto e fotos originais e pode ser reaberta na marca correspondente. Importações validam estrutura, tamanho, MIME, referências de fotos e a decodificação das imagens.

Prévia e exportação usam o mesmo renderizador Canvas e fontes locais licenciadas. Exportação individual PNG ou ZIP com PNGs numerados e `legenda.txt`. A exportação exige as fotos e bloqueia texto que não caiba no layout. A fonte é ajustada para caber, sem cair abaixo de 20 px; no editor o tamanho escolhido é o limite superior.

## Limites desta entrega

O editor usa os roteiros já preparados no radar ou o texto escrito/colado pela usuária. Ainda não chama um modelo para redigir/revisar automaticamente. Não publica nem agenda posts na Meta. Esses recursos dependem da próxima etapa, com armazenamento na conta, ativos acessíveis ao servidor, permissões e confirmação do envio.

## Validação

`node --test tests/carousel-editor.test.mjs tests/tideplace-navigation.test.mjs` valida identidade por marca, requisitos de fotos, importação de roteiros, negrito, quebra de palavras longas, URLs e integridade do ZIP. `npm run build` valida a rota nativa.

QA complementar em DOM simulado e Canvas com fontes reais: IndexedDB por marca, edição e recuperação de rascunhos, foto repetida, ordem dos slides, desfazer/refazer, proporção da tela, exportação real de PNGs/ZIP, cópia editável com os bytes originais e quatro composições da Vital. Não substitui validação visual no navegador da usuária.
