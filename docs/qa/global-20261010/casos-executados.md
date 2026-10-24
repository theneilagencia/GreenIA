# Casos executados

849 serviços (Node 24.19.0) e 132 navegador (Node 22.23.3), 981 casos, zero falhas. Os nove novos serviços também passaram em Node 22 nas suítes focadas.

## Serviços

1. acesso sem tipo, com tipo inválido ou sem justificativa é bloqueado e não abre sessão nem registro
2. acesso válido: operador, empresa, tipo, justificativa, início, prazo de 60 minutos e status aberto
3. o acesso aparece na hora para o admin da empresa; outra empresa não vê nem encerra
4. sair encerra o acesso e registra fim e duração
5. o acesso expira em 60 minutos: a sessão cai e o registro fecha no horário do vencimento
6. acesso vencido sem nenhuma requisição não aparece como aberto na tela da empresa
7. admin da empresa encerra o acesso: a sessão do operador cai na hora
8. suspender a empresa encerra o acesso aberto (não fica aberto sem sessão)
9. novo acesso do mesmo operador substitui o anterior, que fecha com duração
10. sem porta lateral: admin da plataforma sem vínculo não entra pela tela de login da empresa
11. admin da plataforma com vínculo na empresa entra como qualquer pessoa, sem poderes de operador
12. sessão de operador de uma empresa não vale em outra
13. o operador continua sem ler conversas das pessoas, e a tela de acessos não traz conteúdo
14. exportação: sem motivo é bloqueada; com motivo gera registro próprio, visível só para a empresa, e avisa os admins
15. exportação que falha também fica registrada, como falha
16. aviso por email aos admins é complemento: sem email, o acesso abre e fica registrado como falha do aviso
17. marca branca: a empresa vê "Acessos da equipe de operação", sem o nome da plataforma, e o operador continua identificado
18. pendências respeitam bases e responsabilidades; usuário comum não recebe cadastro ou relatos
19. metadados e histórico não revelam conteúdo nem área alheia
20. suspensão impede inferência, mantém cadastro e pode ser retomada
21. validade vencida impede inferência e futuro mantém fonte; data inválida não altera arquivo
22. responsável exige acesso à base e dependências só incluem quick wins gerenciados
23. histórico registra mudanças sem arquivar o texto e exclusão elimina metadados em cascata
24. revisão de acesso registra conferência sem mudar permissões e detecta vínculo posterior
25. comparação de versões é restrita e não retorna prompt técnico
26. multiempresa exige permissão granular, mesmo para admin local
27. impacto de integração respeita ativação, permissão e empresa sem executar ações externas
28. banco existente recebe backup consistente antes das tabelas aditivas; documentos e índice preservados
29. quick win: usuário comum só cria se o admin autorizar; cria nas próprias áreas e gerencia o que criou
30. política: a seção automática muda com a política de informação sigilosa e gera nova versão; nunca cita fornecedor; preço não; ciência pendente bloqueia o envio
31. teto de gasto mensal interrompe os envios; limite diário por pessoa também
32. configurações: cor de marca com contraste baixo é recusada; domínios e retenção validados; só o admin
33. uso e custo: por mês, área, quick win, pessoa, modelo e tipo; CSV; eventos com filtro, sem conteúdo
34. lista de administradores em arquivo: um email por linha, comentários e linhas inválidas ignorados
35. o arquivo do repositório tem só emails válidos
36. 0. controle: numa área comum, sem exigência de "sem treino", o gratuito pedido pela pessoa é usado
37. 1. área sigilosa + PDF sem informação sigilosa → não bloqueia; segue as regras gerais, mesmo sem recurso autorizado
38. 2. área sigilosa + documento com CPF → dado pessoal: segue a política (padrão: normal, sem virar sigilosa); com "proteger", só recurso autorizado
39. 3. área sigilosa + dados bancários → política de informação sigilosa
40. 4. área sigilosa + credencial → bloqueio (regra de segurança), nada enviado, nada guardado
41. 5. área sigilosa + documento público → processa quando as demais regras são atendidas
42. 6. área sigilosa + conteúdo sigiloso + processamento sigiloso desligado → não envia
43. 7. área sigilosa + conteúdo sigiloso + nenhum recurso autorizado → não envia, admin avisado, mensagem simples
44. 8. recurso autorizado indisponível → nunca cai para recurso não autorizado (nem a reserva configurada)
45. 9. créditos no fim → nunca usa recurso não autorizado nem fora da proteção da área para manter continuidade
46. 10. nova tentativa, fallback, anexos e API passam de novo pela mesma governança
47. regressão: PDF institucional sem dado sigiloso em área reforçada não é bloqueado por causa da área
48. regressão: o único bloqueio legítimo de conteúdo comum na área é não haver recurso compatível; mensagem simples, sem marcar a conversa
49. admin cria área com descrição, adiciona pessoas como membros ou administradores da base e vê quem está em cada área
50. administrador da base gere só a base da própria área; membro só consulta
51. a permissão da base é independente do responsável pela área e pode ser tirada
52. área desativada sai do uso sem apagar nada; só dá para excluir depois de desativar
53. renomear para um nome que já existe é recusado
54. grupo mostra o que libera; o editor da pessoa salva áreas e grupos juntos
55. quem ganha a permissão de administrar a base recebe email com o link; o resumo conta o que pede revisão
56. guardar = não: texto, PDF, PPTX, imagem e PDF escaneado são processados por inteiro e não deixam rastro
57. guardar = sim: o mesmo conteúdo fica no histórico, com o texto lido por OCR como anexo
58. guardar = não com erros: provedor que repete o pedido, tempo esgotado, nova tentativa, reserva, leitor e OCR
59. erro do provedor com guardar = sim: o registro de diagnóstico não guarda o trecho do pedido
60. sanitização: exceção e erro do provedor saem sem o conteúdo
61. segredos em texto, PDF, PPTX, imagem e PDF escaneado (OCR): bloqueados antes de qualquer envio, sem guardar
62. OCR não é atalho: imagem com dado sensível segue a mesma política do texto digitado
63. sem texto legível ou sem OCR: mensagem técnica de leitura, nunca de segurança ou de política
64. OCR: tempo esgotado encerra a leitura sem deixar worker nem arquivo
65. arquivos: PDF com texto, PDF escaneado, PPTX e imagem viram texto pelo mesmo caminho
66. quick win "reunião → plano de ação": PDF e imagem com nomes, cargos, emails, clientes, tarefas, decisões, valores e prazos
67. classificação preservada: lista de regressão com as ações padrão
68. guardar = não na empresa A: imagem por OCR processada sem rastro em nenhum banco, arquivo ou memória; a B não é afetada
69. assinatura SigV4 igual ao exemplo da documentação da AWS (GET Object)
70. backup com o servidor no ar, retenção local, envio ao S3 e restauração com conferência
71. restauração recusa arquivo corrompido ou que não é da GreenIA, sem mexer no banco atual
72. migração: cada mudança de estrutura roda uma vez, em ordem; uma falha não deixa pela metade
73. migração 1: banco da versão anterior ganha os oito estados do quick win, responsável e tipo de medição
74. admin cria áreas e pessoas; email inválido é recusado; o último admin não sai
75. só o responsável da área (ou o admin) envia documentos; só o admin, para a empresa toda
76. formatos: PDF com texto, DOCX, XLSX, CSV, TXT e MD; imagem ou PDF sem texto legível recebe o aviso técnico de leitura
77. quem é da área vê o documento da área; quem não é, não vê; o da empresa toda aparece para todos
78. sem resposta na base, a instrução indica o responsável da área
79. substituir e remover documento: a busca acompanha
80. sigilosa por documento sigiloso da base: não vai a modelo não homologado; reenvia ao homologado; a chave trava
81. chat com streaming: persona no system, resposta gravada, custo informado pelo OpenRouter
82. preferências de privacidade em toda chamada: normal pede fornecedor sem treino; o admin pode desligar
83. modelo fora da lista liberada nunca é usado: o pedido segue no automático, sem perguntar nada à pessoa
84. acesso por perfil: sem o Avançado, a pessoa não vê nem usa modelo Avançado no chat
85. trocar de modelo no meio da conversa funciona e fica registrado na conversa
86. falha do modelo principal usa o reserva e registra qual respondeu
87. filtro no servidor: CPF é dado pessoal e segue normalmente por padrão; proteger e bloquear são política da empresa; credencial nunca sai
88. sigilosa pela chave manual
89. sigilosa por dado que a política manda proteger (dados bancários); CNPJ de empresa é conteúdo normal
90. área com proteção reforçada: conteúdo comum segue as regras gerais, mesmo sem recurso para dado sigiloso
91. conversa marcada só pela área (regra antiga): sem sinal de conteúdo sigiloso, volta às regras gerais; com sinal, continua sigilosa
92. sigilosa: o seletor mostra só homologados, e a pessoa usa o homologado padrão mesmo sem o perfil
93. sem nenhum homologado disponível para todos, a configuração é recusada
94. privacidade: outra pessoa e o admin não leem a conversa pela API
95. retenção: conversas sem uso há mais que o prazo são apagadas, com registro
96. admin informa a chave: formato, teste no OpenRouter, cifrada, máscara e troca na hora
97. depois de reiniciar, a chave salva volta sozinha; remover volta para a variável
98. 1, 2 e 3. chave nova inicia o contador; troca reinicia e descarta o vencimento informado da anterior
99. 7. cálculo em UTC + duração: 100, 90, 89, 88, 83, 60 e 0 dias de uso; vencimento do provedor por duração exata
100. 7b. o fuso da plataforma só muda a exibição; o cálculo é o mesmo em qualquer fuso
101. 8 e 14–16. prazo: 7 e 730 aceitos; fora do limite, decimal, zero, negativo, nulo e texto rejeitados; mudar o prazo não reinicia o início
102. 6–12. cada estágio envia um email por chave e por destinatário; o job repetido não duplica; a troca reinicia os estágios
103. 10b. falha no envio não marca como enviado; sucesso parcial reenvia só para quem faltou
104. 13. duas instâncias no mesmo banco, ao mesmo tempo: um email só
105. 4, 5 e 23. recusa num envio: alerta e email imediatos, prevalece sobre o prazo, bloqueia novos envios; a troca tira o alerta na hora
106. 24. sem vencimento no OpenRouter não é chave inválida; OpenRouter fora do ar não é recusa
107. 17 e 18. OPENROUTER_API_KEY: início persistido entre reinícios; chave nova reinicia o ciclo; voltar à antiga não reinicia
108. 19–21. a chave completa não aparece em respostas, HTML, logs, auditoria, emails nem no banco (fora da cifra)
109. 22. empresas não acessam a chave nem a configuração, e nada da chave aparece nas APIs da empresa
110. conversa apagada: o conteúdo sai do banco, é zerado no arquivo principal e o arquivo temporário (WAL) é consolidado e truncado na hora
111. Visão geral: envio bloqueado pelas regras de dados aparece como ponto de atenção, sem o conteúdo
112. registro: toda linha tem as 13 colunas, estado válido, superfície conhecida e id único
113. registro: cada claim sustentado está na superfície, com evidência no código e teste existente
114. fora da página: claims obsoletos, não sustentados e futuros não aparecem em nenhuma superfície
115. trechos sensíveis (dados, segurança, privacidade, custo, conferência, fornecedores) só entram com registro sustentado
116. blacklist: formulações proibidas não aparecem, salvo dentro de frase registrada que as sustenta
117. blacklist B20: "antes do envio" sempre diz sobre o quê (mensagem, anexo, senhas e chaves, documentos da base)
118. blacklist B23: "colegas e admin não veem" só com o escopo das telas (exportação e suporte alcançam o banco)
119. blacklist B24: "conferido a cada execução" só com a jornada guiada (quick win em branco ou de modelo não é conferido)
120. blacklist: cada entrada do código está documentada no registro, e cada liberação aponta para uma entrada existente
121. as páginas não fazem promessa jurídica, não generalizam garantias e não expõem o provedor
122. dados: CNPJ não é "protegido", CPF não é "protegido" nem confidencial, e cada tipo tem a sua regra
123. confidencial só por marcação reconhecida, nunca por ser uma proposta; guardrails de sigilo não são atribuídos a CPF/CNPJ
124. credenciais: a promessa é sobre senhas e chaves reconhecidas, em todas as partes do envio, sem absoluto (P1 resolvida)
125. ambiente: sem "infraestrutura privada/dedicada", servidor dedicado ou isolamento físico
126. fornecedor: atributos declarados, nunca garantia verificada de retenção ou treino
127. roteamento e créditos: sem troca automática de recurso; continuidade sempre com a ressalva da reserva
128. telas ilustrativas: cada bloco com números tem o aviso de exemplo; o menu é o da Administração atual
129. comparação com terceiros: a página fala do que a GreenIA faz, sem generalizar sobre outros produtos
130. textos internos: nenhuma formulação retirada volta à política, ao admin, às mensagens de bloqueio ou aos avisos
131. política: diz o escopo real de visibilidade, acesso técnico, backup, credenciais e regras por parte do envio
132. admin: a opção de dados pessoais descreve o pedido sem treino como filtro, não como garantia
133. 1-6. conteúdo normal processa, em área normal e reforçada, mesmo sem recurso autorizado para sigilo
134. 7-9. dado pessoal não bloqueia nem torna a conversa sigilosa por si só, em mensagem, PDF ou área reforçada
135. 10-13. dado sensível e informação confidencial: só com guardrails; sem recurso autorizado ou com a opção desligada, nada sai
136. 14-17. credenciais e segredos: bloqueio absoluto, em mensagem e em PDF, com qualquer configuração
137. 18-22. sem recurso elegível, créditos no fim, nova tentativa, API e anexos: a mesma governança, nunca recurso não autorizado
138. 23-25. histórico: processado fica com mensagem, anexo e resposta; bloqueado registra a tentativa sem conteúdo e sem marcar a conversa
139. quick win "reunião → plano de ação": transcrição com nomes, cargos e emails corporativos, em área reforçada, sem recurso autorizado para sigilo
140. empresas que já existiam: regras antigas viram as proporcionais; o "bloquear" escolhido pela empresa continua valendo
141. classificação: CPF é dado pessoal; CNPJ é identificação de empresa, sem os controles de dado pessoal
142. documento com CNPJ e dados de pessoas físicas: cada dado pelo próprio conteúdo
143. uso: CNPJ sozinho processa normalmente, sem controles de dado pessoal; com CPF do representante, os controles valem pelo CPF
144. console mostra saldo, créditos e uso da chave no OpenRouter, e o consumo diário da plataforma e da empresa
145. só o admin da plataforma vê; a empresa não vê a conta nem o consumo das outras
146. saldo abaixo do alerta avisa os admins por email, no máximo uma vez por dia; o limite é configurável
147. cliente do OpenRouter lê /key e /credits e tolera a parte que falhar
148. receita e margem TOTAL do console: plano + Capacity Packs do mês − custos proporcionais − IA com a taxa − parte da infraestrutura; servidor configurável e auditado
149. planos no console: margem TOTAL no pior caso com detalhamento, status, preço mínimo e folga; trava de 50% no salvamento; sem preço e sem teto marcados
150. conciliação com o OpenRouter: gasto da chave no mês contra o registrado como crédito; alerta quando passa de 1%
151. formulário cria o contato com last_interaction_at; o mesmo email volta ao mesmo contato; email aos admins sem o conteúdo
152. interação real registrada no console move last_interaction_at; data futura é recusada; automação não move
153. 24 meses: até o limite fica; passou, dry-run só registra e aplicar elimina os dados pessoais; agregado não reidentifica
154. hold (obrigação legal, contrato ou litígio) impede a eliminação; liberado, segue a regra
155. limite de 500 não apaga: 510 contatos ficam todos; a listagem é paginada
156. migração: provada por contagem, sem perda, sem duplicar o mesmo email, idempotente, com rollback sem perda
157. as rotas administrativas foram encontradas no código
158. quem não é admin recebe 403 em toda rota administrativa, com ou sem parâmetros de "admin"
159. quem não é admin continua sem acesso depois de tentar; o admin segue com a mesma sessão nos dois contextos
160. multiempresa: membro, leitor e gestor não têm a permissão das rotas de configuração
161. a tela não decide: quem não administra pergunta ao servidor, e cada tela aponta para uma leitura que existe
162. texto pequeno com contraste de pelo menos 4,5:1
163. verde e âmbar de texto pequeno são os pedidos
164. esquema de cor da empresa: toda cor aceita pelo servidor mantém 4,5:1 nos tons derivados
165. a cor sugerida é o mesmo tom, mais escuro, e sempre passa no mínimo (servidor e navegador iguais)
166. variantes do selo vêm depois da regra base (senão o fundo areia apaga a cor e o selo escuro fica ilegível)
167. resposta aparece uma vez com a rota atual; histórico de auditoria e outras conversas não duplicam conteúdo
168. histórico paginado pesquisa e filtra só conversas da pessoa; excluir todas passa de 200 e preserva novas
169. excluir conversa limpa mensagens e anexos, invalida aprovação e remove material de integração
170. exclusão é recusada durante resposta em andamento e funciona após a conclusão
171. uma regra só: contemCredencial é a mesma regra do tipo "credencial" usada em mensagens e anexos
172. base de conhecimento: o documento pode ser guardado, mas o trecho com segredo nunca entra no contexto, em qualquer formato (inclusive OCR)
173. base de conhecimento: pergunta que não recupera o trecho com segredo processa normalmente
174. quick win: arquivo, instruções e exemplos com segredo bloqueiam em uso e em teste; sem segredo, processa
175. histórico: um segredo guardado antes (ex.: conteúdo anterior à regra) bloqueia a nova chamada que o reenviaria
176. contexto composto: mensagem segura + base com segredo, e mensagem segura + quick win com segredo, são bloqueadas
177. defesa final: um caminho que montasse contexto sem passar pela conferência é barrado antes do envio, e nada fica gravado
178. sem credencial configurada: o Quick Win de pesquisa não quebra, não simula e não chama o provedor
179. admin da empresa não configura a chave; a do console é testada, cifrada e nunca volta
180. A: pesquisa com a chave do console, plugin web, data_collection=deny, fontes reais do payload e tool_used só com metadados
181. três níveis: Rápido, Equilibrado e Avançado usam o modelo configurado, a mesma chave, web e deny
182. F: pesquisa + contexto da empresa + entregáveis separados por canal, briefing nas imagens e roteiro de Reels
183. isolamento: a empresa B não lê a credencial nem a configura; sem liberar pesquisa, nada de plugin e resultado parcial
184. CSV: índices das tabelas, UTF-8, proteção contra fórmula e números negativos
185. CSV de conversa: download autenticado contém só a tabela pedida, sem cache
186. CSV de conversa: outro usuário, admin e visitante não acessam o conteúdo
187. CSV de conversa: índices inválidos, mensagem da pessoa, conteúdo não guardado e exclusão não expõem dados
188. chamada refeita: o custo da primeira (que a rota sobrescreveu) entra na linha de uso do pedido
189. execução que falha depois de gastar (nada gravado pela rota): uma linha com o custo, atribuída à conversa
190. stream interrompido: o custo é buscado no provedor pela identificação da geração e vira crédito
191. quem para de ler antes do fim também paga: o custo vem do provedor
192. caminho feliz: nada muda (sem ajuste, sem linha a mais) e imagem cobrada sem imagem entra no pedido
193. cliente OpenRouter: avisa a geração no stream, busca o custo da geração e devolve o custo junto do erro de imagem
194. login da empresa com email falhando: 503 claro, motivo registrado sem segredos, aviso no console; volta ao normal quando o envio funciona
195. email próprio da empresa falhando: o código sai pelo email da plataforma e a falha fica registrada
196. admin da empresa: vê a falha do email próprio (explicada, sem segredo) e o teste não cai em silêncio no email da plataforma
197. explicações de falha de email: senha recusada, domínio não verificado, conexão bloqueada, remetente recusado
198. semSegredos tira senha de URL, chaves de API e Bearer
199. cancelar registra cancelled_at e delete_after = +30 dias corridos e bloqueia o uso na hora, inclusive da equipe de operação
200. antes de 30 dias não exclui; no prazo exclui sozinha (dry-run só registra); revalida e é idempotente
201. hold impede a exclusão automática e a do console; liberado, a exclusão segue
202. exclusão antecipada pelo Cliente: código no email do admin, identificador e ciência de irreversível
203. exclusão antecipada sem autorização falha: quem não é admin, código errado, pedido informal e hold
204. devolução: pedido verificado, cópia SQLite gerada pela operação, link de uso único até 7 dias, entrega registrada
205. link de devolução vence em 7 dias: a cópia sai do servidor sem download
206. sem o endereço público da plataforma, o link de devolução não é gerado (nada é exportado)
207. empresa cancelada antes do controle: data estimada nunca exclui sozinha nem vence antes de 30 dias da migração; só com confirmação
208. página: /encontrar abre no endereço da plataforma; /entrar sem empresa leva para lá
209. email com acesso recebe os links das empresas disponíveis; suspensa fica de fora
210. email sem acesso: mesma resposta, nenhum email enviado
211. limites: no máximo 3 emails por hora para o mesmo endereço, e 10 pedidos por IP
212. domínio próprio entra no link só depois de verificado
213. administrador da plataforma recebe o link do console
214. endereço de empresa inexistente: página da marca com o caminho para encontrar; sem hífen leva ao endereço certo
215. "suporte" (e "outro") isolado não exporta o banco; sem justificativa também não
216. pedido do Cliente, incidente e obrigação legal exportam: cópia no servidor, hash, registro e aviso
217. download registrado (quem e quando); necessidade encerrada calcula expires_at = +7 dias; elimina no prazo
218. hold (obrigação legal ou incidente) suspende o prazo; ao liberar, o tempo restante volta a correr
219. cópia baixada: a eliminação externa só é declarada (não é provada) e exige download
220. detecta cpf
221. detecta cnpj
222. detecta cartao
223. detecta banco
224. detecta pix
225. detecta credencial
226. detecta rg
227. detecta email
228. detecta sensivel
229. detecta confidencial
230. detecta telefone
231. detecta cep
232. detecta endereco
233. não dispara em datas, valores, números de pedido e textos comuns
234. devolve só os tipos, nunca os valores
235. decidir: credencial sempre bloqueada, mesmo marcada como permitir
236. HTML vira texto com a estrutura útil; script, estilo e navegação nunca entram
237. link mascarado: sem usuário, senha nem query (token, assinatura)
238. link inseguro nunca é buscado: http, localhost, loopback, rede interna, metadados, IPv6 local, credencial e DNS rebinding
239. link que exige login e formato binário: falha com o motivo, sem adivinhar o conteúdo
240. conferência de fidelidade: obrigatória usada, obrigatória ilegível, referência copiada como fato, base não confundida
241. comandos de fonte na conversa: ignorar, só esta, só referência, fonte principal, usar
242. Imagem final: tipo próprio (peça pronta, PNG e JPG), distinto de Imagem (briefing); pedido explícito vira imagem final
243. A/B. arquivo como fonte obrigatória e link como base de conhecimento: papel, situação, sem link real na tela
244. E. execução usa as fontes com código e papel; fonte obrigatória usada → aprovado; "Fontes usadas" no resultado
245. F/G. obrigatória ignorada é corrigida; obrigatória que não pôde ser lida → parcial com o motivo (nunca aprovado); opcional ausente não bloqueia
246. C. referência só influencia estilo: dado copiado dela é corrigido; nunca entra como fato
247. D. planilha como fonte (XLSX) com papel; troca de papel e substituição criam nova versão da fonte
248. J. versão publicada guarda o retrato das fontes; fonte alterada depois é avisada na execução
249. conhecimento da empresa como fonte (papel próprio); escolher documento invisível para a pessoa não é aceito
250. conhecimento da empresa na execução: trecho da base entra com o papel e aparece em "Fontes usadas"
251. H/I. multiempresa e acesso: quem não gere o Quick Win não lista, não lê nem muda as fontes (sem revelar)
252. conversa: link enviado é lido pela rede segura; link inseguro vira aviso explícito; comando muda o papel do material
253. Imagem final: com gerador, a imagem é gerada e a peça sai pronta (PNG/JPG); nova imagem e variação viram versões
254. Imagem final com texto mais longo: nova imagem e variação recompõem sem cortar (mesmo ajuste da execução)
255. Imagem final sem gerador: parcial, com briefing da imagem; nunca aprovada como imagem
256. generalização (24 pedidos novos): imagem final × briefing × outra peça × sem visual; comandos de fonte
257. persona: a lista de responsáveis serve só para indicar quem procurar; nomes do material são dados do trabalho
258. nenhuma página nem gerador chama o Google Fonts; todas usam /fontes/fontes.css
259. fontes servidas com tipo font/woff2, cache longo e CSP só com fontes locais
260. nenhum nome de cliente, área fixa ou ERP no código da aplicação
261. invariante (10 casos): modelo proibido nunca é executado; com alternativa é substituído, sem alternativa bloqueia
262. invariante 7b: Automático do OpenRouter ligado pela empresa nunca recebe dado sigiloso
263. invariante 8: capacidade abaixo da classe mínima do quick win não é usada
264. invariante 9: janela insuficiente do modelo solicitado: vai para um que lê tudo
265. invariante 4: fora do plano (créditos no fim): só o nível econômico
266. invariante (propriedade): 120 entradas aleatórias de API nunca executam modelo proibido
267. caso A: solicitado elegível é usado (solicitado == selecionado)
268. caso B: solicitado não elegível com alternativa: substituído, executa normalmente; o admin vê o motivo exato
269. caso B2: o selecionado cai no fornecedor e a reserva responde: registrado como substituição por indisponibilidade
270. caso C: solicitado não elegível e sem alternativa: bloqueio seguro, nada enviado, admin avisado
271. uma só rota de execução: toda chamada à IA passa pelo roteador e pela governança
272. modo recomendado e manual: as mesmas regras obrigatórias; o manual muda só o grau de controle
273. hierarquia: modelo homologado pela empresa MAS proibido pela plataforma não é elegível; a empresa não reverte
274. admin leigo: nova empresa, recomendações, tarefas, sigilo, bloqueio, alerta legível, manual e volta
275. ignorância deliberada: as tarefas se resolvem só com a intenção
276. matriz da pessoa leiga: nenhum cenário pede decisão técnica, homologação, política, permissão ou reserva
277. recursos: nível de proteção calculado dos atributos da rota real, não de uma chave binária
278. dados pessoais e identificadores: processam com os controles proporcionais, sem bloqueio nem conversa sigilosa
279. a política da empresa é a autoridade: sem a proteção de dados pessoais, vale o recurso que ela liberou
280. documentos e contexto: PDF, PPTX, reunião, RH sem conteúdo sensível, contrato e relatório processam, também em área reforçada
281. conteúdo sensível e confidencial: controles adicionais; sem recurso compatível, não envia e explica em linguagem simples
282. segredos: senha, API key, token e segredo em PDF ou PPTX são bloqueados sempre
283. fallback: nunca um recurso incompatível ou não autorizado; sem compatível, nada sai; nova tentativa e API repetem a avaliação
284. retenção separada do processamento: guardar, processar sem guardar e bloqueio sem guardar
285. regressão crítica: PDF institucional de ~9.500 caracteres, área reforçada, sem recurso para confidencial, opção ON ou OFF → processa
286. npm start: sobe, responde em /api/saude e para com SIGTERM
287. produção sem OPENROUTER_API_KEY: sobe com a IA desligada e avisa, sem cair na simulada
288. com a IA desligada, a mensagem volta com o aviso claro e o admin sabe pelo /api/eu
289. generalização: 22 pedidos inéditos de 10 áreas, motor congelado
290. generalização, rodada 2: 20 pedidos novos depois do ajuste genérico
291. caso Financeiro: conciliar recebimentos (leitura liberada), lançar baixa (aprovação), apagar título (negado)
292. caso Gestão: indicadores do BI (leitura), tarefa no gerenciador de projetos (aprovação), sistema sem integração (configurar)
293. caso RH/Administrativo: dado pessoal pede aprovação até na leitura; política da empresa (dados) libera o que ela decidir
294. fluxo Financeiro: negócio concluído → validação → emissão do documento → envio → registro
295. fluxo Gestão: dados → indicador → alerta → responsável → decisão
296. fluxo RH/Administrativo: entrada → validação → encaminhamento → acompanhamento → conclusão
297. nome composto após sistema e referência ao mesmo sistema resolvem o conector aprovado
298. nome curto identifica seu sistema, sem casar letras dentro de outro nome
299. risco e classe: leitura baixa, escrita média, destrutivo/financeiro crítico, automação de navegador alta
300. políticas são dados: padrão (ler, aprovar escrita, negar destrutivo), regra da empresa, invariantes que nenhuma regra afrouxa
301. mapeamento: DSL segura (renomear, tipos, data, enum, juntar, dividir, padrão); sem eval e sem __proto__
302. esquema: tipos, obrigatórios, enum, itens; gravidade parcial x inconsistente
303. descoberta: OpenAPI 3, Swagger 2 e GraphQL viram operações declarativas; documentação é dado não confiável
304. ciclo de vida: nada vai de DRAFT para ACTIVE; publicar exige teste e aprovação da MESMA versão; versão nova invalida aprovação
305. runtime: leitura passa; escrita pede aprovação e só executa a entrada aprovada; destrutivo negado; idempotência evita duplicar
306. repetição só quando segura: 503 em leitura repete; escrita sem idempotência não; tempo esgotado; resposta fora do esquema não passa em silêncio
307. modo teste: escrita é simulada (nada enviado); leitura de verdade; teste reprova credencial inválida
308. reutilização: a capability publicada serve a vários Quick Wins da empresa; resolução indica disponível, configurar ou não permitido
309. plano de execução: dependências, saída de uma etapa vira entrada da outra, aprovação pausa, falha bloqueia dependentes, compensação só sugerida
310. OAuth: client credentials; authorization code com state de uso único, mesma pessoa, redirect exato e PKCE
311. webhook: assinatura, janela de tempo, replay, rotação de segredo
312. limite de taxa por conector
313. reabrir conversa mostra a gravação concluída sem repetir chamada nem expor dados do plano
314. listas longas preservam o total no runtime e o recorte só acontece no material da IA
315. SSRF: localhost, 127.0.0.1, metadados, rede privada, CGNAT, IPv6 local e mapeado são bloqueados
316. SSRF: DNS rebinding (um IP bom e um interno, ou troca entre resolução e conexão) não alcança a rede interna
317. allowlist de hosts, protocolo, credencial na URL e redirecionamento para fora ou para IP interno
318. cabeçalho com quebra de linha, nome inválido ou proibido é recusado (header injection)
319. tempo limite e resposta grande demais
320. redirecionamento para outro host da allowlist não leva a credencial
321. redação: nada de token, senha, chave ou Authorization em log e auditoria
322. credencial não aparece em log, erro, auditoria, resposta nem no banco em claro; erro do sistema externo que ecoa a chave é redigido
323. caminho com ".." ou parâmetro que tenta trocar de host é recusado (path traversal)
324. desligado por padrão: rotas de integração respondem 404 e o Quick Win não mostra nada de integração
325. ciclo completo pela API e Quick Win: leitura vira material; escrita pede aprovação, executa só a entrada aprovada e não duplica
326. isolamento entre empresas: conector, credencial, aprovação, plano e catálogo da Alfa não existem para a Beta
327. sem permissão: quem não administra não configura nem aprova integrações
328. conferência parcial ou desconhecida nunca sugere ausência de problemas
329. empresa nova já tem a landing publicada e preenchida, com SEO
330. todas as seções novas são salvas e validadas
331. marca: favicon em JPG ou WEBP é aceito, e o ícone da aba não fica em cache
332. marca nasce com título e texto do login e aviso de privacidade de exemplo, editáveis
333. marca branca: o aviso de privacidade de exemplo não cita a plataforma; o texto antigo gravado é trocado, o editado fica
334. multiempresa: o aviso de administrar a base leva ao endereço da própria empresa
335. todas as seções opcionais podem ser escondidas, inclusive O que você encontra e Institucional
336. admin da empresa edita a landing sem plano definido; quando trava, o motivo é o verdadeiro
337. prévia: quem edita vê a landing completa em rascunho ou em implantação; visitante nunca
338. domínio próprio vale em qualquer plano; empresas antigas recebem a liberação; o operador ainda pode travar
339. páginas legais geradas em dia com docs/legal (rode node scripts/gerar-legais.js depois de editar o .md)
340. termos e privacidade no ar na instalação de vendas e na plataforma, com noindex e faixa de candidata até a publicação final
341. identificação legal igual no rodapé da LP, nos Termos e na Política
342. LP: acesso da equipe sem aprovação prévia inventada; retenção sem prazo na página; nada de "equipe GreenIA" no app das empresas
343. termos e privacidade só no endereço canônico da plataforma; no endereço de uma empresa levam à plataforma e o resto continua igual
344. versão final 1.0: sem marcação de pendência, rascunho ou texto interno; vigência de 30/11/2026; publicação marcada
345. registro da aprovação: o hash anotado bate com os documentos (mudou o texto, atualize o registro)
346. mais anexos do que o permitido por mensagem é recusado
347. anexo com texto demais é recusado com a estimativa de páginas e a sugestão da base
348. a soma do texto dos anexos de uma mensagem tem teto
349. arquivo acima do tamanho máximo é recusado
350. anexos antigos saem do histórico quando passam do orçamento; o da mensagem atual vai sempre
351. código por email: só domínio permitido; entra, recebe cookie HttpOnly e SameSite=Lax
352. fora dos domínios, só entra quem o admin cadastrou; ADMIN_EMAIL é sempre admin
353. ADMIN_EMAIL com vários emails, de qualquer domínio, entra como admin
354. cookie Secure quando a instalação usa HTTPS
355. código errado conta tentativa; depois de 5, nem o certo entra; código vale uma vez só
356. no máximo 3 códigos a cada 15 minutos; código vencido não entra
357. sem sessão: 401; escrita sem token CSRF ou com Origin de fora: 403
358. páginas saem com cabeçalhos de segurança e sem script de terceiros
359. medição sem valor antes mostra "sem ponto de partida" e não calcula nada; com antes e depois, mostra a variação
360. uso automático por mês: conversas (não mensagens), pessoas, feedback e custo
361. decisão com data, quem decidiu e por quê; CSV com uso, medições e decisões; só quem gerencia
362. problema reportado: gravado, email ao admin, evento sem a descrição
363. modelo gratuito: liberado com aviso, nunca homologado
364. banco anterior ao Quick Win 2.0 sobe com a estrutura nova e os dados intactos
365. catálogo: Starter 199/2.000/400, Team 399/5.000/1.000, Business 749/10.000/2.000, Company 1.799/25.000/5.000; Capacity Pack 229/2.000
366. premissas: crédito US$ 0,01 + 5,5% = US$ 0,01055; custos proporcionais 12% + 3% + 15% = 30%; piso 50% e meta 52%
367. margem total no pior caso, calculada das premissas (infraestrutura de referência US$ 7,25): faixas, preço mínimo e folga
368. trava: abaixo de 50% é erro; exatamente no preço mínimo passa; a média de uso não contorna a trava
369. premissas validadas no servidor: frações entre 0 e 1, meta ≥ piso, custos + piso < 100%; o custo-base do crédito não é editável
370. plataforma nova: os quatro planos, o Liberado e o Capacity Pack; mesmos limites e recursos; premissas pelo console (auditadas) mudam as margens
371. migração do catálogo: Team e Company atualizados no MESMO registro (empresas continuam vinculadas), Starter e Business criados, planos do operador intocados, idempotente
372. ajuste de preço do Company (US$ 1.749 → 1.799): uma vez, auditado, e só se o preço ainda é o de catálogo
373. migração do banco da empresa: pacotes antigos ganham produto legado e o valor da época, sem mudar créditos
374. consumo: franquia primeiro, depois Capacity Packs (do mais antigo), por último a reserva; pausa no fim; renovação zera a franquia e o pack acumula
375. reserva: só classe Rápido, sem imagem, sem design pela IA, sem conferência por IA, sem estrutura de Quick Win; execuções simultâneas não passam do teto
376. nome de 20 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
377. nome de 40 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
378. nome de 50 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
379. nome de 51 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
380. nome de 60 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
381. nome de 72 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
382. nome de 80 caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe
383. personalização: nome comum aparece nos quatro campos; nome de 80 caracteres usa as formas genéricas inteiras
384. domínio próprio: provedor recebe o cadastro, DNS certo vira verificado, errado fica pendente com orientação
385. provedor Render: chamadas corretas à API, sem expor a chave em erro
386. respostas simultâneas: acima do limite do plano, 429 só para aquela empresa
387. exportar e excluir: só empresa cancelada, com confirmação; guarda cópia e apaga o banco
388. console: só admin da plataforma entra; pessoa comum não recebe código
389. fluxo de aceite: criar empresa, plano, admin, marca, landing, URL e publicar
390. admin da empresa entra, convida usuário, cria role e define permissões
391. admin da empresa personaliza dentro do que foi concedido; o operador bloqueia e sobrescreve
392. isolamento: nada da empresa A é alcançável a partir da empresa B
393. domínio próprio e subdomínio resolvem a empresa; duplicidade e domínio da plataforma são recusados
394. suspender derruba as sessões e bloqueia o acesso; reativar libera
395. admin da plataforma entra em qualquer ambiente, com registro na auditoria
396. planos por configuração: limite de usuários, recursos e mudança de plano valem na hora
397. último admin da empresa não sai; próprio usuário não se rebaixa
398. auditoria registra usuário, empresa, ação, antes, depois e origem
399. importação: a instalação única vira a primeira empresa, com pessoas e admins
400. avaliação de legibilidade: texto real passa; ruído (mesmo com confiança de página acima do antigo mínimo de 30) não
401. girar: 90° horário, 270°, 180° e volta completa, em cinza
402. regressão: imagens de pé continuam lidas como antes
403. rotação: foto de lado (PNG e JPEG) e PDF escaneado de uma página de lado são lidos
404. rotação em todas as orientações: 90°, 180° e 270° em PNG, JPEG e PDF de uma página dão o mesmo texto da imagem de pé
405. conteúdo visual com texto: o texto é lido, o visual não vira texto; só visual: recusado
406. radiografia sintética (confiança de página acima do antigo mínimo): o ruído é descartado e as etiquetas de lado são lidas
407. imagem sem texto legível e PDF escaneado sem texto legível: mensagem própria, técnica, sem jargão
408. chat: imagem só com ruído não chama a IA e mostra a mensagem própria
409. chat: senha numa imagem de lado agora é lida e bloqueada como credencial (antes saía ruído)
410. chat: foto de lado com texto comum é lida e enviada normalmente
411. limites centralizados e configuráveis por variável de ambiente (padrão: 1 leitura por vez)
412. dimensões pelo cabeçalho (sem decodificar) e imagens de um PDF pelos dicionários
413. concorrência: 1 leitura por vez no processo, mesmo com pedidos de pessoas e empresas diferentes
414. concorrência: com a fila cheia ou a espera esgotada, resposta técnica controlada (sem fila persistente)
415. limites de tamanho, páginas e pixels: recusa técnica antes de abrir o OCR
416. PDF escaneado: 1, 5, 10, 20 e 30 páginas página a página; acima do limite, recusa técnica
417. imagem acima da resolução de leitura: reduzida (em cinza) antes do OCR, e o texto continua legível
418. guarda de memória: sem margem, a leitura não começa; durante a leitura, acima do limite, ela é interrompida
419. tempo esgotado, erro de OCR, erro numa página intermediária, cancelamento, imagem inválida e PDF corrompido
420. memória volta a um patamar estável depois das leituras (sem retenção acidental de objetos)
421. sem rastro: nenhum arquivo temporário e nenhuma métrica com conteúdo
422. diagnóstico no servidor real (processo limpo, limites padrão): nada passa do limite operacional
423. INSTANCIAS: nome, url e token por linha ou ponto e vírgula
424. rota de token: sem token, token errado e bloqueio após tentativas
425. cliente não acessa o console nem com sessão de admin
426. console junta as instalações e mostra quem não responde
427. Capacity Pack liberado pelo console chega à instalação do cliente: créditos e valor calculados no servidor; créditos avulsos são cortesia
428. troca do modelo por trás de uma classe avisa os admins, sem tom de erro
429. painéis multiempresa: IDs iguais nunca compartilham registros, permissões atuais são exigidas
430. catálogo, preparação atômica e nenhuma publicação automática
431. dados preparados não contam; confirmação e repetição não duplicam registros
432. registro privado invisível até confirmação explícita de compartilhamento; conversa permanece privada
433. nova proteção de sigilo esconde dados anteriormente compartilhados
434. resultado de teste é visível para revisão, mas não entra no histórico
435. pergunta, inconsistência, falta de conferência e conteúdo não guardado não geram registros
436. parcial exige ciência; validação bloqueia campo ausente, estado inválido e confirmação ausente
437. correção mantém mês de confirmação, exige motivo e versão atual; revisões auditáveis
438. retirada com motivo recalcula indicadores e impede nova confirmação
439. apagar conversa apaga registros e revisões por retenção, sem dados órfãos
440. governança de armazenamento e credenciais continua aplicada a dados conferidos manualmente
441. usuário de consulta não grava nem prepara
442. estado agregado e data de ações são validados, não inferidos pelo painel
443. extração descarta campos sem evidência literal e não aceita dados ou estados fora do catálogo
444. sugestão governada prepara campos, contabiliza custo e reaproveita sem nova chamada
445. paginação conserva todos os indicadores e permite alcançar registros anteriores
446. sigilo não dispara chamada de extração e compartilhamento segue bloqueado
447. falha de IA mantém caminho manual, sem incluir dados no histórico
448. datas mensais respeitam Brasília, revisões têm motivo e não expõem dados a terceiros
449. QA profundo: excluir origem durante extração não cria órfãos e libera preparação em andamento
450. QA profundo: política de armazenamento alterada durante IA é aplicada antes da persistência
451. QA profundo: correções concorrentes aceitam uma versão e preservam indicador e trilha coerentes
452. QA profundo: múltiplos itens, repetição do caso em outra conversa e busca não equivalem a deduplicação de negócio
453. QA profundo: ações validam calendário real, aceitam prazo vazio e não aceitam estados de fornecedores
454. QA profundo: sigilo do Quick Win após compartilhamento recolhe acesso sem apagar registro pessoal
455. QA profundo: leitura repetida de indicadores não chama IA nem altera custo, versões ou dados
456. QA profundo: expiração real da retenção elimina histórico e revisões e recalcula indicadores
457. números em formatos comuns (pt-BR, ponto, moeda, porcentagem) e texto não é número
458. totais, vazios, fora do padrão, variação e somas por categoria sobre todas as linhas (inclusive as últimas)
459. XLSX e CSV: o texto extraído leva os cálculos conferidos
460. o plano Liberado existe, com todos os recursos e sem limites
461. empresa no Liberado: plano ilimitado, sem bloqueio nem limite de mensagens, e sem dólar para o cliente
462. variáveis do servidor: PLANO_CREDITOS e reserva de 20% por padrão
463. operador de outro domínio entra; só ele vê dólar e preços dos modelos
464. mês completo: 80%, só rápido em 100%, bloqueio no fim da reserva, avisos por email
465. o cliente vê créditos, nunca dólar: uso, eventos, tetos e CSV
466. pacote do operador volta todos os modelos, o que sobra passa para o mês seguinte, e a renovação avisa
467. mês que terminou só no rápido: na virada, o admin recebe o aviso de renovação
468. sem plano, nada muda: o admin vê dólar e não há bloqueio
469. preço de modelo liberado muda mais de 20%: evento e email ao operador; a empresa não é avisada sem decisão do operador
470. catálogo confirmado amplia para três modelos por nível e registra uma única inclusão idempotente
471. modo manual, modelos desativados, vetos e capacidades existentes nunca são sobrescritos
472. falta de catálogo, preço inválido, teto excedido e contexto desconhecido não liberam novos recursos
473. escolha de cada nível compara seus modelos em vez de fixar o padrão; Automático usa o menor nível suficiente
474. capacidade explícita relevante vence opção insuficiente dentro do mesmo nível
475. dados sigilosos nunca usam modelos novos sem autorização e não têm reserva livre do fornecedor
476. modelo técnico explicitamente fixado no Quick Win continua fixo
477. modelo retirado do catálogo não participa; falha de consulta preserva catálogo conhecido
478. falhas e latência só pesam com amostra suficiente, são auditadas e não escapam do nível
479. dados antigos, bloqueios de governança e resultados ainda incompletos não contaminam desempenho
480. curadoria seleciona modelos diferentes para tarefas distintas no mesmo nível, com custo e governança mantidos
481. isolamento: o artefato visual da empresa A não abre, não baixa e não se edita na empresa B; a identidade visual é por empresa
482. execução com artefato: plano visual pela IA (mesma rota), artefato guardado na execução, custos por etapa, auditoria sem conteúdo
483. plano visual ilegível: o planejador determinístico assume, sem perder o artefato
484. edição sem refazer a execução: texto, título, ordem, formato e cores viram nova versão conferida; restaurar; regra da marca não muda
485. reuso de conteúdo: derivar outro artefato (one-page, infográfico, carrossel) sem nova execução e sem IA
486. acesso: só quem executou vê, baixa, edita ou deriva o artefato (outra pessoa e o admin recebem 404)
487. gerador de imagem liberado: imagem vira asset (só o tema vai para o modelo), custo separado; falha do provedor não perde o artefato
488. governança do gerador de imagem: sigilo, área reforçada, dado protegido e reserva do plano bloqueiam; sem provedor, sem chamada
489. imagem que precisa ser real: espaço reservado explícito e resultado parcial; a foto enviada entra numa nova versão (validada pelos bytes)
490. regressão: Quick Wins sem visual (resumir, comparar cláusulas, listar pendências) não ganham produção visual
491. interpretação: o plano da IA decide (tipo desconhecido vira custom); sem IA, a leitura do pedido reconhece o visual; pedido de texto não vira visual
492. identidade visual no admin: regras validadas (logo SVG com script recusado), preferência não vira regra, imagens desligadas quando a empresa desliga
493. retenção: conteúdo que a empresa não guarda não gera artefato guardado, e a pessoa é avisada
494. filtro de saída: substitui o nome, a URL, a chave e o identificador do provedor
495. código das páginas da empresa não contém o nome do provedor (só o painel global e o console do operador)
496. respostas da API da empresa, para quem usa e para o admin da empresa, nunca citam o provedor
497. arquivos da interface: revalidação a cada carga (deploy novo aparece na hora) e 304 quando nada mudou
498. tipo de trabalho: sugestão clicada vale; sem ela, inferido da descrição
499. nome e descrição automáticos
500. regras: poucas, "não inventar" sempre ligada e travada; formato sugerido com motivo
501. exemplo: extrai estrutura, detalhe e tom; não vai inteiro para a execução
502. especificação: estrutura completa, sem ferramentas, autonomia do catálogo, explicação vira procedimento
503. entradas de teste geradas: sintéticas, sem segredo e sem dado que a política bloqueie ou proteja
504. contrato de saída: formato, colunas, seções e números sem fonte
505. conferência pela IA: JSON lido com segurança; critério desconhecido ignorado
506. correção automática: aprova, corrige, respeita o limite, reserva sem IA e falha da conferência
507. regras próprias: dados estruturados na especificação, na execução e no Quality Check
508. caso real de produção: contrato Cliente | Valor, resultado Cliente | Valor → aprovado, sem correção, sem Status
509. coluna extra: Cliente | Valor | Status fora do contrato Cliente | Valor → formato falha; corrigido só se voltar ao contrato
510. correção por outro motivo: resolve a regra e continua exatamente Cliente | Valor; Status nunca reaparece
511. renomeação: Cliente | Valor total | Situação na execução, conferência e correção; Valor e Status não voltam
512. adição manual: Responsável passa a ser exigido; o objetivo original não limita o contrato
513. ordem confirmada faz parte do contrato; especificação sem confirmação continua tolerante como antes
514. intenção do trabalho: sem estrutura localizável e colunas da pessoa, o texto original não vai para a conferência
515. decisão explicitamente configurada tem precedência; preferência comum continua automática
516. execução aguarda escolha sem reavaliação automática; recarga preserva estado e resposta continua execução
517. se o modelo ignora a escolha, não entrega artigo nem executa próxima etapa; tentativa permanece pendente
518. plataforma explicita etapa atual e recupera opções uma vez; custo inclui tentativa descartada e escolha retoma
519. falha do provedor na recuperação conserva a espera e o custo da primeira chamada, sem nova rota
520. A e B: colunas nomeadas no objetivo viram o contrato (execução e Quality Check usam as mesmas)
521. origem conferida: campo inventado ou renomeado pela IA é descartado; resposta ilegível não inventa nada
522. C e D: sem campos nomeados, nenhuma coluna tratada como pedida
523. E, F e G: exemplo define como antes; compatível sem duplicar; conflitante mantém o exemplo e registra
524. edição manual é soberana; falha da IA não inventa colunas; Quick Win antigo igual
525. uma chamada por objetivo novo; mesmo objetivo salvo = 0 chamadas; objetivo alterado = 1; consumo registrado
526. C, D e campo inventado pela IA, pelo servidor
527. governança da chamada: permissão, segredo, dados, política, limites, plano e falha da IA (sem bloquear a criação)
528. plano na reserva: nenhuma chamada extra na criação
529. colunas Cliente/Valor/Status + regra própria "Destacar documentos vencidos": especificação, execução e Quality Check
530. precedência: configuração confirmada vale mais que o objetivo na execução e na conferência; especificação antiga igual
531. soberania na execução, no Quality Check e na correção: remover, renomear, adicionar e ordenar
532. critério de aceite: as 7 frases recebem a mesma estrutura de operação (não só a de social media)
533. A. social media continua: canal é só um metadado do entregável
534. B. contrato: documento → resumo, riscos e obrigações, com dependências, critérios e sugestão opcional
535. C. fornecedores: 3 propostas → tabela, análise e riscos; sem os arquivos, pede antes de responder
536. D. pesquisa de mercado: web + contexto da empresa, em etapas; a lacuna de mercado é perguntada
537. E. planilha: dados → resumo, desvios e prioridades; sugestão aceita vira entregável
538. F. reunião: transcrição → ata, decisões, próximos passos e pendências
539. G. relatório: um entregável só é o contrato do formato (relatório), com a lacuna da origem dos dados
540. H. pedido vago: o Quick Win pergunta o mínimo necessário
541. I. imagem pronta pedida vira "Imagem final" (gerada pela GreenIA, com fallback honesto), nunca briefing
542. I2. ferramenta ausente (briefing pedido): a GreenIA explica e entrega a alternativa possível (nunca simula)
543. J. Quick Win antigo: continua funcionando e é atualizado sem perder histórico (só vale ao publicar)
544. interpretação: sem IA usável, plano heurístico (nunca trava); resposta com segredo ou fora do catálogo é descartada
545. homologação real: plano da IA sem canal para peças de um pedido com canais recupera os canais do pedido
546. trabalho que depende da empresa: o contexto da base chega mesmo sem palavra em comum com o pedido
547. rótulo vindo da IA não repete o canal do entregável
548. política de autonomia: pergunta de preferência não bloqueia (vira escolha registrada); a necessária continua bloqueando
549. invariantes do pedido: o que o pedido diz explicitamente não se perde quando o plano da IA varia
550. política de autonomia: sem material obrigatório e com o contexto da empresa, a insistência em perguntar o tema não bloqueia
551. o mesmo pedido em duas empresas: cada uma interpreta, chama e registra o seu plano
552. QA-07: a auditoria da interpretação registra o tipo da correção, não o texto do pedido
553. QA-12: correção estrutural do plano chega na resposta e na auditoria só como contagem
554. QA-02 (revalidação): a mesma frase em empresas e contextos diferentes — caches, planos e eventos independentes
555. inferência: canais, entregáveis ligados ao canal, pesquisa e só valores do catálogo
556. criação: contexto acumulativo, entrega por canal no contrato, lacunas só quando a base não tem o contexto
557. aceite A e B (Apy Mine): pesquisa real, contexto da empresa, todos os entregáveis por canal, fontes guardadas
558. aceite A (falhas): sem pesquisa liberada, entregável faltando ou conversa sigilosa, o resultado não passa como aprovado
559. aceite C: teste contextual e real (exemplo fictício do Quick Win, mesma engine, fora da medição)
560. aceite D: falta contexto essencial, a execução pergunta, pausa e continua com a resposta
561. aceite E: excluir preserva histórico, some do catálogo, respeita permissão e não afeta outra empresa nem o modelo global
562. compatibilidade: Quick Win antigo (sem operação) segue igual; especificação forjada não liga ferramenta
563. inferência: canal coordenado herda as peças já pedidas ("posts para LinkedIn e Instagram e um Reels")
564. citações no formato oficial do OpenRouter (message.annotations e delta.annotations); só http(s)
565. só contexto interno: nenhuma busca, a pergunta mínima de mercado, sem "Concorrente A"
566. contexto público disponível: o perfil classificado pelo admin vai para a busca, e só ele
567. perfil público com dado que não pode sair é recusado; o perfil salvo continua
568. sem contexto nenhum (empresa sem base e sem perfil): pergunta; pedido com o mercado no próprio objetivo: pesquisa
569. isolamento: o perfil e a base de uma empresa nunca vão para a busca da outra
570. o que a pessoa cola de material na execução (texto longo, anexo, dado pessoal) não vai para a busca
571. unidade: o contexto externo só junta peças seguras e diz quando falta mercado
572. checker: matriz com "Concorrente A–E" que não está no material é invenção; tabela sem dados é parcial, não aprovada
573. checker: honesto não é aprovado — a conferência diz que o objetivo não foi atingido, e o status é parcial
574. pesquisa bloqueada chega à conferência e à revisão como estado confiável; falta de pesquisa não vira erro de conteúdo
575. bloqueio não apaga invenção; pesquisa concluída não recebe instrução de limitação e continua sendo conferida
576. "se houver pesquisa de clima, use-a": pesquisa é material, não busca na internet
577. conferente: duração entre datas do material e campo derivado não são invenção
578. conferente: contagem de slides/páginas de peça visual vira observação; o mesmo critério sem peça visual reprova
579. conferente: motivo que confirma o resultado ("está correto", "cálculo legítimo") ou só pede ênfase não reprova
580. conferente: datas sem ano nos dois sentidos, reformulação e aproximação não reprovam; contexto da empresa é observação
581. revisão: só achado confirmado com trecho real reprova; não confirmado, trecho inexistente ou invenção sem trecho viram observação
582. revisão no fluxo: falso positivo do conferente não reprova; revisão que falha mantém o achado
583. avisos de configuração trazem a ação: pesquisa, imagem, fonte obrigatória; motivo que não é configuração não traz
584. execução: data sem ano ou prazo relativo nunca é motivo para perguntar
585. conferente: objetivo "não atingido" só por contagem de slides de peça visual vira observação
586. QA-01 sem IA, contrato: os entregáveis pedidos estão no plano, sem canal
587. QA-01 sem IA, planilha: os entregáveis pedidos estão no plano, sem canal
588. QA-01 sem IA, reunião: os entregáveis pedidos estão no plano, sem canal
589. QA-01 sem IA, atendimento: os entregáveis pedidos estão no plano, sem canal
590. QA-01 sem IA, compliance: os entregáveis pedidos estão no plano, sem canal
591. QA-01 sem IA, apresentação: os entregáveis pedidos estão no plano, sem canal
592. QA-01 sem IA: contexto da empresa pela linguagem do pedido, não só para conteúdo de canal
593. QA-03: componente pedido que só estava na descrição vira seção conferível
594. QA-05: a quantidade do pedido conta o material, não o resultado
595. QA-08: "pesquisa" como material interno não liga a pesquisa na internet; pedido de pesquisar continua ligando
596. QA-09: provedor que aceita a conexão e não responde não pendura a interpretação
597. QA-05: mais ambiguidade numérica — conta o material, nunca o formato, o período ou o resultado
598. QA-08: "revise esta pesquisa" é material, não busca; "faça uma pesquisa na internet" continua sendo busca
599. QA-10: sem IA, os três pedidos da missão saem com a estrutura que pedem (não um relatório genérico)
600. QA-10: sem IA, pedido sem objeto pergunta o mínimo (obrigatório); pedido sem lista sai com o trabalho literal
601. QA-06: o que o Quick Win produz nunca é material obrigatório; vídeo final vira pacote de produção, parcial
602. QA-06: A (campanha no contexto) entrega o pacote e fica parcial; C (sem ferramenta) não aceita arquivo simulado
603. QA-12: dependência inválida é normalizada quando dá, removida quando não dá, e a validação sabe
604. produção (qw de posts): a explicação de como se faz hoje não vira seção obrigatória; restrição nunca é entregável
605. produção (qw de posts): plano guardado por uma regra de leitura anterior não é reaproveitado depois da correção
606. sugestões contextualizadas pela IA não alteram o Quick Win e usam o resultado guardado
607. exige edição autorizada e teste pertencente à pessoa e ao Quick Win
608. falha da IA mantém feedback sem inventar sugestões nem alterar o rascunho
609. sigilo impede enviar material e resultado para análise adicional
610. recupera proposta que eliminou a escolha e explica a validação na segunda tentativa
611. reabrir recupera resultado, material e histórico próprio sem refazer o editor
612. repete material guardado em novo teste e mantém ligação para comparar após reabrir
613. repetição recusa conversa de outra pessoa, outro Quick Win e conversa regular como destino
614. retenção impede repetir ou analisar conteúdo não guardado
615. resultado de execução regular pode ser refinado sem usar resposta de conversa posterior
616. aprovação rejeita sugestão desatualizada e conserva a especificação
617. seleção explícita por campo e limites protegem as regras atuais
618. orientação dos entregáveis vale na execução e na conferência sem trocar formato ou ferramentas
619. teste de outro Quick Win não é usado no refinamento
620. não sobrescreve uma tela aberta antes de mudar o responsável ou o rascunho
621. processo aprovado orienta execução e conferência sem trocar contrato, regras ou ferramentas
622. teste sem documentos da empresa: o exemplo decide pela empresa fictícia e a execução não para numa pergunta de preferência
623. sem pesquisa liberada e sem base: o prompt manda fazer todos os entregáveis, com o tema como sugestão
624. conferência: critério que depende de material ausente é atendido quando o resultado diz que ele não veio
625. peças por canal: número, resultado de cliente e oferta só entram se estiverem no material
626. material só citado e não obrigatório (guia da marca): não vira pergunta
627. v1 (simples, tabela, modelo fixado, com histórico e conversas): antes, prévia, atualização, publicação e restauração
628. isolamento: Quick Win 2.0 da empresa A não aparece nem abre na empresa B
629. criação: sugestões sem IA, nome e descrição automáticos, "não inventar" travado, formato com motivo
630. nome escolhido identifica o trabalho; descrição automática continua baseada no objetivo
631. a especificação só sai do construtor: campos forjados pela API não ampliam fontes, ferramentas ou autonomia
632. segurança: credencial na descrição, na explicação ou no exemplo (texto e arquivo) não entra no Quick Win
633. execução com Quality Check aprovado: prompt gerado da especificação, etapas, resultado conferido e mesma rota
634. Quality Check reprova, corrige sozinho e confere de novo
635. Quality Check: limite de tentativas e falha final com mensagem simples
636. versões: quem usa recebe a publicada; o teste usa o rascunho; publicar a nova; restaurar a anterior
637. governança soberana: o Quick Win não libera dado bloqueado, credencial nem troca a rota de dado protegido
638. ciclo de vida: execução tem Quality Check; ajuste e pergunta seguintes são conversa normal; nova execução tem de novo
639. ciclo de vida: a resposta a uma pergunta de esclarecimento continua a mesma execução
640. ciclo de vida: Quick Win antigo continua igual (sem Quality Check, instruções em todas as mensagens)
641. ciclo de vida (Cliente, Valor, Status): "Tire a coluna Status" e "Qual foi o maior valor?" não herdam a execução
642. regras próprias: salvas, publicadas, herdadas na nova versão, removidas, na execução e no Quality Check
643. o selo e a publicação exigem teste do rascunho e das fontes atuais
644. quick win de ponta a ponta: configurar com arquivo, testar, ativar, conversar com anexo, ajustar, retomar, feedback e uso
645. pessoa de outra área não vê o quick win; "toda a empresa" aparece para todos
646. filtro no servidor: CPF bloqueado no quick win com "bloquear"; credencial sempre bloqueada
647. perfis: sem o Avançado, a pessoa usa o Avançado que é padrão do quick win, mas não troca para outro Avançado
648. sigilosa por quick win que trata dados sigilosos: nasce sigilosa; modelo não homologado nunca é usado; a GreenIA usa o homologado sem perguntar
649. apagar a conversa apaga os anexos; outra pessoa, o responsável e o admin não leem a conversa
650. duplicar para outra área copia instruções, arquivos e configuração, nunca conversas
651. estimativa de custo por conversa típica, por modelo, a partir do preço do catálogo
652. controles persistem na operação; valores inválidos ficam restritivos; nenhuma autorização nasce do texto
653. preparar, consultar, limites de ações e itens bloqueiam no servidor antes de efeitos externos
654. aprovador definido é obrigatório, entrada aprovada não duplica a escrita e autorização expira
655. catálogo não expõe credenciais; pedido é persistente, idempotente e só pode ser concluído com conexão pronta
656. agenda usa fuso local, semana, mês e ignora horário inexistente
657. programação nasce pausada, protege entrada e executa no servidor sem navegador
658. equipe vê status mas não entrada nem conversa do responsável; usuário comum não programa
659. mudança de versão e revogação do responsável bloqueiam a fila antes de inferir
660. limite persiste após excluir a conversa; rotina não se sobrepõe
661. reinício preserva fila e pausa ação incerta sem repetir efeito externo
662. evento exige assinatura, deduplica entregas e aceita gatilho e fila atomicamente
663. configuração recusa credenciais e horários inválidos sem gravar
664. integração programada aguarda aprovação e retoma uma vez com as mesmas entradas
665. perda de permissão granular e capacidade do plano impedem execução multiempresa
666. fila sobrevive ao fechamento e reabertura do banco em disco
667. outro gestor pode pausar mas não executar como o responsável
668. excluir Quick Win pausa programações e cancela somente trabalhos na fila
669. conferência de horário é calculada no servidor e não grava agendamento
670. repetir pedido de criação preserva uma única rotina e rejeita alteração do pedido
671. contexto usa a versão publicada, não inventa fontes e não é exposto ao usuário comum
672. QA profundo: execução programada gera resultado e não confirma automaticamente histórico de negócio
673. etapa editorial e pesquisa na internet não viram sistema externo; sistema explicitamente nomeado permanece
674. diagnóstico editorial oferece ajuste concreto e preserva a evidência completa
675. consulta bloqueada não é descrita como gravação bloqueada pela qualidade
676. negação, falha, resultado parcial e aprovação nunca propõem repetir efeito incerto
677. prazos padrão: automático 7 dias, manual 30, empresa excluída 30; variáveis só aceitam números válidos
678. plano por camada: idade, manifesto, hold, sem classificação e itens fora do padrão
679. dry-run não apaga nada; aplicar apaga só o planejado; segunda rodada não tem mais nada (idempotente)
680. proteção: banco em uso dentro do padrão, link simbólico e hold criado depois do plano não são apagados
681. hold: precisa de motivo e responsável, só vale em backups, excluídas e restauração, e pode ser liberado
682. classificar um backup manual antigo: a data informada passa a valer para o prazo
683. backup automático atrasado vira alerta
684. backup manual: cópia consistente de cada banco, com manifesto, e entra na regra de 30 dias
685. WAL: a conversa apagada some do banco e do WAL logo depois da exclusão
686. WAL: consolidação periódica de todos os bancos, sem VACUUM e sem perder dados
687. empresa excluída: a cópia de recuperação ganha manifesto com prazo e entra na limpeza de 30 dias
688. S3 só com expiração declarada no bucket (S3_LIFECYCLE_DIAS de 1 a 7); sem ela, o destino é ignorado com aviso
689. elegibilidade por atributos: recursos equivalentes são elegíveis; um rótulo não substitui o atributo real
690. área reforçada sem recurso para confidencial, mas com recurso compatível com a área: documento comum processa
691. RH: classificado pelo conteúdo (casos A a F), não pelo departamento nem por palavras soltas
692. conteúdo sensível: classificação adequada, controles adicionais, bloqueio só sem caminho permitido
693. hard block: senha, API key, token, chave privada, seed phrase e credencial, em texto, PDF e PPTX
694. retenção: guardar = sim; guardar = não (processa, entrega, nada fica em banco, log, evento ou erro); bloqueado
695. quick win comercial com dados reais simulados (nomes, cargos, emails corporativos, clientes), em área reforçada
696. 1. tarefa simples não usa modelo avançado, em nenhuma preferência
697. 2. tarefa complexa não usa modelo insuficiente, em nenhuma preferência
698. 3. contexto grande: escolhe janela suficiente; volume sozinho não sobe a classe
699. 3b. estimativa de tokens: conteúdo denso usa razão mais conservadora; a seleção usa a segura
700. 4. assunto de alta precisão aumenta a exigência quando aplicável
701. 5. pessoa sem acesso à classe necessária recebe o melhor modelo permitido, com a causa registrada
702. 6. sigilo exclui os modelos não homologados; a escolha segue a capacidade entre os homologados
703. 7. a preferência muda a decisão quando há alternativas equivalentes, e só então
704. 8. falha da classificação não quebra a governança
705. 9. fallback nunca viola política: o modelo usado não tem motivo de governança; a reserva passa pelas mesmas regras
706. 10. mudança de configuração da empresa altera o conjunto de candidatos e a escolha
707. 11. o motivo exibido corresponde à decisão real
708. 12. solicitações diferentes, mesma pessoa e mesma configuração, não são obrigadas ao mesmo modelo
709. nova tentativa sobe a partir da classe usada antes; na classe mais alta, registra que não há acima
710. capacidade x classe: cada dimensão tem efeito próprio e registrado
711. quick win: fixo define a classe (com a análise registrada); flexível entra como piso do Automático
712. todo sinal da análise muda a escolha em pelo menos um caso de referência (nenhum sinal decorativo)
713. capacidades explícitas: modelo Equilibrado forte em programação atende código difícil antes de um Avançado mais caro
714. dominância: um desempate nunca escolhe modelo menos capaz e mais caro
715. "não serviu": só falha explícita sobe a exigência; continuação da conversa e assunto não sobem
716. nova tentativa é limitada: no máximo uma classe acima do que a tarefa pede, sem subir em cadeia
717. quick win fixo com conteúdo grande: troca só dentro da classe dele; com modelo técnico fixado, não troca
718. governança, janela e permissão: nunca violadas (400 cenários)
719. capacidade: sem fallback, o escolhido atende a todos os requisitos (400 cenários)
720. quick win flexível: a classe dele é piso e não impede subir (400 cenários)
721. Economia nunca escolhe mais caro que uma alternativa equivalente (mesma capacidade e mesma janela para o histórico)
722. Qualidade nunca reduz a capacidade escolhida em relação a Equilíbrio e Economia
723. monotonicidade de capacidade: aumentar uma exigência nunca escolhe capacidade inferior (400 cenários × 6 exigências)
724. monotonicidade de contexto: mais conteúdo → o mesmo modelo ou janela maior; nunca janela insuficiente
725. monotonicidade de nova tentativa: com falha anterior, a classe é igual ou maior
726. auditoria: toda decisão, inclusive bloqueada, é reconstruível e determinística
727. fluxo completo: pedido simples no Rápido, contrato com riscos no Avançado; o modelo chamado é o decidido
728. v3: tarefa simples fica na menor classe suficiente mesmo com preferência por qualidade
729. auditoria: reconstrói a decisão (requisitos, candidatos, motivo, preferência, resultado) sem guardar conteúdo
730. sem acesso à classe necessária: a mais capaz permitida, com a causa na auditoria e na explicação
731. classe escolhida pela pessoa: respeitada, analisada e sinalizada quando fica abaixo do necessário
732. nova tentativa na mesma conversa sobe a partir da classe usada antes
733. roteamento desligado: padrão da empresa, registrado como padrão (não como escolha da pessoa)
734. decisão bloqueada também é registrada; nada é enviado nem gravado como mensagem
735. falha na análise do pedido: responde com a exigência padrão e a governança intacta
736. reserva de execução: só vai ao fornecedor se passar pelas regras; o uso da reserva fica no registro
737. Automático do serviço de IA: fora das regras de roteamento, identificado como tal e fora dos indicadores do roteador
738. admin: Automático é o padrão; liga, desliga e muda a preferência; a preferência chega à decisão
739. feedback "não serviu" vale só para a próxima mensagem; a tentativa fica ligada à anterior; latência registrada
740. rajada: acima do limite por minuto, 429 antes de chamar o modelo
741. arquivo compactado com extensão que não é DOCX nem XLSX é recusado
742. anexo e documento vão delimitados, sem como fechar a marca por dentro
743. camada central: fail closed; desconhecido nunca vale como permitido
744. classificação: CPF, CNPJ, cartão, banco, PIX, senha e API key detectados; categorias distintas
745. política OFF: informação sigilosa nunca é enviada; nada gravado; sem marcar a conversa; mensagem simples
746. política ON + rota válida: envia pela rota fixada, com retenção zero exigida; o registro reconstrói a decisão
747. política ON + guardrail inválido, autorização ausente ou desconhecida: nunca envia; admin avisado uma vez
748. economia nunca supera autorização: o barato não autorizado nunca é usado, mesmo para pedido simples
749. fallback: principal indisponível → outro recurso SÓ se autorizado e elegível; senão, nada mais é enviado
750. reserva do plano: créditos no fim continuam só com recurso autorizado; sem ele, nada é enviado
751. API, nova tentativa, anexo e streaming: a mesma governança em todo envio
752. invariante absoluta: nenhuma condição (barato, rápido, único disponível, reserva, créditos, fallback, API, retry) faz a informação sigilosa chegar a recurso não autorizado
753. nunca expor provider: respostas para quem usa não citam OpenRouter, fornecedor, rota nem identificador técnico
754. migração de bancos existentes: autorização da plataforma vai para coluna própria; homologações antigas ganham os atributos que já valiam
755. SMTP da instalação anterior vira o da plataforma, uma vez, inclusive depois da importação
756. plataforma já importada sem SMTP: a cópia acontece na subida seguinte
757. variáveis do servidor têm prioridade; sem elas, vale o SMTP do console
758. produção sem SMTP: o console avisa que o email não está configurado, em vez de dizer que enviou
759. SMTP recusa o envio: o console mostra o motivo, sem o endereço com a senha
760. falha no envio do email não gasta o limite de pedidos de código
761. endereço SMTP com caracteres especiais na senha, codificados ou não
762. envio por API HTTPS (Resend e Brevo), sem expor a chave em erro
763. configurações da empresa: email em campos separados, senha nunca devolvida e mantida quando em branco
764. senha de app colada com os espaços de exibição ("abcd efgh ijkl mnop") é gravada sem espaços
765. 11. nenhum modelo homologado: conversa sigilosa bloqueada com segurança, nada enviado, admin avisado uma vez
766. 1. sigilosa sem modelo elegível para a pessoa (homologado só numa classe que ela não acessa): bloqueio seguro
767. 2. sigilosa com modelo elegível em outro nível: a GreenIA usa o autorizado, sem perguntar
768. 17. conteúdo confidencial detectado com escolha de modelo não autorizado: não vai ao não autorizado
769. 9. pessoa sem conhecimento técnico: pede, e a GreenIA resolve; o seletor não mostra modelos técnicos
770. 14. pedido simples usa o nível econômico
771. 4. o necessário não está disponível para a pessoa: usa o mais capaz permitido e registra a causa
772. 12. nível sem permissão para o grupo da pessoa, pedido à força: não é usado; o automático resolve
773. 13. pedido que exige mais capacidade: sobe de nível sozinho quando a pessoa tem acesso
774. 3 e 7. principal indisponível com reserva: a reserva responde, registrada, sem perguntar
775. 8 e 16. principal e reserva fora: mensagem simples; nova tentativa funciona sem nada a configurar
776. 5. conteúdo maior que a janela do nível econômico: vai para um que lê tudo, sem pedir nada
777. 19. conteúdo incompatível com todos os modelos: bloqueio com orientação da tarefa, sem acionar o admin
778. 15. anexo de tipo desconhecido: recusado com orientação simples, nada enviado
779. 6. chave recusada pelo provedor: mensagem simples para quem usa; detalhe técnico e aviso só para o admin
780. 18. Automático do provedor: nunca usado com dado sigiloso; fora dele, explicado sem termos técnicos
781. 10. configuração incompleta (quick win fixo numa classe sem modelo liberado): atende no automático e avisa o admin
782. 20. falha que exige o admin (nenhum modelo liberado): bloqueio simples, auditado, admin avisado
783. plataforma: a operadora autoriza um modelo para dado sigiloso em todas as empresas; a empresa não retira
784. a raiz abre a página de vendas só com PAGINA_INICIAL=vendas
785. a página não promete o que não existe nem mostra custo de fornecedor
786. a página da empresa orienta o uso e segue as mesmas regras de texto
787. contato válido vira lead, evento e email; inválido e robô não
788. limite de contatos por endereço
789. a LP mantém a demonstração e condições de integração com uma estrutura comercial curta
790. A. apresentação: nada do conteúdo some (blocos na capa, vários itens num bloco); riscos não viram checklist nem status vira processo
791. A. a capa não desenha blocos: o que a IA pôs nela vira subtítulo ou segue para a próxima página
792. B. cronograma com 3 fases (uma seção por fase): todas aparecem, em ordem, sem "não informado"
793. B. cronograma com 10 fases (uma seção por fase): todas aparecem, em ordem, sem "não informado"
794. C. comparação: a peça usa a seção que tem a peça ("Título:") e a tabela é desenhada inteira, sem célula cortada
795. C. comparação sem a tabela desenhada é reprovada pela conferência
796. D. texto abaixo do mínimo do formato é reprovado; texto pequeno com espaço sobrando também
797. E. página de leitura quase vazia com texto no tamanho base é reprovada; a correção preenche (texto maior)
798. E. cronograma longo num painel largo corre em colunas (sem fio estreito com o resto da página vazio)
799. F. cartaz com conteúdo demais não ganha segunda página: diz o que não coube
800. G. lacunas opcionais saem da peça (linha, célula, coluna e campos com |); o resto fica
801. H. conferência textual julga o conteúdo da peça visual, não a aparência; invenção continua reprovada
802. limpeza: script, eventos, iframe, link, @import, url() e src externos saem; assets da peça viram a origem isolada
803. isolamento do navegador: JavaScript da página não roda e nenhum pedido sai para a rede (mesmo sem a limpeza)
804. conferência no navegador: transbordo, margem, fonte pequena, contraste (nos pixels), sobreposição, número inventado e conteúdo omitido
805. Quick Win com peça desenhada pela IA: artefato "design", prévia, PDF de várias páginas, PNG/JPG, edição sem IA, restauração e acesso
806. design reprovado duas vezes: uma correção com a lista exata, depois motor clássico (a peça nunca sai quebrada)
807. peça de impacto: imagem ilustrativa gerada (liberada para todos por padrão) entra no design pela origem isolada
808. QF-05 escolha: IA quando ligada, saudável e permitida; clássico com categoria e motivo em cada outro caminho (nunca silencioso)
809. QF-05 ajuste determinístico: texto na borda e com pouco contraste é consertado sem nova chamada e o design pela IA é usado
810. QF-05 ajuste determinístico: texto pequeno sobe para o mínimo (com a margem e o contraste) sem nova chamada
811. QF-05 validação: falha sem conserto determinístico (conteúdo omitido) → VALIDATION_FALLBACK com códigos; resposta ilegível também
812. QF-05 tempo esgotado e falha do provedor: fallback explícito, sem repetição infinita
813. QF-05 na execução: evento com motor pedido/usado, categoria e motivo; IA usada quando o design passa; clássico com motivo quando não; checker nos dois
814. QF-05 ajuste de contraste vence cor !important e fundo médio (tarja atrás do texto)
815. 1. comparação (3 fornecedores x 5 critérios em listas paralelas) vira matriz desenhada; nenhum item ou critério some
816. 1. comparação: plano que desenha a matriz como texto é corrigido para tabela; sem tabela, a conferência reprova
817. 1. pedido comparativo cuja peça não tem matriz: a matriz do resultado entra na peça
818. 2-4. números pt-BR e en-US: entrada -> parser -> renderer mantém o valor exato (nunca "+3" por "+3,3%")
819. 5. cartaz: uma página e todos os elementos dentro do canvas; conteúdo que não cabe no formato pequeno vai para o maior da família
820. 5. a conferência acusa qualquer elemento fora do canvas (não só texto)
821. 6-7. checklist: "Título:" depois de cabeçalho não vaza; introdução de lista não vira caixa; caixa só em item real
822. 8. fluxo com setas (com "Fluxo:" antes ou na mesma linha) vira diagrama de nós e ligações
823. 9. capa: título único e subtítulo sem repetir partes nem o título
824. 10. texto pequeno com espaço sobrando é reprovado, com limite por tipo de página; a correção aumenta o texto
825. 11. conferência textual: toda falha tem motivo (do conferente ou determinístico), nunca só "faltou parte"
826. 12. apresentação: o conteúdo esperado de cada slide está desenhado no slide dele
827. 13. cronograma: fase, período e descrição de todas as fases, em ordem
828. 6b. "- Título: X" dentro de uma lista vira cabeçalho do grupo, nunca texto do item
829. 5b. formato escolhido pela interpretação não prende a peça: só o que a pessoa pediu fica; painel largo tenta mais colunas
830. conteúdo: indicadores, listas, tabelas, fluxo, chamada e título viram itens com id; números para a fidelidade
831. contrato: tipo semântico extensível (desconhecido vira custom com o rótulo), formatos e traços sem switch de canal
832. página única (one-page): uma página, aprovada, todo o conteúdo e os valores exatos da tabela
833. multipágina (apresentação de 6): capa + uma seção por slide, número de páginas pedido, rodapé numerado
834. gráfico: escolha pela semântica dos dados (tempo -> linhas, partes de 100% -> pizza, categorias -> barras, conclusão -> progresso); rótulos com o valor do conteúdo
835. diagrama: fluxo com decisão em losango e ramos rotulados; processo numerado; linha do tempo
836. peça de impacto (post 1:1) com imagem gerada: imagem é asset (nunca texto), título forte e chamada
837. sem gerador de imagem: peça tipográfica (sem espaço reservado); imagem que precisa ser real vira espaço reservado explícito e a peça fica parcial
838. marca completa: logo da empresa em todas as páginas, cores da regra da empresa, origem de cada campo; a inferência do pedido não troca regra nem usa cor proibida
839. marca ausente: sistema visual neutro (origem padrão), sem logo inventado, contraste garantido
840. conteúdo longo: a correção automática reorganiza (escala, colunas, página de continuação) sem perder conteúdo; registro de cada rodada
841. conteúdo curto: texto maior para não deixar a página vazia, sem passar da área útil
842. inglês e português: escala do eixo e datas no idioma do conteúdo
843. conferência visual acusa: contraste, transbordo, número inventado, conteúdo faltando, logo deformado, dimensão errada
844. correção automática: contraste ruim da marca é corrigido e registrado; o limite de rodadas é respeitado
845. exportações reais: PDF (páginas, fontes embutidas, texto), PNG e JPG nas dimensões do formato, SVG com fontes, ZIP
846. renderização real: o PNG da página tem a cor da marca nos pixels (não só no DOM)
847. fontes: medida pela tabela da fonte, quebra sem cortar palavra, número nunca partido, texto seguro para WinAnsi
848. PDF: caminhos SVG (arcos, curvas, relativos) viram operadores válidos
849. plano pela IA: validado contra o conteúdo (refs, tipos, gráfico, números fora do conteúdo); item esquecido volta

## Navegador

1. checklist real e pendências por perfil; usuário comum sem ações administrativas
2. conhecimento: responsável, validade, suspensão e histórico; falha preserva edição
3. filtros salvos retornam à consulta e ajuda fecha com Escape e devolve foco
4. revisão de acesso exige conferência e registra sem mudar papel
5. comparação apresenta diferença de objetivo sem restaurar automaticamente; resultados acessíveis ao gestor
6. auditoria apresenta autor e detalhe legível e permite salvar filtros
7. layout e navegação em 320, 390, 768 e 1280 px, inclusive ajuda e revisão
8. detalhe da execução pertence à conversa privada e distingue conferência de ação externa
9. pendência de integração abre o detalhe correto em vez da lista geral
10. cinco caminhos preparam pedidos editáveis sem enviar ou criar conversa
11. voltar, fechar e redesenhar conservam contexto; pedido anterior exige confirmação; anexos mantidos
12. Conhecimento e processos encaminham aos recursos existentes sem executar ações externas
13. teclado, validação e layout mobile não deixam enviar ajuda vazia ou transbordar
14. pedido preparado só executa após envio explícito e recebe resposta pelo fluxo existente
15. pessoa comum recebe a mesma orientação e mantém o catálogo limitado ao seu acesso
16. imagem e PDF escaneado pelo anexo: lidos e processados; segredo em imagem bloqueado; sem texto, aviso técnico; guardar = não
17. admin: a Administração mostra os recursos sem o provedor; a tela de uso não mostra detalhe técnico
18. admin liga as integrações para a empresa toda em Configurações; o menu aparece; desligar esconde de novo
19. histórico: busca, menu, renomear, cancelamento e exclusão individual e total no celular
20. histórico: falha de exclusão preserva a conversa; ação da conversa aberta e acesso pela lateral
21. login → chat → quick win
22. 360 px: sem rolagem horizontal, menu abre a lateral
23. quem gerencia: medição e decisão; reportar problema; painel do admin com todas as abas
24. criação (1280px): Fontes separadas dos entregáveis; link lido, arquivo enviado, papel trocado; conversa com link e papel do anexo
25. criação (390px): Fontes separadas dos entregáveis; link lido, arquivo enviado, papel trocado; conversa com link e papel do anexo
26. aviso de configuração com link: "Liberar a pesquisa na internet" leva a Políticas com o campo em destaque
27. proteção reforçada: usuário comum recebe causa, impacto e relato existente; servidor impede alteração da área
28. recomendações são padrão e persistem após salvar, navegar e recarregar
29. uso real: PDF e PPTX com dados pessoais processam em área reforçada; histórico, bloqueios e retenção após recarregar
30. admin da empresa: vê o que cada recurso pode receber, sem o provedor; as políticas oferecem as três ações e a retenção
31. tela: Quick Win pede a integração; assistente de 8 passos cria, testa, aprova e publica; credencial não volta; Quick Win passa a ✓
32. A (só leitura) e B (escrita com aprovação): leitura vira material; escrita espera aprovação, grava uma vez a entrada aprovada
33. C credencial inválida, D tempo esgotado, E resposta fora do esquema: o teste reprova e a integração não publica
34. F 503 repetível: leitura repete com segurança e conclui; G irreversível: negado pela política, nada apagado
35. H: outra pessoa não abre o plano nem a aprovação de quem pediu; sem permissão, nada da administração de integrações
36. interface privada: 29 telas em 1280px, hierarquia, controles e conteúdo contido
37. interface privada: 29 telas em 390px, hierarquia, controles e conteúdo contido
38. interface privada: 29 telas em 320px, hierarquia, controles e conteúdo contido
39. estado de erro e diálogo: mensagem legível, recuperação e foco por teclado
40. troca rápida de telas: resposta lenta não deixa conteúdo de outra rota
41. console da operadora: nove telas com a mesma escala em desktop e celular
42. espera orientada e falha de preparação permitem repetir ou voltar sem perder o objetivo
43. erro de tela conserva a rota e tentar novamente abre o mesmo trabalho
44. ações visíveis, exemplos recolhidos e configuração com cancelamento preservam controles
45. registro histórico de bloqueio fica fora da contagem de pendências
46. navegar entre biblioteca e detalhe não repete confirmação nem gravação de Quick Win
47. 0 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
48. 1 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
49. 5 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
50. 10 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
51. 50 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
52. 100 conversas: no máximo 5 recentes, "Ver todas" só quando passa de 5, Quick Wins e Conhecimento visíveis (A, B, C, D)
53. "Ver todas" leva à lista completa existente; títulos longos são truncados com o título no tooltip (C, I)
54. estado ativo: Conversas nas rotas de conversa; Quick Wins em todas as rotas filhas; Conhecimento (E, F, G)
55. estado ativo acompanha o clique mesmo com a tela ainda carregando (rede lenta)
56. Administração: aparece no primeiro nível só para quem tem permissão e leva à administração (H)
57. teclado: os itens principais são alcançáveis por Tab com foco visível
58. celular/tablet 320, 390 e 768px com 100 conversas: menu com a mesma hierarquia, Quick Wins acessível, alvos de toque e sem rolagem horizontal (J)
59. tela baixa (320x568), admin com 100 conversas: todos os itens principais, inclusive Administração, e "Ver todas" à vista sem rolar
60. histórico real com back/forward cache não restaura conteúdo privado após logout
61. falha ao abrir ambiente apresenta recuperação e preserva mensagem escapada
62. LP: exemplo finito, pausa, etapas manuais e nenhum efeito externo
63. LP: redução de movimento, leitura no celular e formulário com tentativa recuperável
64. LP operações: animações finitas, controles, saída da tela e nenhum efeito externo
65. LP operações: movimento reduzido, teclado e etapas legíveis de 320 a 1280 pixels
66. ambiente da empresa: login, uso e administração sem a marca da plataforma
67. o console da plataforma continua com a marca da plataforma
68. histórico de modelos apresenta campos legíveis e fornecedor em detalhes
69. falha de leitura permite tentar novamente sem alteração de configuração
70. falha tardia de leitura não substitui a tela escolhida após navegação
71. guia: quatro passos para usuário, progresso retomável, conclusão e ajuda reaberta; conta diferente não herda conclusão
72. guia por perfil: gestora de base vê orientação de gestão; admin vê configuração; adiar não altera ciência ou acesso
73. biblioteca: usuário só vê sua área e documentos comuns; filtros sem acentos e revisão não revelam bases alheias
74. gestão restrita: bases autorizadas, confirmação do envio, rede falha preserva arquivo, repetição grava uma vez
75. edição, substituição e revisão preservam a base; falha de rede mantém alterações; acesso à outra base continua recusado
76. biblioteca: filtros não descartam envio; saída não salva exige confirmação; Escape preserva edição quando descartada a saída
77. biblioteca e guia: 320, 390, 768 e 1280 px sem transbordamento, erros JavaScript ou acesso perdido
78. biblioteca grande: paginação preserva contagem e filtro; atualizar após revogar gestão remove ações
79. remover documento: cancelar preserva o arquivo; confirmar remove somente o documento escolhido
80. leigo: resultado → conferir → erro recuperável → confirmar → histórico → corrigir → recarregar
81. processo pronto cria rascunho com campos definidos e obriga teste/publicação
82. 320/390/768/1280px: acompanhamento e conferência legíveis, foco, busca, escopo e retirada
83. paginação pelo link persiste após recarga e ajuda explica o acompanhamento
84. QA profundo UX: conflito real entre abas conserva preenchimento e impede sobrescrever correção
85. QA profundo UX: acrescentar e remover itens conserva dados, foco e confirmação humana
86. QA profundo UX: busca local conserva indicadores e explica contratação da integração contínua
87. comparação do refinamento resolve a pesquisa na área exata sem perder o resultado
88. conversa comum explica bloqueio atual, abre a área exata, confirma alcance e preserva o pedido
89. pessoa muda o comportamento pelo refinamento: sugerir → esperar escolha → escrever, sem editar campos técnicos
90. salvar processo sem avançar atualiza etapas e pesquisa; falha conserva orientação e não salva plano antigo
91. planos: margem total no pior caso com status, preço mínimo, Capacity Pack e premissas; editor com prévia e trava do piso
92. empresa: libera Capacity Packs por quantidade; créditos e valor calculados no servidor
93. admin vê os conjuntos e alternativas por nível; perfil comum continua com escolhas simples
94. Rápido, Equilibrado, Avançado e Automático executam pelo roteador e conservam o nível escolhido
95. artefato visual: cartão com miniatura real, visualizador multipágina, PDF e PNG baixados, edição em nova versão
96. celular (390px): cartão e visualizador sem rolagem horizontal, página inteira visível
97. contrato: entendimento do trabalho, edição, sugestão aceita, entregáveis, teste real e um cartão por entregável
98. Quick Win antigo: "Atualizar para Quick Win inteligente" mostra a estrutura como sugestão; nada muda sem aceitar
99. celular (390px): entendimento, entregáveis e resultado sem rolagem horizontal
100. pessoa define o nome na criação e o rascunho mantém nome e objetivo após recarregar
101. editar nome tem cancelamento e recuperação, persiste para a equipe e preserva publicação, agenda e histórico
102. operação de conteúdo: peças por canal, pesquisa, exemplo contextual, resultado por canal com fontes, pausa e retomada
103. excluir: só quem gere vê a ação; modal pede o nome; histórico preservado; nenhum alerta do navegador
104. celular: etapa de entregas e resultado por canal sem rolagem horizontal; quem só usa não vê "Excluir"
105. resultado modular: um cartão por entregável e CSV de cada tabela (UTF-8, acentos e números intactos)
106. largura 320px: plano, materiais, sugestões, lacunas, entregáveis e resultado sem rolagem horizontal
107. largura 390px: plano, materiais, sugestões, lacunas, entregáveis e resultado sem rolagem horizontal
108. largura 768px: plano, materiais, sugestões, lacunas, entregáveis e resultado sem rolagem horizontal
109. largura 1280px: plano, materiais, sugestões, lacunas, entregáveis e resultado sem rolagem horizontal
110. pessoa leiga: biblioteca vazia → ensinar em 5 etapas → testar → revisar → publicar → usar → conversar → nova execução
111. etapas: voltar e avançar sem perder nada; exemplo; conferência parcial (◐) e pontos para revisar
112. celular: progresso compacto na criação; colega usa pela biblioteca, sem rolagem horizontal
113. editar um Quick Win publicado cria a próxima versão sem mexer na publicada; versões e restauração
114. colunas do objetivo: uma estruturação por objetivo, revisão e ajuste manual soberano, falha sem inventar
115. concorrência: resposta atrasada não vale para outro objetivo, não desenha etapa abandonada e não vence a mais nova
116. a revisão não reaproveita a conferência em memória depois de mudar uma fonte
117. refinamento guiado no celular: aprovar campos, preservar versão e governança, repetir arquivo e comparar
118. detalhe publicado: nome junto ao título, ações em outra linha e edição contida em todas as larguras
119. criador sem administração prepara conexão, define pessoas e limites, retoma rascunho no celular
120. agendar parte da lista em um clique e o menu não fica sob outras linhas
121. programação simples confere e ativa, funciona após fechar aba e cabe no celular
122. agendamento em processamento orienta a espera e só oferece resultado após concluir
123. alerta real → refinar o caso exato; melhoria não envia, não publica e conserva texto após erro
124. login: reenvio invalida o código anterior; limite do servidor continua valendo; código mais recente entra
125. entrada e navegação: caminhos visíveis; Quick Wins aparece antes das conversas recentes; salto evita mudar a rota
126. rascunho: objetivo e processo salvos ao continuar são retomados após recarga; saída protege alterações não salvas
127. falha de rede ao salvar preserva o objetivo e permite repetir sem duplicar o rascunho
128. fontes: papel tem explicação acessível; URL inválida fica junto ao campo e não perde o formulário
129. busca encontra nomes sem acento e arquivados; restauração conserva histórico e não publica automaticamente
130. diálogos: Tab permanece no modal, Escape devolve foco e não fica associado ao diálogo fechado
131. mobile: menu tem foco contido, Escape fecha e restaura aria-expanded; principais precedem recentes
132. logout: falha de rede não afirma sucesso; aviso persiste e pode ser fechado; saída confirmada impede voltar à área privada
