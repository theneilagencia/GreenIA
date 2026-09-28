# Auditoria: validade, rotação e monitoramento da chave do OpenRouter

Data: 28/09/2026. Escopo:
- `src/plataforma/chave-validade.js`: estado, cálculo e avisos.
- `src/plataforma/servidor.js`: chave, impressão digital e bloqueio de envio.
- `src/plataforma/consumo.js`: leitura da conta.
- `src/plataforma/api-plataforma.js`: rotas.
- `src/iniciar.js`: tarefa horária e chave da variável.
- `public/plataforma.js`: aviso do topo e card da chave.

Evidência:
- `test/chave-validade.test.js`: 11 testes, cobrindo os 24 cenários pedidos e mais o cálculo de datas.
- Um roteiro rodado contra a versão anterior (commit `e275ac4`), que confirmou os defeitos abaixo.
- Um fluxo no navegador real: aviso do topo → formulário de troca → troca → aviso some.

## O que o OpenRouter informa (item 17)

A documentação oficial de [GET /api/v1/key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) lista o campo `expires_at` na resposta. Ele pode ser `null` quando a chave foi criada sem vencimento, como mostram as páginas de criação e gestão de chaves ([Provisioning API Keys](https://openrouter.ai/docs/features/provisioning-api-keys)). Uma chave vencida, revogada ou inexistente responde **401**. Consultado em 28/09/2026; o acesso direto a openrouter.ai estava bloqueado neste ambiente, então a leitura foi pela busca.

Consequências na implementação:

| Situação | Como o GreenIA mostra |
|---|---|
| `expires_at` com data | "Vencimento no provedor: DD/MM/AAAA · informado pelo OpenRouter" |
| `expires_at: null` | "não definido no OpenRouter (sem validade conhecida)". **Não** é chave inválida |
| OpenRouter sem resposta (rede) | "não informado (o OpenRouter ainda não respondeu)". **Não** é recusa |
| Leitura ou envio com 401 | **Recusada**, com prioridade sobre qualquer prazo |
| 403 num envio | Não é recusa da chave: no OpenRouter é bloqueio de moderação do pedido. A versão anterior tratava 403 como recusa |

A troca preventiva é mostrada sempre à parte: "Próxima troca preventiva: DD/MM/AAAA · política da plataforma, a cada N dias".

## Defeitos encontrados e corrigidos

Priorizados pelos riscos listados no pedido.

| # | Risco | Defeito na versão anterior | Como foi comprovado | Correção |
|---|---|---|---|---|
| 1 | Uso prolongado de chave inválida | Um 401 no chat não mudava nada: o aviso não aparecia e cada mensagem de cada empresa continuava indo ao OpenRouter com a chave recusada | Roteiro: 3 envios com 401 → aviso `null`, 3 chamadas ao OpenRouter | O 401 em qualquer envio registra a recusa na hora (aviso e email imediatos). Os envios seguintes param **antes** de chamar o OpenRouter (erro 503 claro). Uma revalidação a cada 10 minutos libera sozinha se a chave voltar a valer |
| 2 | Falsa indicação de validade | A recusa só existia no cache de 5 minutos da conta: depois de 5 minutos ou de um reinício, o aviso sumia | Roteiro: sem o cache, o aviso fica `null` | Estado persistido por chave em `openrouter_chaves` (banco da plataforma): recusa, última validação e vencimento do provedor. O aviso do topo lê o estado persistido, não o cache |
| 3 | Email perdido ou duplicado | O envio era disparado sem esperar o resultado e o estágio era marcado como enviado antes: um SMTP fora do ar perdia o aviso para sempre. Duas execuções simultâneas podiam enviar duas vezes | Roteiro: email falhou → próxima execução não reenvia | Tabela `avisos_chave`, com chave primária (chave, estágio, destinatário). Reserva **antes** do envio (`insert or ignore`); confirma depois do sucesso; libera se falhar; reserva presa expira em 30 minutos |
| 4 | Contador reiniciado indevidamente, ou não reiniciado | A chave era identificada pela máscara (início e 4 últimos caracteres): duas chaves com o mesmo final eram tratadas como a mesma. A variável guardava só a última chave vista: voltar a uma chave antiga zerava a contagem dela | Leitura do código; teste 17–18 | Impressão digital HMAC-SHA256 da chave completa, com a chave-mestra. Histórico das últimas 20 chaves (só metadados) |
| 5 | Falsa indicação de validade | Rótulo "Sem validade" usado para chave com erro | Roteiro | Estados: Em dia, Troca próxima, Atenção, Vence em breve, Vencida, Recusada. "Sem validade conhecida" só descreve o vencimento do provedor |
| 6 | Mistura de conceitos | Uma única "situação" misturava vencimento real e política interna | Leitura do código | Duas frentes separadas (`provedor` e `troca`) na API, na tela e no email. Prevalece a mais grave e, no empate, a validade externa |
| 7 | Troca pouco previsível | Depois da troca, a resposta da API não trazia o estado novo, e o aviso dependia de recarregar a tela Uso | Leitura do código | A troca valida no OpenRouter, grava, lê a conta com a chave nova, confere os avisos e só então responde, já com o estado. A tela atualiza o aviso com essa resposta |

## Respostas por item

**1. Validade externa × política interna.** Estão separadas no código (`provedor` e `troca` em `situacaoChave`), na API, na tela e no email. A ausência de `expires_at` não gera estado de erro nem de atenção.

**2. Origem da data.** Ordem de precedência:
1. o `expires_at` do OpenRouter;
2. se o OpenRouter não informar, a data digitada pelo admin (rotulada "data informada no console");
3. nenhuma data inventada.

A data digitada vale só para aquela chave.

**3. Início da contagem, persistido no banco:**
- **Chave salva no console:** a data do salvamento.
- **Chave da variável:** a data em que a plataforma a viu pela primeira vez, identificada pela impressão digital.
- **Não depende de:** sessão, processo, cache nem instância. Reiniciar não muda a data (teste 17).
- **Salvar de novo a mesma chave:** não reinicia a contagem, porque não é uma troca.

**4. Troca de chave:**
- **O que acontece:**
  - a cifra nova sobrescreve a anterior;
  - o cliente de IA em memória é substituído;
  - o cache da conta é apagado;
  - o registro da chave nova começa do zero;
  - o vencimento informado da anterior deixa de valer, porque está preso à impressão digital;
  - os estágios de aviso recomeçam, porque são por chave.
- **Não fica em lugar nenhum:** a chave antiga em claro, seja em banco, log, auditoria, email ou tarefa agendada.
- **Continua em memória, por projeto:** a chave da variável `OPENROUTER_API_KEY`, que é o retorno se a chave do console for removida.

**5. Chave recusada:**
- **Prioridade:** 401 prevalece sobre qualquer prazo (teste 4–5).
- **Bloqueio:** depois da recusa, os envios param de chamar o OpenRouter, com uma revalidação a cada 10 minutos.
- **Recusa que volta:** se a chave for recusada de novo depois de voltar a valer, o email é reenviado; o estágio leva a data da recusa.

**6. Estados.** Ordem de prevalência: Recusada > Vencida > Vence em breve (≤7 dias) > Atenção (vencimento ≤30 dias, troca atrasada, troca hoje ou em ≤7 dias) > Troca próxima (≤30 dias) > Em dia.

**7. Cálculo (regra determinística):**
- **Base:** dias corridos no calendário de **America/Sao_Paulo**.
- **Troca preventiva:** devida na data de início + N dias. `diasRestantes` = próxima troca − hoje.
- **Vencimento do provedor:** vale o **instante** exato. No dia do vencimento, antes do horário, o estado é "vence hoje"; depois, "vencida".
- **Data digitada:** vale até 23h59 daquele dia, em São Paulo.
- **Testado** com 100, 90, 89, 30, 7 e 1 dia, no dia, no dia seguinte, na virada de 23h59 para 00h01, e com prazos de 90, 30, 730 e 7 (teste 7).

**8. Prazo (7 a 730):**
- **Aceita:** números inteiros entre 7 e 730, inclusive como texto ("30").
- **Rejeita com 400:** 6, 731, 0, −1, 7,5, `null`, vazio, texto, booleano, lista, objeto e 1e9.
- **Mudar o prazo não reinicia a contagem.** Exemplo: chave com 60 dias de uso e prazo mudado de 90 para 30 → atrasada 30 dias na hora (teste 8).

**9. Alertas:**
- **Estágios da validade externa:** 30, 7 e 1 dia antes, no dia do vencimento, vencida e recusada.
- **Estágios da troca preventiva:** 30, 7 e 1 dia antes, no dia e atrasada.
- **Limite:** um email por chave, estágio e destinatário. Três execuções seguidas enviam um só (teste 6–12).
- **Ao trocar de chave:** o ciclo recomeça.

**10. Idempotência:**
- **Tarefa horária:** uma por processo (`setInterval`), mais a verificação logo após a troca.
- **Execuções simultâneas:** duas instâncias no mesmo banco rodando ao mesmo tempo enviam um email só (teste 13).
- **Falha:** falha de envio não marca como enviado.
- **Sucesso parcial:** só quem ficou sem receber recebe na próxima execução (teste 10b).
- **Limite:** isso vale para instâncias que **compartilham o banco da plataforma**. Com SQLite em discos separados, cada instância teria seu próprio estado, inclusive a própria chave. A implantação atual (Render com disco persistente) roda uma instância.

**11. Ordem na troca:**
1. validar no OpenRouter;
2. persistir;
3. ler a conta com a chave nova (estado e vencimento);
4. conferir avisos;
5. responder com o estado.

A tela nunca mostra "válida" antes da validação: a resposta só existe depois dela.

**12. Segurança.** Teste 19–21 procura a chave completa, e um trecho do meio dela, em vários lugares, inclusive com uma chave recusada e um erro de envio no caminho:

| Onde | A chave completa aparece? |
|---|---|
| Respostas de `/eu`, `/consumo`, `/auditoria`, `/configuracoes` e da troca | não |
| HTML do console | não |
| Logs capturados | não |
| Banco (fora do campo cifrado) e tabela de avisos | não |
| Emails | não; só `sk-or-v1-…b9c1` |
| localStorage, sessionStorage e HTML no navegador real | não |
| URLs | não; a chave só viaja no corpo do PUT |

**13. `OPENROUTER_API_KEY`:**
- **Identificação:** impressão digital calculada na subida, persistida no registro da chave com a data da primeira vez que foi vista.
- **Mudar a variável:** gera outra impressão digital, então a chave é nova e o ciclo recomeça.
- **Mesmo final, chave diferente:** é chave nova.
- **Voltar a uma chave anterior:** retoma a contagem dela (teste 17–18).
- **O que fica registrado da chave antiga:** só metadados (máscara, datas e estado), nunca a chave.

**14. Empresas × plataforma.** Com sessão de empresa:
- `/api/plataforma/eu`, `/consumo`, a configuração de validade, a troca e a remoção da chave respondem 401, 403 ou 404;
- as APIs da empresa (`/api/eu`, `/api/admin/modelos`, `/api/admin/config`, `/api/saude`, `/api/modelos`) não contêm `sk-or` nem dados de troca preventiva (teste 22);
- os estágios de alerta são fixos e não configuráveis, nem pela plataforma.

**15. Interface:**
- **Topo de todas as telas do console:** mostra estado e texto quando há Atenção, Vence em breve, Vencida ou Recusada. O link "Trocar a chave" abre o formulário de troca com o cursor no campo.
- **Depois da troca:** o aviso some sem recarregar (verificado no navegador).
- **Em Uso → Chave do OpenRouter, o card mostra:**
  - estado;
  - origem;
  - início da contagem e dias em uso;
  - vencimento no provedor;
  - última validação;
  - próxima troca preventiva, com os dias e o prazo configurado;
  - o formulário de prazo e de vencimento informado. O campo de vencimento some quando o OpenRouter informa a data.

## Diagnóstico

| Componente | Antes | Agora |
|---|---|---|
| 1. Cálculo do prazo | PARCIAL (horas com arredondamento, sem fuso, mistura de conceitos) | **CORRETO** (dias corridos em São Paulo; instante exato para o vencimento do provedor; testado nos limites) |
| 2. Persistência | PROBLEMÁTICO (recusa só em cache) | **CORRETO** (estado por chave no banco; sobrevive a reinício) |
| 3. Troca de chave | PARCIAL (identidade pela máscara; estado não voltava na resposta) | **CORRETO** |
| 4. Detecção de chave recusada | PROBLEMÁTICO (só na leitura da conta; 403 confundido; chave recusada continuava em uso) | **CORRETO** (401 em leitura ou envio; bloqueio com revalidação) |
| 5. Alertas | PARCIAL | **CORRETO** (estágios das duas frentes; um por chave, estágio e destinatário) |
| 6. Idempotência | PROBLEMÁTICO (falha marcava como enviado; corrida duplicava) | **CORRETO** no mesmo banco; **NÃO COMPROVADO** para instâncias com bancos separados, cenário que não existe na implantação atual |
| 7. Segurança | CORRETO | **CORRETO**, agora com teste de respostas, HTML, logs, banco, emails e navegador |
| 8. `OPENROUTER_API_KEY` | PARCIAL (máscara; histórico de uma chave) | **CORRETO** |
| 9. Isolamento plataforma × empresas | CORRETO | **CORRETO**, com teste das rotas e das APIs da empresa |
| 10. Interface | PARCIAL ("Sem validade" para erro; vencimento e troca misturados) | **CORRETO** |
| 11. Testes | PARCIAL (4 testes) | **CORRETO** (11 testes, cobrindo os 24 pedidos, mais o fluxo no navegador) |

## Limitações que continuam

- **Recusa descoberta pelo tráfego ou pela tarefa horária.** Se ninguém usar a IA, uma chave revogada é descoberta na próxima leitura da conta, no máximo em uma hora.
- **Vencimento digitado pelo admin.** O GreenIA não tem como conferir; ele fica rotulado como "data informada no console".
- **Fuso fixo.** A regra usa America/Sao_Paulo (UTC−3, sem horário de verão desde 2019). Se o horário de verão voltar, a data digitada pode deslocar em uma hora no dia da virada.
