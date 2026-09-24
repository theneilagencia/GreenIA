# Plano da Fase 3: capacidades do Prumo Discovery

A Fase 3 foi confirmada em 24/09/2026. Este plano registra a ordem, as bibliotecas e o modelo de dados que guiam os commits. Não é um pedido de aval: o prompt não pede plano prévio para esta fase.

## Princípio

Nenhuma melhoria ganha código próprio. Um assistente é uma **definição versionada** (JSON validado por Zod) que encadeia **blocos genéricos**. Os quatro assistentes de referência (3.10) são o teste disso: se algum precisar de código específico, a falha é da plataforma, e o bloco é generalizado.

## Ordem dos commits

1. **Auditoria com hash encadeado (3.5).** Vem primeiro porque todo o resto registra nela.
2. **Assistentes por configuração (3.1):** schema v2, versões e pacote portátil em Markdown.
3. **Blocos (3.2).** Um commit por grupo, cada bloco com seus testes:
   1. leitura;
   2. extração estruturada;
   3. conferência e checklist;
   4. classificação, organização e ZIP;
   5. consulta, busca e resumo;
   6. exportação.
4. **Execução do pipeline:** tabela de execuções, arquivos de entrada, executor na fila, versão, hashes e fontes.
5. **Revisão humana (3.3).**
6. **Medição antes e depois (3.4).**
7. **Política de Uso de IA e incidentes (3.6).**
8. **Consumo, tabela de preços configurável e simulador (3.7).**
9. **Implantação (3.8):** usuários por CSV, documentos em lote, guia rápido e roteiro.
10. **Exportação completa e exclusão do tenant (3.9).**
11. **Assistentes de referência (3.10),** de ponta a ponta com o provedor simulado.
12. **Telas:** execução, revisão lado a lado, resultados, incidentes, política e painel de assistentes.
13. **`RELATORIO-FASE-3.md`.**

## Bibliotecas (npm, licenças permissivas)

| Uso | Biblioteca |
|---|---|
| Texto e páginas de PDF | `unpdf` (pdf.js empacotado para servidor) |
| DOCX para texto | `mammoth` |
| Ler e gerar XLSX | `exceljs` |
| XML de NF-e (determinístico, sem modelo) | `fast-xml-parser` |
| Validar a saída contra o JSON Schema do assistente | `ajv` |
| Gerar PDF | `pdfkit` |
| Gerar DOCX | `docx` |
| ZIP organizado e exportação do tenant | `jszip` |
| Diff da saída editada | `diff` |

- **PDF escaneado e imagens** vão para a visão do modelo, que lê imagem e PDF direto. Não há OCR local: nenhum motor de OCR em português instala sem baixar modelos de fora do npm. O relatório registra isso.
- **CSV** usa um leitor próprio (RFC 4180, com `;` ou `,`, BOM e aspas), porque o CSV exportado do SyGeCom é simples e não justifica uma dependência.

## Modelo de dados (novas migrações)

- **`audit_log`:** ganha `seq` (por tenant), `prev_hash` e `hash`, calculados por gatilho no banco. A função `audit_verify(tenant)` refaz a cadeia e aponta o primeiro registro quebrado.
- **Definição do assistente v2:**
  - identificação e dono;
  - objetivo, instruções e exemplos;
  - entradas (texto, tipos e tamanho de arquivo, fontes da base);
  - política e retenção;
  - `pipeline` (lista de blocos com parâmetros);
  - `output` (formato e JSON Schema);
  - `review` (obrigatória por padrão, e quem revisa);
  - `metrics` (indicadores).

  A v1 da Fase 2 continua aceita e é promovida para a v2 na leitura.
- **`runs`:** execuções, com assistente e versão, usuário, área e status (`processando`, `rascunho`, `erro`, `aprovado`, `aprovado_com_edicao`, `rejeitado`). Guarda:
  - a saída original e a editada, o diff e o motivo da rejeição;
  - a origem de cada campo e as fontes da base;
  - provedor e modelo, hashes, tempos, páginas e consumo;
  - `expires_at`, pela retenção.
- **`run_files`:** arquivos de entrada no S3, com sha256, tipo e páginas.
- **`baselines`:** indicador, valor, unidade e origem (`medido`, com período e método, ou `informado`, com quem informou).
- **`assistant_decisions`:** `manter`, `descartar` ou `ampliar`, com data, responsável e justificativa.
- **`usage_policies` e `policy_acks`:** Política de Uso de IA versionada e a ciência de cada pessoa por versão.
- **`incidents`:** tipo, descrição, área, status (`aberto`, `em_analise`, `resolvido`, `encerrado`) e histórico.
- **`price_tables`:** preços por modelo e por página, com vigência e editáveis pela plataforma. Substituem a tabela fixa da Fase 2.
- **`tenant_deletions`:** comprovante de exclusão (fora das tabelas do tenant, porque sobrevive a ele).
