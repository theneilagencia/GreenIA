# QA final em produção — relatório final

- Produção: https://greenia.theneil.com.br. Primeira bateria em **ddded3f**; correções em e702aca, 26a3c30, d45c6bc;
  navegação lateral em e3345c4, 8476933, 42a7e0b. Live ao fim: **d45c6bc** (`/api/saude`: ok, IA ativa, design ativo).
- Sessão única por OTP com vinicius@apymine.com (admin). Código usado só no login, nunca impresso ou guardado; cookie e
  CSRF só na memória do processo; sem bypass nem rota de QA. Sessão encerrada com `sair` ao fim.
- Testes ao fim: unitários **714/714**, E2E **49/49**, `npm audit` 0.

## QF-05 — design pela IA (peças elegíveis; imagem final é composição determinística por desenho)

| Rodada | Build | IA usada / elegíveis | Fallbacks (categoria: códigos) |
|---|---|---|---|
| b1 | ddded3f | 1/6 | VALIDATION ×5 (margem, contraste, fora_da_pagina, conteudo_omitido) |
| r1 | e702aca | 3/5 | VALIDATION |
| r2 | e702aca | 1/6 | VALIDATION |
| r3 | e3345c4 | **5/6** | apresentação: margem, contraste, fonte_pequena |
| r4 | 42a7e0b | 3/6 | apresentação (margem, fonte_pequena, contraste); dashboard (texto_cortado, conteudo_omitido); cartaz (resposta_invalida) |
| r5 | d45c6bc | 4/6 | apresentação (sobreposicao, após ajuste de margem); comparação (conteudo_omitido) |
| r6 | d45c6bc | 2/5 | apresentação (conteudo_omitido…); comparação ×2 (sobreposicao, conteudo_omitido) |

Desde as correções (r3–r6): **14/23 (61%)**, contra 1/6 na primeira bateria. Todo fallback é registrado com motor pedido
e usado, categoria e códigos; nenhum é silencioso, e o checker aprovou ou corrigiu o conteúdo em todos os casos. O
ajuste determinístico (margem, fora da página, contraste e, desde d45c6bc, fonte pequena) recupera a peça sem nova
chamada. Restam falhas sem conserto determinístico seguro: **sobreposição de textos, conteúdo omitido e texto cortado**,
e a **apresentação de 5 slides cai no clássico em todas as rodadas**.

## Tabela final

| ID | Severidade | Área | Sintoma | Causa | Correção | Evidência | Status |
|---|---|---|---|---|---|---|---|
| QF-05 | P1 | Design pela IA | IA reprovada pela conferência e trocada pelo clássico | margem/contraste/fonte fora da regra; sobreposição e omissão no HTML da IA | ajuste determinístico (margem, contraste com tarja, fonte mínima), correção única pela IA, escolha estruturada | 30-r3…r6.json | **Parcial** (1/6 → 61%; apresentação sempre clássico) |
| QF-05b | P2 | Eventos visuais | categoria e motor não estruturados | evento só com motivo | `motor_pedido`, `motor_usado`, `fallback_categoria`, `fallback_motivo`, tentativas, tempo | eventos visual.produced | Corrigido |
| QF-06 | P2 | Fontes | nomes do material viravam "não informado" | contatos de "quem procurar" lidos como material | contatos fora do material para execução e checker | fontes2 r3/r4 caso 10 OK | Corrigido |
| QF-07 | P2 | Execução | perguntava o ano de datas sem ano | regra de perguntas | data sem ano não gera pergunta; revisão não confirma esse achado | bateria | Corrigido |
| QF-08 | P2 | Checker | contagem errada de slides derrubava o objetivo | paginação é da produção visual | contagem de slides de peça visual não derruba o objetivo | bateria | Corrigido |
| QF-09 | P3 | Links | Quick Win de pesquisa sem pesquisa liberada sai "inconsistente" além de "parcial" | conferente marca a falta da pesquisa como inconsistência | — | 32-r3.json | Aberto (link de resolução correto) |
| QF-10 | P3 | Catálogo | "QA - " de missões anteriores ativos | sessões perdidas antes da limpeza | limpeza: 388 excluídos (soft delete), 0 restantes | limpeza | Corrigido |
| NAV-01 | P2 | Lateral | item ativo atrasado uma tela | lateral redesenhada só depois da tela carregar | redesenho já no clique | lateral 8476933 | Corrigido |
| NAV-02 | P2 | Lateral | em 320x568 Administração e "Ver todas" sumiam | rodapé e recentes sem prioridade de altura | só as recentes encolhem; rodapé vai para o fim em tela baixa | lateral 42a7e0b | Corrigido |

## Demais resultados

- **QF-04** (r3): 4 correct_approval, 2 correct_rejection, **0 falso positivo, 0 falso negativo**.
- **Links de resolução** (r3): pesquisa → `#/politicas?foco=pesquisa-web` e imagens → `#/configuracoes?foco=iv-imagens`
  abrem com o campo focado e em destaque; fontes → `#/qw/:id/editar?foco=fontes-qw` em destaque; área reforçada: nenhum
  "liberar".
- **Fontes/imagem final** (r4): **11/11 OK** (r3 tinha 1 falha do script de QA, que só aceitava número em algarismo;
  a resposta estava certa).
- **Limpeza**: 388 Quick Wins "QA - " excluídos (soft delete), 0 restantes; conectores de QA: nenhum ativo;
  `integracoes.ativa=false`; logout feito.

QUICK WIN AINDA NÃO APROVADO EM PRODUÇÃO — QF-05: o design pela IA é usado em 61% das peças elegíveis (14/23); a apresentação ainda cai no motor clássico em todas as rodadas por sobreposição, conteúdo omitido e fonte pequena.
