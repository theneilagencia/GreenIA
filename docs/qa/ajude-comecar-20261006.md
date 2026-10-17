# Me ajude a começar

## Resultado

A tela Nova conversa oferece uma jornada de dois passos com cinco caminhos: Criar e comunicar; Analisar e decidir; Planejar e organizar; Consultar o conhecimento da empresa; Executar processos da empresa.

Os quatro primeiros preparam um pedido editável a partir do objetivo informado. O quinto abre o catálogo existente de Quick Wins, sujeito às permissões atuais. Conhecimento oferece acesso à consulta dos materiais existentes e orienta a conferir as fontes. A orientação não garante que haverá documentos ou processos adequados disponíveis.

## Segurança e escopo

A ajuda é local à conversa, sem IA, consumo de créditos, envio automático ou persistência adicional em localStorage. Preparar um pedido não cria conversa nem executa integração. O envio explícito usa os mesmos controles de política, sigilo, modelos e permissões do chat existente. Conteúdo informado é escapado ao renderizar. Substituir um pedido já escrito exige confirmação; anexos e respostas da ajuda são preservados durante redesenhos na mesma conversa. Abrir outra conversa inicia nova orientação.

Os cartões secundários e sugestões ficam ocultos enquanto a ajuda está aberta. O compositor e os controles de sigilo continuam disponíveis. Fechar a ajuda devolve o foco ao botão; os passos têm título focável e campos rotulados. Catálogo vazio e falta de permissão continuam tratados pelos recursos existentes. Sem alterações de servidor, esquema, dependências ou dados de produção.

## Validação

- Suíte completa: 91 E2E aprovados, zero falhas e zero testes pulados.
- Após ajuste visual final: 15 E2E aprovados, zero falhas, cobrindo a nova jornada e regressão de UX.
- Seis testes novos: cinco caminhos, ausência de POST ao preparar, edição do pedido, volta/fechamento/redesenho, confirmação de substituição, anexos, consulta e catálogo, teclado, campo vazio/espaços, escape de conteúdo, envio explícito e resposta, perfil comum com catálogo vazio sem criação.
- Larguras 320, 390, 768 e 1280 px sem transbordamento horizontal.
- Capturas de desktop e celular conferidas com conta fictícia em ambiente local; IA simulada apenas nos testes.
- Regressão existente inclui Quick Wins, anexos, integrações e aprovações, políticas, permissões, modelos, administração e logout/BFCache.

## Limites e publicação

O QA desta alteração é automatizado em navegador real no ambiente local. A sessão de produção do QA anterior foi encerrada; a nova jornada não foi percorrida autenticada em produção nesta entrega. A publicação será confirmada pelo deploy correspondente no Render. Recarregar abas já abertas para obter o novo código. O fluxo continua sujeito à qualidade dos materiais disponíveis e à revisão humana dos resultados.
