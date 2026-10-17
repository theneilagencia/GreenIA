# Painéis padronizados ligados a Quick Wins

## Produto e jornada

Catálogo inicial fechado: conferência de documentos de fornecedores e acompanhamento de ações e prazos. Campos, estados e indicadores são definidos pelo produto, sem configuração de banco, fórmulas ou gráficos pelo usuário. Processos criados pelo catálogo ficam em preparo e seguem o teste/publicação já existente. Quem prepara pode associar um modelo a um Quick Win existente; isso não modifica suas instruções ou publicação.

Jornada: Quick Wins → Escolher processo com acompanhamento → criar e testar → publicar pelo fluxo existente → executar → Conferir dados para o acompanhamento → confirmar → Acompanhar resultados. No detalhe de um Quick Win existente: Preparar acompanhamento.

São entregas distintas: painel do resultado (campos sugeridos para conferência), histórico consolidado (dados confirmados com indicadores prontos) e integração contínua. Painéis personalizados e integrações específicas dependem de contratação adicional com escopo e manutenção definidos. Não há sincronização contínua implícita.

## Registro, cálculo e acesso

A extração opcional usa a chamada governada existente: classe/roteamento, política, sigilo, limites, consumo e prazo. Sugestões sem trecho literal do resultado são descartadas. Resultado protegido não dispara chamada adicional; falha ou ausência de evidência abre os campos para conferência manual. A IA não certifica o registro. Preparação idempotente por mensagem, inclusive pedidos simultâneos, sem repetir consumo.

Nada entra nos indicadores sem confirmação humana. Perguntas, inconsistências e conteúdo não guardado não geram registros. Resultados de teste são apenas prévias. Resultado parcial exige ciência adicional e permanece parcial. Campos, datas, estados, limite de 30 itens, credenciais e restrições de armazenamento são validados no servidor. Índices e cálculos não dependem de respostas da IA.

Cada registro começa privado. Compartilhar exige escolha explícita: só os campos confirmados são visíveis às pessoas com acesso atual ao Quick Win; a conversa continua privada. Gestores não recebem registros privados de outras pessoas. Mudança de sigilo atual impede acesso aos compartilhados por terceiros. Acesso de consulta não permite mutação. Cada empresa mantém seu próprio banco; isolamento testado com IDs iguais.

Correção exige motivo e versão atual; revisões são preservadas. Retirada exige motivo e recalcula indicadores. Um resultado é contado uma vez por mensagem; executar novamente o mesmo caso em outra conversa pode duplicar o caso. Para atualizar, use corrigir registro. Não há deduplicação automática por fornecedor ou inferência de aprovação.

Histórico acompanha retenção da conversa de origem, inclusive exclusão e expiração, por chaves estrangeiras em cascata. Esse alcance é explicado nas telas. Registros mensais usam a primeira confirmação em Brasília; correções atualizam os estados daquele mês. A série não é uma fotografia histórica dos estados. Paginação de 50 execuções mantém os totais completos, com 30 itens no máximo por execução.

## Implantação

Três tabelas aditivas: configuração por Quick Win, registros por mensagem e revisões por versão. Banco existente recebe backup consistente antes da primeira atualização. Não há conversão, limpeza ou publicação automática de dados anteriores. Rollback de código é compatível com as tabelas extras, que podem permanecer no banco.

## Evidências técnicas

- Bateria completa de serviços final: 840/840 aprovados, zero falhas, cancelados ou ignorados; 123,57 s, concorrência 2.
- Bateria completa de navegador: 128/128 aprovados, zero falhas, cancelados ou ignorados, antes dos últimos ajustes de interface.
- Após esses ajustes: 5/5 percursos afetados aprovados (4 de painéis e 1 de detalhe existente), 28,30 s. Complemento final de painéis após ajustes de cabeçalho e consulta: 4/4 aprovados, 20,92 s. Inclui processo escolhido pela biblioteca vazia, resultado, erro 503 sem perda, confirmação, correção, recarga, busca, retirada, ajuda e paginação.
- Larguras novas: 320/390/768/1280px. Detalhe existente também cobre 1024/1440px. Capturas locais conferidas.
- Migração em banco em disco simulando estrutura anterior: backup, preservação do registro existente, criação das tabelas e reabertura idempotente aprovados.

A primeira bateria simultânea de serviços/navegador teve 8 falhas de composição visual por proteção de memória do ambiente; não foi aprovada nem se reduziu a proteção. A bateria final de serviços com concorrência 2 passou integralmente. Teste de virada de mês inicialmente expirou sessões ao avançar relógio; fixture passou a renovar ambos os acessos, preservando a validação real da sessão. Falhas iniciais de rota, rótulo de situação e busca móvel foram corrigidas, sem relaxar asserts.

## Limites do aceite

Testes usam fontes e contas fictícias e IA simulada. Extração com provedor real, entendimento por usuários leigos e leitor de tela precisam de aceite separado. A sessão produtiva encontrada estava sem autenticação e com contexto de outra empresa; nenhum dado ou permissão real foi alterado. Deploy e saúde devem ser verificados separadamente da validação autenticada. Este documento não certifica conectores externos nem compliance de fornecedores.
