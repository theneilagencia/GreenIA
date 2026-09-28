# Auditoria de UX/UI: acabamento

Referência: produtos com acabamento premium (anthropic.com, linear.app). A base visual da GreenIA já estava
certa: neutros quentes, uma cor de ação, serifa nos números e sans na interface. O que destoava eram os
controles e os padrões de composição das telas administrativas.

## Achados e correções

| # | Achado | Onde | Correção |
|---|---|---|---|
| 1 | Rádios, checkboxes e selects nativos do navegador, sem a cor da marca e desalinhados; o texto quebrava por baixo do controle | Todas as telas (Modelos, Políticas, quick win, Configurações, chat) | Controles da marca no sistema visual, com o mesmo tamanho, alinhados à primeira linha do texto e com foco visível |
| 2 | Decisão importante apresentada como lista de rádios em um parágrafo | Modelos → "Como a empresa usa a IA" | Cartões de escolha (título, selo "Recomendado", descrição e estado selecionado) |
| 3 | Cabeçalho de tabela em CAIXA ALTA espaçada e linhas apertadas | Todas as tabelas | Cabeçalho em caixa normal, mais respiro nas linhas, destaque ao passar o mouse e células centralizadas na vertical |
| 4 | Avisos em bloco colorido inteiro (vermelho, verde, âmbar), que gritavam mais do que informavam | Modelos, Políticas, painel | Avisos discretos: fundo claro, barra de cor à esquerda e título colorido, com o texto na cor de leitura |
| 5 | Dois rádios por linha quebrando em duas linhas cada | Políticas → tipos de dado; quick win → dados e sigilo | Controle segmentado em uma linha ("Processar com proteção" ou "Não enviar") e efeito em texto curto |
| 6 | Interruptor, título e selo "OFF" desalinhados | Políticas → Informações sigilosas | Linha de interruptor com controle, título clicável, estado ON/OFF à direita e descrição abaixo |
| 7 | Texto introdutório sem largura de leitura consistente | Todas as páginas | Largura de leitura de 72 caracteres e ritmo de margem padronizado; títulos de seção com hierarquia |
| 8 | Cartões de configuração sem hierarquia | Modelos, Políticas | Cartão com título, descrição, sombra leve e raio de 12px |

As correções ficam na camada de acabamento no fim de `public/estilo.css`. Os componentes novos
(`.escolhas` / `.escolha`, `.segmento`, `.linha-switch` / `.estado`) servem a qualquer tela nova.

## Verificação

- Capturas antes e depois com `node scripts/capturas.js <pasta>`, que sobe a GreenIA e fotografa as telas.
- `node scripts/auditoria-responsiva.js` não encontrou nenhuma tela com rolagem ou corte (360 e 390 px).
- Testes unitários e de ponta a ponta passam.

## Próximos passos sugeridos

- **Console da plataforma:** as barras do gráfico de uso por dia (`.gb-col`) têm alvo de toque de 9px no celular.
- **Formulário longo do quick win:** dividir em etapas ou em seções recolhíveis.
- **Catálogo técnico de Modelos:** já é só do admin, mas pode ficar recolhido por padrão no modo "Seguir recomendações".
