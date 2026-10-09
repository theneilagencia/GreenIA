# Correção do detalhe de Quick Win — 09/10/2026

## Evidência e prioridade

A captura enviada pelo usuário às 12:17 mostrou a versão `aff718c`, Quick Win publicado “Analisar documentos”. O nome e cinco ações dividiam a mesma faixa; “Editar nome” caía em linha isolada e ações de execução e configuração tinham pesos equivalentes. A função de renomear estava implementada, mas a composição foi rejeitada pelo usuário. RQ-27 reaberto; RQ-28 adicionado.

| Achado | Tipo / gravidade | Impacto e evidência | Correção | Aceite |
|---|---|---|---|---|
| QA-13: título disputa espaço com ações | Apresentação / alta | Captura do usuário: quebra de “Editar nome”, excesso de caixas com peso equivalente | Nome/status em faixa própria; ações abaixo; Usar principal, Agendar secundária; Refinar/Editar instruções com menos peso; formulário limitado a 640 px | Nome e botão na mesma faixa; ações abaixo do status; edição com foco e cancelamento; 320–1440 px sem excesso horizontal |
| QA-14: medição responde depois de abandonar a tela | Funcionamento / alta | Regressão de uso acusou `Cannot set properties of null (setting 'innerHTML')` | Capturar o elemento original; ignorar resposta/erro quando desconectado | Criar/testar/publicar/usar sem erro de página; resposta 503 deliberadamente atrasada depois de navegar não desenha nem lança erro |
| QA-15: Menu encosta no título no celular | Apresentação / média | Captura local de 390 px: coluna de 44 px menor que botão com texto | Coluna do menu dimensionada pelo conteúdo, intervalo de 10 px | Nome do menu separado do título; matriz de 29 telas e console em larguras pequenas |

## Jornada mantida

1. A pessoa vê o nome, “Editar nome” e estado publicado.
2. “Usar” inicia o trabalho; “Agendar” abre a rotina; “Refinar Quick Win” conduz o ajuste guiado; “Editar instruções” distingue a edição de conteúdo da edição do nome.
3. “Editar nome” abre um campo preenchido no próprio detalhe. Foco vai ao campo. “Salvar nome” persiste; “Cancelar” restaura o valor e devolve o foco.
4. Nome vazio pede um nome; erro de gravação mantém o texto para repetir. Sucesso é anunciado depois da gravação, com catálogo atualizado.
5. Arquivamento, permissões, publicação e versões continuam regidos pelos mesmos controles. Nenhum novo recurso, mudança de permissão ou alteração de dados reais foi necessário.

## Validação

- Bateria inicial de nome/jornadas/agendamento: 12 de 13 aprovados. A falha assíncrona de medição foi preservada no diagnóstico e corrigida.
- Repetição de `quickwin2`: **8/8 aprovados**, incluindo criação, publicação, execução, versões e refinamento guiado móvel.
- Nome: dois cenários aprovados na bateria inicial; agendamento: três cenários aprovados. Persistência de nome e disparo real já tinham evidência em produção no relatório anterior.
- Matriz final de interface + detalhe: **7/7 aprovados**. Abrange 29 telas privadas em 1280/390/320 px, nove telas do console, foco/diálogos/recuperação e navegação rápida.
- Detalhe: 1440/1280/1024/768/390/320 px; nome longo; abrir/cancelar; captura visual desktop/celular; resposta lenta com falha.
- Publicação e inspeção real: **validadas em `f45a851`**, PR #43 integrado, deploy live em 09/10/2026 às 15:39:10 UTC. Saúde e rodapé confirmaram a versão. A mesma tela real da captura foi recarregada; título/status separados das ações. Editar nome abriu campo preenchido e focado; cancelar fechou formulário e devolveu foco. Nenhuma gravação no Quick Win real. Captura da página publicada preservada como evidência para o usuário.

## Limites

Testes técnicos e inspeção especializada não comprovam entendimento por participantes representativos nem certificam leitor de tela real. Esta correção trata a composição rejeitada e as falhas encontradas; não encerra as pendências históricas do tracking. QA em produção usa abertura/cancelamento de edição sem gravar no Quick Win real do usuário.
