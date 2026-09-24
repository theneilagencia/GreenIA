# Relatório da Fase 3B: generalização

Situação em 24/09/2026, branch `claude/descompactar-enviar-arquivos-hkx9is`.

A GreenIA é uma plataforma para qualquer empresa. Cada empresa define as próprias áreas, as bases de conhecimento de cada uma e os próprios assistentes. A Repet é o primeiro cliente, não o molde. Parte da Fase 3 foi escrita a partir da proposta dela; esta fase tira do código tudo o que assume um cliente, um setor ou um conjunto fixo de áreas.

## 1. Auditoria do código

A busca cobriu `server/src`, `server/migrations`, `lib`, as três páginas `.dc.html`, `scripts`, os testes e os arquivos de implantação. Os termos procurados: nomes de área (Financeiro, RH, DP, Fiscal, LGPD, Compliance, Jurídico, Comercial), nomes de cliente (Repet, SyGeCom, Prumo, "o Grupo"), conceitos de setor (NF-e, DANFE, pedido, fornecedor, admissão, eSocial) e listas fixas de tipos, taxonomias, checklists, schemas, regras e indicadores.

Resultado geral:
- Nenhuma rota, bloco ou tabela do servidor conhece uma área pelo nome. Áreas já são linhas do banco, criadas por tenant.
- Taxonomias, checklists, schemas de extração, regras de conferência e indicadores já são configuração do assistente (Fase 3, item 3.1).
- O que prende a plataforma a um setor: a NF-e e a DANFE estão embutidas no núcleo (bloco de leitura, conferência, classificação, extração, exportação e telas).
- O que prende a um tipo de empresa: os tipos de dado sensível são uma lista fixa, sem tipos próprios do cliente.
- O que falta para um cliente qualquer: subáreas, compartilhamento entre áreas, catálogo de modelos e um tenant novo que não herde as quatro áreas da proposta da Repet.

### Achados

| # | Onde | O que é | Como vai ser resolvido |
|---|---|---|---|
| A1 | `server/src/blocks/params.ts` (`FILE_KINDS` com `nfe_xml`; `datasetRefSchema.de` com `nfe`) | Tipo de arquivo e fonte de dados de um setor (fiscal brasileiro) dentro do núcleo | `FILE_KINDS` fica só com formatos genéricos (`pdf`, `imagem`, `docx`, `xlsx`, `csv`, `xml`, `texto`). Tipos especializados vêm do registro de leitores. A fonte `nfe` vira `{ de: 'leitor', leitor: 'nfe' }`; definições antigas são promovidas na leitura. |
| A2 | `server/src/blocks/ler.ts`, `nfe.ts`, `danfe.ts` | Leitura de XML de NF-e e da chave da DANFE chamadas direto pelo bloco genérico | Registro de leitores (`server/src/readers/`). Cada leitor declara o formato que reconhece, os campos que entrega e o tipo de arquivo que acrescenta. O bloco de leitura só chama os leitores ligados no tenant. NF-e e DANFE viram dois leitores. |
| A3 | `server/src/blocks/types.ts` (`ReadDoc.nfe`, `ReadDoc.danfe`) | Campos de um setor no tipo central do documento lido | `ReadDoc.dados` genérico, por leitor (`dados.nfe`, `dados.danfe`), mais `pendencias` e `semExtracao` declarados pelo leitor. |
| A4 | `server/src/blocks/extrair.ts` (pula DANFE), `classificar.ts` (período pela data da NF-e), `exportar.ts` (`danfeLabel`), `conferir.ts` (fonte `nfe`) | Regras de um setor dentro de blocos genéricos | Cada bloco usa o que o leitor declara: `semExtracao` (extração pula), `periodo` (classificação), `situacao` (exportação e revisão) e o conjunto de registros do leitor (conferência). |
| A5 | `server/src/assistants/package.ts` e `guide.ts` (textos sobre NF-e e DANFE; rótulos de tipo) | Instruções de setor no pacote portátil e no guia | Textos e rótulos vêm do registro de leitores (cada leitor tem descrição e instrução para outra plataforma). |
| A6 | `Assistentes GreenIA.dc.html` (`KIND_LABEL` com `nfe_xml`; rótulo de DANFE) | Tipos de setor fixos na tela | A tela recebe os tipos aceitos e os rótulos pela API (`/api/readers`), só dos leitores ligados no tenant. |
| A7 | `lib/greenia-core.js` (tipos de dado sensível fixos) e `server/src/tenants/config.ts` (`dataPolicySchema` só com esses tipos) | Detectores fixos; um cliente não cadastra "matrícula", "placa" ou "código de paciente" | Registro de detectores no servidor: os de fábrica (CPF, CNPJ, cartão, e-mail...) mais os do tenant, cadastrados pelo admin com padrão, validação opcional (CPF, CNPJ, Luhn, módulo 11) e ação padrão. A política aceita as chaves dos detectores do tenant. |
| A8 | `server/deploy/tenant-local.json`, `server/deploy/demo/tenant-demo.json` | As quatro áreas da proposta da Repet (Financeiro, RH/DP, Fiscal, LGPD & Compliance) como padrão de tenant | O tenant novo começa sem áreas, ou com um modelo inicial de áreas escolhido na criação (catálogo). `tenant-local.json` passa a não ter áreas fixas. O tenant de demonstração continua com essas áreas, como dado de demonstração. |
| A9 | `server/deploy/demo/assistentes/*.json` | Os quatro assistentes de referência ligados ao tenant de demonstração | Viram modelos do catálogo da TheNeil, sem ligação com cliente. O tenant de demonstração cria os seus a partir do catálogo. |
| A10 | `migrations/001_base.sql` (`areas` só com slug e nome) e `002_areas.sql` (`app_can_see_area` sem hierarquia) | Área plana, sem descrição, sem subárea, sem desativação, sem compartilhamento | Migração nova: descrição, área mãe, ordem, ativa, herança de permissão; tabelas de compartilhamento de assistente e de documento com várias áreas; visibilidade pela RLS considerando o compartilhamento. |
| A11 | `server/src/admin/routes.ts` (áreas só criadas) | O admin não renomeia, não desativa, não organiza | Rotas e tela de áreas: criar, renomear, descrever, mover (subárea), reordenar, desativar e reativar, com key users, revisores, base e assistentes de cada área. |
| A12 | `server/src/tenants/config.ts` (padrões "do Grupo": `orgName`, `tagline`, `heroSubtitle`, `whatIs`) e `GreenIA.dc.html` (padrão `orgName` "Grupo") | Textos padrão escritos para o Grupo da Repet | Padrões neutros ("da empresa"). Cada tenant define os seus. |
| A13 | `GreenIA.dc.html` modo demonstração (persona e base "do Grupo", exemplo "cliente Repet Soluções Ambientais") e `Política GreenIA.dc.html` ("A IA do dia a dia do Grupo") | Conteúdo do protótipo da Fase 1, escrito para o Grupo | É dado de demonstração, mas aparece para qualquer cliente que abra a página. Troca de "do Grupo" por "da empresa" e do exemplo por um nome fictício. |
| A14 | `lib/greenia-core.js` (comentário com "Repet Soluções Ambientais") e `tests/sensitive-policy.test.mjs` | Nome do cliente em comentário e teste da lib | Exemplo fictício. |
| A15 | `server/src/config.ts` (exemplo `OIDC_REPET_ENTRA_SECRET`) e `server/src/tenants/routes.ts` (exemplo `repet.greenia...`) | Nome do cliente em comentários do núcleo | Exemplos neutros (`OIDC_CLIENTE_ENTRA_SECRET`, `cliente.greenia...`). |
| A16 | Testes do servidor (tenant `repet`, áreas `fiscal`, `rh`, `financeiro`) | Os testes criam as próprias áreas nos fixtures, mas com os nomes da proposta da Repet e o slug `repet` | Os fixtures já criam as áreas. Os nomes passam a ser neutros onde o teste não depende deles; o teste contra nomes fixos ignora `test/` (fixtures são livres). |
| A17 | `RELATORIO-FASE-3.md` (checklist "para colocar a Repet no ar"), `PLANO-FASE-4.md` (validação "da Repet", SyGeCom como layout principal), `README.md` | Documentação tratando a plataforma como produto da Repet | Checklist genérico de implantação (`docs/IMPLANTACAO.md`); dados da Repet num arquivo de implantação dela (`implantacoes/repet/`); Fase 4 como validação da plataforma. |
| A19 | `server/src/metrics/` e tabelas `metric_values` e `assistant_decisions` (migração 009); `metrics` no schema do assistente | Ciclo de vida (baseline, medição e decisão) dentro do assistente. Um quick win é uma melhoria de processo e pode usar vários assistentes, várias bases ou só uma base | Quick win como objeto próprio (oportunidade, seleção, janelas, decisão, ampliação); medição por execução vinculada ao quick win; dados de medição por assistente migrados para quick wins (migração 020). |
| A18 | `eval/nomes/candidato-local.mjs` (palavras de empresa como "soluções ambientais") | Lista de palavras da avaliação de nomes com vocabulário do setor da Repet | Avaliação, fora do núcleo. Fica registrado; a lista ganha termos de outros setores quando a segunda camada for decidida. |

### O que já estava genérico

- Papéis (`usuario`, `revisor`, `key_user`, `admin_cliente`, `admin_theneil`) valem para qualquer área.
- Checklist, taxonomia, schema de extração, regras de conferência, tópicos do resumo e indicadores são parâmetros dos blocos, definidos no assistente.
- Política de Uso, incidentes, consumo, exportação, exclusão e auditoria não conhecem área nem setor.

## Resumo da execução

A numeração segue o pedido revisado: 5 implantação, 6 quick wins, 7 prova, 8 documentação.

| Item | O que ficou | Commits |
|---|---|---|
| 1. Auditoria | Achados A1 a A19, acima | `7d0487c` |
| 2. Áreas do cliente | Criar, renomear, descrever, mover, ordenar, desativar. Subárea herda ou não a permissão da mãe (permissão desce, não sobe). Key users, revisores, base e assistentes por área. Assistente e documento compartilhados com várias áreas ou com a empresa toda. Tenant novo começa vazio ou com modelo de áreas | `985ed0c` |
| 3. Blocos genéricos | Registro de leitores (`server/src/readers/`: NF-e e DANFE, ligados por tenant). Registro de detectores: os de fábrica e os do tenant (padrão, validação opcional, contexto, ação padrão), com teste antes de salvar | `3ee40dd` |
| 4. Catálogo | Oito modelos de assistente versionados (os quatro de referência e Comercial, Jurídico, Suprimentos, Atendimento) e três modelos de áreas. Criar do zero, de um modelo ou duplicando. O assistente não muda quando o modelo muda; o painel avisa | `ba72ec6` |
| 5. Implantação | `docs/IMPLANTACAO.md` genérico (tenant e login, áreas, papéis, política de dados, bases, assistentes, quick wins, treinamento, operação). Dados da Repet em `implantacoes/repet/`. Padrões "do Grupo" viraram "da empresa"; exemplos sem nome de cliente (A12 a A15) | `f0ae26e`, `2aed66d` |
| 6. Quick wins | Oportunidade com roadmap e arquivo; patrocinador; ciclo do quick win com volta ao roadmap; execução em um só quick win; janelas e comparação na mesma unidade; ampliação com recursos compartilhados ou duplicados; cota do plano; dois relatórios; migração da medição por assistente; telas | `09d5daf`, `f76a068` |
| 7. Prova de generalidade | Segundo tenant (construtora) só pela API; teste contra nomes fixos; validação dos arquivos de implantação | `d734c05`, `a7dad3f` |
| 8. Documentação | README, plano da Fase 4 e relatório da Fase 3 | `d1ef247` e o commit desta revisão |

Testes nesta data: servidor 276/276 (inclui o e2e das telas e o segundo tenant), raiz 73/73 (lib, sincronia, templates, contraste), `tsc --noEmit` sem erros. O e2e do protótipo no navegador (`npm run test:e2e`) não rodou: ele carrega uma biblioteca de `unpkg.com`, que o proxy deste ambiente recusa.

## 2. Áreas definidas pelo cliente

- Migração `016_areas.sql`: descrição, área mãe, ordem, ativa, herança de permissão; gatilho contra ciclo; `area_subtree()`; tabelas `assistant_shares` e `kb_document_shares`; `company_wide` em assistente e documento; RLS considerando compartilhamento.
- Herança calculada no login (`loadMembership`): o key user de Engenharia enxerga Obras; o de Obras não enxerga Engenharia. Área desativada deixa de dar acesso, a ela e às de baixo; os registros dela ficam.
- A execução é registrada na área de quem executa, não na área dona do assistente.
- Tela: aba Administração › Áreas (árvore, criar, renomear, mover, desativar, aplicar modelo) e botões de compartilhamento no editor de assistente e na base.

## 3. Blocos genéricos

- `FILE_KINDS` só com formatos genéricos. Tipos especializados vêm dos leitores ligados; a fonte antiga `{ de: 'nfe' }` é promovida para `{ de: 'leitor', leitor: 'nfe' }` na leitura (a lista de aliases fica no registro de leitores).
- `ReadDoc.dados` por leitor, com `semExtracao`, `periodo` e `situacao` declarados pelo leitor. Extração, classificação, exportação e revisão usam isso, sem saber de NF-e.
- Assistente que usa um leitor desligado ou um tipo de dado desconhecido é recusado ao salvar (409, com os rótulos).
- Detectores do tenant: `GET/PUT /api/admin/detectors`, `POST /api/admin/detectors/test`. Padrão com checagem contra regex perigosa.

## 4. Catálogo de modelos

- `server/catalog/modelos/` e `server/catalog/areas/`, publicados pelo migrador na tabela `catalog_templates`. Versão publicada é imutável; versão nova entra pela rota da plataforma.
- Assistente guarda `template_slug`, `template_version` ou `duplicated_from`. Lista e detalhe mostram a origem e, se houver, "há versão nova do modelo".
- O tenant de demonstração cria os quatro assistentes a partir do catálogo (`server/deploy/demo/tenant-demo.json`).

## 5. Implantação genérica

- `docs/IMPLANTACAO.md` em dez blocos: contrato e SI, infraestrutura, tenant e login, áreas, papéis e política de dados, bases, assistentes, oportunidades e quick wins, treinamento (pessoas, key users e revisores, patrocinadores), operação do piloto.
- `implantacoes/repet/tenant.json` é aceito pelo `create-tenant.ts`. Domínio, host, `issuer` e `clientId` estão como provisórios, marcados "A-CONFIRMAR"; o segredo vai por variável. Patrocinador a confirmar.
- Um teste valida todo `implantacoes/*/tenant.json` no mesmo schema da criação de tenant e recusa segredo no arquivo.

## 6. Quick wins

**a) Oportunidade.** Registrada por key user ou admin na área: processo, problema, quem executa hoje, volume, evidência (comprovada ou hipótese). Avaliada pelos critérios do tenant: padrão Valor 40, Complexidade 20, Risco 20, Dependências 20, escala de 1 a 5, tudo editável (Administração › Critérios de avaliação). Nota de 0 a 100, com os critérios "menor é melhor" invertidos; a oportunidade guarda os critérios da época. Ciclo: registrada → avaliada → selecionada, enviada ao roadmap ou arquivada; roadmap e arquivo exigem motivo, e dá para reabrir. Portfólio por área (com subáreas) e da empresa, com filtro por critério e por situação.

**b) Quick win.** Nasce da oportunidade selecionada, em implantação, com responsável, áreas, objetivo, indicadores escolhidos pelo cliente (nenhum fixo no código), janelas, recursos (assistentes e documentos), revisores e prazo. Ciclo: em implantação → em medição → decisão (manter, descartar, ampliar) → encerrado. Na implantação, `POST /api/quick-wins/:id/roadmap` devolve ao portfólio como oportunidade no roadmap, com motivo (a ampliação ganha oportunidade própria); a próxima seleção pode registrar que entra no lugar (`substitui`).

**c) Quem decide.** Papel novo `patrocinador`, no tenant ou numa área (permissão `qw.decide`). Key users propõem (registram, avaliam, mandam ao roadmap, arquivam, conduzem a implantação); selecionar, registrar a decisão final e ampliar exigem patrocinador ou admin do cliente das áreas envolvidas. O patrocinador do tenant enxerga oportunidades e quick wins de todas as áreas (`app.qw_all` na RLS), mas não a base nem as execuções das áreas; os números das execuções chegam a ele por uma função que só devolve contagens e tempos. Toda mudança de etapa vai para o histórico e para a auditoria, com quem e por quê.

**d) Medição.**
- As execuções guardam `quick_win_id`. Cada uma pertence a no máximo um quick win: com o assistente em mais de um quick win ativo, a pessoa escolhe ao executar (seletor na tela; `quickWinId` na API, `null` para "fora dos quick wins"). Sem escolha, vale a área de quem executa quando ela aponta um só; se a pessoa também usa o assistente pela área de outro quick win, a API pede a escolha (409 `escolha_o_quick_win`). Quem escolhe um quick win executa por uma área dele.
- O automático (volume, tempo de processamento, tempo até a revisão, aprovação sem edição, taxa de revisão, divergências, pendências, consumo, pessoas) vem só das execuções do quick win, na janela de medição. Indicadores manuais têm origem e período.
- Janela do ponto de partida e janela de medição, com datas e volume (o da medição, se não informado, é o número de execuções concluídas). Cada indicador compara pelo valor, por mês ou por item. O relatório avisa quando falta data, quando a duração ou o volume são mais de duas vezes diferentes e quando as janelas se sobrepõem.
- Sem valor "antes", não há comparação nem ganho calculado.

**e) Ampliação.** Só depois da decisão "ampliar". Novo quick win em outra área, unidade ou processo, com baseline próprio e vínculo com a origem (trajetória nos dois sentidos). Recursos compartilhados (os mesmos, compartilhados com as áreas novas) ou duplicados (cópia independente na primeira área nova: assistente com slug e nome da área, documento com o mesmo conteúdo e nova indexação). Duplicar um documento exige acesso a ele.

**f) Cota.** Nenhuma na plataforma. A TheNeil define, se o plano tiver, o máximo de quick wins em andamento; ao atingir, o painel avisa e a criação seguinte é recusada. Quick win encerrado ou devolvido ao roadmap não conta.

**g) Relatórios.** Portfólio de oportunidades (todas, com avaliação por critério, situação, motivo de roadmap e arquivo, contagem por situação) e resultados dos quick wins (antes × depois na unidade de comparação, janelas e avisos, decisões, trajetória), em PDF e XLSX, para qualquer área criada pelo cliente.

**Migração da medição por assistente.** A migração `020` cria, para cada assistente com valores ou decisões da Fase 3, uma oportunidade selecionada e um quick win na área do assistente, com os indicadores da definição, os valores com origem, a última decisão (com responsável e data) e as execuções do assistente. Roda uma vez por assistente e fica na auditoria (`medicao_migrada_para_quick_win`). As tabelas antigas continuam no banco, sem uso, até você confirmar que podem sair.

**Telas.** Aba Quick wins: portfólio com filtros; nova oportunidade; avaliar; enviar ao roadmap, arquivar e reabrir; seleção (só para quem decide) com janelas, recursos e indicadores; lista e detalhe do quick win com janelas e avisos, etapa, volta ao roadmap, decisão, ampliação com recursos compartilhados ou duplicados, valores, medições automáticas e histórico. Na execução, seletor do quick win quando o assistente está em mais de um. CSV de pessoas aceita o papel patrocinador.

**Falha corrigida no caminho.** A atualização do quick win sem o campo de recursos apagava os recursos (o valor padrão do schema entrava no lugar do campo ausente). Um teste agora trava isso.

## 7. Prova de generalidade

**Segundo tenant de demonstração** (`server/test/second-tenant.test.ts`): Construtora Horizonte, montada só pela API, como o admin faria no painel.

| O quê | Como ficou |
|---|---|
| Áreas | Engenharia, Obras (subárea de Engenharia, herdando), Suprimentos, Jurídico, Segurança do trabalho, Comercial |
| Pessoas | Um key user por área, pessoas em Obras e Suprimentos, e um patrocinador do tenant |
| Tipo de dado próprio | Registro no CREA (padrão, classe amarela, avisar), testado antes de salvar |
| Assistentes (4) | Três do catálogo (cotações × especificação, cláusulas de contratos, requisitos de edital) e um do zero (resumo semanal do diário de obra). O do Jurídico é compartilhado com Suprimentos e Obras |
| Bases (2) | Segurança do trabalho (procedimento de trabalho em altura, para a empresa toda) e Engenharia (padrão de medição) |
| Critérios | Os quatro padrão mais "Impacto em segurança" (peso 20) |
| Oportunidades (6) | Uma por área. Engenharia vai ao roadmap e Comercial é arquivada, com motivo; Jurídico fica avaliada |
| Quick wins | Suprimentos com dois assistentes (decisão: manter). Segurança do trabalho só com a base: volta ao roadmap na implantação, é reaberta, reavaliada e selecionada de novo no lugar. Obras com o assistente do diário e o do Jurídico, três execuções revisadas, decisão ampliar, ampliado para Segurança do trabalho com recursos compartilhados e baseline próprio |
| Sem contagem em dobro | O assistente do Jurídico fica em dois quick wins ativos (Suprimentos e Obras). Quem é de Suprimentos conta em Suprimentos; quem é de Obras, em Obras; o admin tem de escolher. Três execuções, três contagens |
| Janelas | Cotações: 92 dias no ponto de partida e 20 na medição, com aviso de duração e volume diferentes, e compras refeitas comparadas por mês |
| Relatórios | Portfólio e resultados, em PDF e XLSX, em `docs/fase-3b/relatorios-construtora/` |

Nenhum passo pediu código de cliente. Os pontos em que a plataforma falhou ao generalizar, e o que foi feito:
- Nos relatórios da primeira rodada, a etapa aparecia como chave interna, a origem automática sem acento, e a oportunidade devolvida não mostrava o motivo. Corrigido.
- O patrocinador do tenant não enxergava os assistentes das áreas e por isso não conseguia vincular recursos nem compartilhar na ampliação. Resolvido com duas funções no banco: uma devolve só ids para vincular, outra só nomes, área e definição do assistente de um quick win que a pessoa enxerga. O conteúdo dos documentos continua restrito.
- A execução de quem usa o assistente por várias áreas (o admin, por exemplo) ia para a área dona e ficava fora dos quick wins sem perguntar. Agora a API pede a escolha.
- Volume de medição: quando o item do processo não é uma execução (ex.: semana de canteiro), o número de execuções não serve. O volume da medição passa a ser informado nesses casos; o checklist diz isso.

**Teste contra nomes fixos** (`server/test/genericity.test.ts`). Varre `server/src` (menos `src/demo`), as migrações e `lib/`, sem os comentários, e falha se achar nome de cliente (Repet, SyGeCom, Prumo, também nas páginas), nome de área como literal ou tipo de documento fora do registro de leitores. Ficam de fora os dados de demonstração, o catálogo e os fixtures de teste. O próprio teste confere que a varredura lê os arquivos.

**Testes com áreas da Repet.** Os fixtures criam as próprias áreas (`seedTenant` não cria nenhuma). O slug `repet` e as áreas `fiscal` e `rh` continuam em vários testes, como dado de fixture.

## 8. Documentação

- `README.md`: o que cada cliente configura, papéis, catálogo, quick wins (ciclo, patrocinador, medição, janelas, ampliação, migração), tenants de demonstração.
- `PLANO-FASE-4.md`: validação da plataforma. Corpus com as quatro frentes e duas áreas da construtora (cotações de Suprimentos e contratos do Jurídico). O layout do SyGeCom é uma variação entre outras. O modelo é escolhido por assistente. Cada assistente avaliado fica ligado a um quick win com janelas, e um deles em dois quick wins, para validar a contagem.
- `RELATORIO-FASE-3.md`: nota da Fase 3B no início, medição no quick win, catálogo, checklist genérico no lugar do checklist da Repet.

## Limites e pendências

- A tela ainda não edita indicadores, recursos e revisores de um quick win depois de criado: a API aceita (`PATCH /api/quick-wins/:id`); a tela edita as janelas.
- A cota de quick wins só é definida pela API da plataforma; não há tela da TheNeil para isso.
- Patrocinador do tenant não duplica documento de área que não enxerga: compartilha, ou pede ao key user da área.
- As tabelas da medição por assistente (`metric_values`, `assistant_decisions`) ficam no banco, sem uso, até a sua confirmação.
- O segundo tenant existe como teste executável, não como seed no ambiente de demonstração.
- Instabilidade vista uma vez, sem relação com a Fase 3B: o `audit-chain` falhou uma vez na desmontagem do banco (conexão encerrada durante o `drop`) e passou nas execuções seguintes.
- A18 (vocabulário de setor na avaliação de nomes) continua como estava: é avaliação, fora do núcleo.

## Parada

A Fase 3B está concluída. Espero o seu aval para a Fase 4 (`PLANO-FASE-4.md`, revisado).
