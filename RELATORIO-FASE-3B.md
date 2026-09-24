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
| A18 | `eval/nomes/candidato-local.mjs` (palavras de empresa como "soluções ambientais") | Lista de palavras da avaliação de nomes com vocabulário do setor da Repet | Avaliação, fora do núcleo. Fica registrado; a lista ganha termos de outros setores quando a segunda camada for decidida. |

### O que já estava genérico

- Papéis (`usuario`, `revisor`, `key_user`, `admin_cliente`, `admin_theneil`) valem para qualquer área.
- Checklist, taxonomia, schema de extração, regras de conferência, tópicos do resumo e indicadores são parâmetros dos blocos, definidos no assistente.
- Política de Uso, incidentes, consumo, exportação, exclusão e auditoria não conhecem área nem setor.

## 2 a 7. Execução

Preenchido item a item, com os commits.
