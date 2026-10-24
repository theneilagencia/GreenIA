# Página pública de planos e capacidade

Rota: `/planos.html`. Candidata para revisão, sem alteração na cobrança ou na liberação de acesso.

A página principal mantém seus CTAs e a apresentação do produto. O link de planos fica na navegação de desktop e celular, no rodapé e no contexto de capacidade compartilhada. O FAQ também aponta para a página.

Os links “Falar sobre este plano” abrem o formulário comercial existente com o nome do plano na mensagem. São aceitos somente os quatro planos e o Capacity Pack; não há envio de contato, criação de cliente ou cobrança automática ao abrir esses links.

## Conferência comercial em 24/10/2026

- Starter: US$ 199/mês, 2.000 créditos; Team: US$ 399/mês, 5.000 créditos; Business: US$ 749/mês, 10.000 créditos; Company: US$ 1.799/mês, 25.000 créditos.
- Capacity Pack: 2.000 créditos por US$ 229.
- Preços correspondem ao catálogo `src/plataforma/catalogo.js` e aos cinco preços ativos USD consultados no Stripe de produção. Nenhuma divergência encontrada.
- Usuários ilimitados, funcionalidades iguais e reserva de 20%: `catalogo.js` e `regrasComerciais`.
- Franquia mensal sem acúmulo, pacotes registrados separadamente e reserva restrita à classe Rápido: `src/plano.js` e `src/plataforma/stripe-direitos.js`.
- Comunicação, análise de arquivos, organização de informações e produção de materiais: funcionalidades existentes de conversas, Quick Wins e geração de arquivos em `src/escritorio.js` e `src/visual/`.

Condições tributárias, prazos de início do acesso e políticas comerciais de alteração ou cancelamento não foram presumidas nem anunciadas. Devem constar da proposta ou dos termos aplicáveis à contratação. A página não cria checkout público nem converte os preços por conta própria.

## Validação

- Teste de correspondência entre a página servida e o catálogo comercial, incluindo preservação do plano na mensagem recebida pelo fluxo real de contatos em ambiente isolado.
- Testes existentes de vendas, contatos, destinatários e alegações comerciais.
- Revisão no navegador em desktop e em viewports incorporados de 320, 390, 768 e 1024 px: sem transbordamento horizontal; planos empilhados no celular, duas colunas no tablet e quatro no desktop.
- Salto “Comparar planos” com foco na seção; menu por teclado com Enter e Escape; CTA do Starter preenchendo a mensagem; parâmetro desconhecido ignorado.

A prévia estática serve somente para revisão visual. O envio de contatos é verificado no servidor real em testes isolados, sem mensagens comerciais externas. Nenhuma publicação em produção foi realizada para esta página.
