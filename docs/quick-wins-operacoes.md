# Quick Wins como operações executáveis

Este documento registra:
- a investigação feita antes de alterar o código: mapa da arquitetura e causa raiz de cada problema;
- o desenho adotado para a evolução.

Os Quick Wins 2.0 (`docs/quick-wins-2.md`) continuam valendo. O que está aqui se soma a eles.

## 1. Mapa da arquitetura (antes desta evolução)

| Assunto | Onde está | Como funciona |
|---|---|---|
| Schema | `src/db.js` (`quick_wins`, `quick_win_versoes`, `quick_win_areas`, migração 12) | Uma linha por Quick Win por banco de empresa. A especificação (JSON) fica em `quick_wins.especificacao` e as versões publicadas em `quick_win_versoes`. |
| Wizard | `public/quickwin2.js` | São 5 etapas: Objetivo, Processo, Regras, Resultado e Testar. O estado `W` fica só na memória da tela. Nada é gravado até sair da etapa Resultado: `salvar` faz POST ou PUT com `assistente`. |
| Persistência do contexto | `src/quickwin-construtor.js` → `construir` | As respostas viram a especificação. O texto do Processo vira `contexto`, com até 600 caracteres, e `procedimento`. |
| Teste × produção | `src/conversas.js` → `enviarMensagem` | O caminho é o mesmo. `conversas.teste = 1` só tira o uso da medição, e o teste usa o rascunho (`efetivo`). |
| Endpoints | `src/quickwins.js` | `/api/quick-wins` (CRUD, publicar, versões, arquivos, uso) e `/api/quick-wins/assistente/*` (sugerir, estrutura, exemplo, entrada-teste). |
| Engine de IA | `src/ia.js` (OpenRouter) e `conversas.js` | Uma chamada de execução, a conferência de qualidade (JSON) e no máximo uma correção. |
| Ferramentas | — | Nenhuma. `ferramentas_permitidas` é sempre `[]`, e o prompt diz "Você não tem ferramentas nem acesso a sistemas externos". |
| Conhecimento | `src/bases.js` e `quickwins.js` → `contexto` | Busca FTS nas bases da área ou escolhidas e nos arquivos do Quick Win. A consulta é **só o texto da mensagem atual**. |
| Arquivos e multimodal | `src/texto.js` e `src/ocr.js` | O texto é extraído de PDF, Office e imagem (OCR). Não há geração de imagem nem de vídeo. |
| Permissões | `quickwins.js` → `podeGerir` e `permissoesQw`; `src/plataforma/rbac.js` | Admin, responsável da área ou quem criou. |
| Multiempresa | `src/plataforma/*` | Um banco SQLite por empresa. Uma empresa não enxerga as linhas da outra. |
| Auditoria | `src/eventos.js` (tabela `eventos`, sem conteúdo) | Eventos `quickwin.*` e `conversation.*`. |
| Jobs | `src/retencao.js` e rodadas horárias | Não há job de Quick Win. A execução é síncrona, por streaming. |
| Edição | `#/qw/:id/ajustar` (wizard) e `#/qw/:id/configurar` (formulário antigo) | — |
| Globais × por empresa | `modelos-quick-win.json` | São modelos iniciais da instalação, iguais para todas as empresas, lidos do arquivo. Não existe Quick Win global no banco. |
| "Exemplo pronto" | `quickwin-construtor.js` → `ENTRADAS` e `/assistente/entrada-teste` | Há um texto fixo por tipo de trabalho, quase sempre de manutenção industrial (esteiras, rolamentos). |

## 2. Causas raiz

1. **"Executa só com o último campo" e "ignora o contexto da empresa".**
   - `quickwins.contexto(pessoa, qw, texto)` busca nas bases usando só o `texto` da mensagem atual.
   - Num teste, esse texto é o exemplo fixo (esteiras) ou "Faça o trabalho com o arquivo anexado." O documento "Sobre a empresa" nunca é encontrado, porque o objetivo e o contexto do Quick Win não entram na consulta.
   - O Processo é cortado em 600 caracteres e as respostas de contexto não têm onde ficar.
2. **Não pesquisa de verdade.**
   - Não existe nenhuma ferramenta, e o prompt proíbe expressamente o acesso externo.
   - Um pedido como "pesquise temas em alta" é respondido com o conhecimento do modelo: é uma pesquisa simulada, sem fontes.
3. **Não entende canais nem vários entregáveis.**
   - O contrato tem um formato só: resumo, lista, tabela, relatório ou outro.
   - "Copy para LinkedIn, legenda para Instagram e roteiro de Reels" vira formato "outro", com uma frase livre. Não há lista de entregáveis, adaptação por canal nem conferência de que cada peça veio.
   - Não há tipo de trabalho de conteúdo: o pedido cai em "Outro" ou em "Responder clientes" (pela palavra *mensagem*).
4. **"Exemplo pronto" sem relação com o Quick Win.**
   - `entradaDeTeste(arquetipo)` devolve um texto fixo do tipo de trabalho, que ignora o objetivo, os canais e os entregáveis.
   - Para um Quick Win de conteúdo, o teste mostra esteiras transportadoras.
5. **Sem perguntas de contexto na criação.**
   - O wizard não detecta o que falta: empresa ou marca, público, tom.
   - A execução só pergunta quando falta material. Quando falta contexto, ela inventa ou responde de forma genérica.
6. **Exclusão destrutiva.**
   - `DELETE /api/quick-wins/:id` faz um `delete` físico.
   - Por `on delete cascade`, medições, decisões, versões e arquivos somem junto. As conversas ficam com `quick_win_id = null` e perdem o vínculo.
   - Na tela, a exclusão é feita com `confirm()` nativo.
   - Quem vê o Quick Win sem poder gerir recebe 404, e não 403.
7. **Modelos iniciais não podem ser ocultados por empresa.** O arquivo é igual para todas as empresas.
8. **Resultado sem separação.** A resposta é um bloco de Markdown, sem separação por canal ou entregável, sem fontes da pesquisa e sem "Responder e continuar" quando a IA pergunta.

## 3. Desenho adotado (incremental, sem refactor amplo)

### Operação na especificação (`src/quickwin-operacao.js`)

A especificação ganha o campo opcional `operacao`. A versão da especificação não muda: especificações antigas, sem o campo, continuam idênticas.

```
operacao: {
  canais: ['linkedin', 'instagram', ...],
  entregaveis: [{ id, tipo, canal, config }],
  ferramentas: ['pesquisa_web'],
  contexto_respostas: [{ id, pergunta, resposta }],
  origem: 'inferida' | 'pessoa'
}
```

- A inferência é determinística, a partir do objetivo e do processo, como a do tipo de trabalho. A pessoa confirma ou ajusta.
- `ferramentas_permitidas` passa a aceitar só ids do catálogo `FERRAMENTAS` (hoje, `pesquisa_web`). Os ids fora dele são descartados.
- As lacunas de contexto são perguntas mínimas: empresa ou marca, público e tom. Elas aparecem só quando o tipo de trabalho pede, e só se a resposta não estiver no objetivo, no processo nem nas bases autorizadas da empresa.
- O exemplo pronto é contextual e fictício, montado a partir do objetivo, dos canais e dos entregáveis, sempre com o aviso: "Exemplo fictício gerado para testar este Quick Win. Nenhum dado real é usado."
  - Quando o trabalho depende de um arquivo, o exemplo orienta a enviar um arquivo.
  - Quando não há contexto suficiente, aparece a mensagem de fallback.

### Execução: mesma engine nos dois modos

A execução continua sendo `enviarMensagem`, que corresponde a `executeQuickWin(definition, input, context, mode)`. O modo teste:
- usa o rascunho;
- não entra na medição;
- não publica nada.

O sistema não tem efeitos irreversíveis: nenhuma ação externa é executada, nem em produção.

Pipeline (entre colchetes, o que esta evolução acrescenta):

1. entrada;
2. limites e ciência da política;
3. filtro de dados e credenciais;
4. contexto autorizado [consulta = objetivo + contexto do Quick Win + mensagem];
5. sigilo e área reforçada;
6. análise e roteamento;
7. conferência das credenciais em cada parte do envio;
8. [planejamento: o prompt diz o que será entregue, por canal];
9. [decisão da ferramenta: pesquisa liberada, permitida pelo Quick Win e segura para o conteúdo];
10. conferência final do recurso;
11. defesa final de credenciais;
12. execução por streaming, [com pesquisa real e fontes guardadas];
13. [conferência dos entregáveis e da pesquisa];
14. Quality Check com correção;
15. gravação da resposta, do uso, do roteamento e dos eventos;
16. [estado da execução: aprovado, parcial, inconsistente ou pergunta (pausada)].

### Pesquisa web real

- É feita pelo plugin `web` do OpenRouter (`plugins: [{ id: 'web' }]`). As citações (`annotations` do tipo `url_citation`) são guardadas como fontes da resposta.
- Ela só roda quando todas as condições abaixo valem ao mesmo tempo:
  - a empresa ligou "Pesquisa na internet" (`pesquisaWeb.ativa`, que vem desligada);
  - o Quick Win tem `pesquisa_web` nas ferramentas;
  - a conversa não é sigilosa;
  - a área não pede proteção reforçada;
  - a mensagem não tem dado que a política manda proteger.
- Quando a pesquisa é pedida e não pode rodar, o resultado é **parcial**, nunca aprovado, e diz o motivo. Não existe pesquisa simulada.
- A conferência de qualidade nunca usa a ferramenta.

### Arte final × briefing

Entregável com `visual` (apresentação, peça, carrossel, infográfico, one-page...) sai como artefato pronto pela
produção visual (`docs/producao-visual.md`). Sem `visual` (Quick Wins anteriores) e em vídeo e Reels, a peça
continua saindo como briefing ou roteiro, com o rótulo "Briefing (a arte final não é gerada aqui)".

### Pausar e retomar

Quando falta um contexto essencial, a execução responde com o marcador de pergunta e fica no estado `pergunta`. A resposta da pessoa, enviada na mesma conversa, continua a mesma execução (o comportamento que já existia). A tela de teste ganhou "Responder e continuar". O evento `quickwin.context_requested` registra a pausa.

### Exclusão (soft delete)

- A migração 13 acrescenta `quick_wins.excluido_em` e `quick_wins.excluido_por`. Só acrescenta, então é compatível com o código anterior.
- `DELETE /api/quick-wins/:id` marca a exclusão e mantém versões, medições, decisões, arquivos, conversas e eventos.
- O Quick Win excluído:
  - some do catálogo, das listas, do portfólio e do limite do plano;
  - não pode ser usado numa nova conversa;
  - mantém uma execução em andamento até o fim;
  - mantém as conversas existentes legíveis e com o nome do Quick Win.
- Modelo inicial (global): `POST /api/quick-wins/modelos-iniciais/:i/ocultar` oculta o modelo só nesta empresa (`config.modelosOcultos`). O arquivo não muda e as outras empresas não são afetadas.
- Permissão: gerenciar o Quick Win. Quem só vê recebe 403 e não vê a ação; quem não vê recebe 404.
- A tela usa um modal próprio, que exige digitar o nome.

### Auditoria

A auditoria usa o prefixo `quickwin.*`, já adotado por ela. Os nomes da especificação (`quick_win.*`) correspondem a estes:

| Especificação | Evento |
|---|---|
| quick_win.created | `quickwin.created` |
| quick_win.updated | `quickwin.updated` |
| quick_win.tested | `quickwin.tested` |
| quick_win.executed | `quickwin.executed` |
| quick_win.deleted | `quickwin.deleted` |
| quick_win.hidden | `quickwin.hidden` |
| quick_win.context_requested | `quickwin.context_requested` |
| quick_win.tool_used | `quickwin.tool_used` |

Os eventos guardam só metadados (ids, contagens, estado), nunca conteúdo.

### Observabilidade

Cada execução tem uma linha em `roteamento`, que é o *run*. `roteamento.qualidade` ganha:
- `entregaveis`: esperados e encontrados;
- `pesquisa`: exigida, feita, número de fontes e motivo.

Nada disso guarda conteúdo.

## 4. Arquitetura generalista: qualquer trabalho vira uma operação

A versão anterior só estruturava entregáveis quando o pedido citava canais ou peças de marketing
(`inferirOperacao`). Sem isso, o Quick Win caía no formato único (resumo, lista, tabela ou relatório) escolhido por
palavra-chave do tipo de trabalho. Contratos, propostas, planilhas e reuniões ficavam com um relatório genérico.

### Causa raiz
- Criação 100% determinística por palavra-chave: entregáveis só com canal ou com 2+ peças do catálogo de marketing.
- Lacunas só para trabalho com canal (`lacunasDeContexto`).
- Prompt e exemplo de teste pensados para conteúdo ("este trabalho não precisa de material").
- Wizard binário: "peças por canal" ou "formato único". Resultado separado só por título com canal (" · ").

### Modelo de operação (`espec.operacao`, v: 2)
| Campo | O que é |
|---|---|
| `resumo` | o que o Quick Win faz, numa frase |
| `entradas[]` | material de cada execução: `tipo` (documento, planilha, transcricao, texto, imagem, audio, dados), `rotulo`, `quantidade`, `obrigatoria` |
| `etapas[]` | como fazer, em ordem, com `ferramenta` opcional; viram o "Como fazer" do prompt |
| `entregaveis[]` | `tipo` (catálogo amplo: resumo, lista, tabela, matriz, analise, riscos, recomendacao, plano_acao, checklist, ata, relatorio, copy, legenda, carrossel, reels, imagem...), `rotulo` semântico livre, `descricao`, `depende_de`, `config` (slides, duração, colunas) e `canal` opcional |
| `ferramentas[]` | pesquisa_web (executável, governada), base_empresa, leitura_documento, analise_planilha, geracao_imagem (indisponível: entrega o briefing) |
| `criterios[]` | critérios de qualidade do plano (entram na conferência) |
| `lacunas[]` | perguntas mínimas que mudam o resultado (`obrigatoria` quando sem a resposta não dá para fazer) |
| `sugestoes[]` | itens úteis não pedidos; só entram se a pessoa incluir |
| `contexto_empresa`, `categoria` | se depende da empresa; a categoria só organiza (não muda o motor) |

Canal é só um metadado do entregável. O `formato_saida` é derivado do plano: vários entregáveis viram seções
obrigatórias (conferidas pelo código); um só, de formato simples, é o contrato daquele formato (tabela continua
com colunas e as mesmas conferências).

### Interpretação (`src/quickwin-interpretacao.js`)
- `POST /api/quick-wins/assistente/interpretar`: uma chamada pela governança da criação (`chamarGovernado`, finalidade
  `quick_win_interpretacao`, decisão e consumo registrados), cacheada por pedido.
- A resposta é validada contra o catálogo (`limparOperacao`): ids renumerados com dependências, textos limpos e
  limitados, tipos e ferramentas desconhecidos descartados, credencial derruba o plano. Canal citado no pedido e
  ausente nas peças é recuperado da leitura determinística (`garantirCanais`).
- Sem IA usável (dados protegidos, sigilo, reserva do plano, falha, resposta ilegível): `planoHeuristico`, com o
  comportamento anterior de formato e peças e com entradas, etapas e ferramentas explícitas. Nunca trava.

### Execução
- Prompt: material do trabalho (obrigatório pede antes de inventar), entregáveis com "O que é" e "Feito a partir de",
  critérios do plano, ferramenta indisponível com a alternativa, regra de perguntas (usar o que existe; perguntar só
  quando impossível).
- Em etapas quando há pesquisa liberada: 1) coleta (plugin web, notas com fonte); 2) produção a partir das notas, sem
  nova pesquisa. As notas entram na conferência de qualidade. Coleta sem notas: a produção pesquisa sozinha.
- Trabalho que depende da empresa: a consulta às bases também procura o que descreve a empresa.
- Exemplo pronto pelo tipo de entrada (contrato, propostas, planilha, transcrição fictícios), marcado como material
  de teste fictício.

### UX
- Depois do objetivo: "Entendi que este Quick Win vai fazer" (objetivo, vai precisar de, vai fazer, vai entregar,
  vai usar), com confirmar, editar materiais e etapas, responder lacunas e incluir sugestões.
- Etapa Resultado: editor universal de entregáveis (título, tipo, configuração; canais recolhidos quando não há).
- Resultado: um cartão por entregável (agrupado por canal só quando há canal), tabelas com CSV por cartão.
- Quick Win antigo: na edição, a estrutura aparece como sugestão ("Usar esta estrutura"). Sem especificação (v1):
  "Atualizar para Quick Win inteligente"; quem usa continua no comportamento antigo até a primeira publicação
  (`origem.atualizado_de = 'v1'`), sem mudar formato, modelo ou troca da configuração antiga.

## 5. Homologação final: autonomia, invariantes e cálculos conferidos

### Política de autonomia (perguntas)
- Prompt de execução (v2): só é motivo para perguntar o que for NECESSÁRIO (material obrigatório que não veio, ou
  informação indispensável impossível de inferir). Preferência (estilo, detalhe, ordem, desempate, custo total ou
  valor, tema, foco, tom, público, o que a pesquisa descobre, escolhas reversíveis) vira escolha registrada na seção
  "## Escolhas feitas".
- Execução que volta só com perguntas: uma reavaliação pela mesma rota (`PEDIDO_AUTONOMIA`). Uma segunda, final, só
  quando a estrutura do plano garante que nada indispensável falta: sem material obrigatório e com o contexto da
  empresa no envio (`PEDIDO_AUTONOMIA_FINAL`). Material obrigatório ausente continua bloqueando. Evento
  `quickwin.autonomy_checked` (só metadados: resultado e número de reavaliações).
- Interpretação: lacuna `obrigatoria` só quando sem a resposta não dá para fazer e ela não pode ser inferida,
  pesquisada nem escolhida.

### Invariantes do pedido (`garantirInvariantes`)
Extraídas só da linguagem do pedido (nenhum setor): quantidade ("três fornecedores" → 3), critérios depois de
"considerando…" (viram colunas da tabela/matriz ou critério), objetos de verbos de entrega ("destaque riscos e
obrigações", "transforme em ata, decisões e próximos passos"), comparação estruturada (verbo "comparar" com
critérios) e necessidade de pesquisa. O servidor só acrescenta o que faltar; o resto do plano da IA fica.

### Planilhas (`src/planilha.js`)
A partir de 10 linhas de dados, o texto extraído de XLSX/CSV leva "Cálculos conferidos pela GreenIA" sobre todas
as linhas: totais, médias, mínimo e máximo (com a linha), vazios, valores fora do padrão (3 IQR), maiores variações
entre as duas primeiras colunas numéricas e somas por categoria (variação só nas linhas com os dois valores).
Motivo: na homologação real os desvios por linha vinham certos e os totais por categoria vinham errados.

### CSV
Proteção contra fórmula sem corromper número negativo ("-10,9%" continua "-10,9%").
