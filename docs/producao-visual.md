# Produção visual nos Quick Wins

Capacidade universal do motor de Quick Wins: quando o resultado de um entregável é para VER (apresentação,
one-page, relatório visual, infográfico, fluxograma, mapa de processo, dashboard, matriz, checklist, cronograma,
cartaz, capa, peça para redes, carrossel, anúncio, material de treinamento, documento institucional ou qualquer
outro artefato estruturável), a GreenIA entrega o arquivo pronto (PDF, PNG, JPG, SVG), com prévia na tela,
edição e versões. Ela não é um módulo de social media: o motor entende "o trabalho precisa de um artefato visual",
nunca "o usuário está fazendo social media". Canal continua sendo só um metadado do entregável.

## 1. Arquitetura antes desta evolução (mapa)

| Assunto | Onde | Situação |
|---|---|---|
| Plano do Quick Win | `src/quickwin-operacao.js` (operação: entradas, etapas, entregáveis, ferramentas) | Entregável com `tipo`, `rotulo`, `canal` |
| Interpretação | `src/quickwin-interpretacao.js` (IA governada + invariantes do pedido) | Sem noção de artefato visual |
| Execução | `src/conversas.js` → `enviarMensagem` (governança, rota, streaming, Quality Check) | Texto em Markdown |
| Peças visuais | `ENTREGAVEIS.imagem/carrossel/reels/video` com `visual: true` | Saíam como **briefing** ("a arte final não é gerada aqui") |
| Ferramenta de imagem | `FERRAMENTAS.geracao_imagem` com `disponivel: false` | Resultado sempre parcial |
| Renderização | — | Nenhuma (só HTML do chat) |

Componentes reaproveitados: a rota e a governança da execução (`chamar`, sigilo, fornecedor fixo, não treino,
defesa final de credenciais), a conferência textual (Quality Check), o registro (`roteamento`, `uso`, `eventos`),
o isolamento por empresa (um banco SQLite por empresa), a marca da empresa (`logo`, `corMarca`) e o
`playwright-core` dos testes (QA visual no navegador).

Dependências novas (pequenas, sem framework): `@resvg/resvg-js` (SVG -> PNG, binário pronto, ~4 MB, sem fontes do
sistema) e `jpeg-js` (JPG, JavaScript puro). O PDF é escrito aqui (`src/visual/pdf.js`). Fontes empacotadas:
Inter e Source Serif 4 (OFL), em TrueType, em `src/visual/fontes`.

Migração: 14 (só acrescenta; as tabelas `artefatos_visuais` e `visual_assets` vêm pelo esquema).

## 2. Contrato universal

O entregável ganha `visual` (opcional). É o contrato do artefato, com tipo **semântico e extensível**:

```
entregavel.visual = { tipo, rotulo?, formato?, paginas?, publico?, estilo?, imagem?: 'conceitual'|'real', imagemDescricao? }
```

`src/visual/contrato.js` guarda só **traços** por tipo (formato padrão, multipágina, capa, impacto, fluxo por
seção ou contínuo, foco). O motor lê os traços, nunca o nome do tipo. Tipo desconhecido vira `custom` com o
rótulo que veio, sem mudança de código. Formatos: A4 retrato e paisagem, 16:9, 1:1, 4:5, 9:16 e 1.91:1.

O artefato produzido (tabela `artefatos_visuais`) guarda: tipo, rótulo, título, formato, páginas, conteúdo
estruturado, plano visual, opções de composição, identidade usada (com a origem de cada campo), registro da
conferência (status, rodadas, avisos), exportações, versão e vínculos (conversa, resposta, Quick Win e versão,
rota). O arquivo final é sempre refeito destes dados: determinístico.

## 3. Pipeline (cada etapa auditável)

```
execução do Quick Win (texto conferido)
  -> CONTEÚDO     src/visual/conteudo.js   itens com id: parágrafo, lista, checklist, tabela, indicadores, fluxo, chamada
  -> PLANO        src/visual/plano.js      páginas, papel na narrativa, layout e blocos que APONTAM para os itens
  -> ASSETS       src/visual/assets.js     logo da empresa, imagem gerada (se liberada) ou enviada, ícones do sistema
  -> COMPOSIÇÃO   src/visual/layout.js     grade, margens, tipografia medida pela fonte, tabelas, gráficos, diagramas
  -> CONFERÊNCIA  src/visual/qualidade.js  visual e semântica, sobre as mesmas primitivas que viram arquivo
  -> CORREÇÃO     src/visual/motor.js      no máximo 4 rodadas, cada uma registrada
  -> EXPORTAÇÃO   src/visual/{svg,raster,pdf}.js
```

- **Conteúdo separado do design.** A execução escreve só o conteúdo da peça (prompt em
  `promptVisual`): "Título:", uma subseção por página ou bloco, números com rótulo, tabelas, etapas, setas para
  fluxos, "Chamada:" nas peças de leitura rápida. Nunca cores, fontes, layout ou prompt de imagem.
- **Plano machine-readable.** A IA (o "diretor de arte", mesma rota da execução) decide narrativa, layout e tipo
  de bloco; o plano só referencia itens do conteúdo. A validação (`lerPlano`) recusa tipo desconhecido, ref
  inexistente, gráfico sem número, pizza que o dado não sustenta e título com número fora do conteúdo, e devolve à
  peça todo item esquecido. Sem IA (reserva do plano, falha, resposta ilegível): o planejador determinístico.
- **Composição determinística.** Mesma entrada, mesmo arquivo. Escala de texto por formato, ajuste do maior
  tamanho que cabe, página de pouco conteúdo com corpo maior em degraus, painéis em colunas (alvenaria), slides,
  capa, fechamento, peças de impacto, fluxo contínuo com tabelas e listas partidas (cabeçalho repetido).
- **Gráficos** (`graficos.js`): barras, barras horizontais, linhas (tempo), rosca (partes de 100%) e progresso
  (conclusão), escolhidos pela semântica dos dados. O valor escrito é o texto da célula; o eixo é só escala.
- **Diagramas** (`diagramas.js`): primeiro a estrutura lógica (nós e ligações), depois o desenho: camadas,
  nós fictícios nas ligações longas, ordem por baricentro, rotas ortogonais, decisão em losango com ramos
  rotulados, processo numerado, ciclo e linha do tempo. Nenhum modelo de imagem desenha processo.

## 4. Identidade visual (`src/visual/marca.js`)

Por empresa (`config.identidadeVisual`, no banco da empresa; tela em Configurações -> Identidade visual das
peças): cores (principal, secundária, destaque, texto, fundo), tipografia (sem serifa ou serifada), cantos, logo
claro para fundo escuro, cores proibidas, regras e tom. Nada é obrigatório: sem nada, o sistema visual neutro.

Origem de cada campo resolvido: `empresa` (regra), `inferida` (pedido desta peça, só para ela), `preferencia`
(salva) e `padrao`. Ordem: empresa > inferida > preferência > padrão. Inferência nunca é gravada como regra e
nunca usa cor proibida. Logo: só o que a empresa forneceu, sempre com a proporção natural (num fundo escuro sem
versão clara, vai num selo claro). Contraste mínimo garantido na derivação do tema.

## 5. Assets e geração de imagem

`asset = { id, tipo, origem, proposito, restricoes, gerado, referencia }`; origens: empresa, enviado, gerado,
sistema, placeholder. Provedor de imagem é opcional e governado (`decisaoImagem`):

- desligado por padrão (`config.producaoVisual.imagens.ativa`);
- não roda em conversa sigilosa, área com proteção reforçada, dado que a política manda proteger, reserva do plano;
- o pedido leva só o tema e o estilo (sem números, sem conteúdo do material), passa pelo filtro de dados;
- a imagem é sempre **asset** (nunca texto, tabela, logo ou layout); falha não perde a peça (sai tipográfica, com aviso);
- imagem que precisa ser real (`imagem: 'real'`, foto do produto) nunca é gerada: espaço reservado explícito e
  resultado parcial até a pessoa enviar a foto (PNG, JPG ou WEBP, até 5 MB, validada pelos bytes).

## 6. Conferência e correção

Conferência visual: dimensões, transbordo, corte, texto cortado, palavra partida, sobreposição, contraste (WCAG,
pelo fundo real sob o texto), legibilidade (mínimo por formato), margens, alinhamento, consistência, logo deformado
ou ausente, densidade, hierarquia, repetição, asset ausente e cor proibida. Semântica: conteúdo faltando (todo
item aparece), dados incorretos (todo número na peça está no conteúdo), páginas pedidas e o que o pedido exige.

Fidelidade antes do layout: um bloco desenha um item (bloco do plano com vários itens vira um bloco por item; a
capa não desenha blocos, então o que o plano põe nela vira subtítulo ou segue para a página seguinte); seções
paralelas com os mesmos campos (uma fase, um fornecedor por seção) viram um item só, em ordem; campo opcional sem
dado ("não informado") não vai para a peça; a peça usa a seção do resultado que traz o conteúdo dela ("Título:").
Peça de página única (cartaz, one-page, post, capa) nunca ganha segunda página: o que não couber é dito.

Comparação é estrutura, não texto: listas "item: valores" com os mesmos itens (fornecedores, opções) viram uma
matriz itens x critérios (`comparacao: { itens, criterios }`), desenhada sempre como tabela ou cartões; num pedido
comparativo sem matriz na peça, a matriz do resultado entra nela; a conferência reprova matriz ausente ou incompleta
(`comparacao`) e a correção a materializa. Números são dados: o valor exibido é o texto original inteiro
("+3,3%", "4,3 de 5", "1.234,56", "$12,345.67", "3 h 40 min"), com o número normalizado ao lado, nunca cortado no
separador decimal. Checklist distingue título ("Título:" em qualquer linha), introdução de lista (vira subtítulo),
item marcável ("[ ]") e nota (sem caixa). Fluxo com setas, com ou sem "Fluxo:" antes, vira diagrama de nós e
ligações. Capa: título único e subtítulo sem partes repetidas. Página única que corta tenta o formato maior da
família (sem formato pedido); edição ou variação que cortaria é recusada (nunca um artefato cortado).

Espaço vazio e legibilidade são medidos no renderer: página de leitura com menos de 30% da área útil ocupada e texto
no tamanho base (ou menor) é reprovada (`espaco_vazio`), como texto pequeno com espaço sobrando; capa, fechamento,
peça de impacto e desenho na largura toda (diagrama, gráfico, cronograma) não entram nessa regra.

Legibilidade: mínimo do formato, entrelinha mínima, e piso por tipo de página (dados 0,75 do corpo; texto 0,85) quando
sobra espaço. A conferência textual guarda o motivo de cada falha (do conferente ou determinístico).

Correção automática, em ordem, uma ação por rodada: materializar a comparação, recompor o que faltou, títulos do conteúdo, reduzir a escala
(até o mínimo legível), outra grade de colunas com o maior texto que cabe, reduzir a escala (até o mínimo legível), layout denso, página de
continuação (só em peça multipágina), preencher (texto maior quando sobra espaço), ajustar contraste, aumentar escala. No máximo `MAX_CORRECOES_VISUAIS = 4`. Estados: `aprovado`, `corrigido`, `parcial` (com explicação
objetiva: continuação, imagem reservada, páginas a menos) e `inconsistente`.

## 7. Integração com a execução (`src/conversas.js`)

Depois do Quality Check textual, para cada entregável com `visual`: `produzirVisuais` (sem gravar), a resposta é
gravada, e `gravarVisuais` liga os artefatos à resposta, à execução e à rota. Etapa na tela: "Montando o visual…".
Retenção: conteúdo que a empresa não guarda não gera artefato (há aviso). Custos por etapa em
`roteamento.qualidade.custos` (execução, conferência, pesquisa, plano visual, imagem, render = 0) e somados no
`uso` (créditos). Eventos: `visual.produced`, `visual.exported`, `visual.edited`, `visual.derived`,
`visual.restored` (só metadados).

## 8. API (`src/visual/rotas.js`)

| Rota | O que faz |
|---|---|
| `GET /api/artefatos?conversa=` | Artefatos atuais de uma conversa |
| `GET /api/artefatos/:id` | Resumo, modelo editável, versões |
| `GET /api/artefatos/:id/paginas/:n` | Prévia (PNG), `?miniatura=1` |
| `GET /api/artefatos/:id/baixar?formato=pdf|png|jpg|svg[&pagina=n]` | Arquivo (multipágina em PNG/JPG/SVG: ZIP). PPTX e DOCX: 400 honesto |
| `PATCH /api/artefatos/:id` | Edição (título, textos, páginas, ordem, remover, tipo de bloco, formato, cores desta peça) -> nova versão |
| `POST /api/artefatos/:id/imagem` | Foto enviada -> nova versão |
| `POST /api/artefatos/:id/derivar` | Outro artefato com o mesmo conteúdo, sem IA |
| `POST /api/artefatos/:id/restaurar` | Restaura uma versão |

Acesso: só quem executou (a conversa é dela); o admin não lê. Multiempresa: um banco por empresa, o id de uma
não existe na outra (testes em `test/producao-visual-tenants.test.js`).

## 9. Tela

Na conversa e no teste do Quick Win: bloco ARTEFATOS (miniatura real, tipo, páginas, formato, estado, avisos),
Visualizar (navegação entre páginas, miniaturas, setas do teclado, celular), Baixar PDF/PNG/JPG/SVG, Editar
(textos, títulos, ordem, formato, cores, imagem, outro artefato do mesmo conteúdo, versões). Nunca JSON.

## 10. Extensão

Novo renderer ou formato (PPTX, DOCX): uma função a partir das páginas compostas (`paginasDoArtefato`) e uma
entrada em `EXPORTACOES`. Novo provedor de imagem: implementar `gerarImagem(prompt, op)` no cliente de IA. Novo
tipo de artefato: uma linha de traços em `TIPOS` (ou nenhuma: vira `custom`). Novo tipo de asset: `TIPOS_ASSET`.

## 11. Design pela IA (diretora de arte)

Para chegar ao acabamento de um estúdio de design, as peças passam a ser **desenhadas pela IA em HTML/CSS** e
compostas num navegador. O motor clássico (composição determinística em SVG) continua como garantia.

```
conteúdo conferido -> plano (quais itens vão em cada página) -> imagem ilustrativa (governada)
  -> IA desenha cada página (HTML/CSS, lotes de 4 páginas com o mesmo CSS) -> limpeza
  -> Chromium isolado (render + medidas) -> conferência -> [1 correção] -> artefato "design"
                                                      \-> falhou de novo / indisponível -> motor clássico
```

- **Quem desenha**: a classe Avançada, quando a pessoa e o Quick Win podem usá-la e nada pede proteção extra
  (sigilo, área reforçada, dado pessoal); senão, o mesmo recurso da execução. Mesmas defesas de credencial.
- **Entrada da IA**: só o conteúdo da peça (itens com id, texto literal), a paleta, as fontes empacotadas,
  o formato e os assets disponíveis (`asset:heroi`, `asset:logo`). Tabelas numéricas levam `barras_prontas`
  (percentual de cada barra) para os gráficos não estimarem tamanhos.
- **Limpeza** (`design.js`): fora `<script>`, eventos `on*`, `<iframe>`, `<link>`, `<object>`, `<form>`,
  `<foreignObject>`, `@import`, `@font-face`, `url()`/`src`/`href` que não sejam assets da peça ou âncoras do SVG,
  `position:fixed`, animações.
- **Navegador isolado** (`chromium.js`): JavaScript da página desligado, CSP `default-src 'none'`, rede
  bloqueada (só a origem virtual `design.greenia.local` responde: fontes empacotadas e assets da peça), um
  trabalho por vez, navegador fechado ao fim, guarda de memória (`DESIGN_MEMORIA_MIN_MB`, padrão 160).
- **Conferência no navegador**: texto fora da página, encostado na borda (margem de segurança), cortado por
  contêiner, sobreposto a outro texto, fonte abaixo do mínimo do formato, contraste medido nos **pixels reais**
  em volta de cada texto (pega gradiente e foto), número fora do conteúdo, texto de exemplo, conteúdo da página
  que não apareceu literalmente e número de páginas. Falhou: uma correção com a lista exata; falhou de novo:
  motor clássico (`qualidade.motivo_classico`).
- **Saídas**: prévia JPEG por página e PDF (texto vetorial) guardados em `artefatos_render`; PNG/JPG em alta e
  PDF de uma página gerados na hora; SVG embute a imagem da página.
- **Edição**: texto, título, títulos de página, ordem, remoção de páginas e cores (variáveis CSS
  `--primaria`, `--secundaria`, `--destaque`, `--fundo`, `--texto`) viram nova versão renderizada e conferida,
  sem IA. Formato e tipo de bloco: derivar uma nova peça. Imagem nova entra no lugar reservado pelo design.
- **Imagens ilustrativas**: ligadas para todas as empresas (migração 16; a empresa pode desligar em
  Configurações). No design pela IA, peças de impacto e capas recebem uma imagem, sempre sob a governança
  de sempre (sem sigilo, sem área reforçada, sem dado protegido, fora da reserva; só o tema vai ao modelo).
- **Infraestrutura**: a imagem Docker instala `chromium`; `CHROMIUM_PATH` aponta o executável; `DESIGN_IA=0`
  desliga o design pela IA (só motor clássico). `/api/saude` informa `design: true` quando o navegador existe.
