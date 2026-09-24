# Relatório da Fase 3: capacidades do Prumo Discovery

Situação em 24/09/2026, branch `claude/descompactar-enviar-arquivos-hkx9is`. Atualizado no mesmo dia com as quatro decisões da revisão (seção "Decisões aplicadas depois da revisão"). Os 11 itens da Fase 3 foram entregues, com um commit por item e as telas em dois commits. Os quatro assistentes de referência rodam só por configuração. Dois blocos precisaram ser generalizados no caminho, e isso está registrado abaixo. A próxima etapa só começa depois da sua confirmação.

> **Depois da Fase 3B (generalização).** A GreenIA é uma plataforma para qualquer empresa; a Repet é o primeiro cliente, não o molde. Os quatro assistentes de referência viraram modelos do catálogo da TheNeil (`server/catalog/modelos/`), as áreas são do cliente (com subáreas e compartilhamento), NF-e e DANFE viraram leitores ligados por tenant, e a medição saiu do assistente e foi para o quick win. O checklist da seção "Checklist de implantação" passou a ser genérico (`docs/IMPLANTACAO.md`), com os dados da Repet em `implantacoes/repet/`. Detalhes em `RELATORIO-FASE-3B.md`.

## Resumo

- Um assistente é uma **definição versionada** (JSON validado por zod), com uma lista de **blocos genéricos**. Nenhum dos quatro assistentes de referência tem código próprio.
- Toda saída nasce **rascunho**. Só a saída aprovada exporta.
- A auditoria virou uma **cadeia de hashes**. Alterar um registro antigo quebra a verificação.
- A **Política de Uso de IA** do cliente é versionada, exige ciência e vira piso da política de dados dos assistentes.
- Consumo por tenant, assistente e pessoa, com tabela de preços editável e simulador.
- Exportação completa do tenant em formato aberto e exclusão total com comprovante.
- Telas novas: a página `Assistentes GreenIA.dc.html` (Executar, Revisão, Resultados, Administração). No chat (`GreenIA.dc.html`, modo com servidor), entraram o botão Reportar incidente, a ciência da política, o roteiro do primeiro acesso e o link para os assistentes. O modo demonstração não mudou.
- Testes, todos passando nesta data:

  | Suíte | Resultado |
  |---|---|
  | servidor (inclui e2e das telas com servidor) | 198/198 |
  | raiz (lib, sincronia, templates, contraste) | 72/72 |
  | e2e do protótipo no navegador (modo demonstração) | 10/10 |
  | `tsc --noEmit` do servidor | sem erros |

  Os testes rodam com o **provedor simulado**. Nenhum assistente foi rodado com o modelo real nem com documento real de cliente.

## O que cada item cobre

### 3.1 Assistentes definidos por configuração
- Schema v2 (`server/src/assistants/schema.ts`):
  - identificação, dono e área;
  - objetivo, instruções e exemplos;
  - entradas (texto, tipos e tamanho de arquivo, base de conhecimento);
  - classes de dado e política de dados;
  - retenção;
  - `pipeline` de blocos;
  - saída (formato, JSON Schema, arquivos);
  - revisão (obrigatória por padrão, com revisores e checklist);
  - indicadores.
- A definição v1 da Fase 2 continua aceita e é promovida na leitura.
- Os JSON Schemas da saída e da extração são compilados com ajv na validação da definição. Schema inválido não salva.
- Toda alteração, inclusive de status (rascunho, piloto, ativo, arquivado), cria uma versão nova. Cada execução guarda a versão usada.
- Pacote portátil (`/api/assistants/:slug/package`, em ZIP ou num único Markdown) com:
  - `instrucoes.md`, `exemplos.md`, `schema-saida.json`, `checklist-revisao.md` e `definicao.json`;
  - um README para ChatGPT, Claude e Gemini.
- O que a GreenIA faz em código (conferência, checklist por regras, NF-e por parser) vira instrução explícita no pacote, com o aviso de que ali depende do modelo.

### 3.2 Blocos de capacidade
Cada bloco tem teste próprio (`server/test/blocks-*.test.ts`).

| Bloco | O que faz | Usa o modelo? |
|---|---|---|
| `ler` | PDF com texto (por página), DOCX, XLSX (acha o cabeçalho, pula títulos, guarda a linha de origem), CSV (UTF-8 ou Latin-1, `;` ou `,`), texto e XML de NF-e por parser determinístico. PDF escaneado (menos de 25 caracteres por página) e imagem vão para a visão do modelo, página a página. | Só para escaneado e imagem, e a visão pode ser desligada |
| `extrair` | Campos por JSON Schema, com origem (página e trecho) por campo. Confere se o trecho existe no documento. Campo sem origem vira pendência. Saída fora do schema vai para revisão e nunca é concluída. | Sim |
| `conferir` | Compara dois conjuntos (NF-e, planilha, extração) em código. Regras: igual, texto normalizado, número com tolerância absoluta ou percentual, data com prazo. Casa registros por chave, trata registro sem par e informa a origem de cada lado. | Não |
| `checklist` | Presente, ausente ou duvidoso. Pelo método de regras, usa nome de arquivo, sinônimos e conteúdo. Pelo método do modelo, a origem indicada é conferida no arquivo. Duvidoso vai para revisão. | Só no método do modelo |
| `classificar` | Categoria por taxonomia, período e nome sugerido. Gera índice e ZIP organizado por pastas. | Sim |
| `consultar` | Responde só com a base da área e cita documento e versão. Sem fonte, diz que não sabe e indica o key user. | Sim |
| `buscar` | Localiza documentos entre os enviados ou na base, com o trecho relevante. | Não (palavra-chave) |
| `resumir` | Resumo com tópicos fixos, na ordem, com limite de palavras. | Sim |
| `exportar` | XLSX (uma aba por seção), CSV, PDF, DOCX e ZIP, com a identificação da execução, a versão e o status da revisão. | Não |

### 3.3 Revisão humana
- Estados: rascunho, depois aprovado, aprovado com edição (guarda original, editada e diff) ou rejeitado (motivo obrigatório).
- A decisão é única. Quem gerou não revisa a própria saída. Só os papéis listados em `review.reviewers` revisam.
- Só a saída aprovada ou aprovada com edição exporta. A exportação usa a versão editada.
- A tela de Revisão mostra, lado a lado, o resultado e a origem de cada item (arquivo, página, linha ou campo) e permite editar.

### 3.4 Medição antes e depois
- Linha de base por indicador, com origem: **medido** (período e método) ou **informado** (quem informou e quando).
- Indicadores automáticos: tempo de processamento, tempo até a revisão, aprovação sem edição, divergências e pendências por execução, custo por execução, volume e pessoas ativas.
- Painel por assistente com antes, depois e a origem de cada número, e um campo de decisão (manter, descartar ou ampliar), com data, responsável e justificativa. Relatório em PDF e XLSX.
- **Sem linha de base, o painel mostra "sem ponto de partida"** e não calcula ganho.
- *Fase 3B:* a medição foi para o quick win, que junta o automático das execuções dos assistentes vinculados (só nas áreas do quick win) com indicadores lançados à mão. A regra do ponto de partida continua a mesma.
- O tempo automático mede só o processamento, não a revisão humana. Comparado com o tempo manual, aparece como "comparação parcial" e não vira horas economizadas. O ganho acumulado só é calculado quando o "depois" também é medido ou informado por uma pessoa.

### 3.5 Auditoria com hash encadeado
- Cada registro tem `seq`, `prev_hash` e `hash`, calculados por gatilho no banco. A hora é a do servidor.
- `audit_verify()` refaz a cadeia e aponta o primeiro registro quebrado e o motivo.
- Histórico por documento, por execução ou por hash de arquivo. Exportação em CSV, que também fica registrada.
- Teste: alterar um registro antigo direto no banco quebra a verificação naquele registro.

### 3.6 Política de Uso de IA do cliente
- Política versionada. Cada pessoa dá ciência por versão. Sem ciência, o servidor recusa o envio (428), e a tela mostra a política.
- As regras (ação por tipo de dado, termos restritos, classes permitidas) viram piso da política de dados de cada assistente: vence a ação mais restritiva.
- Publicar uma versão que conflita com assistentes em piloto ou ativos lista os conflitos. Esses assistentes ficam bloqueados até serem ajustados.
- Botão **Reportar incidente** em todas as telas com servidor. O incidente tem tipo, área, descrição e histórico de status (aberto, em análise, resolvido, encerrado). O aviso por email não leva a descrição.

### 3.7 Consumo
- Consumo por tenant, assistente e pessoa (tokens, páginas e reais). Cada evento guarda a linha de preço usada.
- A tabela de preços (`price_tables`) é editável pela plataforma, com vigência, câmbio próprio e preço por página opcional.
- Relatório mensal em JSON, CSV e XLSX, para o cliente e para a plataforma.
- Simulador de custo mensal por assistente. Usa as médias medidas (a partir de 5 execuções em 90 dias) ou as premissas da seção "Custos por página", e diz qual das duas usou.

### 3.8 Implantação
- Criação de tenant por script (`create-tenant.ts`) ou pela rota da plataforma, com key users e política iniciais.
- Importação de pessoas por CSV, com simulação antes de gravar e erro por linha.
- Importação de documentos da base em lote, com relatório de erros e recusas por arquivo.
- Guia rápido por assistente em PDF e Markdown, gerado da definição e da política.
- Roteiro guiado no primeiro acesso, no chat e na página de assistentes.
- Tenant de demonstração com os quatro assistentes e amostras fictícias (`seed-demo.ts`).
- *Fase 3B:* tenant novo começa sem áreas (ou com um modelo de áreas do catálogo). Segundo tenant de demonstração, uma construtora, montado só pela API (`server/test/second-tenant.test.ts`).

### 3.9 Portabilidade
- Exportação completa do tenant em ZIP: dados em JSON e CSV, arquivos originais, auditoria com a verificação da cadeia e um manifesto com hashes.
- Exclusão total pela plataforma, com confirmação pelo slug e motivo. Apaga banco e S3, confere que não sobrou nada e gera um comprovante com contagens, hash final da auditoria e SHA-256 do próprio comprovante.
- Teste: depois da exclusão, nenhuma linha do tenant no banco e nenhum objeto no armazenamento.

### 3.10 Assistentes de referência
Na Fase 3 as definições ficavam em `server/deploy/demo/assistentes/`; desde a Fase 3B são modelos do catálogo (`server/catalog/modelos/`), e o tenant de demonstração cria os seus a partir deles. Cada um roda de ponta a ponta nos testes, com as amostras fictícias.

| Assistente | Pipeline | Resultado com as amostras |
|---|---|---|
| Fiscal: NF-e (XML) × pedido (XLSX) | ler, conferir itens, conferir cabeçalho, exportar | Acha quantidade divergente, preço 4% acima da tolerância, item da nota sem pedido, item do pedido sem nota e valor total. Deixa passar o que está dentro de 1% e do prazo. **Não chama o modelo.** |
| RH/DP: checklist de admissão | ler, checklist, exportar | RG, CPF, CTPS e comprovante (foto, pela visão) presentes; ASO ausente; título de eleitor e dados bancários duvidosos (só citados na ficha). |
| Financeiro: resumo padronizado | ler, extrair, resumir, exportar | Indicadores extraídos com origem e resumo nos tópicos fixos. |
| LGPD: índice de evidências | ler, classificar, buscar, exportar | Índice por categoria e período, ZIP organizado e busca por documento. A planilha sem relação fica sem categoria e vai para revisão, onde o revisor a classifica antes de aprovar. |

**Generalizações da plataforma** (cada uma teria sido código específico):
1. **Planilha chave-valor.** O cabeçalho do pedido é uma aba "Campo | Valor". O bloco `conferir` ganhou `orientacao: 'chave_valor'`, que lê essa aba como um registro só.
2. **Prazo contado a partir da direita.** "A nota deve sair até N dias depois do pedido" conta da data do pedido, que está do lado direito. A regra de data ganhou `referencia: 'esquerda' | 'direita'`.

Nenhum dos quatro precisou de código específico depois dessas duas mudanças.

### 3.11 Testes
Os casos pedidos estão cobertos:
- saída fora do schema vai para revisão e nunca é concluída;
- o painel mostra "sem ponto de partida" sem linha de base;
- alterar um registro antigo da auditoria quebra a cadeia;
- exportação e exclusão completas, sem sobra no banco nem no armazenamento.

Além deles: isolamento entre tenants e áreas nas execuções, revisão (autor, papel, motivo, decisão única), política e 428, termos restritos, preços por vigência, importações e as telas com servidor no navegador.

## Limites conhecidos

### Tipos de documento que não funcionam bem

| Tipo | O que acontece | O que fazer |
|---|---|---|
| PDF escaneado e foto | OCR local (Tesseract, português), cerca de 2,5 s de CPU por página. Foto torta, com sombra ou letra pequena tende a ficar abaixo do limiar de confiança (70%): o texto segue com aviso para revisão, ou vai à visão do modelo se o assistente permitir. Letra de mão quase não é lida. | Preferir o PDF original ou o XML. Foto de celular: papel plano, luz uniforme, página inteira no quadro. |
| TIFF (comum em digitalização multipágina), HEIC (foto de iPhone) | Convertidos no servidor (ImageMagick com libheif) e lidos pelo OCR. | Nada a fazer. |
| DOC, XLS antigos e ODT/ODS | Convertidos no servidor (LibreOffice sem interface, cerca de 1 s por arquivo). Macro não roda; fórmula de XLS vem com o último valor salvo. | Nada a fazer. |
| PDF com senha | Não é lido: a execução avisa ou termina em erro. | Remover a senha antes. |
| DANFE em PDF | Só a chave de acesso é lida. Com o XML da mesma chave na execução, a nota vem do XML; sem ele, a nota fica como "pedir o XML ao fornecedor". Nenhum campo é extraído do texto impresso. | Enviar o XML junto; o fornecedor é obrigado a entregá-lo. |
| NFS-e, CT-e e outros XML fiscais | Não têm parser: viram texto. | Novo leitor no registro (`server/src/readers/`), quando um cliente precisar. |
| Planilha com várias tabelas na mesma aba, células mescladas ou cabeçalho em duas linhas | O cabeçalho é a primeira linha, entre as 20 primeiras, com pelo menos 60% das colunas preenchidas. Fora desse padrão, a leitura pode errar as colunas. | Uma tabela por aba, ou aba chave-valor. |
| CSV | O leitor é próprio, simples (RFC 4180, `;` ou `,`). Quebra de linha dentro de campo entre aspas funciona. Arquivo com outro separador (tab, pipe) não. | Suficiente para os CSV de exportação de ERP testados (um deles, o layout do SyGeCom). |
| PDF acima de `paginasMax` (padrão 50) | Lê só as primeiras páginas e avisa. | Aumentar o limite no assistente (até 500), com custo proporcional. |

### Outros limites
- **Base de conhecimento com OCR, sem visão.** PDF escaneado passa pelo OCR local; se o OCR não achar texto, vira erro no relatório da importação.
- **Busca só por palavra-chave.** Paráfrases falham (Fase 2: 35,5% de acerto em 3 resultados). Os embeddings locais continuam sem medição.
- **Checklist por regras.** Usa nome de arquivo, sinônimo e conteúdo. Documento com nome genérico ("scan001.pdf") e pouco texto tende a ficar duvidoso. Isso é seguro (vai para revisão), mas gera trabalho.
- **Exportação completa em memória.** O ZIP do tenant é montado inteiro na memória do servidor. Para um tenant com muitos GB de documentos, precisa virar escrita em fluxo direto para o S3.
- **Termos restritos são literais.** A busca ignora acento e maiúsculas, mas não pega variação de grafia nem abreviação.
- **Auditoria.** Quem tem o papel dono do banco consegue reescrever a cadeia inteira, mas a âncora diária no bucket externo acusa a diferença. O que foi gravado depois da última âncora (até um dia) ainda depende só do banco.

## Custos por página

Premissas do simulador (`server/src/usage/simulate.ts`), usadas até haver medição real:
- 750 tokens por página de texto (cerca de 3.000 caracteres);
- página escaneada ou foto: lida pelo OCR local, conta como página de texto quando vai ao modelo;
- fallback de visão (premissa: 10% das páginas escaneadas): 2.300 tokens de entrada (JPEG de até 1568 px) e 750 de saída (transcrição) por página;
- 1.200 tokens fixos de entrada por execução (instruções, schema, contexto);
- 800 tokens de saída por execução.

Preços de referência de 24/06/2026, câmbio de R$ 5,50, que é uma suposição:

| Modelo (US$ por milhão de tokens, entrada/saída) | Página de texto ou OCR | Página no fallback de visão | Parte fixa por execução |
|---|---|---|---|
| `claude-haiku-4-5` (1 / 5), padrão | R$ 0,0041 | R$ 0,033 | R$ 0,029 |
| `claude-sonnet-5` (2 / 10) | R$ 0,0083 | R$ 0,067 | R$ 0,057 |

O OCR não tem custo de modelo: custa CPU do servidor (cerca de 2,5 s por página).

Exemplos com Haiku 4.5:
- **Fiscal**, NF-e em XML × pedido em XLSX: **R$ 0,00**, porque leitura e conferência são em código. O custo é só de infraestrutura.
- **RH**, pasta de admissão com 8 páginas de texto e 2 fotos, checklist por regras: **R$ 0,00** quando o OCR lê as fotos; cerca de R$ 0,03 por foto que cair no fallback de visão.
- **Financeiro**, 20 páginas de texto, com extração e resumo (duas chamadas, cada uma com o texto inteiro): cerca de R$ 0,22 por execução.

Esses valores são projeção. O custo real fica em `usage_events` a cada execução, e o simulador passa a usar as médias medidas depois de 5 execuções. A tabela de preços precisa ser conferida com o contrato antes da proposta comercial.

## Tempos de processamento

Os tempos foram medidos nos testes, com provedor simulado, banco local e armazenamento em memória. Eles mostram o custo da plataforma, **sem a latência do modelo**:

| Etapa | Tempo |
|---|---|
| Ler PDF de texto, NF-e ou CSV | 1 a 120 ms por arquivo |
| Conferir nota × pedido (5 itens) | cerca de 20 ms |
| Exportar XLSX / PDF e DOCX | cerca de 120 ms / 210 ms |
| Assistente de referência de ponta a ponta (envio, fila, pipeline, gravação) | 160 a 310 ms |
| Exportação completa de um tenant pequeno | cerca de 1,2 s |
| OCR de uma página (PDF escaneado, TIFF, HEIC), CPU deste ambiente | cerca de 2,5 s |
| Conversão de DOC, XLS, ODT ou ODS pelo LibreOffice | cerca de 1,1 s |

**A latência do modelo real não foi medida neste ambiente.** Ela depende do modelo, do tamanho da entrada e da saída e da carga do provedor, e vai dominar o tempo total nas execuções que usam o modelo. O Fiscal, sem modelo, ficou abaixo de meio segundo nos testes. A medição real entra no primeiro piloto: o painel já registra o tempo de processamento de cada execução.

## O que não foi possível

| O quê | Por quê | O que destrava |
|---|---|---|
| Rodar com o modelo real e documentos reais | Não há chave do modelo nem documentos de cliente neste ambiente. | Piloto no ambiente da TheNeil, com a chave e uma amostra real de cada área. |
| Medir embeddings e o NER BERTimbau | HuggingFace segue bloqueado no proxy do ambiente (mesmos quatro hosts da Fase 2). | Liberar os hosts nas configurações de rede do ambiente. |
| `docker build` | Docker Hub continua respondendo 429. O `public.ecr.aws` responde (manifesto e token), mas as camadas das imagens vêm de `d2glxqk2uabbnd.cloudfront.net`, que o proxy recusa (403). | Liberar `d2glxqk2uabbnd.cloudfront.net` junto com `public.ecr.aws`, ou construir numa máquina fora deste ambiente. |

## Checklist de implantação

O checklist ficou genérico e vale para qualquer cliente: `docs/IMPLANTACAO.md` (contrato e SI, infraestrutura, tenant, áreas, pessoas e políticas, bases, assistentes, oportunidades e quick wins, operação do piloto). O que é próprio de cada cliente fica no arquivo de implantação dele. Para a Repet, o primeiro cliente: `implantacoes/repet/` (`tenant.json` para o `create-tenant.ts` e `README.md` com as áreas, os leitores e os ajustes de cada assistente, como as colunas do pedido exportado do SyGeCom).

## Decisões aplicadas depois da revisão

| Decisão | Como ficou | Commits |
|---|---|---|
| 1. OCR local, visão como fallback | OCRmyPDF + Tesseract (por) nas páginas sem texto e nas fotos, com a confiança do hOCR. O texto do OCR passa pela política antes de ir ao modelo. A visão só entra na página abaixo do limiar (`reading.ocrMinConfidence`, padrão 70), com `reading.visionFallback` ligado no assistente e sem proibição na Política de Uso (`allowVisionFallback`). Antes da imagem sair, o texto do OCR passa pela política: bloqueio, aviso não confirmado ou mascaramento impedem o envio. Uso e recusa ficam na auditoria (`leitura_visao_fallback`, `leitura_visao_nao_usada`). TIFF e HEIC pelo ImageMagick com libheif; DOC, XLS, ODT e ODS pelo LibreOffice. DANFE: chave de acesso (DV módulo 11) e "pedir o XML ao fornecedor" sem o XML. Simulador com as novas premissas. | `257eeed`, `18fb9ce` |
| 2. Incidentes | Descrição só para quem reportou e o key user da área (sem key user, o admin do cliente). A TheNeil vê tipo, status, data e a execução ou saída; a descrição chega a ela com escalonamento pelo key user ou no tipo "problema técnico". Toda leitura da descrição fica na auditoria com quem leu. Emails nunca levam a descrição. | `07b1113` |
| 3. Âncora da auditoria | Publicação diária por tenant num bucket S3 com Object Lock em modo compliance, numa conta separada (bucket, papel e retenção por configuração). A verificação compara com a última âncora lida do bucket. Aba Auditoria para o admin do cliente, com histórico e CSV. Validado contra o moto. | `98463bd` |
| 4. Prenome sozinho | Não dispara aviso. As regras já exigiam nome e sobrenome; um teste trava o comportamento. | `93254e3` |

**Limites que ficam:**
- Foto de celular ruim cai abaixo do limiar. Com o fallback desligado (padrão), o texto do OCR segue com aviso e a revisão confere no original.
- O filtro que decide o fallback olha o texto do OCR, que pode ter perdido justamente o dado sensível de uma foto ruim. O assistente de RH de demonstração tem o fallback ligado; a SI decide se mantém.
- As ferramentas (Tesseract, ImageMagick, LibreOffice) processam arquivo de terceiros. Rodam sem shell, com tempo máximo e diretório próprio, mas no mesmo contêiner do servidor. Isolar num contêiner à parte fica como pendência (`PENDENCIAS-SEGURANCA.md`, seção 9).
- A imagem Docker com as ferramentas não foi construída aqui (ver "O que não foi possível"). O `/health/ready` mostra se cada ferramenta está presente.
- O HuggingFace continua bloqueado neste ambiente; a liberação pode valer só em sessão nova.

## Decisões que preciso de você

1. As decisões pendentes da Fase 2 continuam abertas: segunda camada do filtro e embeddings (esperam a rede), e `heroTitle`.
2. O plano da Fase 4 está em `PLANO-FASE-4.md` e espera o seu aval.

## Como conferir

```sh
npm test && npm run test:e2e                 # raiz
cd server && npm run typecheck && npm test   # servidor (precisa de Postgres 16 e Redis)
node src/scripts/seed-demo.ts --amostras ./amostras   # amostras fictícias dos quatro assistentes
```
