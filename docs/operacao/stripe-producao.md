# Stripe em produção

O código admite dois ambientes explícitos. Ativar a conta no Dashboard não configura automaticamente o GreenIA. Nenhuma cobrança começa apenas por atribuir um plano ou definir estas variáveis: cada empresa precisa ter cobrança Stripe habilitada explicitamente, e a emissão é uma ação do operador.

## Configuração

- `STRIPE_HABILITADO=teste` utiliza credenciais `sk_test_` ou `rk_test_`.
- `STRIPE_HABILITADO=producao` utiliza `sk_live_` ou `rk_live_` e exige `STRIPE_ACCOUNT_ID=acct_...` da conta empresarial escolhida.
- `STRIPE_SECRET_KEY`: segredo armazenado somente no serviço do servidor. Não colocar em Git, mensagens ou frontend.
- `STRIPE_API_VERSION`: versão escolhida e validada no Workbench; o endpoint de webhook deve usar a mesma versão. A versão vigente conferida na documentação em 23/10/2026 é `2026-09-30.endive`, utilizada nos testes; `2026-09-30.clover` era um identificador inválido e não deve ser configurado; não trocar por uma versão posterior sem validar os objetos canônicos usados pelo código.
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint `/api/stripe/webhook` desta conta e deste modo; não reutilizar o segredo do sandbox anterior.
- `PLATAFORMA_URL`: endereço público HTTPS do ambiente correto.
- `STRIPE_RENOVACOES=0` na configuração inicial. `1` permite as emissões mensais BRL previamente autorizadas para cada empresa, sem confirmar pagamentos nem antecipar créditos.

Sem habilitação, pagamentos permanecem desligados. Restaurações isoladas também não fazem operações externas.

## Separação dos dados

`stripe_ambiente` vincula a base de controle a uma combinação conta/modo. Trocas são recusadas sem apagar dados ou cobranças. Use bases separadas para homologação e produção. Não copie clientes, pedidos, pagamentos, períodos ou saldos fictícios do ambiente anterior para produção.

Bases antigas sem vínculo que já tenham histórico Stripe precisam de conciliação antes de receber uma conta explícita ou o modo de produção. A migração conserva o funcionamento do sandbox legado sem conta explícita; não presume que seus dados pertencem à conta empresarial nova.

Antes de acessar recursos da conta, o cliente consulta `GET /v1/account` e compara o ID. Produção exige pagamentos e repasses habilitados nessa consulta. Uma chave restrita deve permitir essa leitura, além das operações de clientes, Checkout, faturas, itens, assinaturas e, para o preparador de catálogo, produtos e preços. Respostas e eventos do outro modo são recusados. Não há suporte a eventos Connect neste fluxo.

## Catálogo e câmbio

Prévia sem rede ou alterações:

```sh
node scripts/stripe-catalogo.mjs --moeda=usd
```

Com as variáveis seguras previamente configuradas no servidor e a conta correta conferida:

```sh
node scripts/stripe-catalogo.mjs --aplicar-producao --moeda=usd
```

O comando cria ou reutiliza somente produtos e preços USD; não cria clientes, faturas, assinaturas ou créditos. `--aplicar-teste` continua disponível e não aceita configuração de produção. Não reutilizar IDs do catálogo do sandbox.

BRL continua sendo calculado pela PTAX de venda disponível a cada emissão, com cotação e valor registrados no pedido; reenvios conservam o valor original. A capacidade de IA não muda com a moeda. O Checkout USD de planos usa assinatura mensal; BRL usa emissão por período.

## Validação antes da publicação

1. Confirmar banco/CNPJ, cadastro societário e segurança no Dashboard empresarial.
2. Configurar credenciais e endpoint no ambiente correspondente. Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `invoice.payment_failed`.
3. Retestar no provedor em homologação separada: BRL, USD, repetições de webhook, renovação e cancelamento, sem pagamento real automático.
4. Conferir backup e restauração dos dados persistentes antes da publicação. Não trocar a base de produção por uma base vazia para contornar o vínculo Stripe.
5. Após publicação autorizada, conferir entregas de eventos e conciliação. Uma cobrança real de validação exige decisão explícita sobre cliente e valor.

O console identifica “Produção · cobranças reais” ou “Ambiente de teste” a partir do servidor e aguarda a consulta antes de liberar a emissão. Cadastro de sócio não concede acesso ao console Stripe nem ao GreenIA.

## Limites da entrega

Os testes automatizados usam o provedor simulado, inclusive para respostas `livemode=true`; isso não comprova credenciais nem entrega de webhook real. Finalizar uma fatura disponibiliza o link hospedado. O botão “Enviar fatura por email” solicita o envio separadamente, após confirmação do operador, conferindo empresa, cliente, moeda, valor, estado e destinatário da fatura canônica. Repetições reutilizam a mesma referência; retornos inconclusivos com mais de 23 horas exigem conciliação. Esse envio não libera créditos. No modo de teste o Stripe simula a solicitação, mas não entrega email; resposta de sucesso em produção também não comprova recebimento na caixa do cliente. A nova conta exige configuração própria, mesmo que o sandbox antigo já tenha passado em testes.

O endpoint deve ser criado somente quando o receptor estiver preparado. A criação v1 não oferece parâmetro para nascer desativado; criar ativo e tentar desativar em seguida não é uma preparação sem risco. Não ignorar esse limite nem direcionar eventos de produção à homologação.

Fontes: https://docs.stripe.com/api/invoices/send ; https://docs.stripe.com/keys ; https://docs.stripe.com/api/accounts/retrieve ; https://docs.stripe.com/webhooks ; https://docs.stripe.com/api/versioning
