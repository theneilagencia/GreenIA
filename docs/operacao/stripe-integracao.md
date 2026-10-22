# Integração Stripe — GreenIA

## Decisões comerciais confirmadas

Pagamentos em USD e BRL. Base de preço em USD conforme os documentos de formação de preço e custos v4 enviados em 22/10/2026 (conteúdo interno identificado como cenário v3.1). Cada emissão em BRL converte a referência USD pela cotação disponível na data da emissão. Renovação mensal deve consultar novamente; reenvio da mesma cobrança não deve consultar novamente.

| Produto | Base USD | Créditos | Reserva |
| --- | ---: | ---: | ---: |
| Starter mensal | 199 | 2.000 | 400 |
| Team mensal | 399 | 5.000 | 1.000 |
| Business mensal | 749 | 10.000 | 2.000 |
| Company mensal | 1.799 | 25.000 | 5.000 |
| Capacity Pack avulso | 229 | 2.000 | 0 |

Usuários ilimitados. Franquia não acumula; pacotes acumulam. A reserva não é bônus comercial e só permite o nível Rápido. Não cobrar por token ou usuário no Stripe: consumo continua no GreenIA.

## Estado da implementação

Implementados em sandbox, desligados por padrão:

- Catálogo USD e conversão BRL com snapshot persistido por pedido.
- Checkout hospedado: assinaturas mensais USD; compras avulsas BRL e Capacity Packs nas duas moedas.
- Criação e finalização de invoices USD/BRL, com itens explicitamente associados à invoice e link hospedado. Não envia email automaticamente.
- Rotas financeiras do operador com sessão, CSRF e permissão de planos. Ação “Cobranças Stripe (teste)” no resumo da empresa, visível somente com o sandbox habilitado.
- Webhook com corpo bruto, HMAC, tolerância de 5 minutos, verificação de modo/conta, deduplicação e consulta canônica do recurso antes de conceder capacidade.
- Períodos pagos e pacotes com efeito deduplicado no banco do tenant; expiração do período bloqueia nova IA sem apagar histórico. O primeiro pagamento migra a empresa; empresas não migradas continuam manuais.
- Geração mensal BRL com nova cotação, aceite explícito por cobrança, chave de pedido determinística, interrupção/retomada pelo operador e flag global desligada por padrão. Uma invoice ainda não paga não gera uma segunda invoice. Falha de cotação mantém a emissão pendente. A aplicação verifica vencimentos a cada 15 minutos.
- Assinatura USD renova com o período da invoice paga. Cobrança avulsa mensal começa na confirmação ou no fim do período pago atual, se antecipada. Avisos usam o identificador do ciclo pago.
- Receita recebida é registrada com sua moeda original; a referência econômica USD não é lançada como receita USD efetiva quando o pagamento foi em BRL.

Pendentes: credenciais e homologação real Stripe/BCB, entrega automática de invoices e recibos, tratamento financeiro completo de reembolsos/disputas, portal do cliente e ativação live. O operador pode emitir a renovação BRL no console ou programar próximas faturas. A geração programada é diferente de débito automático: o cliente paga pelo link da invoice, e o envio do link ainda precisa de um fluxo de entrega.

Reembolsos, disputas e falhas de pagamento entram em `stripe_pendencias` para conciliação manual. Não geram estorno arbitrário de créditos consumidos ou cancelamento da empresa. Assinaturas canceladas mantêm o acesso já pago até o fim do período. Mudanças de plano/moeda e invoices com proporcionalidade são recusadas para conciliação; não se aplicam automaticamente.

O provisionamento do ambiente da empresa continua sendo responsabilidade do operador. A integração não publica nem cancela ambientes automaticamente. Empresas manuais com pacotes de validade específica exigem conciliação antes da migração, para não transformar saldo temporário em crédito sem prazo.

## Câmbio por emissão

Regra técnica adotada como referência: PTAX de venda do último fechamento publicado pelo Banco Central disponível na consulta, em reais por dólar, sem spread adicional. Fonte configurada no código: endpoint oficial `CotacaoDolarPeriodo`, ordenado pela publicação mais recente. Não é cotação intradiária nem garantia da taxa efetiva de liquidação do Stripe. Fuso do dia da consulta: America/Sao_Paulo.

Antes do fechamento, em fins de semana e feriados, o último fechamento pode pertencer a outro dia. Mostrar sua data real e indicar isso na confirmação e na fatura. Bloquear emissão se não houver resposta válida, se a referência tiver mais de sete dias corridos ou se ela estiver no futuro. Essa janela é um controle técnico; não apresentar uma cotação antiga como cotação publicada hoje.

Fórmula: `total BRL em centavos = arredondar_meio_para_cima(total USD em centavos × PTAX venda)`. Arredondar uma única vez no total da cobrança. Guardar base USD, quantidade, taxa, fonte, data de referência, publicação, consulta e total BRL. O registro por pedido é imutável. Toda nova mensalidade recebe um pedido determinístico distinto; tentativas de pagamento e reenvios reutilizam o pedido original. Uma prévia de preço ainda não confirmada precisa ser revalidada no checkout; não reutilizar um orçamento abandonado de dias anteriores como nova emissão.

## Arquitetura e controles

1. Cadastro: um Customer por empresa e moeda, com vínculo interno obrigatório. Apenas administradores financeiros autorizados iniciam checkout. Valores, produto e quantidade vêm do servidor, nunca do navegador. Nenhum dado de cartão passa pelos bancos da GreenIA.
2. USD: quatro Prices mensais recorrentes no Billing; Capacity Pack como pagamento avulso. Checkout hospedado, sem quantidade por assento e sem cupons automáticos que violem a margem.
3. BRL: emitir invoice de valor convertido a cada ciclo, com item avulso em BRL. Não cadastrar um Price mensal BRL fixo nem presumir que a conversão inicial será recalculada nas renovações. O futuro agendador deverá usar o calendário contratual e registrar uma referência determinística por empresa/ciclo. A renovação BRL pode ser emitida pelo operador ou programada explicitamente por ele. Guardar a taxa nos metadados e na descrição exibida ao cliente. Mostrar valor final antes de uma compra avulsa; informar previamente ao assinante a regra de variação cambial da mensalidade. Meios de pagamento e cobrança automática dependem das capacidades da conta e autorização de pagamento do cliente.
4. Pagamento: validar assinatura do webhook sobre corpo bruto, conta e modo sandbox/live; guardar IDs de evento e IDs de efeito financeiro. Confirmar customer, moeda, valor, produto, empresa e período contra o pedido persistido. A página de retorno não libera capacidade. Evento repetido ou fora de ordem não pode duplicar créditos.
5. Direitos de acesso: liberar franquia/reserva apenas para período pago; pacote uma única vez por pagamento confirmado. Pagamento pendente não libera créditos. Não usar `companies.status='cancelada'` para inadimplência, porque o fluxo atual agenda exclusão em 30 dias. Manter histórico consultável e separar suspensão financeira de cancelamento/exclusão de dados.
6. Ciclo: `src/plano.js` hoje renova no mês-calendário UTC, independentemente de pagamento. Para empresas migradas, franquia, reserva e avisos agora seguem o período pago; não dar uma segunda franquia no dia 1 para uma assinatura iniciada no dia 22. Preservar empresas com cobrança manual durante a migração. O primeiro período parcial exige tratamento coerente de preço e capacidade; não cobrar proporcional e liberar franquia integral por acidente.
7. Mudança de plano: definir vigência do próximo ciclo e evitar proration automática com franquia duplicada. Reembolso/disputa exige registro e reconciliação de capacidade já consumida; nunca apagar histórico ou gerar saldo negativo silencioso. O portal do Stripe não deve permitir troca livre de moeda/plano sem passar pelas regras da GreenIA.
8. Conciliação: comparar pedidos, invoices, pagamentos, reembolsos e capacidade liberada. Preservar USD e BRL separadamente; não gravar receita em reais no campo `preco_usd` nem somar moedas. Para margem, registrar os custos efetivos de Stripe/Billing/Invoicing e liquidação, pois os 3% da planilha são apenas premissa.

## Preparar o catálogo USD em sandbox

Prévia sem chave ou efeitos externos:

```bash
node scripts/stripe-catalogo.mjs
```

Configurar `STRIPE_SECRET_KEY` de teste (preferencialmente chave restrita com Products/Prices), e `STRIPE_API_VERSION` conforme a versão escolhida no Workbench. Não inserir credenciais no comando, no repositório ou no chat. Com variáveis já configuradas:

```bash
node scripts/stripe-catalogo.mjs --moeda=usd --aplicar-teste
```

O script recusa chaves live, reutiliza IDs determinísticos e valida Prices existentes antes de aceitar o vínculo. Não envia emails, cria clientes ou cobra pagamentos. BRL permanece para emissão dinâmica de faturas. Nenhuma chave foi configurada nesta alteração.

## Critérios antes de produção

Validar em sandbox real: sucesso/recusa/autenticação adicional; meios assíncronos; falha de câmbio; fechamento anterior; renovação com nova taxa; repetição preservando valor original; assinatura inválida; evento duplicado e fora de ordem; reinício entre confirmação e crédito; isolamento entre empresas; fim do período sem pagamento; cancelamento preservando dados; reembolso e disputa. Concluir revisão financeira dos custos reais e da cobrança variável antes de habilitar live.

## Referências oficiais

- https://docs.stripe.com/payments/checkout
- https://docs.stripe.com/invoicing/integration
- https://docs.stripe.com/billing/subscriptions/billing-cycle
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/keys
- https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios

## Habilitar o sandbox da aplicação

Usar uma implantação de homologação isolada da operação dos clientes. Configurar pelas variáveis do servidor:

- `STRIPE_HABILITADO=teste`
- `STRIPE_SECRET_KEY`: chave de teste, preferencialmente restrita, com permissões para Customers, Checkout Sessions, Subscriptions (leitura), Invoices e Invoice Items. Products/Prices também são necessários se executar o preparador de catálogo.
- `STRIPE_API_VERSION`: versão explicitamente escolhida no Workbench; usar a mesma para eventos snapshot.
- `STRIPE_WEBHOOK_SECRET`: segredo do endpoint de homologação.
- `STRIPE_RENOVACOES=1`: permite a geração programada de invoices BRL com aceite explícito. Padrão: desligado. Faturas programadas não são enviadas por email nesta etapa.
- `PLATAFORMA_URL`: origem HTTPS do console. O link de retorno não confirma pagamento e não concede direitos.

Endpoint: `POST /api/stripe/webhook`, apenas na origem da plataforma. Registrar eventos snapshot `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded` e `charge.dispute.created`. Não configurar eventos de contas Connect; esta implementação usa a conta própria. O sandbox recusa eventos live.

No console: Empresas → selecionar empresa ativa com plano comercial correspondente → Mais ações → Cobranças Stripe (teste). Selecionar moeda e canal. Para faturas, informar o prazo acordado. Nenhum preço, cartão ou chave é informado pelo navegador. A empresa não acessa os valores financeiros no produto; o pagamento acontece na página hospedada pelo Stripe.

Rotas para o operador:

- `GET /api/plataforma/empresas/:id/cobrancas`
- `POST /api/plataforma/empresas/:id/cobrancas`

Corpo: `pedido` (referência única estável para reenvios), `produto` (`starter`, `team`, `business`, `company`, `capacity_pack`), `moeda` (`usd` ou `brl`), `canal` (`checkout` ou `fatura`), `quantidade` (1 para plano; 1 a 50 para pacotes), `vencimento_dias` (1 a 90, obrigatório para fatura) e `renovar` (booleano, opcional, apenas planos BRL via fatura). O servidor confere o plano atual e calcula valores. Novos planos duplicados são recusados enquanto houver cobrança pendente ou assinatura vinculada. Para um pedido sem retorno remoto por mais de 23 horas, exige conciliação antes de repetir a criação, evitando depender indefinidamente da janela de idempotência do provedor.

O contexto de restauração `isolado` desliga os efeitos externos mesmo com variáveis Stripe presentes. Sem `STRIPE_HABILITADO=teste`, a aplicação mantém pagamentos desligados. Chaves live são recusadas nesta etapa.

Geração programada: o primeiro pagamento registra o fim do período pago como próxima emissão. Para interromper ou retomar, usar as ações do painel ou `POST /api/plataforma/empresas/:id/cobrancas/parar-renovacao` e `POST /api/plataforma/empresas/:id/cobrancas/retomar-renovacao`. Parar futuras emissões não anula uma invoice já emitida nem apaga o período pago. Uma implantação de publicação controlada também pausa a geração programada.
