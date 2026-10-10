# Pendências de integração: destino correto

Em produção, na versão 6814167, o botão Ver e resolver de uma integração gerava #/integracoes/<id>. O roteador só reconhece #/integracoes/c/<id>; por isso redirecionava à lista geral. Defeito reproduzido com a integração fictícia de QA existente.

A resposta do acompanhamento agora usa a rota de detalhe correta. O teste percorre a central, filtra integrações, abre a pendência e confere a URL e o nome do detalhe. Não executa ação externa, não altera credenciais nem autorizações.

Validação: 25 testes focados aprovados, 0 falhas: acompanhamento HTTP, acompanhamento no navegador (incluindo o novo percurso) e integração ponta a ponta em ambiente local fictício. Regressão geral de navegador da correção anterior: 82 aprovados. O ajuste atual muda somente o destino da pendência de integração.

Produção antes deste ajuste: versão 6814167 confirmada; Histórico apresenta rótulos e registros expansíveis, Roteamento e Políticas carregam; seis etapas do guia percorridas; conversa fictícia 730 recebeu as duas tarefas solicitadas. O cadastro do documento fictício persistiu responsável e histórico. Integrações exibem 14 execuções históricas com sucesso e nenhuma aprovação pendente; conectores de cenários negativos continuam reprovados.

A falha transitória de Políticas ocorreu durante a atualização do serviço e desapareceu após a publicação e recarga. Não estabelece a causa do erro de Roteamento da captura antiga. Revisões de acesso e um Quick Win em preparação são decisões operacionais, não defeitos que devam ser eliminados mudando permissões ou publicando sem revisão.
