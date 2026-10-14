# Homologação em produção — tenants controlados, programação com aviso e conexões fictícias

Etapas 5 e 6 **executadas em 14/10/2026**: resultados em `homologacao-producao-20261014.md`. Etapa 7 continua não executada. Texto original: procedimento pronto para execução, não executado na primeira parte da auditoria: o ambiente da auditoria não
tinha acesso legítimo a produção (sem caixa de email para o código de acesso, sem acesso ao console da plataforma,
sem Shell/API do Render). Nada aqui pode ser marcado como comprovado sem a execução real e o registro das evidências.

## Pré-requisitos (acessos que precisam ser fornecidos)

| Recurso | Para quê | Quem fornece |
|---|---|---|
| Conta de admin da plataforma (console) com caixa de email acessível ao executor | Criar os dois tenants de homologação e conferir consumo/auditoria | Responsável pela plataforma |
| Duas caixas de email de teste (uma por tenant) + uma terceira para o usuário comum | Login por código e recebimento do aviso | Responsável pela plataforma |
| Shell do serviço no Render (ou equivalente) | Inventário das conexões e leitura de registros sem passar pela interface | Responsável pela conta Render |
| Acesso ao painel do Resend (somente leitura de logs) | Diferenciar aceitação, entrega ao servidor e eventual rejeição | Responsável pela conta Resend |
| Limites autorizados de consumo de IA para a homologação | Evitar consumo real fora do combinado | Responsável financeiro |

## Etapa 5 — dois tenants exclusivos

1. No console, criar `homolog-a` e `homolog-b` (plano de menor custo, status ativa). Registrar IDs, plano, data e
   configurações originais em `qa-producao-saida/homologacao-<data>/00-base.json` (sem códigos, cookies ou CSRF).
2. Em cada tenant: admin, um usuário comum e uma área restrita; marcador sintético distinto
   (`MARCA-HOMOLOG-A-<aleatório>` / `MARCA-HOMOLOG-B-<aleatório>`) em: uma conversa com anexo, um documento da base,
   um Quick Win (publicado, com versão 2), uma programação, uma conexão de teste (API pública de teste), um painel.
3. Acesso cruzado: com a sessão de B, chamar as URLs/IDs dos recursos de A (conversas, anexos, documentos, Quick Wins e
   versões, programações e execuções, conexões e aprovações, painéis, exportações, consumo). Esperado: 404/403 sem
   corpo com dados; nenhum marcador de A em respostas de B (procurar o marcador em todas as respostas salvas).
4. Combinações de permissão × limite: usuário comum sem acesso à área; limite pessoal, global e diário atingidos;
   plano em reserva; duas execuções simultâneas acima da concorrência do plano. Para cada negação: nenhuma ação
   externa (conexão sem execução registrada), nenhum débito (consumo inalterado), mensagem compreensível.
5. Conferir no console: execuções e consumo atribuídos à empresa e à pessoa corretas; políticas de dados aplicadas
   (um envio com CPF sintético em cada tenant, com regras diferentes).
6. Ao encontrar exposição real de dados: parar, registrar, corrigir, retestar antes de seguir.

Cobertura local (simulação, não substitui o item acima): `test/multiempresa.test.js`, `multiempresa-extra`,
`auditoria-tenants`, `integracoes-tenants`, `paineis-tenants`, `quickwins-v2-tenants`, `producao-visual-tenants`,
`quickwin-interpretacao-tenants`, `consumo`, `qw-programacao` — 57/57 aprovados em 15/10/2026.

## Etapa 6 — programação com aviso real

1. No `homolog-a`, Quick Win simples com material sintético; destinatário do aviso = caixa de teste autorizada.
2. Agendar para daqui a ~10 min (horário de Brasília) pela aplicação; sair da sessão e fechar o navegador.
3. Após o horário: no console/atividade, localizar a execução (`qw_programadas_execucoes`) e o evento
   `quickwin.scheduled_notification_sent` com `execucao`, `programacao`, `via: resend` e `mensagem` (id do Resend).
4. No painel do Resend, abrir a mensagem com esse id: registrar separadamente **aceito** (API 200), **entregue ao
   servidor de destino** (evento delivered) e **na caixa de entrada** (conferência humana na caixa de teste).
5. Entrar como responsável: resultado disponível. Entrar como outro usuário: sem acesso ao resultado.
6. Repetir com: cancelamento antes do horário; falta de material; nova versão publicada (deve pedir revisão);
   permissão revogada do responsável; orçamento esgotado; reinício do serviço durante a fila. Conferir que não há
   duplicação (uma execução e um aviso por ocorrência) e o fuso.
7. Encerrar: pausar/excluir as programações de teste e registrar o estado final.

## Etapa 7 — conexões fictícias antigas

No Shell do serviço:

```
node scripts/conexoes-qa.mjs inventario --dados dados > /tmp/conexoes.json
```

- `qa_comprovado`: endereço numa API pública de teste usada pelos scripts de QA **e** marca de QA no nome.
- `revisar`: só uma das marcas → decisão humana; o script não age.
- `legitimo`: sem marcas.

Antes de agir, revisar para cada `qa_comprovado`: tenant, dependências (capabilities ativas, aprovações pendentes,
execuções, Quick Wins que executaram, programações ativas, webhooks). Programações ativas dependentes devem ser pausadas
antes. Então, por banco:

```
node scripts/conexoes-qa.mjs revogar --db <banco> --ids <id1,id2> --por <email de quem autorizou>          # simulação
node scripts/conexoes-qa.mjs revogar --db <banco> --ids <id1,id2> --por <email de quem autorizou> --confirmar
```

O produto só permite **revogar** (status REVOKED, capabilities revogadas, aprovações pendentes invalidadas, credencial
apagada, evento na atividade). Não há exclusão física; não anunciar "apagada". As demais integrações da empresa não
mudam (testado em `test/conexoes-qa.test.js`). Rodar o inventário de novo e anexar antes/depois ao relatório.
