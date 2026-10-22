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

Preparados nesta alteração: catálogo derivado da fonte de verdade do produto, provisionamento idempotente de Products/Prices USD em sandbox, consulta PTAX, conversão com arredondamento inteiro e snapshot durável por pedido/empresa. Não montados nas rotas da aplicação e não ativados em produção.

Ainda necessários para uma integração operacional: Checkout, emissão/finalização de invoices, agendamento de renovações BRL, webhooks e conciliação, vínculo de clientes/assinaturas, direitos de acesso pagos, telas financeiras e credenciais de sandbox. Os testes desta alteração usam respostas simuladas dos provedores; não constituem homologação Stripe/BCB real.

## Câmbio por emissão

Regra técnica adotada como referência: PTAX de venda do último fechamento publicado pelo Banco Central disponível na consulta, em reais por dólar, sem spread adicional. Fonte configurada no código: endpoint oficial `CotacaoDolarPeriodo`, ordenado pela publicação mais recente. Não é cotação intradiária nem garantia da taxa efetiva de liquidação do Stripe. Fuso do dia da consulta: America/Sao_Paulo.

Antes do fechamento, em fins de semana e feriados, o último fechamento pode pertencer a outro dia. Mostrar sua data real e indicar isso na confirmação e na fatura. Bloquear emissão se não houver resposta válida, se a referência tiver mais de sete dias corridos ou se ela estiver no futuro. Essa janela é um controle técnico; não apresentar uma cotação antiga como cotação publicada hoje.

Fórmula: `total BRL em centavos = arredondar_meio_para_cima(total USD em centavos × PTAX venda)`. Arredondar uma única vez no total da cobrança. Guardar base USD, quantidade, taxa, fonte, data de referência, publicação, consulta e total BRL. O registro por pedido é imutável. Toda nova mensalidade recebe um pedido determinístico distinto; tentativas de pagamento e reenvios reutilizam o pedido original. Uma prévia de preço ainda não confirmada precisa ser revalidada no checkout; não reutilizar um orçamento abandonado de dias anteriores como nova emissão.

## Arquitetura a implementar

1. Cadastro: um Customer por empresa e moeda, com vínculo interno obrigatório. Apenas administradores financeiros autorizados iniciam checkout. Valores, produto e quantidade vêm do servidor, nunca do navegador. Nenhum dado de cartão passa pelos bancos da GreenIA.
2. USD: quatro Prices mensais recorrentes no Billing; Capacity Pack como pagamento avulso. Checkout hospedado, sem quantidade por assento e sem cupons automáticos que violem a margem.
3. BRL: emitir invoice de valor convertido a cada ciclo, com item avulso em BRL. Não cadastrar um Price mensal BRL fixo nem presumir que a conversão inicial será recalculada nas renovações. O agendador usa o calendário contratual, cota antes de emitir e registra a invoice por empresa/ciclo para evitar duplicação. Guardar a taxa nos metadados e na descrição exibida ao cliente. Mostrar valor final antes de uma compra avulsa; informar previamente ao assinante a regra de variação cambial da mensalidade. Meios de pagamento e cobrança automática dependem das capacidades da conta e autorização de pagamento do cliente.
4. Pagamento: validar assinatura do webhook sobre corpo bruto, conta e modo sandbox/live; guardar IDs de evento e IDs de efeito financeiro. Confirmar customer, moeda, valor, produto, empresa e período contra o pedido persistido. A página de retorno não libera capacidade. Evento repetido ou fora de ordem não pode duplicar créditos.
5. Direitos de acesso: liberar franquia/reserva apenas para período pago; pacote uma única vez por pagamento confirmado. Pagamento pendente não libera créditos. Não usar `companies.status='cancelada'` para inadimplência, porque o fluxo atual agenda exclusão em 30 dias. Manter histórico consultável e separar suspensão financeira de cancelamento/exclusão de dados.
6. Ciclo: `src/plano.js` hoje renova no mês-calendário UTC, independentemente de pagamento. Antes da ativação, alinhar cobrança, franquia, reserva e avisos ao mesmo período pago; não dar uma segunda franquia no dia 1 para uma assinatura iniciada no dia 22. Preservar empresas com cobrança manual durante a migração. O primeiro período parcial exige tratamento coerente de preço e capacidade; não cobrar proporcional e liberar franquia integral por acidente.
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
