# Modelo econômico dos planos (out/2026)

Onde está no código:

| Assunto | Arquivo |
|---|---|
| Catálogo (planos, Capacity Pack, pacote legado) | `src/plataforma/catalogo.js` |
| Premissas, margem total, status, preço mínimo, trava, infraestrutura por empresa | `src/plataforma/margem.js` |
| Consumo: franquia → Capacity Packs (FIFO) → reserva → pausa; vagas de execução na reserva | `src/plano.js` |
| Registro de todo custo cobrado como crédito | `src/custo-ia.js` |
| Migração do catálogo (plataforma) | `migrarCatalogo` em `src/plataforma/empresas.js` |
| Migração dos pacotes (banco de cada empresa) | migração 18 em `src/db.js` |
| Receita, margem do mês e conciliação com o OpenRouter | `src/plataforma/consumo.js` |
| Rotas: planos, prévia, premissas, liberação de Capacity Pack | `src/plataforma/api-plataforma.js` |

## Catálogo

| Produto | Preço | Créditos | Reserva |
|---|---|---|---|
| GreenIA Starter | US$ 199 | 2.000 | 400 |
| GreenIA Team | US$ 399 | 5.000 | 1.000 |
| GreenIA Business | US$ 749 | 10.000 | 2.000 |
| GreenIA Company | US$ 1.799 | 25.000 | 5.000 |
| Capacity Pack | US$ 229 | +2.000 | — |

Todos os planos: usuários ilimitados, as mesmas funcionalidades, a mesma infraestrutura compartilhada e os mesmos
limites operacionais. A reserva é 20% da franquia, só na classe Rápido. Créditos do mês não acumulam; os do Capacity
Pack acumulam, são consumidos do mais antigo para o mais novo e podem ter validade. O pacote não traz reserva nova.

## Premissas (ajuste `premissas_economicas` da plataforma; padrões em `PREMISSAS_PADRAO`)

| Chave | Padrão | Editável |
|---|---|---|
| `ai_credit_base_cost` | US$ 0,01 | não (é a definição do crédito no consumo, `CREDITO_USD`) |
| `ai_provider_fee_rate` | 5,5% | sim |
| `tax_rate` | 12% | sim |
| `payment_fx_rate` | 3% | sim |
| `support_operation_rate` | 15% | sim |
| `min_total_margin_rate` | 50% (piso) | sim |
| `target_total_margin_rate` | 52% (meta) | sim |

Validação: frações entre 0 e 1, meta ≥ piso, custos proporcionais + piso < 100%. Mudanças ficam na auditoria
(`platform.economics_changed`).

## Fórmulas (pior caso: franquia + reserva inteiras)

- custos proporcionais = receita × (impostos + pagamento/câmbio + suporte/operação)
- custo de IA = (créditos + reserva) × custo-base × (1 + taxa do intermediário)
- infraestrutura por empresa = fatura mensal do servidor ÷ empresas não canceladas
- margem total = (receita − custos proporcionais − IA − infraestrutura) ÷ receita
- preço mínimo para a margem alvo = (IA + infraestrutura) ÷ (1 − custos proporcionais − alvo)
- Capacity Pack: mesma conta com infraestrutura zero (usa a que a empresa já tem)

Status: abaixo do piso → crítico (o plano ou pacote **não é salvo**); entre piso e meta → alerta; acima da meta →
saudável. A prévia mostra também a margem com 25/50/75/100% da franquia, mas a trava usa sempre o pior caso. A
"margem de IA" (receita − IA) aparece só como diagnóstico.

## Decisões registradas

- **Divisor da infraestrutura**: mantido como estava — empresas com status diferente de `cancelada` (ativas, em
  implantação e suspensas), incluindo contas internas e as do plano interno, porque todas ocupam o mesmo servidor.
- **GreenIA Liberado**: continua existindo, ilimitado e sem preço; aparece como "sem teto de custo (interno)", não
  entra na receita comercial e entra no divisor da infraestrutura (como antes).
- **Planos existentes**: Team e Company foram atualizados no mesmo registro (mesmo id; as empresas vinculadas
  continuam vinculadas e passam às condições novas). Starter e Business foram criados. Planos do operador com outros
  nomes não são tocados. A migração roda uma vez (ajuste `catalogo_2026_10`) e fica na auditoria (`plan.migrated`,
  `plan.created`).
- **Pacotes antigos**: cada liberação anterior ganhou `produto = pacote_legado_10000` e o valor proporcional da época
  (US$ 250 por 10.000 créditos). Créditos e consumo não mudaram. Não há como vender o pacote antigo: a liberação nova
  é por quantidade de Capacity Packs, com créditos e valor calculados no servidor pelas regras do plano. Créditos
  avulsos ficam registrados como cortesia, sem receita.
- **Company a US$ 1.799** (era US$ 1.749 na primeira versão do catálogo): com US$ 1.749 a margem total no pior caso
  ficava entre o piso e a meta (51,5% com US$ 7,25 de infraestrutura por empresa). O ajuste roda uma vez
  (`catalogo_2026_10b_company`), fica na auditoria e só troca o preço se ele ainda é US$ 1.749.
- **Execuções simultâneas na reserva**: cada execução ocupa uma vaga de `RESERVA_POR_EXECUCAO` créditos até terminar;
  uma nova só começa se a reserva que sobra cobre as em andamento. Na franquia e nos packs, uma execução que já
  começou termina e desconta da reserva (nunca além dela).
