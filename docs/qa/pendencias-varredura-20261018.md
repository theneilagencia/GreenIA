# Reprovações observadas na varredura ampla

Esta lista preserva reprovações observadas durante a varredura de 18/10/2026. Não é um laudo de que cada reprovação representa um defeito do produto: cada caso precisa de reprodução, confronto com os requisitos atuais e classificação. Nenhuma ocorrência desta lista foi convertida em aprovação por quantidade de testes verdes.

A rodada original foi interrompida sem resultado global aprovado. Os nomes abaixo são os observados nessa execução e ficam preservados, mesmo quando a expectativa foi substituída por contrariar o requisito atual. Todos os 73 itens foram investigados e revalidados na bateria completa de 1.200 testes de serviço, com zero falhas, cancelamentos ou casos ignorados. A correspondência com os nomes atuais e o TAP está em [evidencias/20261018/ocorrencias-servicos.json](evidencias/20261018/ocorrencias-servicos.json). O fechamento do navegador está registrado em [fechamento-pendencias-20261018.md](fechamento-pendencias-20261018.md).

## Classificação e retestes

- **A** — preparação antiga de Advanced, catálogo ou capacidade: cenário positivo passou a ter autorização explícita, rota e orçamento; cenários sem autorização continuam bloqueados
- **R** — expectativa antiga de roteamento: substituída por bloqueio antes da inferência, sem redução de capacidade nem seleção automática externa ao controle da plataforma
- **L** — texto, registro de claims ou metadados anteriores: alinhados à superfície atual, mantendo verificações de evidência, exposição financeira e promessas indevidas
- **F** — entrega visual/arquivo: referência de layout explícita, metadados atuais e correção do produto para fontes indisponíveis; downloads e conteúdo dos arquivos conferidos
- **P** — matriz/propriedades: catálogo e autorização sintéticos explícitos, dimensão real de capacidade, cobertura de execução e bloqueio; bancos encerrados após cada cenário

A classificação não substitui o teste: cada caso continua no arquivo indicado e integra a bateria global. “IA real” no nome de um arquivo de teste descreve o pedido reproduzido; o provedor nessa bateria é simulado.

## Ocorrências preservadas

- **guardar = não com erros: provedor que repete o pedido, tempo esgotado, nova tentativa, reserva, leitor e OCR** — `test/auditoria-retencao.test.js` — **A · revalidado na bateria completa de serviços**
- **acesso por perfil: sem o Avançado, a pessoa não vê nem usa modelo Avançado no chat** — `test/chat.test.js` — **A · revalidado na bateria completa de serviços**
- **sigilosa pela chave manual** — `test/chat.test.js` — **A · revalidado na bateria completa de serviços**
- **área com proteção reforçada: conteúdo comum segue as regras gerais, mesmo sem recurso para dado sigiloso** — `test/chat.test.js` — **A · revalidado na bateria completa de serviços**
- **registro: cada claim sustentado está na superfície, com evidência no código e teste existente** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **trechos sensíveis (dados, segurança, privacidade, custo, conferência, fornecedores) só entram com registro sustentado** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **as páginas não fazem promessa jurídica, não generalizam garantias e não expõem o provedor** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **credenciais: a promessa é sobre senhas e chaves reconhecidas, em todas as partes do envio, sem absoluto (P1 resolvida)** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **ambiente: sem "infraestrutura privada/dedicada", servidor dedicado ou isolamento físico** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **roteamento e créditos: sem troca automática de recurso; continuidade sempre com a ressalva da reserva** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **telas ilustrativas: cada bloco com números tem o aviso de exemplo; o menu é o da Administração atual** — `test/claims-lp.test.js` — **L · revalidado na bateria completa de serviços**
- **três níveis: Rápido, Equilibrado e Avançado usam o modelo configurado, a mesma chave, web e deny** — `test/credencial-quickwin-plataforma.test.js` — **A · revalidado na bateria completa de serviços**
- **isolamento: a empresa B não lê a credencial nem a configura; sem liberar pesquisa, nada de plugin e resultado parcial** — `test/credencial-quickwin-plataforma.test.js` — **A · revalidado na bateria completa de serviços**
- **nenhum nome de cliente, área fixa ou ERP no código da aplicação** — `test/generico.test.js` — **L · revalidado na bateria completa de serviços**
- **invariante (10 casos): modelo proibido nunca é executado; com alternativa é substituído, sem alternativa bloqueia** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **invariante 7b: Automático do OpenRouter ligado pela empresa nunca recebe dado sigiloso** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **invariante (propriedade): 120 entradas aleatórias de API nunca executam modelo proibido** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **caso A: solicitado elegível é usado (solicitado == selecionado)** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **caso B2: o selecionado cai no fornecedor e a reserva responde: registrado como substituição por indisponibilidade** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **uma só rota de execução: toda chamada à IA passa pelo roteador e pela governança** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **admin leigo: nova empresa, recomendações, tarefas, sigilo, bloqueio, alerta legível, manual e volta** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **ignorância deliberada: as tarefas se resolvem só com a intenção** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **matriz da pessoa leiga: nenhum cenário pede decisão técnica, homologação, política, permissão ou reserva** — `test/governanca-api.test.js` — **A/R · revalidado na bateria completa de serviços**
- **LP: acesso da equipe sem aprovação prévia inventada; retenção sem prazo na página; nada de "equipe GreenIA" no app das empresas** — `test/legais.test.js` — **L · revalidado na bateria completa de serviços**
- **rede de segurança: resposta em roteiro "Slide 1, 2, 3" numa conversa com PDF de apresentação vira o arquivo no layout do PDF** — `test/modelo-pdf.test.js` — **F · revalidado na bateria completa de serviços**
- **correção pedida no chat edita a última versão da apresentação; "não aplicou o meu pedido" reaplica o pedido anterior** — `test/modelo-pdf.test.js` — **F · revalidado na bateria completa de serviços**
- **pediu arquivo, recebe arquivo: slides dentro de bloco de código viram o PowerPoint registrado na resposta** — `test/pedido-apresentacao-real.test.js` — **F · revalidado na bateria completa de serviços**
- **catálogo confirmado amplia para três modelos por nível e registra uma única inclusão idempotente** — `test/pools-modelos.test.js` — **A · revalidado na bateria completa de serviços**
- **escolha de cada nível compara seus modelos em vez de fixar o padrão; Automático usa o menor nível suficiente** — `test/pools-modelos.test.js` — **A · revalidado na bateria completa de serviços**
- **modelo retirado do catálogo não participa; falha de consulta preserva catálogo conhecido** — `test/pools-modelos.test.js` — **A · revalidado na bateria completa de serviços**
- **"no mesmo layout" do material enviado: a peça e o PowerPoint seguem as cores e a fonte do material** — `test/producao-visual.test.js` — **F · revalidado na bateria completa de serviços**
- **economia escolhe dentro da capacidade suficiente, sem baratear uma entrega premium** — `test/qualidade-entrega.test.js` — **A · revalidado na bateria completa de serviços**
- **uma chamada por objetivo novo; mesmo objetivo salvo = 0 chamadas; objetivo alterado = 1; consumo registrado** — `test/quickwin-estrutura.test.js` — **A · revalidado na bateria completa de serviços**
- **governança soberana: o Quick Win não libera dado bloqueado, credencial nem troca a rota de dado protegido** — `test/quickwins-v2.test.js` — **A · revalidado na bateria completa de serviços**
- **quick win de ponta a ponta: configurar com arquivo, testar, ativar, conversar com anexo, ajustar, retomar, feedback e uso** — `test/quickwins.test.js` — **A/R · revalidado na bateria completa de serviços**
- **perfis: sem o Avançado, a pessoa usa o Avançado que é padrão do quick win, mas não troca para outro Avançado** — `test/quickwins.test.js` — **A/R · revalidado na bateria completa de serviços**
- **estimativa de custo por conversa típica, por modelo, a partir do preço do catálogo** — `test/quickwins.test.js` — **A/R · revalidado na bateria completa de serviços**
- **2. tarefa complexa não usa modelo insuficiente, em nenhuma preferência** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **3. contexto grande: escolhe janela suficiente; volume sozinho não sobe a classe** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **5. pessoa sem acesso à classe necessária recebe o melhor modelo permitido, com a causa registrada** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **6. sigilo exclui os modelos não homologados; a escolha segue a capacidade entre os homologados** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **7. a preferência muda a decisão quando há alternativas equivalentes, e só então** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **8. falha da classificação não quebra a governança** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **9. fallback nunca viola política: o modelo usado não tem motivo de governança; a reserva passa pelas mesmas regras** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **10. mudança de configuração da empresa altera o conjunto de candidatos e a escolha** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **11. o motivo exibido corresponde à decisão real** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **12. solicitações diferentes, mesma pessoa e mesma configuração, não são obrigadas ao mesmo modelo** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **quick win: fixo define a classe (com a análise registrada); flexível entra como piso do Automático** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **todo sinal da análise muda a escolha em pelo menos um caso de referência (nenhum sinal decorativo)** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **capacidades explícitas: modelo Equilibrado forte em programação atende código difícil antes de um Avançado mais caro** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **dominância: um desempate nunca escolhe modelo menos capaz e mais caro** — `test/roteamento-matriz.test.js` — **R · revalidado na bateria completa de serviços**
- **governança, janela e permissão: nunca violadas (400 cenários)** — `test/roteamento-propriedades.test.js` — **P · revalidado na bateria completa de serviços**
- **monotonicidade de capacidade: aumentar uma exigência nunca escolhe capacidade inferior (400 cenários × 6 exigências)** — `test/roteamento-propriedades.test.js` — **P · revalidado na bateria completa de serviços**
- **fluxo completo: pedido simples no Rápido, contrato com riscos no Avançado; o modelo chamado é o decidido** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **sem acesso à classe necessária: a mais capaz permitida, com a causa na auditoria e na explicação** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “sem acesso à capacidade necessária: bloqueia antes da inferência e registra solicitação”
- **classe escolhida pela pessoa: respeitada, analisada e sinalizada quando fica abaixo do necessário** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “classe escolhida pela pessoa não reduz capacidade exigida”
- **nova tentativa na mesma conversa sobe a partir da classe usada antes** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **roteamento desligado: padrão da empresa, registrado como padrão (não como escolha da pessoa)** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “roteamento desligado não autoriza padrão insuficiente”
- **falha na análise do pedido: responde com a exigência padrão e a governança intacta** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **reserva de execução: só vai ao fornecedor se passar pelas regras; o uso da reserva fica no registro** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **Automático do serviço de IA: fora das regras de roteamento, identificado como tal e fora dos indicadores do roteador** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “Automático externo nunca recebe conteúdo, mesmo ligado em configuração antiga”
- **admin: Automático é o padrão; liga, desliga e muda a preferência; a preferência chega à decisão** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **feedback "não serviu" vale só para a próxima mensagem; a tentativa fica ligada à anterior; latência registrada** — `test/roteamento.test.js` — **R · revalidado na bateria completa de serviços**
- **economia nunca supera autorização: o barato não autorizado nunca é usado, mesmo para pedido simples** — `test/sigilo-guardrails.test.js` — **A · revalidado na bateria completa de serviços**
- **fallback: principal indisponível → outro recurso SÓ se autorizado e elegível; senão, nada mais é enviado** — `test/sigilo-guardrails.test.js` — **A · revalidado na bateria completa de serviços**
- **API, nova tentativa, anexo e streaming: a mesma governança em todo envio** — `test/sigilo-guardrails.test.js` — **A · revalidado na bateria completa de serviços**
- **4. o necessário não está disponível para a pessoa: usa o mais capaz permitido e registra a causa** — `test/usuario-leigo.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “4. capacidade necessária bloqueada preserva pedido e solicita autorização”
- **12. nível sem permissão para o grupo da pessoa, pedido à força: não é usado; o automático resolve** — `test/usuario-leigo.test.js` — **R · revalidado na bateria completa de serviços** · cenário atual: “12. escolha forçada não concede acesso”
- **13. pedido que exige mais capacidade: sobe de nível sozinho quando a pessoa tem acesso** — `test/usuario-leigo.test.js` — **R · revalidado na bateria completa de serviços**
- **18. Automático do provedor: nunca usado com dado sigiloso; fora dele, explicado sem termos técnicos** — `test/usuario-leigo.test.js` — **R · revalidado na bateria completa de serviços**
- **10. configuração incompleta (quick win fixo numa classe sem modelo liberado): atende no automático e avisa o admin** — `test/usuario-leigo.test.js` — **R · revalidado na bateria completa de serviços**
- **a página não promete o que não existe nem mostra custo de fornecedor** — `test/vendas.test.js` — **L · revalidado na bateria completa de serviços**
- **a LP mantém a demonstração e condições de integração com uma estrutura comercial curta** — `test/vendas.test.js` — **L · revalidado na bateria completa de serviços**
