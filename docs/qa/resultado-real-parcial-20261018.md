# Primeiro retorno da execução real

Fonte: trecho enviado pelo usuário em `Texto colado(20261018-131409).txt`. O arquivo começa no meio dos recibos, portanto não contém o JSON integral. O log informa SHA-256 do relatório completo `9da5c1fcfdd431fe9cd5d83275e6185cea1f2fca4a9fa60957bf0b81f47ebe4c`; não é possível recalcular esse hash com o trecho recebido.

O log traz 49 tentativas HTTP 200, 48 inferências com recibo e US$ 0,3169843500000001 de custo informado pelo provedor. Um custo permanece pendente. Não houve consulta independente ao extrato do provedor. O custo total não é conhecido e não deve ser reportado como US$ 0,31698435.

Nove cenários principais têm evidência automatizada positiva sem custo pendente: contrato, fornecedores, ata, relatório, concorrentes, currículos, reclamações, não conformidades e checklist. Isso não substitui aceitação das entregas e inspeção dos arquivos.

## Ocorrências independentes

- `03-planilha`: o conferente reprovou o resultado por insuficiência na seção de maiores gastos, percentual e critério de comparação; também houve sinalização de invenção. O texto entregue não foi incluído no anexo. Não se presume que o julgamento da própria IA esteja certo. É necessário confrontar esse material com a planilha sintética determinística antes de alterar o produto
- `09-pendencias`: execução bloqueada com HTTP 403, sem inferência na etapa de execução. O roteiro antigo não preservou o código e o detalhe do bloqueio no resumo. O motivo exato permanece desconhecido; nenhuma autorização será relaxada para fazer o teste passar
- `12-apresentacao`: houve resposta de imagem HTTP 200 via JSON. O coletor antigo só procurava eventos SSE, por isso perdeu o recibo e deixou o custo pendente. É um defeito confirmado da instrumentação, não prova de ausência de cobrança nem de falha do gerador. A marcação `utilizavel: true` desse cenário não vale como aprovação completa
- Após esse recibo pendente, as novas inferências foram bloqueadas corretamente. O roteiro continuou percorrendo os cenários e registrou falhas derivadas e fallback heurístico. E-mail, social, pedido vago, surpresas e classes não recebem aprovação nem são tratados como defeitos independentes com essa evidência
- O encerramento com código 2 representa reprovação ou incompletude. A stack extensa com `data:text/javascript;base64` é o endereço do bootstrap importado em memória, não uma chave vazada

## Correção do roteiro

O coletor agora distingue JSON e SSE, preservando o corpo original para a aplicação, e registra custo, geração, tokens, provedor e modelo retornado de ambos. JSON sem custo continua pendente; não há conversão para zero. A entrega com custo pendente não é aprovada. A parada é propagada ao final da coleta, e os casos posteriores recebem `nao_executado`, sem novas chamadas ou interpretações heurísticas causadas pelo coletor.

O próximo bootstrap pode retomar o relatório em `/tmp/greenia-candidata-QlzQ2v/qa-candidato-saida`, conferir o hash informado, imprimir o material anterior da planilha e selecionar os seis principais pendentes, mantendo os nove anteriores fora da nova rodada. As surpresas e classes ainda precisam ser executadas. Essa seleção não é anunciada como uma bateria completa nova; a liberação de produção permanece falsa. Se a pasta anterior não existir mais, a retomada interrompe antes de consumir IA.

Nove testes locais do coletor passaram, incluindo imagem JSON com recibo e preservação do corpo, JSON sem custo, JSON inválido e SSE dividido em blocos com CRLF e último evento sem quebra de linha. Uma regressão passa pelo próprio `criarOpenRouter().gerarImagem`, executa duas chamadas simuladas consecutivas e confirma que o recibo da primeira não bloqueia a segunda. Não são testes de IA real nem são somados às contagens anteriores. O runtime do produto não foi alterado nesta correção.

Referência determinística calculada localmente a partir de `planilha()` em `qa-cenarios.mjs`, sem IA: 120 lançamentos; previsto de R$ 1.682.153; realizado conhecido de R$ 1.801.408; quatro realizados ausentes (`L041`, `L077`, `L095`, `L109`). O maior lançamento é `L118`, Energia, CC-101: R$ 207.036 realizados contra R$ 23.004 previstos, correspondendo a 11,4930099% do realizado conhecido. Por categoria, Energia soma R$ 441.567, ou 24,5123259%. Ausências não são gastos zero; orçamento total e realizado conhecido não abrangem o mesmo conjunto de linhas. Esses valores servem para conferir o material entregue antes de atribuir erro à análise ou à conferência.
