# QA profundo do Quick Win + Fontes e Imagem final — relatório final em produção

- Ambiente: produção (greenia.theneil.com.br), empresa Apy Mine, conta vinicius@apymine.com (admin), uma sessão por OTP.
- Versões promovidas para `greenia-lite` (fast-forward, deploy automático do Render, sem deploy manual):
  cffe219 → b20ec31 → aaf2da9 → 5c8a02a → 259f1b0 → **b6fb598** (live: `/api/saude` = `{"ok":true,"ia":true,"versao":"b6fb598","design":true}`).
- Testes locais na versão final: unidade **701/701**, E2E **35/35**, `npm audit` **0 vulnerabilidades** (produção e completo).
- Nada de dado real alterado; material sempre fictício; nenhum OTP, cookie, CSRF ou chave registrado (os três arquivos
  `otp`, `codigo.fifo`, `comandos.fifo` do scratchpad são FIFOs vazios).
- **Pendente:** limpeza (exclusão lógica dos Quick Wins "QA - " desta sessão, revogação de conectores de teste) e logout.
  O processo da sessão foi perdido num reinício do ambiente depois da última bateria; o cookie existia só na memória.
  Concluir exige um novo código (módulo pronto: `scripts/qa-modulos/limpeza.mjs`, depois `sair`).

## Bateria final (b6fb598) — mesmos casos da primeira bateria, sem mudança de caso

| Caso | Teste (rascunho) | Uso real (publicado) | Leitura |
|---|---|---|---|
| 1 Resumo de documento | aprovado | parcial | conferência incompleta nesta execução |
| 2 Análise de contrato | corrigido | aprovado | ok |
| 3 Ata de reunião | aprovado | aprovado | ok |
| 4 Análise de planilha | parcial | aprovado | ok |
| 5 Comparação de fornecedores | aprovado | aprovado | ok (QW-01/02 resolvidos) |
| 6 Relatório executivo | corrigido | aprovado | ok |
| 7 Checklist | aprovado | aprovado | ok |
| 8 Pesquisa de tendências | parcial | parcial | esperado: pesquisa na internet não liberada pela empresa |
| 9 Apresentação | aprovado | parcial | peça entregue; conferência visual com ressalva |
| 10 Dashboard | inconsistente | pergunta | **instável** |
| 11 Cronograma | inconsistente | aprovado (2ª rodada: inconsistente) | **conferente instável** (resultado correto) |
| 12 Integração | parcial | parcial | esperado: Integration Builder desligado na empresa |
| 13 Comunicado | corrigido | aprovado | ok |
| 14 Pedido ambíguo | pergunta | pergunta | esperado |
| 15 Material ausente | pergunta | pergunta | esperado (QW-12 resolvido: executa e pede o material) |
| 16 Material opcional | aprovado | aprovado | ok (QW-11 resolvido: sem pesquisa inventada) |
| 17 Critérios objetivos | aprovado | aprovado | ok |
| 18 Correção pelo checker | aprovado | aprovado | ok |
| 19 Múltiplos entregáveis | inconsistente | aprovado | conferente instável no teste |
| 20 Pedido inesperado | aprovado | aprovado | ok |

Smoke: visual 7/7 com peça, prévia, PDF, PNG, JPG e SVG; conversa 8/8 sem re-executar, histórico 2→18; versões
(rascunho não afeta uso, v2 vale, restaurar); cache (mesmo pedido reaproveita em ~60 ms); acesso (404 para o que não é
da pessoa; ids 1, 2, 3, 111, 112 são conversas da própria conta); checker 5/5 sem invenção; navegador de composição
disponível em produção (`/api/admin/visual/diagnostico`: ok, 5,9 s).

## Fontes e Imagem final — bateria de produção (10 Quick Wins "QA - ")

| Quick Win | Resultado | Evidência |
|---|---|---|
| QA - Documento com PDF obrigatório | OK (aprovado) | 22 h e 90 dias certos, citação do item, "Fontes usadas" |
| QA - Planilha como fonte | OK (aprovado) | Recife 7 dias / R$ 9,10; Manaus mais caro |
| QA - Link como conhecimento | OK (aprovado) | RFC lida pela rede segura; domínios reservados corretos |
| QA - Referência visual | OK (aprovado) | nenhum dado da referência copiado; números do dia usados |
| QA - Conhecimento da empresa | OK (aprovado) | papel da base aplicado (empresa sem documentos na base: coberto também por teste automatizado) |
| QA - Fonte opcional ausente | OK | opcional 404 não bloqueia (aprovado); a mesma como obrigatória → parcial com o motivo |
| QA - Imagem final | OK (aprovado) | imagem gerada, PNG e JPG baixados; variação gera versão nova |
| QA - Imagem briefing | OK (corrigido) | briefing, nenhuma imagem final |
| QA - Fonte alterada após versão | OK (aprovado) | v1 com R$ 95; fonte trocada → R$ 120 e aviso "fontes mudaram desde a v1" |
| QA - Quick Win sem fonte | OK (corrigido) | funciona sem fonte |
| Conversa com link | OK (aprovado) | link lido; 169.254.169.254 bloqueado com aviso explícito |

## Achados e correções

| ID | Severidade | Área | Problema | Causa | Correção | Evidência | Status |
|---|---|---|---|---|---|---|---|
| QW-01 | P1 | Contrato | formato manual impunha seções genéricas | dois contratos concorrendo | vários entregáveis → estrutura do plano; formato vira estilo | final 5/19 ok | corrigido |
| QW-02 | P1 | Contrato | colunas sugeridas viravam contrato | origem "sugestão" tratada como pedida | sugestão não vincula nem reprova | final 5/17 ok | corrigido |
| QW-03 | P1 | Interpretação | atributos viravam entregáveis | sem filtro de entregável | atributo/forma vira componente | final | corrigido |
| QW-04 | P1 | Conferência | reprovava regra não pedida, cálculo derivado, ano | conferência sem graduação | regras leves, cálculo/data derivada, motivo autocontraditório não reprova | final 2/4/6 ok; 11 ainda instável | parcial |
| QW-05 | P1 | Design IA | navegador falhava 100% (`falha_render`) | ambiente do Chromium no Render | HOME/XDG, flags, diagnóstico | diag ok; agora cai no clássico por **conferência** | parcial |
| QW-06 | P1 | IB | escrita cobrada pelo conferente | ação externa julgada no texto | conferente recebe ações externas | ibq | corrigido |
| QW-07 | P1 | IB | sistema errado na resolução | sistema nomeado não exigido | candidato exige o sistema | testes IB | corrigido |
| QW-08 | P1 | IB | corte 200→50 silencioso | material sem total | total real + aviso de corte | testes IB | corrigido |
| QW-09 | P1 | Fontes | link não era lido | não existia | fontes por link (rede segura) | fontes2 3 e 11 | corrigido |
| QW-10 | P1 | Imagem | não havia imagem final | não existia | entregável Imagem final | fontes2 7 | corrigido |
| QW-11 | P2 | Ferramentas | pesquisa adicionada sem pedido | palavra "pesquisa" | só quando pedida; pesquisa como material | caso 16 ok | corrigido |
| QW-12 | P2 | Material | executar sem texto → 400 | mensagem vazia | execução pede o material | caso 15 ok | corrigido |
| QW-13 | P2 | Perguntas | "fictício ou real?" | prompt | proibido perguntar | final | corrigido |
| QW-14 | P2 | Visual | timeline/dashboard sem peça | detecção e seção | timeline + peça sem seção | visual 7/7 | corrigido |
| QW-15 | P2 | Imagem | área reforçada sem imagem | governança | (esperado) imagem final fica parcial com briefing | visual poster | por desenho |
| QW-16 | P3 | Texto | "Ensine ao" | concordância | "Ensine à GreenIA" | E2E | corrigido |
| QW-17 | P3 | IB | max_tentativas | semântica (repetições) | sem mudança | — | não é defeito |
| QW-18 | P3 | Limite | rajada em uso intenso | limite por pessoa | sem mudança (proteção) | log | por desenho |
| QF-01 | P1 | Imagem final | variação falhava `nao_cabe` | recomposição perdia o ajuste | só a imagem mudou → mantém ajuste | fontes2 7 | corrigido |
| QF-02 | P2 | Conferência | nomes do contexto autorizado marcados como inventados | conferente sem os responsáveis | responsáveis vão ao conferente | caso 20 ok | corrigido |
| QF-03 | P2 | Conferência | contagem de slides de peça visual reprovava | texto julgando paginação | fica com a produção visual | caso 9 | corrigido |
| QF-04 | P1 | Conferência | conferente por IA reprova resultado correto de forma intermitente | variação do modelo conferente | várias salvaguardas genéricas | 11: 3 de 4; testes 10 e 19 | **aberto** |
| QF-05 | P2 | Design IA | design pela IA não usado em produção | peças reprovadas na conferência do design | motor clássico entrega | visual | **aberto** |
| QF-06 | — | Operação | limpeza e logout pendentes | sessão perdida no reinício do ambiente | módulo `limpeza` pronto | — | **pendente** |
