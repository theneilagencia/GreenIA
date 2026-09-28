# Informações sigilosas com guardrails de proteção

A GreenIA não bloqueia informação sigilosa por princípio. Ela a **protege**: a empresa decide se permite o
processamento, e a GreenIA só encaminha a solicitação por um recurso autorizado cuja rota real atende a todos
os guardrails. Quando não há recurso assim, o conteúdo não é enviado.

## Invariante

```text
sigilosa E política ligada E guardrails satisfeitos E recurso autorizado E rota elegível → ENVIA
qualquer outra combinação                                                                → NÃO ENVIA
```

Ela vale no backend, e não só na tela.

- **Camada central:** `src/sigilo.js`. As funções `avaliarRecurso` e `avaliarProcessamentoSigiloso` (o
  `evaluate_sensitive_processing` do pedido) devolvem se o recurso é elegível, o motivo e os requisitos.
- **Catálogo:** a linha do catálogo (`deLinha`, em `src/modelos.js`) calcula `homologado` com essa camada.
  O roteador, o seletor e o envio leem o mesmo campo.
- **Conferência final:** logo antes de chamar a IA, `conferirEnvio` (em `src/conversas.js`) relê o catálogo
  e reavalia. Um recurso que deixou de ser elegível entre a decisão e o envio não recebe nada.

## Configuração da empresa

"**Permitir processamento de informações sigilosas com guardrails de proteção**" [ON / OFF].

| Aspecto | Como funciona |
|---|---|
| Nome interno | `allow_sensitive_processing_with_guardrails` (booleano) |
| Padrão | `false`. Ausente, `null`, `"true"`, `1` e qualquer outro valor que não seja `true` valem como desligado |
| Quem altera | Só o admin, em Políticas → Informações sigilosas (`PUT /api/admin/sigilo`). A mudança é registrada e gera nova versão da Política de Uso, com nova ciência |
| **OFF** | Informação sigilosa não vai para nenhum recurso. A decisão acontece antes de gravar a mensagem ou os anexos e antes de marcar a conversa. Quem usa lê: "Esta solicitação contém informações que a empresa não permite processar com IA. Nenhum conteúdo foi enviado." O admin não é avisado, porque foi escolha da empresa |
| **ON** | Libera a capacidade de processar informação sigilosa com proteção, não um recurso. Cada envio passa pelos guardrails. Sem recurso elegível, quem usa lê "Não foi possível processar esta solicitação com segurança. Nenhum conteúdo foi enviado. O administrador foi informado." e o admin recebe o alerta |

**Empresas que já existiam começam com a opção desligada.** Nenhuma migração a liga.

## Guardrails: a rota real, e não o nome do modelo

| Requisito | O que precisa ser verdade | Motivo quando falha |
|---|---|---|
| Liberado | O recurso está liberado na empresa | `nao_liberado` |
| Rota fixa | Não é gratuito nem automático, que não têm fornecedor com garantias verificáveis | `sem_rota_fixa` |
| Veto da plataforma | A plataforma não proibiu o recurso para informação sigilosa | `proibido_pela_plataforma` |
| Homologação da empresa | A empresa homologou. No modo "Seguir recomendações", a adoção da autorização da plataforma conta como homologação | `sem_homologacao_empresa` |
| Autorização da plataforma | Exigida no modo multiempresa: é o mínimo e a empresa não a remove | `sem_autorizacao_plataforma` |
| Mesma rota | O endpoint homologado pela empresa é o mesmo autorizado pela plataforma. O mesmo modelo por outro fornecedor é outro recurso | `rota_diferente_da_autorizada` |
| Fornecedor e endpoint | Os dois estão informados | `fornecedor_desconhecido`, `endpoint_desconhecido` |
| Retenção zero | `retencaoZero === true` na rota. Com a plataforma, na dela **e** na da empresa | `retencao_nao_comprovada` |
| Sem uso para treino | `semTreino === true` na rota, com a mesma regra | `treino_nao_comprovado` |

A regra é **fechada em caso de dúvida**: ausente, `null`, `"sim"`, JSON ilegível ou desconhecido tornam o recurso
não elegível. Capacidade, janela, permissões e plano são as restrições que o roteador já aplicava, na
lista `RESTRICOES`.

**No envio,** a rota fica fixada no pedido ao fornecedor: `provider.only` com o endpoint, `allow_fallbacks: false`,
`zdr: true` e `data_collection: deny`.

**O que não é verificado automaticamente:** a retenção zero e a ausência de treino de cada rota são
declaradas por quem homologa. A empresa e a plataforma confirmam as duas garantias, e a justificativa fica
registrada. A GreenIA não consulta o fornecedor para confirmar. Por isso a página de vendas diz "rotas que
atendam aos requisitos definidos" e não promete que todo modelo tem retenção zero.

## Hierarquia

```text
plataforma: requisitos mínimos (autoriza, proíbe, exige retenção zero e ausência de treino)
      ↓
empresa: liga ou desliga a política, homologa ou só restringe (nunca remove o mínimo)
      ↓
GreenIA: aplica os guardrails a cada envio
      ↓
pessoa: não altera nada disso nem escolhe recurso não autorizado (o modelo pedido é só preferência)
```

**Antes, a plataforma apenas "homologava em todas as empresas".** Agora a autorização dela fica numa coluna
própria (`autorizacao_plataforma`). A empresa em modo manual precisa homologar, e a empresa que segue as
recomendações adota a autorização automaticamente.

## Classificação proporcional ao risco

**A IA não bloqueia porque encontrou um dado pessoal.** Ela decide como tratar o conteúdo pelo risco, pelo
contexto e pelas políticas da empresa. A classificação fica em `src/filtro.js` (`detectar`, `decidir`) e vale
para mensagens, anexos (PDF, DOCX, XLSX, imagens com OCR, texto), nova tentativa, API e histórico.

| Nível | O que é | Exemplos | Padrão |
|---|---|---|---|
| 1 | Conteúdo normal | Nomes, cargos, empresas, email e telefone de trabalho, CNPJ, atas, relatórios, documentos institucionais | Regras gerais. Email corporativo nem é "detectado" |
| 2 | Dado pessoal | CPF, RG, email pessoal (Gmail, Hotmail…), telefone, endereço, CEP | **Processar normalmente**: a conversa não vira sigilosa. Cartão, dados bancários e PIX: só com proteção |
| 3 | Dado pessoal sensível | Laudo, atestado ou exame médico, CID, biometria, religião, orientação sexual, filiação sindical, origem racial | Só com proteção, em qualquer área |
| 4 | Informação confidencial marcada | "CONFIDENCIAL", "documento confidencial", documento da base marcado como sigiloso | Só com proteção, em qualquer área |
| 5 | Credencial ou segredo | Senha, API key, token, chave privada, `usuário:senha` em URL | Bloqueio absoluto; nenhuma configuração muda |

- **Ações que a empresa escolhe por tipo** (Políticas de IA → Tipos de dado): **Processar normalmente**
  (`permitir`), **Só com proteção** (`proteger`, a conversa vira sigilosa e segue só com os guardrails) ou **Não
  enviar** (`bloquear`). Ação desconhecida vale "Não enviar" (fail closed).
- **Contexto, não palavra solta:** "diagnóstico de vendas", "política de confidencialidade", "desligamento de
  sistemas" e "salário de mercado" são conteúdo normal.
- **Registro:** a auditoria guarda os tipos encontrados, nunca o valor.
- **Quem usa não precisa limpar o texto.** A mensagem de bloqueio explica o motivo, sem pedir para tirar dados.
- **Empresas que já existiam:** no formato antigo, "permitir" queria dizer "processar com proteção". Esse valor
  passa para o padrão proporcional do tipo, e o "bloquear" que a empresa escolheu continua valendo (`acoesAtuais`,
  `acoesDoQuickWin`). Conversas que ficaram sigilosas só por um tipo que agora é processado normalmente são
  reavaliadas ao abrir; na dúvida, continuam sigilosas.
- **Não é uma afirmação de conformidade com a LGPD.** São controles configuráveis que apoiam as obrigações da
  empresa.

## Área com proteção reforçada (antes: "todas as conversas da área são sigilosas")

A área com política de sigilo **não classifica o conteúdo**. Ela pede proteção reforçada, e quem decide se
uma conversa é sigilosa é o que foi escrito e anexado.

| | Área padrão | Área com proteção reforçada |
|---|---|---|
| A conversa nasce sigilosa? | Não | Não |
| O que torna o conteúdo sigiloso | Tipos que a política manda proteger (padrão: pagamento, dado sensível, marcação de confidencial), marcação manual, quick win sigiloso, documento sigiloso | Tudo o da área padrão **e** os sinais de `detectarReforcado`: marcação de uso interno ("uso interno", "uso restrito", "não divulgar", NDA) e registros de pessoas em processo interno (holerite, folha de pagamento, processo disciplinar, salário ou desligamento de colaborador) |
| Conteúdo sem nenhum sinal | Regras gerais da empresa | Regras gerais da empresa, **só com recurso compatível com a proteção da área**: fornecedor fixo (nada de gratuito ou do Automático do serviço de IA) e sem treino com os dados. Não exige homologação para dado sigiloso |
| Conteúdo sigiloso | Todos os guardrails; sem recurso autorizado, nada é enviado | Igual |

- **Antes, a área era classificação absoluta.** `motivosFixos` devolvia `area`, e toda conversa nascia
  sigilosa. Sem recurso autorizado, qualquer pedido era bloqueado, até um PDF sem nenhum dado sigiloso. A
  regra foi corrigida.
- **Conversas antigas marcadas só pela área** (`motivo_sigilosa = 'area'`) são reavaliadas ao abrir ou ao
  enviar, pela função `reavaliarMarcacaoDaArea`. Elas voltam às regras gerais só se nenhuma mensagem ou
  anexo tiver sinal de conteúdo sigiloso (padrões gerais e reforçados) e se nenhuma fonte de conhecimento
  tiver sido usada. Na dúvida, continuam sigilosas. A mudança fica registrada (`conversation.reclassified`),
  e a pessoa vê um aviso.
- **Quick win classificado como "trata informações sigilosas"** continua fazendo as conversas nascerem
  sigilosas. Nesse caso, quem configura o quick win declara o conteúdo da tarefa.
- **Restrição no roteador:** `area_protecao_reforcada` fica na lista `RESTRICOES` e vale para a escolha
  automática, a escolha pedida pela pessoa ou pela API (vira preferência substituída, com o motivo
  `requested_model_area_protection`), a reserva de execução e a reserva do plano.
- **Nunca** se usa um recurso não autorizado para conteúdo sigiloso, nem para manter continuidade ou
  reduzir custo.
- **Ordem:** mensagem e anexos → classificação → políticas da empresa → guardrails → recursos elegíveis →
  capacidade e adequação → seleção → processamento. O teste `area-reforcada` espiona o provedor e falha se
  alguma chamada acontecer antes da decisão registrada, depois de um bloqueio ou com conteúdo sigiloso fora
  de um recurso autorizado.

## Tentativas bloqueadas no histórico

Uma mensagem bloqueada (dado que a empresa não envia, credencial, política desligada, nenhum recurso
elegível, conteúdo grande demais) **não é guardada nem enviada**. O histórico mostra a tentativa com o
aviso "Uma mensagem não foi enviada…", que diz o motivo em linguagem simples, sem nenhum trecho do
conteúdo.

A conversa só vira sigilosa quando o envio vai de fato acontecer. Um bloqueio não deixa a conversa presa
como sigilosa sem ter recebido nada.

## Ordem de decisão

```text
classificação (mensagem + anexos) → política da empresa → autorização → guardrails → elegibilidade
→ capacidade → adequação → continuidade → custo → latência
```

Custo, continuidade, reserva, disponibilidade e latência só ordenam recursos que já são elegíveis. Os testes
cobrem o barato não autorizado, o único disponível, a reserva do plano e o fallback.

## Busca por caminhos de contorno

| Caminho | Resultado |
|---|---|
| Chamadas que enviam conteúdo à IA | Uma só: `app.ia.enviar`, em `src/conversas.js`, depois do roteador e de `conferirEnvio`. O teste `uma só rota de execução` falha se aparecer outra |
| Outras chamadas ao provedor | `ia.listarModelos` (catálogo) e `ia.conta` (saldo e validade da chave). Nenhuma leva conteúdo |
| Fallback em conversa comum | A reserva configurada só vai ao fornecedor se passar pelas mesmas restrições do roteador |
| Fallback em conversa sigilosa | Sem reserva no fornecedor. Se o recurso cai antes de responder, a GreenIA roteia de novo sem o recurso que falhou e passa de novo por `conferirEnvio`. Sem outro elegível, nada mais é enviado. O registro guarda `reserva = guardrails:<id>` |
| Nova tentativa | É uma nova mensagem e passa por tudo de novo. Uma tentativa anterior não autoriza nada |
| API | O mesmo endpoint da tela. O modelo pedido é preferência, e o Automático do provedor nunca recebe informação sigilosa |
| Anexos | São classificados junto com a mensagem, antes de qualquer gravação ou envio. Credencial num anexo bloqueia |
| Documentos das bases | Um documento marcado como sigiloso torna a conversa sigilosa, com as mesmas regras |
| Agentes, automações, jobs, workers | Não existem caminhos desse tipo que executem IA. Se surgirem, precisam chamar a mesma camada; o teste acima falha se a IA for chamada de outro arquivo |

## Auditoria (tabela `roteamento`, sem o conteúdo)

| Pergunta | Coluna |
|---|---|
| Foi identificado conteúdo sigiloso? | `sigilosa` |
| A empresa permitia o processamento protegido? | `politica_sigilo` (`on` ou `off`) |
| Quais guardrails foram aplicados? | `guardrails.requisitos` |
| Quais recursos foram considerados, quais eram elegíveis e por que os demais foram descartados? | `candidatos`, `guardrails.elegiveis`, `guardrails.descartados` (com os motivos) |
| Qual recurso foi selecionado e qual respondeu? | `guardrails.selecionado`, `modelo`, `modelo_usado` |
| O conteúdo foi enviado? | `resultado` (`respondido`, `respondido_pela_reserva`, `falha_na_execucao` ou `bloqueado`) e `motivo_bloqueio` |
| Houve fallback? | `reserva` |
| Houve nova tentativa? | `nova_tentativa_de` |
| Houve modelo solicitado? | `modelo_solicitado`, `decisao_solicitado`, `motivo_substituicao` |

A explicação mostrada à pessoa ("Proteção aplicada…") e a explicação técnica do admin saem do mesmo registro.

## O que quem usa nunca vê

Para quem não é admin, o servidor não devolve:

- o nome do provedor (OpenRouter);
- o fornecedor;
- o endpoint;
- o identificador técnico do modelo, nem no streaming, nem no histórico, nem na conversa, nem na solicitação;
- o modo `openrouter_auto`, que vira `externo`;
- o id da opção do Automático do provedor, que vira `classe:externo`.

A Política de Uso não cita modelos nem fornecedores. O teste `nunca expor provider` percorre sucesso, falha,
bloqueio, política desligada, indisponibilidade, Automático do provedor, histórico e as telas de quem usa.
