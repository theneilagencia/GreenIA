# Quick Wins guiados — preparação e execução segura

## Comportamento entregue

A biblioteca oferece usar um trabalho pronto, criar com orientação e continuar um rascunho. A criação conserva suas cinco etapas e incorpora materiais, Conhecimento e sistemas no processo; pessoas e limites nas regras; um resumo dessas escolhas na revisão. Exemplos incluem fornecedores, atendimento e compras.

O criador escolhe sistema e ação do catálogo de conexões ativas, na versão aprovada e permitidas pela política. Uma conexão ausente pode ser pedida no próprio rascunho; a ação não faz chamadas externas. O pedido persiste, não se duplica e aparece em Administração e Pendências para quem já tem permissão de preparar conexões. Concluir exige resolver todas as ações pedidas. O pedido não envia email ou mensagem a terceiros.

Responsáveis são pessoas ativas da empresa. Aprovadores precisam já ter a permissão integrations.approve; selecionar uma pessoa não concede acesso. O servidor verifica a elegibilidade na configuração, na decisão e antes de usar a aprovação. Um perfil que só aprova consegue revisar sem acessar a configuração técnica das conexões.

Três modos: preparar resultado sem acesso externo; consultar sem alterações; consultar e preparar alterações que exigem aprovação humana. O último modo exige aprovação mesmo quando uma política mais permissiva dispensaria essa etapa. Há até dez ações e limite de itens por ação. Entradas acima do limite são bloqueadas antes da chamada; uma consulta acima do limite não vira material da IA. Ações de alteração em massa sem contagem verificável ficam bloqueadas.

A autorização dos trabalhos com controles novos expira em 24 horas, vale para a entrada e versão aprovadas e preserva a idempotência ao retomar. Quick Wins anteriores, sem esses controles, conservam sua configuração. Planos associados a um Quick Win usam as ações e controles da versão efetiva no servidor; valores enviados pelo cliente não os substituem.

## Limites explícitos

O limite de itens conta coleções verificáveis no material da ação. Não garante o número de registros afetados por um endpoint arbitrário, nem valores financeiros, unidades ou categorias por texto livre: esses limites exigem validação na conexão. A avaliação de qualidade da IA não autoriza efeitos externos. Solicitar uma conexão não a publica nem cria credenciais. Nenhum sistema externo foi alterado pelos testes; APIs e IA são simuladas localmente.

## Validação

- Regressão existente do navegador: 93/93 testes aprovados.
- Jornada final de integrações e preparação: 6/6 aprovados, incluindo escolha de ação pronta, pedido persistente de conexão, criador sem acesso administrativo, responsáveis e limites recuperados após recarregar, celular 390px sem rolagem horizontal e nenhum erro JavaScript.
- Regressão focal do servidor: 24/24 aprovados, cobrindo motor, integração multiempresa, permissões e preparação.
- Novos testes de segurança: 4/4 aprovados, incluindo modos, limites antes de efeitos, material excedente, aprovador obrigatório, expiração, não duplicação, catálogo sem credenciais, pedido idempotente, feature flag e controles autoritativos do Quick Win.

Suíte ampla do servidor: 770/770 aprovados, com Chromium configurado para os testes de peças visuais. Verificação isolada de design visual: 13/13 aprovados. Após o ajuste final de revogação do aprovador, motor e isolamento multiempresa foram verificados novamente. Os testes de navegador simulam o perfil iniciante; não substituem observação com usuários reais não nativos digitais.

## Publicação e recuperação

Mudança aditiva de banco: tabela qw_pedidos_conexao e índice, criados com IF NOT EXISTS. Sem alterações em dependências, credenciais, preços ou autorizações existentes. Reverter o código à base 049bad0 preserva a tabela e os dados. Não restaurar banco antigo sobre dados recentes; antes de voltar o código, suspender trabalhos novos que dependam dos controles novos para não perder sua imposição.
