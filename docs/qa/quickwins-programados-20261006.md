# Quick Wins programados

Liberação programados-v1. Base de produção: 80f3629. Data: 2026-10-06.

## Escopo entregue

- Programação diária, semanal e mensal (dias 1 a 28), com fuso explícito.
- Eventos autenticados por webhooks existentes. Assinatura, validade e deduplicação preservadas. O evento inicia o caso configurado; seu corpo não é enviado automaticamente para a IA.
- Fila persistente no banco de cada empresa, executada pelo servidor a cada 30 segundos, sem sessão do navegador. Um trabalho por rotina; ocorrências vencidas são consolidadas, sem executar todo o período de indisponibilidade.
- Criação e revisão salvam pausadas. Só o responsável ativa ou inicia; gestores podem pausar. Equipe com acesso ao Quick Win vê status; entrada e conversa ficam restritas ao responsável.
- Revalidação de pessoa ativa, vínculo/roles, plano, ciência da política, acesso ao Quick Win e versão publicada. Antes de cada etapa externa, a pessoa é revalidada novamente.
- Caso configurado cifrado com AES-256-GCM. Recusa de credenciais e de conteúdo incompatível com política/retenção. Auditoria e email de status sem conteúdo do caso.
- Créditos mensais e quantidade diária por rotina. Consumo consolidado sobrevive à exclusão da conversa. Execução iniciada pode ultrapassar o orçamento da rotina; limites do plano continuam aplicados.
- Alterações externas exigem aprovação; modos preparar/consultar continuam restritivos. Retomada usa o mesmo plano e as mesmas entradas aprovadas, sem nova geração pela IA. Expiração ou recusa pausa a rotina.
- Reinício conserva a fila. Execução de resultado incerto é interrompida e pausada para revisão humana, sem repetir efeitos externos automaticamente.
- Acréscimo de duas tabelas, em transação, com backup consistente antes da primeira instalação em banco existente. Nenhum dado antigo é removido. Voltar ao código anterior não exige remover as tabelas.

## Validação

Testes locais com dados fictícios, provedores simulados e API de integração local. Nenhum sistema externo real recebeu escrita.

`test/qw-programacao.test.js`: agenda/fuso/DST; pausado por padrão; execução sem navegador; acesso da equipe; versão e responsável revogados; créditos após exclusão; não sobreposição; recuperação; webhook inválido/replay/rollback; credenciais; aprovação e retomada única; escrita legada sob política permissiva ainda aguardando aprovação; aprovação expirada; plano multiempresa; banco fechado/reaberto; outro gestor não executa como o responsável; exclusão do Quick Win pausa rotinas e cancela trabalhos na fila.

`e2e/qw-programacao.test.js`: formulário, salvar/conferir/ativar, executar/fechar aba/reabrir resultado, 390 px e erros JavaScript. Regressão do modo recomendado e da LP/demonstração: 4 testes aprovados. Regressão browser de integrações, Quick Wins, histórico e Conhecimento: 26 testes aprovados.

Motor/API de integrações, separação entre empresas, legislação e programação: 39 testes aprovados. Programação e registro da copy: 30 testes aprovados. Suíte geral: 786 testes aprovados. Após os últimos reforços, programação e Quick Wins: 21 testes aprovados (incluindo os 13 cenários de programação).

A verificação em produção confere deploy, saúde, carregamento das telas e a LP. Não equivale a testar cada conector real; a execução depende de uma conexão preparada e validada pela empresa.

## Limites operacionais

A fila usa o banco no disco persistente da instalação atual. Esta versão foi projetada para um processo de aplicação, não para múltiplas réplicas escrevendo na mesma fila. Horários não têm garantia de pontualidade. A indisponibilidade pode atrasar execuções. Arquivos no computador fechado não ficam disponíveis automaticamente; fontes precisam estar na plataforma ou em conexões autorizadas.

Notificação por email depende do SMTP. Falhas são auditadas e o status permanece consultável na plataforma. Não há garantia de entrega nem retentativa automática de email. Conversas seguem a retenção existente; a configuração cifrada da rotina é cadastro operacional e pode ser revisada para remover o caso.

Nenhuma rotina existente é ativada por esta atualização. A funcionalidade fica disponível para Quick Wins publicados e pessoas com permissão de gestão; eventos dependem da habilitação de integrações.
