# Conversas: histórico e exclusão

Data: 06/10/2026. Base: `02d30d0`, branch `greenia-lite`.

## Comportamento

- Histórico com busca por título ou Quick Win, filtros, agrupamento por data e paginação de 50 conversas. O total deixa de ficar limitado às primeiras 200 conversas.
- Menu de ações em cada conversa, no histórico e na lateral: renomear e excluir. Layout responsivo, foco visível e operação por teclado.
- Exclusão individual com diálogo acessível e cancelamento em foco. A conversa aberta também usa esse diálogo.
- Exclusão de todas as conversas da própria pessoa neste ambiente, incluindo testes de Quick Wins, com quantidade conferida no servidor e aceite explícito. Conversas criadas depois do limite confirmado são preservadas.
- Exclusão bloqueada durante o processamento de mensagens ou de integrações. Transação remove mensagens, anexos e planos vinculados; aprovações pendentes são negadas e seu material é removido. O runtime bloqueia planos excluídos.
- A interface explica que exclusão é irreversível, não desfaz alterações externas e que registros de uso e backups seguem a retenção aplicável.

## Validação

- `npm test`, com Chromium configurado: suíte completa do servidor, 774 testes aprovados.
- Regressão de navegador de lateral, UX, fluxo e histórico: 26 cenários aprovados.
- Suíte final específica do histórico: 2 cenários aprovados, incluindo paginação, busca, renomeação, cancelamento, exclusão individual e total, falha recuperável do servidor e conversa aberta.
- Inspeção visual de desktop (1280 px) e celular (390 px). Verificação de ausência de transbordamento em 320, 390 e 768 px.
- Testes de isolamento entre pessoas, mais de 200 conversas, limpeza de anexos e planos, preservação de novas conversas e bloqueio durante processamento.
- `git diff --check` sem erros.

Todas as exclusões de QA ocorreram em bancos temporários com dados fictícios. A verificação em produção deve abrir e cancelar os diálogos, sem excluir o histórico real.

## Referência visual e limite de escopo

Princípios de navegação da Linear: busca e filtros próximos ao conteúdo, hierarquia discreta, listas compactas e ações contextuais. A implementação mantém a arquitetura JavaScript e os componentes da GreenIA; não introduz uma migração de framework.

O bloqueio de envio ativo acompanha o processo da aplicação atual. Uma futura implantação com múltiplos processos simultâneos requer coordenação compartilhada desse bloqueio.
