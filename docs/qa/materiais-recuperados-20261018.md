# Correções após ler os materiais reais do QA

Fonte: saída entregue em `Texto colado(20261018-135931).txt`, contendo os arquivos sintéticos salvos da rodada `c54a621`. A leitura não fez novas inferências nem consultou dados de clientes. Nenhuma publicação em produção foi realizada.

## Facilities U05

Data-base explícita: 24/10/2023. Os registros abertos há mais de 15 dias são `OS-4401`, `OS-4412`, `OS-4420` e `OS-4435`. A última tem 17 dias e responsável vazio: deve aparecer com esse campo não informado. O resultado a excluiu por essa ausência e não apresentou o agrupamento por tipo solicitado. A reprovação é sustentada pelos dados, não apenas pela nota do conferente.

Foram corrigidos dois pontos do contrato: a descrição usada na conferência e o pedido de correção tratavam as colunas sugeridas pelo arquétipo como se tivessem sido escolhidas manualmente. Agora a origem `sugestao` permite os campos exigidos pelo objetivo e pelo agrupamento. Colunas de origem `pessoa` e `exemplo` continuam fixas. A instrução de ausências e a correção exigem preservar uma linha elegível quando apenas outro campo está vazio. A regra de preservar dados distingue valores originais de cálculos derivados corretos, eliminando o conflito que levava a retirar contas legítimas.

O oráculo independente do caso U05 usa a data de extração, exige os quatro IDs dentro das tabelas, rejeita linhas fora do filtro e confere o tipo de serviço e a célula de responsável ausente. Citar `OS-4435` numa nota sobre exclusão não equivale a entregar a linha. O oráculo é específico dessa fixture e não é anunciado como compreensão universal de tabelas.

## Auditoria U10

O documento fala em **prontuários de treinamento**, não clínicos. O detector disparava pelo radical `prontuario` isolado. A expressão exata de treinamento deixa de ser um sinal de saúde quando não há sinais médicos no mesmo material. O restante da análise continua ativo: prontuário clínico, exame admissional, saúde ocupacional, enfermagem, medicamentos, confidencialidade explícita, dados pessoais e credenciais não recebem liberação por essa exceção. A política da empresa e as rotas autorizadas não foram desligadas. O documento sintético completo agora não é classificado como saúde; isso não é uma certificação geral de classificação por palavras.

## Atendimento U09 e e-mail

O material U09 é um conjunto de incidentes, incluindo API com erro, senha esquecida sem informar a senha, código de barras, divergências de valores e perda de acesso. Nenhuma resposta foi produzida antes do bloqueio Advanced. Mantém-se a preparação corrigida no commit anterior: autorização explícita no banco fictício, preços consultados internamente, nenhuma exposição financeira ao cliente. Não há evidência para declarar que a classificação final do atendimento foi executada ou aprovada.

O texto de e-mail confirma que o canal email foi usado. O teste antigo não deveria ter rejeitado esse canal. O material contém pré-cabeçalho e um rótulo de aprovação, mas não representa envio de email nem uma integração funcional de aprovação. A correção do teste não transforma essas ações em capacidades executadas.

## Retomada e arquivos

A seleção agora combina principais, surpresas e classes pendentes, sem voltar a executar casos `fora_desta_rodada` nem as classes positivas. Também não herda o antigo PASS da planilha sem conferência numérica. Para a rodada em `hd7JM0`, a seleção verificada é: `03-planilha`, `09-pendencias`, `13-email`, `U03`, `U05`, `U09`, `U10`; classes pendentes: Rápido em contrato, fornecedores e reunião e Advanced nos cinco trabalhos. O Rápido bloqueado não é transformado em aprovação presumida: a próxima execução guardará os requisitos e o motivo de bloqueio do roteamento para classificar esse controle com evidência.

Os casos surpresa retomados reutilizam o material capturado da rodada anterior, sem gerar outra amostra paga. O formato do arquivo anterior é separado pelo delimitador gravado pelo próprio roteiro; nos quatro casos desta retomada, os resultados bloqueados são vazios e o resultado U05 não tem delimitadores internos. Se não for possível separar, o caso para sem gerar silenciosamente outro exemplo. O material reutilizado tem origem e SHA-256 no relatório e também é salvo separadamente. Assim, a retestagem de U05 usa os mesmos registros e a mesma data-base que demonstraram a falha.

Os arquivos produzidos nas próximas execuções são copiados do banco sintético para `artefatos/` antes de sua exclusão, com bytes, MIME e hash SHA-256. Essa preservação **não comprova** download HTTP, fidelidade do conteúdo ou qualidade visual; esses pontos permanecem explicitamente pendentes. O relatório continua com `liberacaoProducao: false`.

## Verificações executadas

- **1.222 testes completos de serviços: 1.222 aprovados, zero falhas, cancelamentos e ignorados**, em 231,335 segundos, com Chromium Headless Shell local disponível. Inferência simulada; rede HTTP local, SQLite, OCR e composição reais conforme os testes
- **54 verificações focadas finais aprovadas**, incluindo os três novos casos de seleção e material da retomada, adicionados depois do início da expansão dos arquivos da rodada completa. Não são somadas como 54 cenários adicionais à contagem global
- Sintaxe dos scripts e `git diff --check` aprovados

O runtime alterado (`src/filtro.js` e `src/quickwin-construtor.js`) já estava na versão final ao iniciar a rodada completa. Alterações posteriores se limitaram ao coletor, à seleção e à preservação dos arquivos do QA. A nova rodada completa não apaga a rodada interrompida documentada anteriormente. Não houve nova bateria completa de navegador nem nova inferência real nesta continuação.

Próxima etapa: revalidar os casos pendentes com IA real na candidata corrigida, com a mesma execução isolada no serviço existente, recolher os arquivos e conferir as entregas antes de decidir a liberação.
