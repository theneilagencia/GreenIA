# Refatoração: GreenIA como infraestrutura de IA da empresa

Documento de trabalho da refatoração de produto, arquitetura de informação, design e posicionamento. Data: 26/09/2026.

Critério de todas as decisões: isto faz a GreenIA parecer um chatbot ou uma infraestrutura corporativa de IA?

## 1. Auditoria do produto atual

### O que existe

| Camada | Estado |
|---|---|
| Implantação | Uma instalação por empresa: um processo Node 22, um banco SQLite próprio, Docker com Caddy ou Render com disco próprio. Não há banco compartilhado entre empresas |
| Autenticação | Código de 6 dígitos por email, sessão em cookie HttpOnly, CSRF por cabeçalho, conferência de origem, limite de 3 códigos em 15 minutos e 5 tentativas. Login por conta Microsoft ou Google não existe (há só o ponto de extensão) |
| Papéis | Admin, responsável de área, pessoa. Operador da plataforma por variável de ambiente. Permissão para criar quick win por pessoa, grupo ou responsável |
| Chat | Streaming, anexos (PDF com texto, DOCX, XLSX, TXT, MD, CSV), seletor de modelo, conversas salvas por pessoa com retenção configurável |
| Filtro de dados | Detecta CPF, CNPJ, cartão, dados bancários, PIX, RG, email, telefone, CEP e endereço. Senhas e credenciais sempre bloqueadas. Ação por tipo: bloquear ou permitir (a conversa vira sigilosa) |
| Conversas sigilosas | Cinco gatilhos: área sigilosa, quick win sigiloso, dado permitido detectado, documento sigiloso, marcação manual. Só modelo homologado, fornecedor fixo, retenção zero exigida ao OpenRouter, sem troca de fornecedor |
| Bases de conhecimento | Documentos por área ou para a empresa toda, busca por texto (FTS5), fontes citadas na resposta, documento marcado como sigiloso |
| Quick wins | Instruções, arquivos, bases, modelo, formato, sugestões, regras de dados, estados rascunho, ativo e pausado. Retorno por conversa (serviu, com ajustes, não serviu). Medição de antes e depois. Decisões (manter, ajustar, descartar, ampliar). Uso por mês e por modelo. CSV |
| Modelos | Catálogo do OpenRouter atualizado por dia, perfil por modelo (rápido, equilibrado, avançado), padrão por perfil, reserva por modelo, homologação com registro, acesso por perfil a grupos e áreas, trava para modelos gratuitos, aviso de preço acima de 20% |
| Política de uso | Texto da empresa com versões, seção automática gerada da configuração, ciência registrada por pessoa |
| Plano e créditos | Créditos por mês, reserva só no rápido, pacotes, avisos em 80%, 100%, 90% da reserva e fim, só o operador recebe dólar do servidor, resumo do operador |
| Eventos | Registro só de inclusão (gatilho no banco impede alteração e exclusão), 38 tipos com nomes em português |
| Emails | Código de acesso, teste de SMTP, problema reportado, avisos do plano, aviso de preço ao operador |
| Operação | Backup consistente com envio para S3, restauração com conferência, verificação contra o OpenRouter real, demonstração, marca por empresa (logo e esquema de cor derivado) |
| Testes | 78 de servidor, 3 de navegador |

### Inconsistências encontradas

1. **Duas aplicações separadas.** `/app` (chat e quick wins) e `/admin` (painel em abas) têm navegação, cabeçalho e linguagem diferentes. O painel é uma lista de funcionalidades, não uma visão de gestão.
2. **O modelo técnico aparece para todo mundo.** O seletor do chat mostra nomes como "Gemini 3.5 Flash Lite". A pessoa escolhe fornecedor, quando deveria escolher a classe de trabalho.
3. **Quick win com três estados** (rascunho, ativo, pausado) não descreve o ciclo de adoção. Faltam problema, objetivo, processo atual, responsável e resultado.
4. **As decisões não mudam o estado.** Decidir "descartar" não tira o quick win de circulação.
5. **Regras de dados espalhadas.** Ações por tipo de dado ficam em Configurações, homologação em Modelos, texto da política em Política, áreas sigilosas em Áreas. Não há um lugar que responda o que pode ser enviado, por quem e para qual modelo.
6. **Não existe visão geral.** O admin precisa abrir quatro abas para saber como a empresa está usando IA.
7. **O operador vê custos misturados ao painel do cliente**, dentro da aba Uso da própria instalação. Não há visão de várias empresas.
8. **Nomes de eventos** em português e sem padrão (`uso`, `bloqueio`, `quick_win_alterado`), difíceis de agregar.
9. **Identidade visual editorial.** Serifa, fundo creme, lateral verde-escura e o símbolo em forma de estrela passam a ideia de produto de consumo, não de sistema de trabalho.
10. **A página inicial da instalação comparava preços com fornecedores**, o que foi retirado. A página de vendas agora é separada (`PAGINA_INICIAL=vendas`).

### Funcionalidades existentes e não comunicadas

- Instalação própria por empresa, com banco separado
- Filtro de dados antes do envio e bloqueio de credenciais
- Conversas sigilosas com fornecedor fixo e retenção zero
- Política de uso com versões e registro de ciência
- Registro de eventos que não pode ser alterado
- Medição de antes e depois e decisões por quick win
- Troca de modelo sem mudar o trabalho das pessoas
- Backup com restauração conferida

### Funcionalidades pedidas que não existem

| Pedido | Situação | Decisão |
|---|---|---|
| SSO e SCIM | Não existe | Fica fora da comunicação |
| SLA | Não há compromisso definido | Fica fora da comunicação. Enterprise diz "condições negociadas" |
| Integrações com outros sistemas | Não existe | Fica fora da comunicação e da navegação |
| Restrição de modelo por área | Existe por classe (acesso por grupo e área) | Comunicado como regra por classe |
| Detecção automática de informação estratégica | Não existe e não é confiável | Tratado como marcação manual e documento sigiloso |
| Tempo poupado e resultado financeiro automáticos | Não existem | Medição manual, com tipo de indicador |
| Visão de várias empresas | Não existia | Criada por consulta autenticada a cada instalação |

## 2. Mapa de gaps: atual → novo

| Atual | Novo |
|---|---|
| `/app` e `/admin` separados | Uma aplicação, navegação por seções |
| Painel em 9 abas | Trabalho, Gestão e Organização |
| Seletor com nome do modelo | Classes Rápido, Equilibrado e Avançado. Modelo técnico só para admin |
| Quick win: rascunho, ativo, pausado | Identificado, Em configuração, Em teste, Em uso, Em avaliação, Aprovado, Em expansão, Descartado |
| Decisão só registrada | Decisão muda o estado |
| Aba Bases de conhecimento | Conhecimento: o que a IA pode usar, por área e por quick win |
| Regras em quatro lugares | Políticas de IA: uma página com dados, modelos, conversas sigilosas, áreas, retenção e texto da política |
| Aba Modelos com catálogo | Modelos: classes primeiro, modelo técnico depois, histórico de alterações, alerta de homologação |
| Aba Uso e custo | Uso e créditos: plano, previsão, concentração, tendência, custo por execução, uso sem avaliação |
| Resumo do operador dentro da aba Uso | Console do operador em `/operador`, separado, com várias instalações |
| Eventos em português | Eventos canônicos (`credits.consumed`, `quickwin.approved`...) |
| Página inicial com comparação de preço | Página da instalação, com a marca da empresa. Página de vendas separada |
| Sem visão geral | Visão geral: uso do mês, adoção, resultado, concentração, atenção |
| Sem roteiro de implantação | Implantação guiada na visão geral, em oito etapas |

## 3. Nova arquitetura de navegação

Regra: menos módulos, maior clareza. Onze destinos viraram oito, em três grupos.

```
Visão geral                      admin e responsáveis

TRABALHO
  Conversas                      todos
  Quick wins                     todos (gestão para quem administra)
  Conhecimento                   todos (edição para quem administra)

GESTÃO                           admin
  Uso e créditos
  Pessoas e áreas                pessoas, áreas, grupos, quem cria quick win
  Modelos                        classes e modelos técnicos
  Políticas de IA                dados, modelos homologados, sigilo, áreas, retenção, texto
  Atividade                      eventos e problemas reportados

ORGANIZAÇÃO                      admin
  Configurações                  nome, marca, domínios, email, limites

/operador                        só operadores da plataforma, fora da aplicação do cliente
```

Pessoas sem papel de gestão veem só Trabalho.

## 4. Modelo de dados

Cada instalação é uma organização. As entidades pedidas já têm lugar no banco; a refatoração acrescenta o que faltava.

| Entidade | Onde fica |
|---|---|
| Organization | A própria instalação (tabela `config`) |
| Area | `areas`, `area_pessoas` |
| User | `pessoas`, `grupo_pessoas` |
| QuickWin | `quick_wins` (estado, problema, objetivo, processo atual, responsável, resultado) |
| Conversation | `conversas` |
| Execution | cada resposta em `uso` (modelo, créditos, tempo, conversa, quick win) |
| Evaluation | retorno em `conversas.feedback`, decisões em `decisoes`, medições em `medicoes` |
| Model | `modelos` |
| CreditTransaction | débitos em `uso`, créditos em `pacotes` |
| Policy | `config` (ações por tipo de dado, acesso por classe), `politica_versoes` |
| KnowledgeSource | `documentos`, `trechos` |
| Event | `eventos` |
| Cost | `uso.custo` (dólar, só servidor e operador) |
| Plan | variáveis do servidor |
| CreditPack | `pacotes` (quantidade, operador, validade, origem, observação) |
| ReserveUsage | calculado a partir de `uso` e `pacotes` |

Perguntas que o modelo responde: quem usa (`uso.pessoa_id`), onde (área da pessoa ou do quick win), para quê (quick win), quanto custa (créditos), qual resultado (retorno, medições e decisões).

## 5. Eventos canônicos

`auth.login`, `lead.created`, `model.config_changed`, `model.uncertified`, `quickwin.adjusted`, `conversation.created`, `conversation.completed`, `conversation.deleted`, `conversation.confidential`, `quickwin.created`, `quickwin.updated`, `quickwin.status_changed`, `quickwin.evaluated`, `quickwin.decided`, `quickwin.approved`, `quickwin.discarded`, `quickwin.expanded`, `quickwin.measured`, `credits.consumed`, `credits.threshold_80`, `credits.exhausted`, `reserve.started`, `reserve.threshold_90`, `reserve.exhausted`, `credits.renewed`, `creditpack.added`, `model.changed`, `model.price_changed`, `model.certified`, `policy.blocked`, `policy.updated`, `knowledge.added`, `knowledge.removed`, `knowledge.used`, `ai.failed`, `problem.reported`, `config.changed`, `people.changed`, `area.changed`, `backup.completed`, `backup.failed`.

## 6. Segurança

| Item | Como está |
|---|---|
| Isolamento entre clientes | Uma instalação por empresa: processo, banco SQLite e disco próprios. Não há dado de dois clientes no mesmo banco |
| Autorização | Toda regra é conferida no servidor: papel (admin, responsável de área, pessoa), área, quick win e operador. O front só esconde botões |
| Dólar para o cliente | Com plano, o servidor converte custo em créditos e retira preços de modelo de toda resposta JSON e CSV. Só `OPERADOR_EMAIL` recebe dólar |
| Segredos | Chave do OpenRouter, SMTP e `OPERADOR_TOKEN` só em variáveis do servidor. Nada vai para o navegador |
| Console do operador | Rota por token com comparação em tempo constante, bloqueio por endereço após 10 erros em 15 minutos, e rota inexistente sem `OPERADOR_TOKEN` |
| Sessão | Cookie HttpOnly e SameSite, CSRF em todo envio, conferência de origem, código de login com limite de pedidos |
| Limites de uso | Teto mensal, teto por pessoa, limite diário e rajada de 12 envios por minuto por pessoa. Fim da reserva bloqueia o envio |
| Arquivos | Tipo conferido pelo conteúdo (PDF, zip de DOCX ou XLSX, texto sem byte nulo), zip só com extensão DOCX ou XLSX, limite de 20 MB e teto contra bomba de zip. Imagem é recusada |
| Prompt injection | Anexos e documentos vão entre marcas `<anexo>` e `<documento>`, com a marca de fechamento neutralizada dentro do texto, e a instrução do sistema manda tratar esse conteúdo como material, não como ordem |
| Exfiltração | Filtro de dados antes do envio (credenciais sempre bloqueadas); conversas sigilosas só em modelos homologados com fornecedor fixo e retenção zero; o modelo não tem ferramentas nem acesso à rede |
| Abuso de créditos | Créditos, reserva só na classe Rápido, rajada e limites por pessoa. Pessoas comuns só escolhem classes, não modelos técnicos caros |
| Histórico | Eventos canônicos para login, mudanças de modelo, política, configuração, pessoas e pacotes |
| Retenção | Conversas apagadas depois do prazo configurado pelo admin (1 a 3.650 dias) |
| Página de vendas | Formulário público com validação, campo escondido contra robôs e limite de 5 contatos por hora por endereço |

## 7. Funcionalidades não implementadas

- **SSO (Entra ID, Google) e SCIM.** A entrada é por código enviado ao email do domínio autorizado.
- **SLA formal e monitoramento externo.** Existe `/api/saude`, sem alerta automático fora do email de preço e dos avisos de créditos.
- **Integrações** com outros sistemas (ERP, CRM, drive, chat corporativo).
- **OCR.** Imagens e PDF escaneado são recusados com orientação.
- **Busca semântica.** A base de conhecimento usa busca por palavras (FTS5), sem embeddings.
- **Medição automática de tempo poupado e resultado financeiro.** A medição é registrada pelo responsável.
- **Detecção automática de informação estratégica.** Depende de marcação manual (conversa, documento ou área sigilosa).
- **Cobrança automática.** Plano e pacotes são definidos pelo operador; não há fatura, cartão ou emissão de nota.
- **Criação de instalações pelo console.** O console lê e libera pacotes; uma instalação nova ainda é criada no Render.
- **Onboarding guiado em assistente de tela.** A implantação aparece como roteiro de oito etapas na visão geral, com links para cada tela.
- **Exportação do console** (CSV de clientes e margens) e histórico financeiro de meses anteriores no console.
- **Aviso por email de contatos repetidos** e gestão de status dos contatos da página de vendas.

## 8. Riscos técnicos

1. **SQLite em disco único.** Uma instalação por empresa limita o impacto, mas cada banco depende do disco do serviço e do backup diário. Sem `BACKUP_DESTINO`, a cópia fica no mesmo provedor.
2. **Dependência do OpenRouter.** Uma falha dele para todas as instalações. O reserva por classe cobre falha de um modelo, não do intermediário.
3. **Variação de preço.** Os créditos acompanham o custo real, então a margem se mantém, mas um aumento grande consome os créditos do cliente mais rápido. O alerta de 20% vai ao operador, que decide trocar o modelo da classe.
4. **Limites em memória.** Rajada, tentativas de token e contatos são contados na memória do processo e zeram quando o serviço reinicia. Suficiente com um processo por instalação; não com várias réplicas.
5. **Console síncrono.** O console consulta cada instalação na hora, com prazo de 10 segundos. Com muitas instalações, a tela fica lenta; será preciso guardar um resumo periódico.
6. **Token por instalação.** O `OPERADOR_TOKEN` dá leitura financeira e liberação de pacotes. Vazamento exige troca manual em duas variáveis (cliente e `INSTANCIAS`).
7. **Prompt injection não tem solução completa.** As marcas e a instrução reduzem o risco, e o modelo não tem ferramentas. Ainda assim, um documento malicioso pode distorcer uma resposta; a revisão humana continua necessária.
8. **Filtro de dados por padrões.** Pega CPF, CNPJ, cartão, dados bancários, PIX e credenciais em formatos comuns. Dado sensível em texto livre (diagnóstico, salário descrito por extenso) depende de marcação manual.
9. **Dados fora do Brasil.** O Render e os fornecedores de modelo ficam fora do país. Precisa constar na política e no inventário de dados (LGPD).
10. **Migrações num processo só.** As migrações rodam na subida; uma falha no meio deixa o serviço fora até a correção. O backup antes de publicar é a proteção.
