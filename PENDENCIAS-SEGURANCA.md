# GreenIA: pendências para a Segurança da Informação

Situação em 24/09/2026, fim da Fase 3. A GreenIA tem servidor próprio (Fase 2) e agora executa assistentes definidos por configuração, com revisão humana, auditoria encadeada, Política de Uso de IA do cliente, incidentes, exportação e exclusão do tenant (Fase 3). O protótipo continua existindo em modo demonstração, no Claude Design. Este documento reúne:
- o que precisa da sua decisão (seções 1 a 3, atualizadas);
- o que a Fase 2 implementou e precisa da sua revisão (seção 4);
- a configuração de cada cliente antes de entrar em produção (seção 5);
- os pontos jurídicos e contratuais (seção 6);
- as pendências de implantação (seção 7);
- o que a Fase 3 implementou e precisa da sua revisão (seção 8);
- as decisões de 24/09/2026 e o que ainda precisa da sua revisão (seção 9).

## 1. Texto de privacidade

Aparece na tela de login e no resumo da política:

> Suas conversas ficam só nesta sessão. A GreenIA não guarda o histórico em banco de dados.

É verdade no protótipo: o histórico fica só na memória do navegador e some ao sair ou recarregar a página. Mas o texto que a pessoa envia passa pelo provedor do modelo de IA, e o protótipo não controla o que o provedor retém.

**Com o servidor da Fase 2**, o texto continua verdadeiro para a conversa livre: o servidor não grava o conteúdo das conversas. Ele grava, porém:
- metadados na auditoria: login, tipos de dado confirmados (nunca o valor), documentos usados;
- o consumo: tokens e custo, sem conteúdo;
- nos **assistentes configurados para guardar evidência**, a saída do assistente, pelo prazo de retenção do cliente.

O texto agora é configurável por cliente (`privacyNote`, `privacyDetail`). Um cliente que use assistentes com evidência precisa de um texto que diga isso.

Existe também um campo opcional para um texto mais longo no resumo da política, hoje vazio.

**Pergunta:** este texto pode ser exibido assim? Se não, qual texto usar, e o texto mais longo deve ser preenchido?

## 2. Filtro de dados antes do envio

Antes de qualquer envio ao modelo, a GreenIA procura dados sensíveis no texto. O filtro funciona por padrões (formato do número, palavras próximas). Ele não usa IA nem manda o texto a ninguém para decidir.

| O que detecta | O que acontece |
|---|---|
| CPF e CNPJ (com dígito verificador válido) | Bloqueia |
| Número de cartão (validação de Luhn) | Bloqueia |
| Agência e conta bancária | Bloqueia |
| Chave PIX aleatória | Bloqueia |
| RG | Bloqueia |
| Senha, token, chave de API seguidos de um valor | Bloqueia sempre, em qualquer configuração |
| Tabela colada (3 ou mais linhas no mesmo formato) contendo qualquer dado desta lista | Bloqueia |
| Email | Avisa |
| Telefone brasileiro | Avisa |
| CEP perto de palavras de endereço | Avisa |
| Endereço (rua, avenida etc. seguida de número) | Avisa |
| Nome de pessoa depois de "nome:", "colaborador", "funcionário", "cliente", "paciente", "candidato", "Sr.", "Sra." | Avisa |

- **Bloqueia:** nada é enviado. A GreenIA diz qual tipo de dado encontrou (sem repetir o valor) e orienta procurar o key user da área. O texto fica no campo para a pessoa corrigir.
- **Avisa:** a GreenIA pergunta "Seu texto parece conter [tipo]. Enviar mesmo assim?". A pessoa escolhe "Revisar texto" ou "Enviar". Email e telefone ficam em "avisa" porque aparecem em tarefas comuns do dia a dia, como redigir um email para um colega.

**O que o filtro não detecta:**
- nome de pessoa solto no texto, sem um dos marcadores acima (por exemplo, "A Maria Souza pediu férias");
- dados de cliente descritos em texto corrido;
- números financeiros confidenciais, valores de contrato e informações jurídicas;
- documentos em formatos diferentes dos listados.

**Falsos positivos conhecidos:** um código de produto no formato de celular ("98765-4321") gera o aviso. Isso só faz a pessoa confirmar.

A segunda camada é a própria instrução dada ao modelo, que recusa pedidos com dado sensível. Ela não impede que o texto chegue ao provedor.

**Na Fase 2**, o mesmo filtro roda no servidor antes de qualquer chamada ao modelo, e é ele que decide. O do navegador virou só um aviso antecipado. Um teste confirma que o CPF é bloqueado no servidor mesmo com o filtro do navegador desligado.

**Segunda camada para nomes soltos no texto: medida, não implementada.** Um modelo de reconhecimento de nomes (spaCy `pt_core_news_lg`), rodando na infraestrutura da TheNeil sem enviar nada a terceiros, achou 93,8% dos nomes num conjunto não usado para ajuste, com precisão de 88,2%. As regras atuais acham 0% nesse conjunto. A decisão espera o terceiro conjunto, escrito pelo time. Os números estão em `RELATORIO-FASE-2.md`.

**Pergunta:** esta cobertura é suficiente como primeira camada para tarefas Verdes?

## 3. O que acontece quando a pessoa confirma um aviso

- O texto é enviado ao modelo exatamente como foi escrito, com o email, telefone, endereço ou nome.
- No protótipo, nada é registrado: não há servidor, log ou auditoria. A resposta aparece na conversa, que fica só na memória do navegador.
- **Com o servidor**, a confirmação vai para a auditoria do cliente com quem confirmou, quando e os tipos de dado, nunca o valor. Sem confirmação, o servidor recusa o envio (erro 409), mesmo que alguém chame a API diretamente.
- O provedor do modelo recebe o texto nas condições do contrato dele, que o protótipo não controla.

## 4. O que a Fase 2 implementou e precisa da sua revisão

| Tema | Como ficou | O que revisar |
|---|---|---|
| Isolamento entre clientes | O Postgres filtra cada linha pelo cliente da sessão (Row-Level Security). O servidor conecta com um papel que não pode ignorar esse filtro. Há testes de isolamento contra o banco real. | Aceitar RLS como controle principal, e o acesso de operação da TheNeil (papel dono) só para migrações e criação de cliente. |
| Login | OIDC com Entra ID e Google (PKCE, `state`, `nonce`, conferência do diretório ou do domínio) ou código de 6 dígitos por email (10 minutos, 5 tentativas, 3 códigos a cada 15 minutos). Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`, com prefixo `__Host-`. Proteção CSRF nas escritas. Nenhum token acessível ao JavaScript. | Validade da sessão (padrão 12 h), se o código por email pode ser usado em produção ou só como contingência, e a exigência de MFA no provedor corporativo. |
| Resolução do cliente | Pelo host (ex.: `cliente.greenia...`). Em produção, o parâmetro `?tenant=` é ignorado (correção feita nesta fase). | Um host por cliente. |
| Chaves e segredos | Chave do modelo e segredos OIDC só em variáveis de ambiente, vindas do cofre (Secrets Manager). A configuração do cliente guarda apenas o nome da variável. | Política de rotação das chaves. |
| Filtro e política de dados | Por cliente e por assistente: bloquear, avisar, mascarar, permitir com registro ou permitir. Credencial é sempre bloqueada, e a classe do assistente (verde, amarela, vermelha) limita o que pode ser afrouxado. | A política padrão de cada cliente (seção 5). |
| Documentos da base | No S3 com criptografia (SSE-KMS em produção), separados por cliente. O acesso por área é aplicado pelo banco. Versão e hash sha256 de cada arquivo. | Chave KMS própria por ambiente e quem pode administrar a base (papel `key_user`). |
| Retenção | Conversa livre: não gravada. Saída de assistente com evidência: gravada pelo prazo do assistente ou do cliente (padrão 90 dias) e apagada automaticamente de hora em hora. | O prazo padrão, e o fato de o apagamento não alcançar os backups até eles expirarem (35 dias no RDS, 12 meses no dump semanal sugerido). |
| Auditoria | A tabela `audit_log` só aceita inserções: criação do cliente, login, login negado e logout, envio bloqueado, aviso confirmado, dado mascarado ou enviado com registro, resposta gerada (sem conteúdo), documentos e versões, áreas, papéis, assistentes, alertas de cota. A configuração do cliente ainda não tem rota de alteração: hoje ela muda pelo papel dono, fora da auditoria, e a Fase 3 traz o painel com registro. O encadeamento por hash entrou na Fase 3 (seção 8). | O que mais deve ser registrado, e o prazo de guarda da auditoria. |
| Logs do servidor | JSON sem conteúdo das conversas. | Destino (CloudWatch em sa-east-1) e retenção. |
| Frontend | Servido pelo próprio servidor, com CSP. A CSP precisa de `'unsafe-eval'` porque o runtime das páginas compila os templates no navegador. | Aceitar `'unsafe-eval'` enquanto o frontend usar esse runtime. Não há script de terceiros: o React é servido localmente. |
| Limites | Por minuto (por usuário e por cliente), tamanho de mensagem e de arquivo, e cota mensal em reais com alerta em 80% e 100%. | Os valores padrão de cada cliente. |

## 5. Configuração de cada cliente antes de entrar em produção

- [ ] Domínios de email permitidos (`domains`) e host próprio (`hosts`).
- [ ] Provedor de login:
  - Entra ID: app registrado no diretório do cliente, `tenantId` do diretório, URL de retorno `https://<host>/api/auth/oidc/callback`, segredo no cofre;
  - ou Google: `hostedDomain`;
  - decidir se o código por email fica habilitado.
- [ ] Administradores iniciais (`admin_cliente`) e key users por área.
- [ ] Áreas e quem pertence a cada uma, antes de subir documentos restritos.
- [ ] Política de dados revisada pela SI do cliente. O padrão é o da tabela da seção 2.
- [ ] Textos de privacidade (`privacyNote`, `privacyDetail`) coerentes com a retenção configurada.
- [ ] Prazo de retenção padrão e assistentes com evidência.
- [ ] Cota mensal em reais, se ela bloqueia (`hardLimit`) e o câmbio usado (`USD_BRL`).
- [ ] Marca e cores. As que não passam em contraste são ajustadas automaticamente, e o ajuste é mostrado na criação.
- [ ] Contato do key user exibido nas mensagens de bloqueio.
- [ ] Email de envio: domínio com SPF, DKIM e DMARC (roteiro no `README.md`), testado numa caixa do cliente.

## 6. Pontos jurídicos e contratuais

- **Transferência internacional de dados.** Os dados em repouso (banco, documentos, filas, backups) ficam no Brasil (AWS sa-east-1). O **processamento pelo modelo acontece fora do Brasil**: a API da Anthropic não tem região no Brasil, e o Claude no Amazon Bedrock também não tem perfil de inferência no Brasil (`docs/fase-2/bedrock-regiao-brasil.md`). Isso é transferência internacional nos termos da LGPD (arts. 33 a 36) e precisa de base contratual (por exemplo, cláusulas-padrão) e de menção na política de privacidade de cada cliente.
- **Retenção no provedor do modelo.** O que a Anthropic retém das requisições, e por quanto tempo, depende do contrato comercial (termos da API e acordo de processamento de dados). A GreenIA não controla isso. Para a classe Amarela, a recomendação é contrato com retenção zero ou mínima e acordo de processamento assinado antes de liberar assistentes dessa classe.
- **Papéis na LGPD.** O cliente é o controlador dos dados dos seus colaboradores e documentos. A TheNeil opera a GreenIA como operadora, e a Anthropic e a AWS como suboperadoras. O contrato com cada cliente deve listar as suboperadoras e as regiões.
- **Backups e direito de eliminação.** Apagar por retenção ou a pedido do titular não remove imediatamente o dado dos backups. O prazo dos backups deve constar da política comunicada ao cliente.
- **Email transacional.** Os códigos de login saem pelo Amazon SES em sa-east-1. Confirmar no console que o serviço está habilitado nessa região para a conta, porque a documentação da AWS não pôde ser consultada deste ambiente.

## 7. Pendências de implantação

- Registrar os apps OIDC reais (Entra ID e Google). Os testes usaram um emissor simulado.
- Rodar `docker build` e `docker compose up`. Neste ambiente, o Docker Hub limitou os downloads, e o espelho `public.ecr.aws` responde, mas entrega as camadas por `d2glxqk2uabbnd.cloudfront.net`, que o proxy recusa. As peças foram validadas separadamente (relatório da Fase 2, item 11; OCR e conversões nos testes da Fase 3).
- Liberar o HuggingFace para medir os embeddings locais e o NER BERTimbau antes de decidir a segunda camada e a busca semântica.
- Rodar os quatro assistentes de referência com o modelo real e documentos com formato real (Fase 4, `PLANO-FASE-4.md`). A Fase 3 usou provedor simulado e amostras fictícias.

## 8. O que a Fase 3 implementou e precisa da sua revisão

| Tema | Como ficou | O que revisar |
|---|---|---|
| Auditoria encadeada | Cada registro guarda `seq`, o hash do anterior e o próprio hash (SHA-256), calculados por gatilho no banco, com a hora forçada pelo servidor. `audit_verify` refaz a cadeia e aponta o primeiro registro quebrado. A tela de Administração mostra a verificação, o histórico por documento, execução ou hash, e exporta em CSV (a exportação também é registrada). | Resolvido pela âncora diária (seção 9): reescrever a cadeia no banco passa a divergir da âncora externa. O que foi gravado depois da última âncora (até um dia) ainda depende só do banco. |
| Arquivos enviados à visão do modelo | Substituído pelo OCR local (seção 9). A visão só entra como fallback de OCR com baixa confiança, se o assistente e a Política de Uso permitirem, depois de o texto do OCR passar pela política. | Seção 9. |
| Política de Uso de IA do cliente | Versionada. Cada pessoa dá ciência por versão; sem ciência, o servidor recusa o envio (428). As regras viram piso da política de dados dos assistentes: a ação mais restritiva vence. Termos restritos (ex.: nome de projeto sigiloso) viram o tipo `restrito`. Classes de dado não permitidas bloqueiam assistentes em piloto ou ativos. | O texto da política de cada cliente e os termos restritos. A busca de termos é literal (sem acento e sem diferenciar maiúsculas): variação de grafia escapa. |
| Incidentes | Botão "Reportar incidente" em todas as telas com servidor. Regras de leitura da descrição revistas em 24/09/2026 (seção 9). | Prazo de resposta por tipo de incidente. |
| Revisão humana | Toda saída nasce rascunho. Só aprovado ou aprovado com edição exporta. Quem gerou não revisa a própria saída. A edição guarda original, editada e diff. Rejeição exige motivo. | Se algum assistente da classe Verde pode dispensar revisão (hoje, `review.required` é verdadeiro por padrão). |
| Retenção | As execuções (arquivos de entrada, saídas, diffs) seguem o prazo do assistente ou do cliente e são apagadas de hora em hora, no banco e no S3. | O mesmo ponto dos backups da seção 4. |
| Exportação completa | Pedido pelo administrador do cliente. Gera um ZIP com os dados em JSON e CSV, os arquivos originais e a auditoria com a verificação da cadeia, guardado no S3 do próprio cliente. O download é registrado. | Prazo de guarda do ZIP de exportação, que hoje fica até ser apagado junto com o tenant. |
| Exclusão total | Só pela plataforma, com confirmação pelo slug e motivo. Apaga todas as linhas do tenant, inclusive a auditoria (única exceção ao "só inserção"), e todos os objetos do prefixo no S3. Confere que não sobrou nada e gera um comprovante com contagens, hash final da auditoria e SHA-256 do próprio comprovante, guardado fora das tabelas do tenant. | O comprovante não alcança os backups, que expiram no prazo deles. Isso precisa constar do contrato. Quem na TheNeil pode executar a exclusão. |
| Importação de pessoas | CSV com email, nome, área e papel, com simulação antes de gravar. Aceita só emails dos domínios do cliente e os papéis que quem importa pode atribuir. Nunca cria `admin_theneil`. | Quem pode importar: hoje, o administrador do cliente e o key user, este só na própria área. |

## 9. Decisões de 24/09/2026 e o que ainda precisa da sua revisão

| Tema | Como ficou | O que revisar |
|---|---|---|
| OCR local | PDF escaneado e foto são lidos pelo Tesseract (português), via OCRmyPDF, no próprio servidor. TIFF e HEIC são convertidos pelo ImageMagick com libheif; DOC, XLS, ODT e ODS pelo LibreOffice. O texto do OCR passa pela política de dados antes de ir ao modelo, como qualquer texto. | As ferramentas processam arquivos de terceiros no mesmo contêiner do servidor, sem shell, com tempo máximo, diretório temporário próprio e perfil do LibreOffice por conversão (macro não roda). Recomendação: mover as conversões para um contêiner à parte, sem rede e sem credenciais. Não implementado. |
| Fallback de visão | Só na página com OCR abaixo do limiar (padrão 70%), se o assistente tiver `reading.visionFallback` e a Política de Uso não proibir (`allowVisionFallback`). Antes, o texto do OCR passa pela política: bloqueio, aviso não confirmado ou tipo a mascarar impedem o envio da imagem. Uso e recusa ficam na auditoria. Padrão: desligado. | O texto de um OCR ruim pode não conter o dado que está na imagem, e aí a política não o enxerga. Decidir em quais assistentes o fallback pode ser ligado; o assistente de RH de demonstração está com ele ligado. |
| DANFE | Só a chave de acesso é lida do PDF. Sem o XML da mesma chave, a nota fica como "pedir o XML ao fornecedor"; nenhum campo sai do texto impresso. | Nada. |
| Incidentes | A descrição fica com quem reportou e com o key user da área (sem key user, o admin do cliente). O admin vê o incidente, não a descrição. A TheNeil vê tipo, status, data e a execução ou saída afetada; a descrição e as notas do histórico só chegam a ela com escalonamento pelo key user ou no tipo "problema técnico". Toda leitura da descrição fica na auditoria do cliente com quem leu. Emails nunca levam a descrição. | Se o admin do cliente deve ler a descrição quando a área tem key user (hoje, não). |
| Âncora da auditoria | Todo dia, o hash final da cadeia de cada tenant vai para um bucket S3 com Object Lock em modo compliance, numa conta AWS separada. A âncora tem só identificador do tenant, número do registro, hash e datas. A verificação da cadeia compara com a âncora lida do bucket. O admin do cliente vê e exporta o histórico. Cadeia quebrada não é ancorada e vira registro. | Quem administra a conta separada (não pode ser quem administra a produção), a retenção (padrão 5 anos) e o fato de as âncoras sobreviverem à exclusão do tenant até o fim da retenção (o comprovante de exclusão registra isso). |
| Prenome sozinho | Não dispara aviso. | Nada. |
