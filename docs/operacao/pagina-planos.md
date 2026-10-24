# Página pública de planos e capacidade

Rota: `/planos.html`. Página disponível por link direto para uso comercial, com contratação autenticada pelo Stripe e alternativa de contato comercial.

Por decisão comercial, a home e o FAQ mantêm a navegação anterior, sem links para esta página. A rota foi retirada do sitemap e recebe `noindex,follow`. O link direto pode ser enviado no fluxo comercial; isso não representa uma restrição de acesso por autenticação.

Os links “Falar sobre este plano” abrem o formulário comercial existente com o nome do plano na mensagem. São aceitos somente os quatro planos e o Capacity Pack; não há envio de contato, criação de cliente ou cobrança automática ao abrir esses links.

## Conferência comercial em 24/10/2026

- Starter: US$ 199/mês, 2.000 créditos; Team: US$ 399/mês, 5.000 créditos; Business: US$ 749/mês, 10.000 créditos; Company: US$ 1.799/mês, 25.000 créditos.
- Capacity Pack: 2.000 créditos por US$ 229.
- Preços correspondem ao catálogo `src/plataforma/catalogo.js` e aos cinco preços ativos USD consultados no Stripe de produção. Nenhuma divergência encontrada.
- Usuários ilimitados, funcionalidades iguais e reserva de 20%: `catalogo.js` e `regrasComerciais`.
- Franquia mensal sem acúmulo, pacotes registrados separadamente e reserva restrita à classe Rápido: `src/plano.js` e `src/plataforma/stripe-direitos.js`.
- Comunicação, análise de arquivos, organização de informações e produção de materiais: funcionalidades existentes de conversas, Quick Wins e geração de arquivos em `src/escritorio.js` e `src/visual/`.

Condições tributárias, prazos de início do acesso e políticas comerciais de alteração ou cancelamento não foram presumidas nem anunciadas. Devem constar da proposta ou dos termos aplicáveis à contratação. A página utiliza Checkout hospedado com preços calculados no servidor. BRL é convertido pela PTAX na emissão; USD de planos é assinatura mensal recorrente e BRL é pagamento único. Não há cobrança automática ao abrir a página.

## Validação

- Teste de correspondência entre a página servida e o catálogo comercial, incluindo preservação do plano na mensagem recebida pelo fluxo real de contatos em ambiente isolado.
- Testes existentes de vendas, contatos, destinatários e alegações comerciais.
- Revisão no navegador em desktop e em viewports incorporados de 320, 390, 768 e 1024 px: sem transbordamento horizontal; planos empilhados no celular, duas colunas no tablet e quatro no desktop.
- Salto “Comparar planos” com foco na seção; menu por teclado com Enter e Escape; CTA do Starter preenchendo a mensagem; parâmetro desconhecido ignorado.

A prévia estática serve somente para revisão visual. O envio de contatos é verificado no servidor real em testes isolados, sem mensagens comerciais externas. A publicação da página foi autorizada e realizada; sua divulgação posterior ficou restrita ao link direto e ao fluxo comercial.

## Autosserviço e esgotamento de créditos

- API `/api/contratacao` usa o tenant da sessão; escrita exige CSRF e `billing.manage`. O administrador da empresa recebe essa permissão pelo perfil existente. Membros consultam a orientação e pedem contratação ao administrador.
- Cotação de 15 minutos vinculada a empresa e usuário. O servidor valida o catálogo ativo e guarda o câmbio pelo pedido. A confirmação habilita explicitamente Stripe em contratos externos ou gratuitos; a visita e a cotação não alteram o contrato nem chamam Stripe.
- Checkout hospedado: retorno e cancelamento voltam à mesma página. Retorno não comprova pagamento. Somente webhook verificado concede direitos, de forma idempotente.
- Uma assinatura/cobrança pendente impede outro plano; a página permite retomar o pagamento existente. Mudanças durante período pago exigem conciliação. Pacotes permanecem separados.
- No app, a franquia esgotada abre `/planos.html?motivo=creditos` uma vez por usuário/empresa/ciclo e uma vez no esgotamento completo. A reserva continua limitada à classe Rápido. Não há redirecionamento enquanto um novo pedido está sendo escrito; a conferência ocorre ao entrar e ao concluir uma resposta.
- Pedido recusado por falta de créditos é preservado na sessão do navegador, com texto e referências dos anexos, vinculado à empresa e ao usuário. O retorno abre a conversa e restaura o pedido sem reenviar.
- Visitantes precisam entrar no ambiente existente; empresas ainda sem cadastro seguem pelo canal comercial. A home, FAQ e sitemap continuam sem links para a página.
- Validação financeira de produção sem transação real: testes automatizados de autorização, isolamento, cotação, idempotência e webhook. Testes de cobrança usam dados isolados e provedor simulado; pagamentos reais dependem da conclusão do Checkout pelo cliente.
