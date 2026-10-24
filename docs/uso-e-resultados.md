# Uso e resultados

Implementação de acompanhamento prospectivo. Não reclassifica respostas históricas como trabalhos concluídos. Uma instalação possui seu próprio banco; o modo multiempresa mantém banco e sessão separados por empresa.

## Unidade e vínculos

`trabalhos.id` é estável. O primeiro envio abre um trabalho; novos envios continuam nele até a conferência final ou escolha explícita de novo trabalho/ampliação de escopo. Essa escolha abre outro identificador e mantém a ligação `anterior_id`. Envios sem motivo confirmado permanecem não classificados. A tela permite confirmar etapa planejada, correção, preferência, nova tentativa, ampliação ou novo trabalho. Vínculos ambíguos precisam ser classificados antes de registrar conclusão.

Uma tentativa corresponde a um envio. Todas as chamadas de modelo, inclusive etapas internas e fallback, são registradas separadamente em `trabalho_chamadas` e não são contadas como falhas independentes. Tentativa executada precisa ter chamada iniciada; bloqueio anterior à chamada não é execução nem falha de entrega. Etapas legítimas e mudanças de preferência não são classificadas automaticamente como retrabalho.

O cadastro de trabalho se aplica ao chat e às execuções de Quick Wins que passam pela mesma rota de mensagem. Preparação de Quick Wins e uso histórico sem vínculo permanecem no consumo do período, fora da coorte de trabalhos. A interface informa essa cobertura.

## Indicadores

O período usa datas UTC, com início inclusivo e fim exclusivo no dia seguinte. A data de atualização é apresentada. Tipo e estado filtram a coorte; período e pessoa também recortam utilização e consumo ocorrido no período. Os filtros aparecem no CSV.

| Indicador | Definição e fórmula | Fonte |
|---|---|---|
| Pessoas cadastradas | Contas observadas no cadastro ao fim do recorte, incluindo convites | Snapshots de habilitação; cadastro autorizado da plataforma no modo multiempresa |
| Pessoas habilitadas | Pessoas da equipe habilitadas em algum intervalo do período | Snapshots de habilitação, sem convites pendentes, contas técnicas ou de teste |
| Pessoas ativas | Pessoas com pelo menos uma execução observada no período | `uso` histórico e tentativas com chamada iniciada, sem testes/contas técnicas |
| Adoção | Ativas ÷ habilitadas × 100 | Mesmas fontes, numerador e denominador apresentados; não medido para período anterior à instrumentação |
| Dias de uso | Datas UTC distintas com execução, inclusive falhas | Uso e tentativas executadas |
| Trabalhos iniciados | Identificadores abertos no período, segundo filtros | `trabalhos`; não mensagens ou chamadas |
| Trabalhos concluídos | Estado concluído após checklist de conferência | `trabalho_verificacoes` e eventos; não inferido de feedback ou encerramento de stream |
| Créditos da coorte | Soma acumulada de `uso.custo` atribuída aos trabalhos iniciados no período, até atualização | Registro de contabilização existente, ligado por trabalho/tentativa; chamadas não são somadas novamente |
| Créditos por concluído | Créditos totais da coorte ÷ trabalhos da mesma coorte concluídos com verificação | Inclui consumo de trabalhos em andamento, falhas, etapas e correções da coorte; sem conclusões ou com apuração pendente, média indisponível |
| Consumo no período | Créditos registrados durante o intervalo, independentemente da data de início do trabalho | `uso`; testes/contas técnicas e histórico sem trabalho identificado discriminados |
| Debitados | Consumo da coorte aplicado à política de saldo do plano | Mesmo registro `uso`; sem plano, não medido |
| Estornados | Créditos efetivamente devolvidos ao saldo via mecanismo de pacotes, com referência única | Ajustes de créditos + pacote confirmado na mesma transação; consumo original preservado |
| Taxa de conclusão | Concluídos com verificação ÷ trabalhos iniciados no recorte × 100 | Coorte filtrada; trabalhos ainda em andamento indicados separadamente |
| Tempo até entrega | Início do trabalho até disponibilização da última entrega, sem a espera pela conferência humana | Eventos e fim da tentativa com resposta; intervalos de processamento, espera e correções separados |
| Mediana e p90 | Percentis do tempo até entrega dos trabalhos verificados | Ao menos dez trabalhos com cronologia disponível; não equivalem a horas humanas economizadas |

Valores em créditos usam até quatro casas decimais para evitar apresentar pequeno consumo observado como zero. O saldo e suas regras de autorização continuam no módulo de plano. A classificação de conta técnica/teste é administrativa e recorta os registros correspondentes; não apaga uso efetivamente contabilizado.

## Estados e conferência

Execução, espera por autorização, espera por informação, entrega pendente de verificação, conclusão verificada, falha, interrupção e conclusão não verificável possuem registros distintos. Reinicialização não transforma uma execução sem desfecho em sucesso.

- Arquivos: persistência, bytes, leitura do pacote Office e evidência de resposta HTTP do download são observações técnicas. Pacotes Office recebem hash SHA-256, quantidade de bytes e identificador do arquivo, sem nome privado no acompanhamento administrativo.
- Conteúdo: a pessoa responsável confirma instruções e conteúdo. Arquivos exigem declaração de download e abertura; planilhas, estrutura/cálculos aplicáveis; apresentações, inspeção de layout; análises, referências aplicáveis.
- A leitura técnica não prova cumprimento do pedido. Um checklist humano é uma declaração do responsável, não certificação independente. Não há aprovação por silêncio, por avaliação exclusiva de IA ou apenas por existência do arquivo.
- Falha técnica conhecida, causa incerta, correção, preferência, escopo, interrupção e bloqueio não são equivalentes. Sem evidência, o motivo permanece não classificado.

## Autorizações e privacidade

Pessoa: somente seus indicadores e trabalhos. Empresa: requer `usage.read`; classificar contas requer `user.update`. Instalação única usa a autorização administrativa correspondente. O administrador não recebe prompt, anexos, títulos privados ou conteúdo produzido por outra pessoa. Metadados de trabalho não concedem acesso às rotas privadas da conversa. Apenas o dono registra conferência da entrega e classifica seus envios.

As APIs do ambiente do cliente usam créditos mesmo sem plano e mesmo se a pessoa também for operadora. Preços de modelos, conversão monetária, custos financeiros e margens não são retornados nessas APIs ou exportações. A área técnica do Advanced também usa créditos. Limites digitados em créditos são convertidos apenas no servidor; a autorização real permanece validada em todas as chamadas.

A Administração Geral tem rota e aba próprias por empresa para registros financeiros. `custo_reportado`, `custo_conciliado` por geração e confirmação de fatura são diferentes. A consulta por geração não confirma uma fatura. Valores sem fonte permanecem pendentes. Conciliação pendente persiste em banco e pode ser retomada após reinício; a atualização é idempotente e não soma custos já reportados. Componentes externos sem integração de cobrança não são estimados silenciosamente.

A estimativa antiga de consumo evitado foi retirada da apresentação. Comparações com outras plataformas permanecem como não realizadas; não há inferência de economia ou de horas humanas a partir dos créditos.

## Validação e limites

Testes de serviço usam registros conhecidos para conferir cálculos, coortes entre meses, isolamento, autorização, arquivos Office efetivamente materializados, saldo, estorno e idempotência. Testes de navegador verificam conferência explícita, persistência, exportação, filtros, erro/repetição, teclado e larguras de 320/390/768 px. O provedor simulado dos testes não comprova qualidade de inferência em produção nem avaliação de um usuário humano real.

O histórico de habilitação é prospectivo: períodos anteriores ao início da instrumentação não recebem denominador estimado. Eventos perdidos fora dos mecanismos instrumentados não são reconstruídos por suposição. Fatura do provedor, avaliações humanas subjetivas e comparações externas dependem de evidência própria. A LP comercial existente é em PT-BR; não há versões EN/ES dessa página nesta implementação.
