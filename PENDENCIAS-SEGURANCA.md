# GreenIA: pendências para a Segurança da Informação

Situação em setembro de 2026. A GreenIA ainda é um protótipo: roda no navegador, sem servidor próprio, e envia o texto ao modelo de IA pelo ambiente de pré-visualização do Claude Design. Este documento reúne o que precisa da sua decisão agora e o que vai precisar de revisão na próxima fase.

## 1. Texto de privacidade

Aparece na tela de login e no resumo da política:

> Suas conversas ficam só nesta sessão. A GreenIA não guarda o histórico em banco de dados.

É verdade no protótipo: o histórico fica só na memória do navegador e some ao sair ou recarregar a página. Mas o texto que a pessoa envia passa pelo provedor do modelo de IA, e o protótipo não controla o que o provedor retém.

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

**Pergunta:** esta cobertura é suficiente como primeira camada para tarefas Verdes?

## 3. O que acontece quando a pessoa confirma um aviso

- O texto é enviado ao modelo exatamente como foi escrito, com o email, telefone, endereço ou nome.
- No protótipo, nada é registrado: não há servidor, log ou auditoria. A resposta aparece na conversa, que fica só na memória do navegador.
- O provedor do modelo recebe o texto nas condições do contrato dele, que o protótipo não controla.

## 4. O que muda na Fase 2 e vai precisar de revisão

- **Filtro no servidor.** O mesmo filtro passa a rodar também no servidor da GreenIA, antes de qualquer chamada ao modelo. O filtro do navegador vira só um aviso antecipado. Cada cliente poderá ajustar a ação por tipo de dado e por assistente, exceto senhas e credenciais, sempre bloqueadas.
- **Registro das confirmações.** Quando a pessoa confirmar um aviso, o servidor registra na auditoria quem confirmou, quando e o tipo de dado. Nunca registra o valor.
- **Segunda camada para nomes e dados em texto livre.** A proposta é um classificador que rode na infraestrutura da TheNeil, sem enviar o texto a terceiros antes da decisão. Opção, custo e taxa de acerto serão apresentados antes de implementar.
- **Retenção.** Conversas livres continuam sem gravação. Saídas de assistentes que exigem evidência passam a ser gravadas por um prazo definido por cliente e apagadas ao fim dele.
- **Provedor do modelo.** O provedor e o modelo passam a ser escolhidos por cliente, com chaves guardadas só no servidor. Retenção no provedor, região de processamento e o contrato necessário para a classe Amarela vão precisar da sua revisão.
- **Login.** Entrar passa a exigir login corporativo real (Microsoft, Google ou código enviado ao email corporativo), com domínios permitidos por cliente.
