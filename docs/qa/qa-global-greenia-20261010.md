# QA funcional, UX/UI e técnico do GreenIA

**Resultado: as baterias automatizadas foram aprovadas, mas o produto não recebe aceite integral.** A inspeção complementar confirmou falhas no cabeçalho móvel, na identificação de campos e na robustez HTTP. A premissa de uso por leigos e não nativos digitais ainda exige correções e avaliação com participantes reais.

Auditoria de 10/10/2026, sobre o código de produção `d795447b0d04ca8a82100ea9dd6dbeda8d414507`, ramo `greenia-lite`. Esta auditoria entrega diagnóstico e evidências; as falhas descritas abaixo continuam no código auditado.

O aprofundamento solicitado de painel do resultado, histórico consolidado e integração contínua está detalhado em [QA dos painéis](qa-paineis-profundo-20261010.md). Foram acrescentados nove testes de serviços e três de navegador. A integração contínua entre sistemas externos e os indicadores não está implementada como entrega padronizada e não recebe aceite nesta versão.

## Escopo e evidências

O inventário inclui trabalho cotidiano, administração da empresa, console operacional, páginas públicas, serviços e os novos painéis. Foram identificadas 263 declarações literais de rotas HTTP, correspondentes a 259 pares distintos de método e caminho, em contextos de instalação única e multiempresa. Páginas públicas e despachos diretos, como encontrar ambiente, contato e devolução de dados, também foram considerados pelas suítes específicas e pela revisão do servidor. Esse inventário não representa cobertura de todas as combinações possíveis de dados e permissões.

| Verificação executada nesta auditoria | Resultado |
|---|---|
| Serviços completos após aprofundamento, Node 24.19.0, concorrência 2 | 849/849 aprovados; zero falhas, cancelamentos e casos ignorados; 129,84 s |
| Serviços completos antes do aprofundamento, Node 22.23.3, concorrência 1 | 840/840 aprovados; zero falhas, cancelamentos e casos ignorados; 233,20 s |
| Suítes aprofundadas de painel e programação, Node 22.23.3 | 44/44 serviços e 7/7 navegador; novos casos incluídos nesses totais |
| Navegador completo após aprofundamento, Chromium e Node 22.23.3 | 132/132 aprovados; zero falhas, cancelamentos e casos ignorados; 283,50 s |
| Inspeção complementar de telas, Chromium e Node 22.23.3 | 83 telas/estados em 1280, 390 e 320 px; 249 observações |
| Conferência complementar de pontos visuais | 4 telas em três larguras; capturas de conversa, integração, marca e página de apresentação |
| Prévia da página de apresentação | Botão “Ver prévia” abriu `/qa-global?previa=1`, com o título esperado e sem alerta, em ambiente local |
| Barreiras HTTP, em ambiente local | 263 pedidos anônimos regulares; nenhum retorno 500; leituras públicas limitadas às rotas esperadas |
| Robustez HTTP com entradas malformadas | Falhas reproduzidas, inclusive no Node 22; detalhes abaixo |
| Sintaxe de JavaScript e módulos | 213 arquivos conferidos, sem erro; inclui os roteiros acrescentados |
| Importações do frontend | Nenhum módulo local referenciado ausente |
| Dependências instaladas | Compatíveis com o manifesto; `npm audit --omit=dev`: zero vulnerabilidades conhecidas reportadas |
| Cobertura instrumentada de serviços | 95,72% das linhas, 84,22% dos ramos e 91,18% das funções dos arquivos de servidor incluídos |

O Node 22 valida a família de runtime usada no Dockerfile; a versão exata de patch do processo produtivo não foi consultada. A cobertura instrumentada é do servidor, sem instrumentação do JavaScript executado no navegador. Ela não mede qualidade de resposta de IA, entendimento humano ou cobertura funcional total.

Os [981 casos executados](global-20261010/casos-executados.md), o [inventário de rotas e arquivos de teste](global-20261010/inventario.json), as [medidas por tela](global-20261010/telas.json), os [resultados HTTP](global-20261010/rotas.json) e o [relatório de cobertura](global-20261010/cobertura-servidor.txt) acompanham este documento. Os dados, contas, conectores e respostas utilizados nos testes são fictícios.

## Matriz de funcionalidades

“Local aprovado” significa que os cenários existentes foram executados e aprovados. As ressalvas de interface aplicam-se também às telas dos módulos abaixo. “Externo pendente” identifica o efeito real que as simulações não certificam.

| Funcionalidade | O que foi conferido | Evidência principal | Situação |
|---|---|---|---|
| Página comercial e contato | Apresentação, demonstração, formulário, planos e consistência das afirmações | `lp-demo`, `lp-operacoes`, `claims-lp`, `contatos`, `vendas` | Local aprovado; entrega real de email pendente |
| Encontrar ambiente e entrada | Endereço da empresa, código, reenvio, expiração, restrições e falha de email | `encontrar`, `login`, `email-falhas`, `smtp-plataforma`, `ux` | Local aprovado; sessão produtiva pendente |
| Política, ciência e documentos legais | Ciência por versão, apresentação e restrição de uso | `legais`, `politica`, `governanca`, `claims-textos-internos` | Comportamento local aprovado; não constitui aprovação jurídica |
| Primeiros passos, ajuda e navegação | Jornada por perfil, guia, paleta, menus, foco, diálogos e recuperação | `onboarding-conhecimento`, `ajude-comecar`, `lateral`, `interface-uniformidade`, `ux` | Local aprovado; cabeçalho móvel pendente |
| Conversa cotidiana | Níveis, envio, streaming, repetição, anexos e continuação | `chat`, `fluxo`, `pools-modelos`, `roteamento` | Local aprovado; IA real pendente |
| Histórico de conversas | Busca, paginação, renomeação, exportação, exclusão e retomada | `conversas-historico`, `csv-conversas`, `logout-cache` | Local aprovado |
| Anexos e OCR | Imagem, PDF escaneado, rotação, DOCX, XLSX, PPTX, CSV, limites e falhas | `auditoria`, `ocr-legibilidade`, `ocr-protecao`, `limites-upload`, `planilha` | Local aprovado, com fixtures sintéticas |
| Biblioteca de conhecimento | Conhecimento comum e por área, filtros, envio, substituição, revisão e responsáveis | `bases`, `fontes`, `onboarding-conhecimento`, `governanca-conhecimento` | Local aprovado |
| Criação de Quick Win | Objetivo, etapas, regras, fontes, colunas, salvamento e retomada | `quickwin-construtor`, `quickwins-v2`, `quickwin2`, `jornadas-leigas`, `ux` | Local aprovado; interpretação com IA real pendente |
| Biblioteca e modelos de Quick Win | Modelos iniciais, acesso por área, nome, duplicação, arquivo e exclusão | `quickwins`, `quickwin-nome`, `quickwin-operacao`, `quickwin-generalista` | Local aprovado |
| Teste, conferência e publicação | Resultado aprovado, parcial e inconsistente; ciência; publicação e versão | `quickwin-teste-autonomia`, `quickwin-qa-final`, `quickwin2`, `quickwin-resultado` | Local aprovado; teste produtivo autenticado pendente |
| Execução e resultados por entrega | Uso repetido, lacunas, tabelas, múltiplas entregas e exportações | `quickwin-operacao`, `quickwin-resultado`, `resultado-orientacao` | Local aprovado; IA e canais reais pendentes |
| Refinamento guiado | Caso escolhido, diagnóstico, orientação de mudança, materiais e novo teste | `quickwin-refinamento`, `qw-preparacao`, `pesquisa-orientacao`, `jornadas-leigas` | Local aprovado; resposta real e compreensão humana pendentes |
| Pesquisa na internet | Necessidade declarada, permissão, fonte, limite e link para ajuste autorizado | `quickwin-pesquisa-externa`, `pesquisa-orientacao`, `fontes-quickwin` | Local aprovado; pesquisa externa real pendente |
| Agendamento | Frequência, fuso, fila, pausa, limite, idempotência e andamento | `qw-programacao`, `qw-programacao` no navegador | Local aprovado; disparo e entrega reais pendentes |
| Painéis padronizados | Escolha de processo, revisão, confirmação, privacidade, indicadores e mês | `paineis`, `paineis-tenants`, `paineis` no navegador | Local aprovado; extração real e entendimento humano pendentes |
| Histórico dos painéis | Correção com motivo/versão, retirada, paginação e retenção por conversa | Mesmos testes de painéis; inspeção das telas de registro e histórico | Local aprovado; política de retenção precisa de aceite operacional |
| Produção visual | Peças, gráficos, diagramas, miniaturas, versões, PDF/PNG/PPTX e visualizador | `producao-visual`, `visual-*`, `producao-visual-tenants` | Local aprovado; cobertura complementar do motor pendente |
| Preparar integração | Descoberta, autenticação, operações, teste, aprovação e publicação | `integracoes`, `integracoes-motor`, `integracoes-generalizacao` | Local aprovado; campos e cabeçalho pendentes; configuração externa pendente |
| Executar integração | Só leitura, escrita aprovada, idempotência, falha, repetição, esquema e revogação | `integracoes-motor`, `integracoes-seguranca`, `integracoes-tenants` | Local aprovado; serviços reais pendentes |
| OAuth e webhooks | Estado, segredo, assinatura, escopo, isolamento e transições | `integracoes-seguranca`, `integracoes-motor`, `integracoes-tenants` | Local aprovado; homologação externa e cobertura complementar pendentes |
| Governança e sigilo | Dado permitido, bloqueado ou não guardado; contexto reforçado; segredo em texto/imagem | `governanca-*`, `sigilo-*`, `credenciais-contexto`, `claims-evidencias` | Local aprovado |
| Modelos e roteamento | Classes, conjuntos, reservas, seleção, homologação, custo e provedor oculto | `modelos-admin`, `pools-modelos`, `roteamento-*`, `provedor-oculto` | Local aprovado; fornecedores reais pendentes |
| Uso, créditos e planos | Consumo, testes, reserva, limite rígido, capacidade, projeção e margem | `consumo`, `custo-ia`, `plano`, `modelo-economico`, `planos-console` | Local aprovado; não houve transação financeira real |
| Pendências e preparação | Central acionável, destino do problema, preparação e revisão de acessos | `acompanhamento`, `qw-preparacao`, `jornadas-leigas` | Local aprovado; cobertura complementar de decisões pendente |
| Pessoas, áreas, grupos e perfis | Gestão por permissão, isolamento, último admin e revogação | `pessoas`, `areas`, `admin`, `multiempresa`, `acesso-greenia` | Local aprovado |
| Marca, página e endereço da empresa | Imagem, cor, editor, publicação, prévia, slug e domínio | `marca-branca`, `landing-modelo`, `multiempresa-extra`, inspeção complementar | Local aprovado; UX e rótulos pendentes; domínio/DNS real pendente |
| Console da operação | Empresas, ambientes, usuários, planos, auditoria, configuração e encerramento | `multiempresa-*`, `operador`, `planos-console`, `encerramento`, inspeção complementar | Local aprovado; operações produtivas sensíveis não executadas |
| Dados e recuperação | SQLite, migração, cópia, restauração, retenção, hold, exportação e eliminação | `backup`, `retencao`, `auditoria-retencao`, `auditoria-tenants`, `exportacoes` | Local aprovado; recuperação real de desastre pendente |
| Transporte, segurança e cache | Sessão, CSRF, origem, CSP, autorização, recursos, cache e retorno após sair | `seguranca`, `login`, `logout-cache`, barreiras HTTP | Local aprovado; entradas malformadas pendentes |

## Falhas confirmadas

### QA-G01 — cabeçalho móvel perde legibilidade

**Prioridade alta para UX.** Na conversa nova em 320 px, o título ocupa apenas 15 px de largura e cerca de 281 px de altura, praticamente uma letra por linha. No detalhe de uma integração em 390 px, o título ficou com aproximadamente 2 px de largura e 351 px de altura. Também ocorre em configuração de Quick Win, preparação, perfis, marca e página de apresentação. Os novos painéis têm tratamento próprio de cabeçalho; isso não uniformiza o restante do aplicativo.

O usuário perde a referência da tela e uma parte importante da área útil. A ausência de rolagem horizontal não detecta esse defeito: o texto permanece “contido”, mas ilegível. Foi confirmado por medidas e inspeção local de capturas de conversa e integração. A versão pública inclui somente as medições, sem as capturas ou textos completos das telas.

Correção indicada: reservar espaço adequado ao título e distribuir as ações de ajuda, guia e saída em outra linha nas telas estreitas, com regra compartilhada pelo aplicativo. Aceite: títulos legíveis, palavras preservadas e controles utilizáveis em 320, 360 e 390 px, incluindo títulos longos e ações adicionais. A regressão deve medir o espaço efetivamente disponível ao título.

### QA-G02 — campos sem identificação suficiente

**Prioridade média, obrigatória para aceite de acessibilidade.** Os seletores de cor principal e secundária no editor de marca não têm nome acessível. No editor da página de apresentação, seletores de estilo dos botões aparecem como `combobox` sem nome; campos repetidos dependem de placeholders e do contexto visual. O seletor de método na documentação manual de integração também carece de rótulo associado.

O mesmo editor é reutilizado no console operacional. As árvores de acessibilidade da marca e da página, examinadas localmente, confirmam os controles sem nome. Os textos integrais dessas árvores e as capturas não acompanham a versão pública; suas contagens estão nas medições por tela.

Correção indicada: rótulos persistentes associados a cada campo e nomes que identifiquem item, função e posição nos grupos repetidos. Aceite: navegar por teclado e leitor de tela, distinguindo cada campo e botão, inclusive depois de preencher e expandir as seções. Não basta retirar placeholders ou dar o mesmo nome a todos os campos.

### QA-G03 — áreas de toque pequenas em ações importantes

**Prioridade média para UX.** O interruptor “Dados sigilosos” da conversa tem aproximadamente 34 × 20 px em celular, e os novos links “Conferir dados para o acompanhamento” e “Acompanhar resultados” têm cerca de 17 px de altura. Outros controles de revelação de conteúdo também ficam pequenos.

A medição identifica a caixa do controle; não presume que todos os links de texto violem uma norma de acessibilidade. Para o público do produto, controles importantes devem oferecer uma área de interação confortável e espaçamento suficiente.

Correção indicada: ampliar a área clicável das ações prioritárias e do interruptor sem aumentar excessivamente a fonte. Aceite: conferir a área realmente clicável e a operação por toque, teclado e zoom, preservando a confirmação e as permissões atuais.

### QA-G04 — entrada malformada vira erro interno

**Prioridade média técnica.** `GET /api/saude` com `Cookie: teste=%` retorna 500 em instalação única e multiempresa. `GET /api/quick-wins/%` também retorna 500 na instalação única. A reprodução confirmou o comportamento no Node 22. O servidor continua disponível, e a resposta não expõe pilha ou conteúdo privado; o pedido específico falha indevidamente.

A causa é a decodificação de percentuais inválidos em `lerCookies` e nos parâmetros do roteador, em `src/http.js`. Um cookie corrompido pode impedir aquele navegador de abrir o ambiente até ser removido.

Correção indicada: tratar falha de decodificação de forma controlada, com resposta apropriada à entrada inválida, mantendo a recusa de sessão inválida. Aceite: testar cookie estranho inválido, cookie de sessão inválido, parâmetro inválido e cookie válido; nenhuma entrada malformada deve produzir 500 por essa causa.

### QA-G05 — ainda existem caminhos técnicos sem exercício completo

**Pendência de cobertura, não falha funcional demonstrada.** A cobertura de ramos é 84,22%. A medição aponta oportunidades específicas em inicialização, acompanhamento, OAuth, visão geral e partes do motor visual. Exemplos de cobertura de linhas: inicialização 51,14%, gráficos 62,07%, WebP 64,58%, acompanhamento 74,71%. OAuth teve 41,67% dos ramos exercitados nessa suíte.

Aceite indicado: acrescentar cenários relevantes para decisões e recuperações ainda não exercitadas, sobretudo efeitos externos, inicialização e composição visual. Não criar testes que apenas espelhem a implementação para elevar percentuais. Os testes de navegador complementam alguns caminhos, mas não foram incluídos nessa medição de cobertura de código.

## Produção e limites do aceite

A inspeção de produção foi limitada a acesso público e não certifica jornadas autenticadas. Identificadores de infraestrutura, métricas e detalhes operacionais não acompanham a versão pública deste relatório.

Continuam pendentes:

1. Executar as jornadas dentro do ambiente produtivo correto, com sessão autenticada e perfis representativos. O navegador disponível estava sem sessão; nenhum acesso foi criado para contornar isso.
2. Validar interpretações, refinamento, pesquisa, conferência, produção visual e extração para painéis com provedores reais. As respostas locais são simuladas.
3. Homologar conectores efetivamente contratados, OAuth, webhooks, domínio/DNS, disparo por relógio real e entrega de email. Os efeitos externos foram simulados.
4. Avaliar entendimento e execução com usuários leigos e não nativos digitais, além do uso de leitor de tela. Esta auditoria fez inspeção especializada e testes automatizados, sem participantes reais.
5. Concluir as correções QA-G01 a QA-G04 e suas regressões. QA-G05 orienta a ampliação de evidências técnicas.

Nos painéis, os registros seguem a retenção da conversa de origem. Excluir ou expirar a conversa remove esses registros; a série mensal reflete os estados atuais atribuídos ao mês da primeira confirmação. Não há deduplicação automática entre execuções diferentes do mesmo caso. Esses limites estão explicados no produto, mas precisam ser compreendidos e aceitos na operação. Painel do resultado, histórico consolidado e integração contínua permanecem entregas distintas; personalizações e integrações específicas exigem escopo e manutenção próprios.

## Reprodução e rastreabilidade

Os roteiros adicionais são `scripts/qa-telas-global.mjs` e `scripts/qa-rotas-global.mjs`. Ambos criam ambientes locais fictícios, com email e IA simulados. O primeiro aceita `QA_FILTRO` para conferir destinos específicos e grava medidas, capturas e árvore de acessibilidade. O segundo registra o inventário literal, as barreiras anônimas e entradas HTTP malformadas. Não devem ser usados como roteiro de mutação de produção.

Na primeira inspeção, a fixture de agendamento tinha status de uso sem uma versão publicada. Foi ajustada para representar um Quick Win publicado; a falsa falha de abertura não foi classificada como defeito do produto. Esperar rede inteiramente ociosa também gerou timeouts no login do console, embora o formulário estivesse pronto: a inspeção passou a conferir o estado renderizado e registrar atividade de rede separadamente. Controles em seções fechadas foram excluídos da medição de visibilidade.

A primeira rodada instrumentada de Node 22 encontrou um nome de operadora nos novos roteiros de QA, recusado pelo teste de generalidade. As contas fictícias dos roteiros foram corrigidas, sem alterar a regra; a bateria completa final do Node 22 aprovou todos os 840 testes. A medição de cobertura acima vem da rodada instrumentada, sobre o mesmo código de servidor.

**O alcance amplo desta auditoria não equivale a “100% aprovado”.** A liberação integral depende das correções reproduzidas e dos aceites produtivos e humanos identificados neste documento.

A repetição global de serviços em Node 22 durante o aprofundamento terminou sem rodapé final de contagem e não foi considerada aprovada, apesar do retorno do processo. O resultado global válido após acrescentar os casos é 849/849 em Node 24, complementado por 44/44 nas suítes afetadas em Node 22. Uma primeira tentativa dos novos testes de navegador teve um seletor de QA incorreto; ele foi corrigido para o nome acessível da região e a suíte passou integralmente.
