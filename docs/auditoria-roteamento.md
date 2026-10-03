# Auditoria técnica do roteamento de modelos

Data: 28/09/2026. Escopo: `src/roteador.js`, o passo 3 de `POST /api/conversas/:id/mensagens` em `src/conversas.js`, `src/modelos.js` (seletor, configuração, indicadores), `src/ia.js` (execução), o registro `roteamento` e as telas que mostram a decisão.

Evidência reproduzível:
- `node scripts/matriz-roteamento.js` gera `docs/roteamento-matriz.md`, com 16 casos × 3 preferências, 6 variações de governança e a ablação de sinais.
- `test/roteamento-matriz.test.js` confere as garantias sobre a mesma matriz.
- `test/roteamento.test.js` confere o fluxo HTTP completo.

A auditoria começou pela versão 1.0 (commit `870ad54`). Os testes da época passavam, mas a matriz de casos mostrou decisões erradas. As correções formam a versão 2.0, descrita abaixo. Os novos testes foram rodados também contra a 1.0: 10 dos 11 testes de fluxo falham lá. Eles detectam a diferença de comportamento; não passam por acaso.

## Resposta ao critério principal

**O GreenIA consegue demonstrar, de forma reproduzível, que escolheu o modelo porque analisou a natureza e a complexidade da solicitação, respeitou as restrições da empresa e selecionou o mais adequado entre os permitidos?**

- **Na versão 1.0: não.** A análise existia, mas o volume de contexto inflava a complexidade: um resumo simples de um arquivo grande ia para o Avançado. A insatisfação não reconhecia "não resolveu". O quick win flexível sempre usava a própria classe. Dentro de uma classe, a escolha era só pelo menor custo, e a preferência nunca mudava o modelo. A explicação podia dar a causa errada ao fallback.
- **Na versão 2.0: sim, com as limitações listadas no fim.**
  - **A análise decide.** Cada sinal muda a escolha em pelo menos um caso de referência (teste "nenhum sinal decorativo").
  - **As regras só filtram.** Toda exclusão tem motivo registrado, e o modelo usado nunca tem motivo de governança (teste 9).
  - **A escolha é explicável.** A explicação sai dos mesmos códigos gravados na auditoria (teste 11).
  - **A resposta é "parcial" em dois pontos:**
    - a capacidade de cada modelo ainda é só a classe que o admin atribuiu;
    - a classificação é lexical (palavras-chave em português).

## 1. Fluxo completo

usuário → filtro de dados → contexto (bases e arquivos do quick win) → sigilo → **análise** → **requisitos** → **candidatos com todos os motivos de exclusão** → **seleção por utilidade** → fallback explícito → registro (antes do envio) → execução (com a reserva validada) → atualização do resultado → resposta com a explicação.

| Verificação | 1.0 | 2.0 |
|---|---|---|
| O modelo pedido pela pessoa passa pela análise? | Sim, mas a análise não produzia nenhum efeito além da janela | Sim. A análise roda, é registrada e sinaliza `abaixo_do_necessario_por_escolha`. A escolha da pessoa é respeitada, não sobrescrita |
| O quick win sobrescreve a decisão inteligente? | **Sim.** O quick win que deixa trocar começava sempre na classe dele: o roteamento nunca atuava em quick win | O quick win fixo define a classe (é governança) e a análise é registrada. O flexível entra no Automático, com a classe dele como **piso** (requisito `quick_win`). O responsável conhece a tarefa; o roteador só vê a mensagem |
| O padrão da empresa domina como fallback? | Com o roteamento desligado, a decisão era registrada como "escolhida pela pessoa" (falso) | Registrada como `padrao`, e a explicação diz isso. Com o roteamento ligado, o padrão da classe só pesa como termo da utilidade (peso D: 0 na Economia, 0,7 no Equilíbrio, 0,5 na Qualidade) |
| Permissões e políticas só filtram? | Sim, mas cada candidato tinha um único motivo, e o fallback era atribuído sempre a "permissões" | Cada candidato tem **todos** os motivos. A causa do fallback vem dos motivos que tiraram os modelos capazes: sigilo, reserva, acesso, janela ou nenhum modelo liberado |
| O custo é o único critério? | **Sim**, entre os suficientes | Não. A utilidade soma custo relativo (C), margem de capacidade (Q), modelo padrão curado (D) e janela para o histórico completo (H) |
| A classe corresponde à capacidade necessária? | Parcial: casos H, E e J erravam | Sim nos 16 casos de referência (testes 1 e 2). Nenhum pedido simples vai ao Avançado; nenhum pedido complexo fica abaixo dele sem fallback registrado |
| Contexto, anexos e histórico influenciam? | O volume entrava na complexidade (errado). O histórico inteiro contava como obrigatório. O orçamento do envio usava outra conta (2,4 caracteres por token, contra 3,6 na seleção) | O volume define a janela. Ele só sobe a capacidade quando é análise ou extração sobre muito conteúdo. O histórico é "desejável" (pode ser cortado). O envio usa o mesmo orçamento da seleção (`orcamentoHistorico`) |

## 2. Utilidade de cada sinal

Ablação: cada sinal é desligado, um de cada vez, nas 48 decisões da matriz (16 casos × 3 preferências).

| Sinal | 1.0 | 2.0: decisões que mudam ao desligar |
|---|---|---|
| Tipo de tarefa: análise | Peso 3 somado aos demais | 12 (casos C, D, O, N) |
| Raciocínio | Peso 4, mas sozinho dava só Intermediária. "Proponha uma solução" nem era reconhecido | 6 (I, L); o caso E sobe pelos critérios |
| Programação | Peso 3,5: **sempre** Equilibrado, até para uma função simples. A regra "programação + raciocínio" quase nunca disparava | 3 (P). Não decide sozinho em F nem em G, porque ali outros sinais já definem |
| Precisão (domínio) | +1,5 na pontuação | 7 (C, D, K) |
| Risco (riscos, inconsistências, segurança, concorrência) | Não existia | 4 (C, D) |
| Critérios e etapas | Contava "?" e itens; critérios não eram lidos | 6 (E, I, L) |
| "Simples" explícito | Não existia | 3 (F) |
| Tentativa anterior sem sucesso | Só frases como "errado" ou "refaça"; **"não resolveu" e "não funcionou" passavam** | 3 (J); também conta o feedback "não serviu" e a classe usada antes |
| Documentos e anexos | Anexo sem outro tipo virava "análise" | Idem, mais código em anexo, que vira programação |
| Grande volume | **Subia a classe** (o caso H ia para o Avançado) | 5 (H, N). No caso H muda só a janela, e a classe continua Rápido |

Sinais que eram calculados e não afetavam a decisão na 1.0:

- `varios_anexos` e `pedido_curto` quase nunca mudavam a faixa;
- a regra `programacao_com_raciocinio` era praticamente inalcançável;
- `codigo` na mensagem só contava acima de 800 caracteres.

Na 2.0, o teste "nenhum sinal decorativo" falha se algum sinal parar de mudar pelo menos uma decisão.

## 3. Matriz de cenários

A matriz completa, com classificação, sinais, candidatos, excluídos e motivo, escolhido, motivo da escolha, custo relativo, governança e explicação, está em `docs/roteamento-matriz.md`. Resumo em Equilíbrio (catálogo com dois modelos por classe):

| Caso | Exigência | Escolhido | Por quê |
|---|---|---|---|
| A. Traduza "bom dia" | Rápido | Rápido curto | o de menor consumo entre os que atendem |
| B. Resuma em cinco linhas | Rápido | Rápido curto | o de menor consumo entre os que atendem |
| C. Contrato: riscos jurídicos | Avançado (precisão 3) | Avançado padrão | padrão da classe (Economia escolhe o Avançado mais barato) |
| D. Demonstrações financeiras | Avançado (precisão 3) | Avançado padrão | idem |
| E. Arquitetura multicritério | Avançado (raciocínio 3) | Avançado padrão | idem |
| F. Função Python simples | Rápido | Rápido curto | programação simples |
| G. Código: concorrência e segurança | Avançado (programação 3) | Avançado padrão | código com riscos |
| H. Pedido simples, contexto enorme | Rápido + janela de ~300 mil tokens | Rápido de janela longa | o Rápido curto fica fora por janela |
| I. Complexo, pouco contexto | Avançado (raciocínio 3) | Avançado padrão | raciocínio multicritério |
| J. "Não resolveu" | Equilibrado (anterior Rápido + 1) | Equilibrado | nova tentativa |
| K. Simples com exatidão | Equilibrado (precisão 2) | Equilibrado | exatidão item a item |
| L. Complexo sem domínio | Avançado (raciocínio 3) | Avançado padrão | raciocínio multicritério |
| O. Análise intermediária | Equilibrado | Equilibrado (Qualidade: Avançado) | margem de uma classe na Qualidade |
| P. Correção de código colado | Equilibrado (programação 2) | Equilibrado | programação |
| N. Análise sobre ~236 mil tokens | Avançado (volume 3) | Avançado de janela longa | o único que atende; o Avançado curto fica fora por janela |

## 4. Capacidade × classe

A 2.0 representa a exigência como um **vetor de requisitos**: geral, raciocínio, programação, precisão, volume, nova tentativa e piso do quick win, cada um de 1 a 3, mais a janela mínima e a janela desejada. A classe exigida é o maior valor do vetor. Assim ficam distinguidos:

- **simples + contexto grande:** H, Rápido com janela grande;
- **complexa + contexto pequeno:** I, Avançado com janela pequena;
- **simples + precisão alta:** K, Equilibrado;
- **complexa sem precisão de domínio:** L;
- **raciocínio:** E, I, L;
- **programação:** F (1), P (2), G (3);
- **síntese:** B, M, H;
- **janela grande:** N.

**Limitação que continua:** do lado dos modelos, a capacidade é só `perfil` (a classe atribuída pelo admin), a janela e o preço. Dois modelos da mesma classe são tratados como igualmente capazes em raciocínio, código e leitura longa. A próxima estrutura recomendada é `capacidades` por modelo: raciocínio, programação, leitura longa e modalidades, de 1 a 3, com padrão igual à classe e editáveis pelo admin. O casamento seria dimensão a dimensão, sem mudar o restante do roteador. O cálculo já é feito por dimensão; hoje só o lado do modelo é escalar.

**Multimodal:** não se aplica hoje. Imagem e PDF escaneado são recusados na extração (`src/texto.js`, erro 415) antes do roteamento. Não existe requisito de visão. Quando existir, ele entra como mais uma dimensão, que exige a modalidade no modelo.

## 5. Ordem necessidade → governança → permissões → custo e qualidade

`rotear()` monta os candidatos nesta ordem:

1. capacidade (`capacidade_insuficiente`);
2. sigilo (`nao_homologado`);
3. reserva do plano;
4. sem treino;
5. permissão (`sem_acesso_a_classe`);
6. janela (`contexto_insuficiente`).

Todos os motivos ficam no candidato. A seleção só considera quem não tem motivo nenhum. Nenhuma regra escolhe o modelo: sigilo, plano e acesso mudam **o conjunto**, e a mesma função de utilidade decide. Prova: na variação "sigilosa com homologados no Rápido e no Avançado", o caso C usa o Avançado homologado e o caso A usa o Rápido homologado (teste 6).

O custo não decide sozinho. Mesmo em Economia (C=1, sem outros pesos), a janela para o histórico (H) pode desempatar.

## 6. Economia, Equilíbrio e Qualidade

A exigência mínima **não** depende da preferência: um pedido nunca vai abaixo do que precisa por orçamento. A preferência muda a função de decisão entre os modelos que atendem:

`utilidade = −C·ln(custo ÷ menor custo que atende) + Q·margem + D·[padrão da classe] + H·[cabe todo o histórico]`, onde a margem vale 1 para uma classe acima, −1 para duas ou mais acima, e só existe em tarefa que não é simples.

| Preferência | C | Q | D | H | Efeito observável |
|---|---|---|---|---|---|
| Economia | 1 | 0 | 0 | 0,3 | O mais barato que atende. C, D, E, G, I e L usam o Avançado curto |
| Equilíbrio | 1 | 0,2 | 0,7 | 0,5 | Prefere o padrão curado da classe se ele custa até ~2× o mais barato. C–L usam o Avançado padrão |
| Qualidade | 0,6 | 1,6 | 0,5 | 0,8 | Uma classe de margem em tarefa não simples: J, K, O e P sobem para o Avançado |

Sem justificativa técnica, as três dão o mesmo resultado (A, B, F, H e M), e isso é intencional (teste 7).

**Ressalva:** com o catálogo inicial (um modelo por classe), Economia e Equilíbrio sempre coincidem, porque não há alternativa equivalente para desempatar. A diferença aparece quando a empresa libera mais de um modelo por classe.

## 7. Contexto

A janela exigida é calculada **antes** da execução e decide quem é candidato. Ela considera:

- instruções do sistema;
- documentos das bases e arquivos do quick win;
- mensagem atual e anexos atuais;
- reserva de saída (1,5 × a saída típica do tipo, no mínimo 1.000 tokens);
- o histórico, só como "desejável": o envio corta as mensagens mais antigas.

Resultados de ferramentas não se aplicam: o chat não usa ferramentas.

**Estimativa de tokens.** Há duas razões de caracteres por token: a média, usada para o custo, e a segura, usada para a janela.

| Conteúdo | Razão média | Razão segura | Folga sobre a média |
|---|---|---|---|
| Prosa | 3,6 | 3,0 | 20% |
| Conteúdo denso (mais de 25% de números, símbolos ou código) | 2,8 | 2,2 | 27% |

Além disso, o roteador usa no máximo 90% da janela do modelo.

**Riscos corrigidos:**
- **A seleção e o envio usavam contas diferentes.** Um modelo aprovado podia receber conteúdo maior que a janela, e o erro 413 aparecia depois de a mensagem estar gravada.
- **O histórico inteiro contava como obrigatório.** Isso excluía modelos que atenderiam com corte.

**Risco que continua:** conteúdo muito atípico, como base64, idiomas não latinos ou tabelas só com números, pode passar de 2,2 caracteres por token. Mitigação opcional: usar a contagem real de tokens que o OpenRouter devolve (`usage.prompt_tokens`) para calibrar a razão por empresa.

## 8. Fallbacks

| Fallback | Quando | Por quê | Pode mascarar erro do roteador? | Pode mandar tarefa complexa a modelo fraco? | Pode ignorar política? | Registrado |
|---|---|---|---|---|---|---|
| Mais capaz permitido (`abaixo_do_necessario`) | Nenhum permitido atende | Responder é melhor que bloquear | Não: a exigência e as causas ficam gravadas | Sim, **visivelmente**, e só pelas causas registradas | Não: o modelo usado não tem motivo de governança (teste 9) | Coluna `fallback` com as causas, explicação e indicador "Abaixo do necessário" |
| Escolha manual abaixo do necessário | A pessoa ou o quick win fixo escolhe menos | É decisão legítima de quem usa | Não | Sim, por escolha, sinalizada | Não | Sim |
| Troca por falta de janela | A classe escolhida não comporta o conteúdo | Evita o erro no fornecedor | Não | Não: só vai para classe igual ou maior | Não | Sim |
| Reserva do plano | Créditos do mês no fim | Regra de plano | Não | Sim, e a exigência fica gravada | Não | Sim (`trocado_pela_reserva_do_plano` ou `abaixo_do_necessario`) |
| Reserva de execução (`models` no OpenRouter) | O fornecedor falha | Disponibilidade | Antes, sim: a reserva ia sem conferência | Antes, sim: podia ser de classe inferior | **Antes, sim**: não conferia liberação, janela nem acesso | Agora só vai se passar pelas mesmas regras e tiver a mesma classe ou maior. Senão, `descartada:<motivo>`. O uso fica em `resultado = respondido_pela_reserva` |
| Análise indisponível | A análise do texto lança erro | O envio não pode quebrar | Não: `analiseFalhou` fica gravado | Não: a exigência padrão é Equilibrado | Não: a governança roda inteira (teste 8) | Sim |
| Roteamento desligado | Configuração da empresa | Escolha da empresa | Não | Sim, e a exigência continua gravada | Não | `modo = padrao` |
| Sem modelo | Nada permitido | Bloqueia com a mensagem certa (409, 413 ou 403) | Não | — | — | Agora registrado com `resultado = bloqueado` |

## 9. Automático do OpenRouter (`openrouter/auto`)

- **Não é usado pelo roteamento:** ele sai da lista de candidatos, e o teste confere.
- **Não recebe conversa sigilosa:** some do seletor, a API devolve 409 e ele não pode ser homologado.
- **Não aparece como decisão da GreenIA:**
  - **Antes:** era registrado como "Classe Rápido, escolhida pela pessoa".
  - **Agora:** `modo = openrouter_auto`, `classe = null`, e a explicação diz "fora da governança da GreenIA".
  - **Na tela da conversa:** mostra "Automático do OpenRouter (fora da governança)".
- **Não entra nos indicadores do roteador:** economia, classes e decisões. Ele aparece em "Fora do roteador".
- **Fica identificado:** o nome no seletor e na configuração é "Automático do OpenRouter (fora da governança)".

## 10. "Por que este modelo?"

A explicação é montada **só** a partir dos códigos da decisão:

- a classe usada;
- a classe exigida e os motivos determinantes;
- o número de modelos excluídos por janela;
- o motivo da escolha;
- o fallback e as causas;
- as regras aplicadas.

Não é gerada depois da escolha por outro processo. O teste 11 confere, nos 48 cenários:

- cada motivo determinante aparece no texto;
- o motivo da escolha aparece;
- a menção à janela aparece se, e só se, algum candidato saiu por janela;
- a mesma decisão dá o mesmo texto, e outra decisão dá outro texto.

**Corrigido:** na 1.0, a explicação citava assuntos de precisão mesmo quando eles não mudavam nada, e atribuía qualquer fallback a "permissões".

## 11. Registro de auditoria

A tabela `roteamento` guarda, por decisão, incluindo as bloqueadas:

- versão do roteador e horário;
- origem do pedido (automático, pessoa, quick win ou padrão) e classe pedida;
- tipos, complexidade, domínios de precisão e sinais (contagens e rótulos);
- requisitos por dimensão, com motivo e determinantes;
- janela mínima e janela desejada;
- preferência e políticas aplicadas;
- candidatos com status, todos os motivos, custo estimado e utilidade;
- modelo escolhido, classe e motivo da escolha;
- fallback, reserva ou reserva descartada;
- resultado: enviado, respondido, respondido pela reserva, falha na execução ou bloqueado;
- modelo usado e custo real;
- explicação.

O que **não** é guardado:
- texto da mensagem, dos anexos ou dos documentos (teste com frase marcada: nenhuma coluna a contém);
- nome de arquivo.

A tela do admin mostra créditos, nunca dólares, e não expõe `custo_estimado` nem `custo_real`.

## 12. Testes de regressão adicionados

- **`test/roteamento-matriz.test.js`** (17 testes): as garantias 1 a 12 pedidas, mais estimativa de tokens, nova tentativa, capacidade × classe, quick win fixo e piso, e "nenhum sinal decorativo".
- **`test/roteamento.test.js`** (11 testes, fluxo HTTP):
  - o modelo chamado é o decidido;
  - a auditoria completa, sem conteúdo;
  - a limitação por acesso;
  - a escolha manual sinalizada;
  - a nova tentativa na mesma conversa;
  - o roteamento desligado registrado como padrão;
  - a decisão bloqueada registrada;
  - a falha da análise;
  - a reserva validada e usada;
  - o OpenRouter fora da governança e dos indicadores;
  - a preferência chegando à decisão.

## 13. Regras determinísticas × classificador por modelo

| Critério | Regras (atual) | Classificador por modelo |
|---|---|---|
| Custo | Zero | Uma chamada a mais por mensagem (~500 tokens de entrada no Rápido: cerca de 10% do custo de uma resposta típica no Rápido e ~1% de uma no Avançado) |
| Latência | Menos de 1 ms | +300 a 800 ms **antes** do primeiro token, que é a métrica que a pessoa sente |
| Explicabilidade | Total: cada código aponta para uma regra | Parcial: rótulos são explicáveis, o "porquê" do classificador não é |
| Previsibilidade | Total: mesma entrada, mesma decisão | Variável entre chamadas e entre versões do modelo |
| Manutenção | Listas de palavras e limiares; precisam de curadoria | Prompt e esquema; precisam de avaliação contínua |
| Casos ambíguos | Fraca: paráfrases, negação ("não precisa analisar"), outros idiomas e pedidos sem palavra-chave (caem em "consulta") | Forte |
| Risco | Baixo | O classificador recebe o conteúdo: em conversa sigilosa, precisaria ser homologado ou pulado. Há risco de injeção pelo texto do pedido |

**Recomendação: manter as regras como decisão principal agora.** O classificador por modelo pode trazer ganho em pontos específicos:

- pedidos que caem em `consulta` (nenhum tipo reconhecido) com mais de ~200 caracteres;
- conversas com feedback "não serviu" e classe baixa;
- pedidos em outros idiomas.

Se for adotado, ele deve:
- só **subir** a exigência, nunca baixar;
- nunca tocar a governança;
- usar os mesmos códigos de requisito;
- ser registrado como `classificador: { versao, sugestao }`;
- ser pulado em conversa sigilosa sem homologado.

**Decisão com dados, não por hipótese.** Primeiro medir, com o registro que já existe, a taxa de `consulta` e a taxa de "não serviu" por classe exigida. Só adotar se essas taxas forem relevantes.

## 14. Diagnóstico por componente

| Componente | Classificação | Observação |
|---|---|---|
| Análise do pedido (tipos, etapas, critérios, risco, domínio) | PARCIAL | Funciona nos casos de referência e todo sinal tem efeito. É lexical, em português, e sem tratamento de negação |
| Requisitos de capacidade (vetor por dimensão) | CORRETO | Distingue os nove perfis de tarefa pedidos |
| Capacidade do lado dos modelos | PARCIAL | Só classe + janela + preço. Falta `capacidades` por modelo |
| Janela de contexto e estimativa de tokens | CORRETO, com risco residual | Mesma conta na seleção e no envio, com folga de 20–27% e margem de 10%. Conteúdo atípico pode passar da razão segura |
| Governança como filtro | CORRETO | Todos os motivos por candidato; o fallback nunca viola política |
| Seleção por utilidade | CORRETO | Custo, margem, padrão curado e janela para histórico |
| Pesos das preferências | NÃO COMPROVADO | Os efeitos são demonstrados, mas os pesos foram definidos à mão, sem calibração com o resultado real (feedback) |
| Latência como critério | NÃO IMPLEMENTADO | A tabela `uso` tem `ms` por modelo; não é usado |
| Quick win (fixo e piso) | CORRETO | O piso depende de a classe do quick win estar bem configurada |
| Fallbacks | CORRETO | Todos explícitos, validados e registrados |
| Reserva de execução | CORRETO (era PROBLEMÁTICO) | Antes ia ao fornecedor sem conferência |
| Automático do OpenRouter | CORRETO (era PARCIAL) | Separado na decisão, no registro, nos indicadores e na tela |
| Explicação | CORRETO (era PARCIAL) | Derivada dos códigos; testada nos 48 cenários |
| Auditoria | CORRETO | Reconstrói a decisão; inclui bloqueios e resultado; sem conteúdo |
| Indicador "consumo poupado" | PARCIAL | É contrafactual (contra "sempre Avançado"): um teto, não economia medida |
| Multimodal | NÃO SE APLICA | Imagens são recusadas antes do roteamento |

### O que já funciona
A análise decide a exigência. As regras só tiram candidatos. A escolha pesa consumo e qualidade conforme a preferência. A janela é calculada antes do envio. Os fallbacks são explícitos. A explicação é fiel à decisão, e a auditoria é completa sem guardar conteúdo.

### O que ainda é heurística
- As palavras-chave de cada tipo, domínio, risco e insatisfação.
- Os limiares: 30 e 150 mil tokens para volume; 2 e 3 critérios ou etapas.
- As razões de caracteres por token.
- Os pesos C, Q, D e H.

### Onde existe risco de seleção inadequada
- **Pedido complexo escrito sem as palavras esperadas.** Cai em "consulta" e fica no Rápido. O Rápido é o piso, então o risco é resposta fraca, não violação.
- **Modelos mal classificados pelo admin.** A capacidade de um modelo é a classe que recebeu.
- **Conteúdo muito denso** perto do limite da janela.

### Onde o roteamento ainda depende de regras fixas
- A classe como proxy de capacidade.
- Os pesos das preferências.
- A exigência padrão Equilibrado quando a análise falha.

### Mudanças necessárias (feitas nesta auditoria)
- **Volume** passa a pedir janela, e só sobe a capacidade quando é análise ou extração sobre muito conteúdo.
- **Insatisfação** ganha frases novas, o feedback "não serviu" e a subida a partir da classe usada antes.
- **Quick win flexível** entra no Automático com a classe como piso.
- **Candidatos** registram todos os motivos de exclusão, e o fallback registra a causa real.
- **Seleção** passa a ser por utilidade, com preferências que mudam a decisão.
- **Janela e envio** usam o mesmo orçamento.
- **Reserva de execução** é validada pelas mesmas regras.
- **Decisões bloqueadas** e o resultado da execução são registrados.
- **Automático do OpenRouter** fica separado em todos os pontos.
- **Explicação** é derivada dos códigos.
- **Roteamento desligado** é registrado como padrão.

### Mudanças opcionais (recomendadas, não feitas)
1. `capacidades` por modelo, editáveis pelo admin, com padrão igual à classe.
2. Latência mediana por modelo (da tabela `uso`) como termo da utilidade.
3. Calibração da razão de caracteres por token com `usage.prompt_tokens` real.
4. Calibração dos pesos com o feedback "serviu" ou "não serviu" por classe exigida e classe usada.
5. Indicador de pedidos não classificados (`consulta`), antes de decidir sobre um classificador.
6. Classificador por modelo só para os casos ambíguos, nas condições da seção 13.

### Novos testes que devem vir com as mudanças opcionais
- Casamento por dimensão: um modelo Equilibrado com programação 3 atende G antes de um Avançado.
- Latência: entre dois modelos equivalentes, o mais rápido em Equilíbrio.
- Calibração: a razão aprendida nunca fica mais otimista que 3,0 para prosa.
- Classificador: nunca baixa a exigência, nunca roda em conversa sigilosa sem homologado, e a falha dele não muda a decisão das regras.
