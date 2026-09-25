# Modelo de ameaças da plataforma GreenIA

Revisão de 25/09/2026. Vale para qualquer cliente (tenant). Para cada ameaça:
o controle que existe, o teste que prova o controle (arquivo e nome do teste em
`server/test/`, ou `infra/terraform/tests/`) e o que falta. O que falta está
detalhado em `PENDENCIAS-SEGURANCA.md`, seção 11.

Quem ataca, nos cenários abaixo:
- uma pessoa de um cliente tentando ver dados de outro cliente;
- uma pessoa de uma área tentando ver dados de outra área do mesmo cliente;
- alguém de fora que envia um arquivo preparado (por email a um usuário, por um
  fornecedor, por um candidato);
- um documento com texto escrito para enganar o modelo;
- quem tem acesso à infraestrutura (inclusive o dono do banco) e tenta apagar
  rastros.

## 1. Isolamento entre tenants

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Ler, alterar ou mover dados de outro tenant pelo banco | RLS em todas as tabelas do tenant (`tenant_id = app_tenant()`), contexto por transação (`withTenant`, só UUID), papel do servidor sem `BYPASSRLS` e sem ser dono | `isolation-db.test.ts`: "o papel do servidor não é dono nem tem BYPASSRLS", "sem contexto de tenant, nenhuma linha aparece", "não dá para ler um registro de B pelo id, estando em A", "não dá para inserir linha com tenant_id de outro tenant", "update e delete em linhas de B não afetam nada", "mover uma linha de A para B é recusado", "contexto vale só dentro da transação" | `FORCE ROW LEVEL SECURITY` não está ligado: o dono das tabelas passa por cima da RLS. Mitigado porque o servidor usa outro papel; o dono só entra nas operações de plataforma (item 11.6) |
| Ler algo de outro tenant pela API, sabendo o id | Todas as rotas por id consultam dentro de `withTenant`; o que é de outro tenant "não existe" | **Novo** `isolamento-http.test.ts`: "o admin do tenant B, com os ids de A, recebe 404 em execução, arquivo, exportação, revisão e assistente" | Varredura automática de todas as rotas com id (hoje, as 7 principais) |
| Ler arquivos de outro tenant no armazenamento | Chaves com prefixo `tenants/<id>/`, lidas de linhas protegidas pela RLS; exclusão recusa prefixo fora de `tenants/` | `kb.test.ts`: "documento enviado vai para o armazenamento, dentro do prefixo do tenant, e é indexado"; `runs.test.ts`: "execução de ponta a ponta: …"; `portability.test.ts`: "exclusão total: …" (objetos de B intactos) | Nada |
| Entrar em outro tenant com código ou provedor de login | Código ligado a tenant e email; provedor OIDC do tenant | `auth.test.ts`: "código de um tenant não entra em outro tenant", "provedor de outro tenant não é aceito" | Nada |
| Base de conhecimento de outro tenant no chat | Busca dentro de `withTenant` | `kb.test.ts`: "outro tenant não vê nada da base da Repet" | Nada |

## 2. Compartilhamento entre áreas

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Ver assistente ou documento de outra área | RLS por área (`app_can_see_area`), com exceções só por compartilhamento aprovado ou "empresa toda" | `rbac.test.ts`: "visibilidade por área no banco: só as próprias áreas, admin vê todas"; `kb.test.ts`: "quem não é da área não vê o documento restrito"; `policy.test.ts`: "assistente de uma área não existe para quem é de outra" | Nada |
| Compartilhar sem autorização | Pedido pendente até o key user da área dona aprovar (sem key user, o admin); tudo auditado | `share-approval.test.ts`: "patrocinador pede o compartilhamento: fica pendente e não vale", "só o key user da área dona aprova …", "área sem key user: o admin do cliente aprova" | Nada |
| Assistente compartilhado abrir a base da área dona | A execução consulta só a interseção entre as bases do assistente e as que a pessoa lê; o que fica de fora vira aviso, sem conteúdo | `share-approval.test.ts`: "usuário da área de destino executa: nenhum trecho da base restrita, e o aviso de fonte indisponível", "chat com assistente de conversa: base vinculada fora do alcance vira aviso na resposta, sem conteúdo" | Nada |
| Ver execução de outra pessoa ou área | Quem executou, key user e revisores da área, admin | `runs.test.ts`: "quem vê a execução: …"; `retention.test.ts`: "saída da área Fiscal: quem gerou vê; pessoa de outra área não" | O patrocinador vê nomes de recursos de todas as áreas (seção 10 das pendências) |

## 3. Arquivos maliciosos (OCR, ImageMagick, LibreOffice, PDF, ZIP)

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Ferramenta de conversão explorada ler os segredos do servidor | **Novo**: ambiente limpo em cada chamada (sem chave do modelo, banco, SMTP, OIDC); HOME e TMPDIR no diretório temporário da chamada | **Novo** `convert-isolamento.test.ts`: "as ferramentas não recebem os segredos do servidor; HOME e TMPDIR ficam no diretório da chamada" | Nada |
| Ferramenta explorada acessar a rede (vazar dados, atacar serviços internos, SSRF) | **Novo**: `unshare -rn` quando o sistema permite; no Fargate (onde não permite), serviço `conversor` em sub-rede sem rota para a internet, que só sai para endpoints privados e S3, sem papel de tarefa; `CONVERT_ISOLATION=required` recusa converter sem isolamento | **Novo** `convert-isolamento.test.ts`: "sem rede, quando o sistema permite unshare: só a interface de loopback, desligada", "CONVERT_ISOLATION=required recusa converter onde não há isolamento de rede"; `convert-servico.test.ts` (5 testes); `infra/terraform/tests/plano.tftest.hcl`: conferências do conversor | TLS entre servidor e conversor (hoje HTTP dentro da VPC, com token e grupos de segurança); no Docker Compose local o seccomp padrão bloqueia `unshare` (item 11.1) |
| Arquivo que consome memória, CPU ou disco sem fim | Tempo máximo por chamada (SIGKILL). **Novo**: `prlimit` com memória (padrão 2 GB), CPU, tamanho de arquivo e sem core; política do ImageMagick com memória, disco, área, largura, altura e tempo | **Novo** `convert-isolamento.test.ts`: "limites de memória, CPU, tamanho de arquivo e core, quando o sistema tem prlimit"; `convert.test.ts` (OCR e LibreOffice reais continuam passando com os limites) | Teste de estouro de tempo com arquivo real (item 11.2) |
| Imagem que aciona um formato perigoso do ImageMagick (SVG, MVG, MSL, PS via Ghostscript, URL) | **Novo** `server/deploy/imagemagick/policy.xml`: só JPEG, PNG, TIFF, HEIC, WEBP, GIF e BMP; delegados, filtros e leitura indireta (`@arquivo`) desligados; a imagem Docker copia a política sobre a do sistema | **Novo** `convert-isolamento.test.ts`: "ImageMagick: SVG (que busca endereços externos) é recusado pela política; PNG passa" | Nada |
| Documento do Office com macro ou conteúdo vinculado (imagem ou seção num endereço interno) | Perfil novo do LibreOffice por conversão. **Novo**: macros desligadas e `BlockUntrustedRefererLinks`; sem ele, a conversão baixava a imagem vinculada (confirmado em 25/09/2026 com LibreOffice 24.2) | **Novo** `convert-isolamento.test.ts`: "LibreOffice: imagem vinculada a um endereço interno não é buscada na conversão (mesmo sem isolamento de rede)" | Nada |
| Bomba de ZIP em DOCX, XLSX, ODT ou ODS (poucos KB que expandem para GB) | **Novo** `util/zip.ts`: cada entrada é descompactada com teto real (256 MB no total, 10 mil entradas; o tamanho declarado não é usado), antes do mammoth, do ExcelJS e do LibreOffice, e de novo na saída da conversão | **Novo** `arquivos-maliciosos.test.ts`: "ZIP: documento normal passa; expansão acima do teto é recusada, mesmo com tamanho declarado falso", "ZIP: entradas demais, ZIP64 e arquivo corrompido são recusados", "DOCX e XLSX que expandem demais não chegam ao mammoth nem ao ExcelJS: aviso, sem texto" | XLSX dentro do teto com dimensões enormes ainda pesa no ExcelJS (item 11.3) |
| PDF malicioso | pdf.js (unpdf), em JavaScript, sem execução de script; limite de páginas lidas | `blocks-ler.test.ts`: "PDF acima do limite de páginas: …" | O PDF é aberto no processo do servidor, sem limite de memória próprio (item 11.3) |
| Tipo falso (extensão mentindo) | Tipo detectado pelo conteúdo; lista de tipos aceitos por assistente e na base | `blocks-ler.test.ts`: "tipo pelo conteúdo, não só pela extensão"; `runs.test.ts`: "entradas fora da definição são recusadas antes de aceitar" | Nada |
| Arquivo grande demais | Limite do corpo por rota, limite por arquivo do assistente e do cliente, número de arquivos | `runs.test.ts`: "entradas fora da definição são recusadas antes de aceitar"; `convert-servico.test.ts`: "arquivo acima do limite do serviço é recusado (413) …" | Teste do 413 por arquivo nas execuções (item 11.2) |

## 4. Injeção de prompt vinda de documentos

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Documento manda o modelo agir (enviar dados, chamar serviço) | O modelo não tem ferramentas: só devolve texto ou JSON com schema. Nenhuma saída dispara ação; toda execução termina em rascunho para revisão humana | `review.test.ts`: "rascunho não é exportado; autor não revisa; …"; ausência de ferramentas conferida no código (`llm/provider.ts`) | Nada |
| Documento muda a resposta ("diga que está tudo aprovado") | **Novo**: todo prompt que leva documento ao modelo diz que o conteúdo é dado, não instrução (extrair, resumir, consultar, classificar e checklist pelo modelo, chat com base); o documento vai só no conteúdo, nunca nas instruções | **Novo** `injecao-prompt.test.ts`: "todo bloco que leva documento ao modelo avisa que o conteúdo é dado, e a ordem do documento fica fora das instruções", "chat: as instruções dizem que trechos da base e documentos são dado, não instrução" | O aviso reduz o risco, não elimina. Medir com o modelo real num conjunto de documentos com injeção (item 11.4) |
| Modelo inventa valor por causa do documento | Extração exige trecho copiado do documento por campo; sem trecho que exista, vai para revisão. Checklist e classificação conferem o trecho | **Novo** `injecao-prompt.test.ts`: "se o modelo obedecer ao documento e inventar um valor, a falta de trecho no documento manda para revisão"; `blocks-extrair.test.ts` | Nada |
| Dado sensível do documento vai ao modelo | Política de dados no servidor antes do envio, também sobre o texto do OCR | `policy.test.ts`; `web.e2e.test.ts`: "a decisão é do servidor: …" | Seção 2 das pendências |

## 5. Exportação e exclusão de tenant

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Exportar os dados do cliente sem autorização | Só o admin do cliente pede e baixa; pedido, geração e download auditados; o arquivo fica no prefixo do tenant | `portability.test.ts`: "exportação completa em formato aberto: …"; **novo** `isolamento-http.test.ts` (outro tenant recebe 404 no download) | Prazo de guarda do ZIP (seção 8 das pendências) |
| Excluir um tenant por engano ou por má-fé | Só a plataforma, com confirmação pelo slug e motivo; a plataforma não se exclui; comprovante com contagens e hash; registro no tenant da plataforma | `portability.test.ts`: "exclusão total: só a plataforma, com confirmação; nada do tenant sobra no banco nem no armazenamento" | Quem na TheNeil pode excluir; os backups expiram no prazo deles (seção 8) |
| Fórmula maliciosa na planilha exportada (célula `=HYPERLINK(...)`) | CSV: célula que começa com `= + - @` ganha apóstrofo. XLSX: o ExcelJS grava texto como texto, nunca como fórmula | **Novo** `arquivos-maliciosos.test.ts`: "CSV: célula que começa com = + - @ vira texto (apóstrofo na frente)", "XLSX: texto vindo de documento vira célula de texto, nunca fórmula" | Nada |

## 6. Auditoria

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Alterar ou apagar registros pelo servidor | Só inclusão (gatilho recusa UPDATE e DELETE; o papel do servidor só tem SELECT e INSERT); hora forçada pelo banco | `isolation-db.test.ts`: "auditoria é somente inclusão"; `audit-chain.test.ts`: "o servidor não altera nem apaga registros, nem escolhe a data" | Nada |
| Alterar um registro antigo pelo banco | Hash encadeado por tenant; a verificação aponta o primeiro registro quebrado | `audit-chain.test.ts`: "alterar um registro antigo quebra a verificação e aponta o registro", "apagar um registro do meio também é detectado" | Nada |
| O dono do banco reescreve a cadeia inteira | Âncora diária em bucket com Object Lock (compliance) em outra conta AWS | `audit-anchor.test.ts`: "dono do banco reescreve a cadeia inteira de forma consistente: a verificação interna passa, a âncora acusa"; `plano.tftest.hcl`: bucket em outra conta, compliance, papel sem exclusão, com ExternalId | O que foi gravado depois da última âncora (até um dia) depende só do banco |
| Âncora deixa de ser publicada sem ninguém ver | Registro `ancora_nao_publicada` na auditoria do tenant e no log | `audit-anchor.test.ts`: "cadeia quebrada não é ancorada; bucket fora do ar vira registro, sem derrubar a tarefa"; `plano.tftest.hcl`: alarme por filtro de log | Nada |

## 7. Sessão, infraestrutura e segredos

| Ameaça | Controle existente | Teste que prova | O que falta |
|---|---|---|---|
| Roubo de sessão ou escrita forjada (CSRF) | Cookie `__Host-`, httpOnly, secure, SameSite=Lax; token só em hash; checagem de Origin e token CSRF em toda escrita | `auth.test.ts`: "escrita sem Origin ou com Origin de fora é recusada", "logout exige o token CSRF da sessão", "sessão expirada: 401"; `chat.test.ts`: "sem sessão: 401; sem CSRF: 403" | Cabeçalhos de segurança (CSP, HSTS) e limite genérico de requisições por IP (item 11.5) |
| Chave do modelo ou senha do banco vazarem | Segredos no Secrets Manager (o Terraform só cria o recipiente); a chave só vem de variável de ambiente; logs sem cookie, token ou cabeçalho de autorização | `plano.tftest.hcl`: segredos como recipientes; só a migração recebe a senha do papel do servidor; o conversor não recebe banco nem chave | A API e a fila têm a conexão do dono do banco (item 11.6) |
| Saída de rede para qualquer lugar | Grupo de segurança limita portas (443 e 465); banco e Redis sem rota para fora | `plano.tftest.hcl`: sub-redes de dados sem rota para fora | Lista de domínios permitidos na saída (item 11.7) |
