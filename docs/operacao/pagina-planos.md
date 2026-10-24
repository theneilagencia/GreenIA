# Página pública de planos e capacidade

Rota: `/planos.html`. Página disponível por link direto para uso comercial, com contratação autenticada pelo Stripe e alternativa de contato comercial.

Por decisão comercial, a home e o FAQ mantêm a navegação anterior, sem links para esta página. A rota foi retirada do sitemap e recebe `noindex,follow`. O link direto pode ser enviado no fluxo comercial; isso não representa uma restrição de acesso por autenticação.

Os quatro cartões oferecem “Escolher este plano”. Sem sessão, a página verifica o email por código e cadastra a empresa ou reutiliza o vínculo existente. Em seguida apresenta cotação e confirmação antes do Checkout hospedado. A visita não cria empresa, cliente Stripe nem cobrança.

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
- Visitantes podem contratar na própria página, sem cadastro prévio: verificam email e cadastram uma empresa antes do pagamento. Clientes existentes reutilizam seu vínculo e sua permissão financeira. A home, FAQ e sitemap continuam sem links para a página.
- Validação financeira de produção sem transação real: testes automatizados de autorização, isolamento, cotação, idempotência e webhook. Testes de cobrança usam dados isolados e provedor simulado; pagamentos reais dependem da conclusão do Checkout pelo cliente.

## Correção da contratação pública em 24/10/2026

A versão anterior limitava o Checkout a empresas previamente cadastradas e deixava visitantes nos links de contato. Essa limitação foi removida.

A API `/api/adesao` existe apenas no host da plataforma e usa cookie HttpOnly/SameSite, sessão de uma hora, CSRF, verificação de origem e código de email de uso único com limites por email/IP. Ela reutiliza o serviço de email e as regras existentes de usuários/perfis. Nome, documento ou domínio não conferem acesso a uma empresa existente. Cadastros repetidos retornam a mesma empresa.

O cadastro de uma empresa nova ativa o controle de direitos sem período pago: não existe franquia inicial utilizável, nem reserva liberada antes do webhook. Falha no provisionamento mantém o ambiente em implantação. O webhook continua sendo a única origem dos direitos pagos.

Teste no navegador: servidor GreenIA real com bancos em memória e caixa postal local de QA; após o cadastro e a confirmação do valor, o servidor criou um cliente e uma sessão reais no sandbox Stripe, pela API oficial, e abriu o formulário hospedado em `checkout.stripe.com`. Valor BRL e metadados corresponderam à cotação. Nenhum pagamento foi concluído e nenhum dado de cartão real foi informado. O fixture de QA não faz parte do código publicado.

## Jornada explícita para novos clientes

A entrada da contratação distingue “Sou novo cliente — escolher meu plano” de “Já sou cliente — acessar minha empresa”. Para um visitante sem sessão, escolher um plano abre diretamente os campos de nome, empresa, email, documento opcional e autorização de cadastro, identificando o plano escolhido.

Os dados ficam apenas na memória da página enquanto o email é verificado. Após o código correto, a API existente cria a empresa sem créditos disponíveis e segue para revisão do valor e Checkout. Se o email já possui vínculo, a página utiliza o cadastro existente e mantém as permissões financeiras. O caminho dos clientes atuais continua disponível sem exigir novo cadastro.

As etapas ficam identificadas na tela: cadastro da empresa, confirmação do email, revisão do valor e pagamento no Stripe. Nenhuma nova chamada ao Stripe foi acrescentada antes da confirmação de pagamento.
