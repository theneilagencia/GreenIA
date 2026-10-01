# Política de Privacidade da GreenIA

> **RASCUNHO PARA REVISÃO. NÃO PUBLICADO.** Este texto descreve o comportamento técnico da GreenIA como implementado e
> auditado (Etapas 1 a 3). As marcações têm três tipos:
> - **[PENDÊNCIA JURÍDICA]**: depende de decisão jurídica.
> - **[PENDÊNCIA DE GOVERNANÇA]**: depende de decisão de produto ou retenção.
>
> Nenhuma base legal, papel jurídico ou prazo foi preenchido por inferência.
>
> **Correspondência com a produção:** este texto descreve a versão da GreenIA que inclui a governança de acesso da
> equipe de operação, a consolidação do WAL e a política de retenção (Etapas 1 a 3), ainda **não publicada em
> produção** (produção em `227fd36` em 2026-10-01). O documento só pode ser publicado junto com o deploy dessa versão.

Versão: rascunho 0.3, de 1º de outubro de 2026 · Vigência: 30 de novembro de 2026 (a data não autoriza a publicação antes da conclusão do plano de liberação)

## 1. Quem somos e como falar conosco

A GreenIA é oferecida por **NEIL INOVAÇÃO E TECNOLOGIA LTDA** ("TheNeil", "nós"), pessoa jurídica de direito privado:
- **CNPJ:** 37.749.373/0001-70
- **Sede:** Rua G, nº 277, Montserrat, Betim/MG
- **Contato:** hello@theneil.com.br · www.theneil.com.br
- **Canal de privacidade e de atendimento aos titulares:** hello@theneil.com.br (privacidade, pedidos de titulares,
  contato com o encarregado e qualquer solicitação relacionada a dados pessoais)
- **Encarregado pela proteção de dados (DPO):** Vinicius Guimaraes · hello@theneil.com.br

Neste documento:
- **"Cliente":** a empresa que contrata a GreenIA;
- **"usuário":** a pessoa autorizada pelo Cliente a usar o ambiente.

## 2. A quem esta Política se aplica

- **Usuários** dos ambientes das empresas clientes, inclusive os administradores.
- **Pessoas cujos dados aparecem no conteúdo** que os usuários inserem (por exemplo, clientes ou colaboradores da
  Cliente citados numa conversa ou num documento).
- **Visitantes** da página de vendas da GreenIA e quem envia o formulário de contato.
- **Equipe de operação** da TheNeil, quanto aos registros de acesso.

O Cliente pode ter sua própria política de privacidade e sua política de uso de IA (disponível dentro do
ambiente, em "Política de uso de IA"), que valem em conjunto com esta.

## 3. Papéis no tratamento de dados

O papel de cada parte depende do tratamento. A matriz abaixo é uma **proposta para validação jurídica**: não forçamos
uma resposta onde a técnica não basta.

| Tratamento | Finalidade | Quem define a finalidade | Papel provável | Pendência |
|---|---|---|---|---|
| Conteúdo inserido no ambiente (mensagens, anexos, documentos, quick wins, respostas) | Uso da IA pelo Cliente | Cliente | Cliente: controlador. TheNeil: operadora | [PENDÊNCIA JURÍDICA: confirmar e formalizar em acordo de tratamento (DPA)] |
| Configurações do ambiente (regras de dados, política de uso, papéis, retenção) | Governança do uso pelo Cliente | Cliente | Idem | Idem |
| Contas dos usuários (email, nome, papel, vínculo) e autenticação | Dar acesso ao ambiente do Cliente e proteger a plataforma | Cliente (quem entra) e TheNeil (como a autenticação funciona) | Misto: operadora para o acesso; possível controladora para a segurança da plataforma | [PENDÊNCIA JURÍDICA] |
| Registros de consumo (créditos por área, pessoa e quick win) | Controle de uso pelo Cliente; cobrança pela TheNeil | Ambas | Misto | [PENDÊNCIA JURÍDICA] |
| Eventos de atividade do ambiente | Prestação de contas ao Cliente (tela "Atividade") | Cliente | Operadora | [PENDÊNCIA JURÍDICA] |
| Auditoria da plataforma (alterações administrativas, IP e navegador de quem agiu) | Segurança e prestação de contas da plataforma | TheNeil | Possível controladora | [PENDÊNCIA JURÍDICA] |
| Acessos e exportações da equipe de operação | Segurança, transparência e responsabilização da operação | TheNeil (e visível para o Cliente) | Possível controladora | [PENDÊNCIA JURÍDICA] |
| Formulário de contato da página de vendas | Atendimento comercial | TheNeil | Controladora | [PENDÊNCIA JURÍDICA: confirmar] |
| Logs técnicos do servidor e do provedor | Operação, diagnóstico e segurança | TheNeil | Possível controladora | [PENDÊNCIA JURÍDICA] |
| Relatos de problema ("Reportar problema") | Suporte interno do Cliente | Cliente | Operadora | [PENDÊNCIA JURÍDICA] |

## 4. Que dados tratamos

### 4.1 Inventário

| Categoria | Exemplos | Onde fica | Armazenado? | Enviado a terceiros? |
|---|---|---|---|---|
| Conta | Email, nome (quando informado), empresa, papel e permissões, status | Banco da plataforma e banco da empresa | Sim | Email: só ao serviço de email, para enviar códigos e avisos |
| Domínios autorizados | Domínios de email do Cliente | Banco da empresa | Sim | Não |
| Autenticação | Código de acesso (guardado só como hash), sessões (só hash do token), cookies de sessão | Banco da plataforma; navegador | Sim (código vale 10 min, sessão até 12 h; acesso da equipe de operação até 60 min) | O código vai por email |
| Conversas e prompts | Mensagens dos usuários | Banco da empresa | Sim, pelo prazo de retenção da empresa, salvo tipos de dado marcados para não guardar | Sim, ao recurso de IA (seção 6) |
| Respostas | Texto gerado pela IA | Banco da empresa | Sim (mesma regra) | Não |
| Anexos | Texto extraído dos arquivos enviados | Banco da empresa | Sim (só o texto, mesma regra) | O texto segue para a IA como parte do pedido |
| Texto extraído por OCR | De imagens e PDFs escaneados, no servidor da GreenIA | Banco da empresa (como anexo) | Sim (mesma regra); a imagem não é guardada | O texto, sim; a imagem, não |
| Documentos da base de conhecimento | Texto e trechos indexados | Banco da empresa | Sim, até serem removidos | Os trechos usados numa resposta seguem para a IA |
| Quick wins | Instruções, regras, formato, arquivos de apoio, versões e avaliações | Banco da empresa | Sim | Instruções e arquivos usados seguem para a IA |
| Configurações | Regras de dados, política de uso, modelos liberados, limites, marca | Bancos da empresa e da plataforma | Sim | Não |
| Relatos de problema | Tipo e texto livre escrito pelo usuário, com nome e email | Banco da empresa; emails dos admins | Sim, sem prazo de eliminação | Pelo serviço de email, aos admins da empresa |
| Consumo | Créditos e custo por pedido, área, pessoa, quick win e classe | Banco da empresa | Sim | Não |
| Eventos de atividade | Tipo do evento, pessoa, data, metadados (por exemplo, tipos de dado identificados num envio bloqueado). Sem o texto | Banco da empresa | Sim, sem prazo de eliminação | Não |
| Auditoria da plataforma | Quem, o quê, antes e depois, quando, IP e navegador | Banco da plataforma | Sim, sem prazo de eliminação | Não |
| Acessos da equipe de operação | Operador (email), tipo, justificativa, início, fim, duração, status, resultado do aviso; IP e navegador (estes não aparecem para a empresa) | Banco da plataforma | Sim, sem prazo de eliminação | Aviso por email aos admins |
| Exportações | Operador, tipo, justificativa, data, tamanho, sucesso ou falha | Banco da plataforma | Sim, sem prazo de eliminação | O arquivo exportado é entregue a quem pediu (seção 12) |
| Formulário comercial | Nome, email, empresa, cargo, faixa de pessoas, mensagem | Banco da plataforma | Sim (seção 14) | Pelo serviço de email, aos admins da plataforma |
| Logs técnicos | Mensagens de operação do servidor (falhas, rotinas, avisos) | Logs do provedor de hospedagem | Sim, pelo prazo do provedor | Ficam no provedor |
| Navegação na página de vendas e nas telas | Endereço IP e navegador, ao carregar as fontes tipográficas | Google Fonts | Não armazenamos | Sim, ao Google (seção 19) |

### 4.2 Dados processados sem ficar guardados

O Cliente pode marcar tipos de dado como "processar sem guardar". A mensagem que os contém, os anexos e a
resposta são processados e enviados à IA, mas não entram no histórico nem no banco.

### 4.3 Dados bloqueados antes do envio

Quando a regra da empresa manda não enviar um tipo de dado, ou quando a GreenIA reconhece uma senha ou chave de acesso,
o pedido não segue para a IA. O conteúdo bloqueado não é guardado; fica registrado só o evento, com os tipos
identificados e sem o texto.

## 5. Dados sensíveis e detecção

5.1. Antes do envio, a GreenIA confere cada mensagem e cada anexo e reconhece, **por padrões e palavras**:
- CPF, RG, CNPJ, cartões, agência e conta, chaves PIX aleatórias;
- emails e telefones pessoais;
- termos que indicam dado pessoal sensível (como laudo médico, CID ou biometria);
- marcação de confidencial;
- senhas e chaves de acesso.

5.2. Para cada tipo, o Cliente escolhe: processar normalmente, só com proteção ou não enviar. Senhas e chaves
de acesso reconhecidas são sempre bloqueadas, inclusive em documentos da base, arquivos de quick win e no histórico da
conversa.

5.3. **A detecção tem limites.** Ela não reconhece todos os dados pessoais ou sensíveis. Exemplos:
- um RG precisa vir identificado como RG;
- uma chave PIX aleatória precisa estar perto da palavra "pix";
- formatos fora dos padrões (por exemplo, CPF com espaços ou PIX por telefone) podem não ser reconhecidos.

5.4. **Informações sigilosas:**
- Com a opção de sigilo ligada pelo Cliente, a conversa sigilosa só usa recursos de IA autorizados para esse
  fim; se não houver, nada é enviado.
- Com a opção desligada (padrão), o conteúdo sigiloso não é enviado.

## 6. Inteligência artificial e fornecedores de modelos

6.1. Para responder, a GreenIA envia o pedido a um recurso de IA por meio do **OpenRouter**, serviço de acesso a modelos
de diversos fabricantes. O pedido é composto por:
- a mensagem;
- os anexos em texto;
- o histórico da conversa;
- as instruções do quick win;
- os trechos de documentos usados.

Os fabricantes envolvidos dependem dos modelos que cado Cliente libera.

6.2. Antes do envio, valem as regras da seção 5.

6.3. **Filtro "sem coleta":** por padrão, toda chamada pede ao OpenRouter que use só fornecedores que ele classifica
como não coletando os dados, segundo as políticas que esses fornecedores informam. Esse filtro depende de informação
declarada e disponibilizada pelos fornecedores. **Não é uma verificação independente da GreenIA nem uma garantia
contratual.** O administrador do Cliente pode desligá-lo.

6.4. Para informações sigilosas, a GreenIA só usa rotas autorizadas cujos atributos declarados (por exemplo, retenção
zero e ausência de uso para treino) atendem aos requisitos, com o fornecedor fixado. Esses atributos são declarados
pelos fornecedores.

6.5. A forma como o OpenRouter e cada fabricante tratam os dados é regida pelas políticas deles. [PENDÊNCIA JURÍDICA:
termos contratuais aplicáveis entre a TheNeil e o OpenRouter, e referência às políticas dos fabricantes.]

## 7. Hospedagem e transferência internacional

7.1. A GreenIA é hospedada no **Render**, em servidores nos **Estados Unidos** (região Virgínia), com disco persistente e
cópias diárias do disco feitas pelo provedor.

7.2. Os pedidos à IA passam pelo OpenRouter e pelos fabricantes dos modelos, que podem estar fora do Brasil. [PENDÊNCIA
JURÍDICA: localização dos fornecedores conforme documentação deles; não foi comprovada nesta auditoria.]

7.3. **Há, portanto, transferência internacional de dados pessoais.** [PENDÊNCIA JURÍDICA: mecanismo aplicável à
transferência internacional, cláusulas ou documentos necessários e eventual DPA com o Cliente e com os
fornecedores.]

## 8. Quem pode ver as conversas

- **Colegas:** um usuário não vê as conversas de outro.
- **Administradores do Cliente:** nenhuma tela da GreenIA mostra a eles o conteúdo das conversas dos usuários;
  as telas de administração mostram dados de uso.
- **Equipe de operação, pela interface:** entra com o perfil de administrador, que também não mostra o conteúdo das
  conversas.
- **Exportação:** a exportação completa do banco do ambiente (seção 12) contém as conversas.
- **Acesso técnico:** o acesso à infraestrutura alcança o banco.
- **Relatos de problema:** o texto escrito em "Reportar problema" aparece para os administradores do Cliente e é
  enviado a eles por email. Não escreva informação sigilosa nesse campo.

## 9. Acesso da equipe de operação

9.1. **Acesso operacional.** Para suporte, solicitação do Cliente, incidente ou outro motivo, a equipe de operação
pode entrar no ambiente pelo console da plataforma:
- **Motivo:** só com um tipo (suporte, solicitação do cliente, incidente ou outro) e uma justificativa por escrito.
- **Prazo:** o acesso dura no máximo 60 minutos.
- **Registro e visibilidade:** fica registrado e aparece na hora para o Cliente em "Acessos da equipe de
  operação", com operador, tipo, justificativa, início, fim, duração e status.
- **Aviso:** os administradores recebem aviso por email, quando o envio está disponível.
- **Encerramento:** um administrador do Cliente pode encerrar o acesso a qualquer momento.
- **Sem aprovação prévia:** o acesso operacional **não depende, hoje, de aprovação prévia do Cliente**.

9.2. **Exportação.** A equipe de operação pode exportar uma cópia completa do banco do ambiente, com tipo e justificativa
registrados. Cada exportação aparece na mesma tela e gera aviso. Também não depende de aprovação prévia.

9.3. **Login como usuário com vínculo.** Se uma pessoa da TheNeil for cadastrada como usuária de um ambiente (por convite
ou pelo console), ela entra como qualquer usuário, com o papel recebido, sem poderes de operação e sem acesso às
conversas de outras pessoas. A inclusão aparece na lista de usuários e na auditoria. É um risco residual conhecido: esse
caminho não passa pelo fluxo de acesso operacional (motivo e prazo). Controles adicionais estão previstos para fase
futura.

## 10. Retenção

### 10.1 Conteúdo no ambiente ativo

- As conversas ficam guardadas pelo prazo de retenção que o Cliente define (de 1 a 3.650 dias sem atividade;
  padrão de 90 dias) e são apagadas automaticamente depois disso.
- O usuário pode apagar as próprias conversas a qualquer momento.
- Documentos e quick wins ficam até serem removidos.
- Ao excluir, o dado deixa de ficar disponível na aplicação e é removido do banco em uso. O espaço é zerado e o arquivo
  temporário de gravação (WAL) é consolidado logo após a exclusão, com uma rotina de hora em hora como salvaguarda.

### 10.2 Cópias de segurança

> **Situação:** política técnica implementada, **ainda não ativada em produção**. Os prazos abaixo passam a valer a
> partir da ativação da limpeza no deploy controlado [PENDÊNCIA DE GOVERNANÇA: data de ativação]. Até lá, a cópia diária
> do disco feita pelo provedor (7 dias) e a rotação dos backups automáticos (7 cópias por banco) já funcionam; a
> eliminação por idade, a de backups manuais e a da cópia de ambiente excluído ainda não.

| Camada | Prazo da camada |
|---|---|
| Backup automático diário | Até 7 dias |
| Cópia diária do disco feita pelo provedor (Render) | 7 dias após a captura |
| Backup manual de manutenção | 30 dias desde a criação |
| Cópia de recuperação de ambiente excluído | 30 dias desde a exclusão |

As cópias do provedor incluem os backups locais. Com a limpeza ativa, no pior caso operacional, um dado excluído pode permanecer:
- até **15 dias** nas cópias diárias;
- até **38 dias** em backup manual ou na cópia de recuperação de um ambiente excluído.

### 10.3 Preservação

Cópias preservadas por obrigação legal, investigação de incidente ou outra justificativa registrada (com motivo,
responsável e data) ficam fora desses prazos enquanto a preservação for necessária.

### 10.4 Armazenamento físico

Os prazos acima valem para as cópias geridas pela plataforma e pelo provedor. **Não são garantia de destruição física de
todos os blocos de armazenamento:** o provedor pode manter blocos já liberados, fora do alcance da aplicação, até que
sejam reutilizados.

### 10.5 Registros sem prazo

Os seguintes registros **ainda não têm prazo final de eliminação**:
- eventos de atividade;
- consumo;
- auditoria da plataforma;
- acessos e exportações da equipe de operação;
- relatos de problema;
- contatos comerciais (limitados aos 500 mais recentes).

Eles não guardam o conteúdo das conversas, mas guardam metadados, emails e, no caso dos acessos, as justificativas.

[PENDÊNCIA DE GOVERNANÇA: definir prazos, ou aprovação jurídica de redação transparente de guarda "enquanto necessário
para segurança, operação e cumprimento de obrigações". Esta Política não deve ser publicada sem essa decisão.]

## 11. Suspensão, cancelamento e exclusão definitiva

- **Suspensão:** ninguém do Cliente entra no ambiente, as sessões são encerradas e os dados continuam guardados.
- **Cancelamento:** o ambiente é encerrado para os usuários, e os dados continuam guardados até a exclusão definitiva.
  [PENDÊNCIA DE GOVERNANÇA / JURÍDICA: prazo entre o cancelamento e a exclusão definitiva. Hoje não há prazo
  automático.]
- **Exclusão definitiva:** feita pela TheNeil depois do cancelamento, com confirmação. A plataforma guarda uma cópia de
  recuperação e a elimina 30 dias depois, salvo preservação (10.3), a partir da ativação da limpeza em produção (10.2). As cópias diárias seguem a seção 10.2.

[PENDÊNCIA JURÍDICA: devolução dos dados ao Cliente no encerramento.]

## 12. Exportações

- **Quem exporta:** a exportação completa do banco de um ambiente é feita pela equipe de operação, com tipo e
  justificativa.
- **Registro:** cada exportação, com sucesso ou falha, aparece em "Acessos da equipe de operação" e gera aviso aos
  administradores do Cliente.
- **Fora do servidor:** o arquivo exportado deixa o servidor e não segue a política de retenção da seção 10. A guarda e a
  eliminação ficam sob a responsabilidade de quem o recebeu. [PENDÊNCIA DE GOVERNANÇA: política própria de guarda,
  entrega e eliminação de arquivos exportados.]

## 13. Emails

A GreenIA envia emails para:
- códigos de acesso (login);
- convites;
- avisos de consumo (80% e esgotamento);
- avisos de acesso e exportação pela equipe de operação;
- relatos de problema (aos administradores do Cliente);
- contatos comerciais (aos administradores da plataforma);
- avisos administrativos da plataforma.

O envio usa o servidor de email da plataforma ou, se o Cliente configurar, o servidor de email da própria
empresa. Os emails que saem do ambiente de uma empresa não levam o nome da plataforma (marca branca).

[PENDÊNCIA: identificar o provedor real do servidor de email da plataforma em produção; não foi comprovado nesta auditoria.]

## 14. Formulário comercial

- **Campos:** nome, email, empresa, cargo (opcional), faixa de pessoas na empresa (opcional) e mensagem (opcional).
- **Finalidade:** responder ao contato e marcar apresentação.
- **Destino:**
  - fica no banco da plataforma GreenIA, que mantém os 500 contatos mais recentes;
  - é enviado por email aos administradores da plataforma.
- **IP:** não é guardado com o contato. O servidor usa o IP só em memória, por uma hora, para limitar o envio a 5
  contatos.

[PENDÊNCIA DE GOVERNANÇA: prazo de guarda dos contatos comerciais (hoje, só o limite de quantidade).]

## 15. Bases legais

[PENDÊNCIA JURÍDICA: a tabela abaixo é uma **proposta para revisão jurídica**. Não publicar bases legais sem aprovação.]

| Tratamento | Finalidade | Base legal provável (proposta) | Confirmação jurídica |
|---|---|---|---|
| Conteúdo no ambiente | Uso da IA pelo Cliente | Definida pelo Cliente, como controlador | Necessária |
| Contas e autenticação | Execução do contrato com o Cliente; segurança | Execução de contrato / legítimo interesse | Necessária |
| Consumo e cobrança | Controle de uso e faturamento | Execução de contrato | Necessária |
| Auditoria e acessos da operação | Segurança e prestação de contas | Legítimo interesse / cumprimento de obrigação | Necessária |
| Logs técnicos | Operação e segurança | Legítimo interesse | Necessária |
| Formulário comercial | Atendimento a pedido do titular | Procedimentos preliminares a contrato, a pedido do titular / legítimo interesse | Necessária |
| Fontes tipográficas (Google Fonts) | Exibição da página | [PENDÊNCIA JURÍDICA] | Necessária |

## 16. Direitos dos titulares

16.1. O titular pode pedir, nos termos da LGPD:
- confirmação da existência de tratamento;
- acesso, correção, anonimização, bloqueio ou eliminação;
- portabilidade;
- informação sobre compartilhamento;
- revisão de decisões automatizadas, quando aplicável.

16.2. **Quando o dado está no ambiente de umo Cliente** (por exemplo, conversas e documentos), a empresa
cliente decide sobre esse tratamento, e o pedido deve ser dirigido a ela. A TheNeil apoia o Cliente conforme o
contrato. [PENDÊNCIA JURÍDICA: confirmar este encaminhamento.]

16.3. **Canal e procedimento:**
- **Canal:** hello@theneil.com.br, aos cuidados do encarregado, Vinicius Guimaraes
- **Responsável:** o encarregado, Vinicius Guimaraes
- **Procedimento e prazo de resposta:** [PENDÊNCIA JURÍDICA]
- **Verificação de identidade:** [PENDÊNCIA JURÍDICA]

Não há atendimento automatizado desses pedidos na plataforma.

## 17. Segurança

Controles implementados:
- banco de dados separado por empresa;
- papéis e permissões;
- acesso por código de uso único, sem senha;
- regras de dados antes do envio e bloqueio de senhas e chaves reconhecidas;
- auditoria administrativa;
- acesso operacional com motivo, prazo de até 60 minutos, visibilidade e encerramento pela empresa;
- exclusão com zeragem e consolidação do WAL;
- cópias de segurança com prazo;
- registros de atividade sem o conteúdo das conversas.

Esses controles reduzem riscos. **Nenhum sistema está livre de incidentes**, e não prometemos segurança absoluta.

## 18. Incidentes

Em caso de incidente de segurança que envolva dados pessoais, a TheNeil avalia o ocorrido, adota medidas de contenção
e comunica o Cliente e, quando aplicável, a autoridade e os titulares.

[PENDÊNCIA JURÍDICA / OPERACIONAL: prazo de comunicação ao Cliente, processo formal e responsabilidades.]

## 19. Terceiros

Inventário de fornecedores confirmados:

| Fornecedor | Função | Categorias de dados | Localidade | Finalidade |
|---|---|---|---|---|
| Render | Hospedagem, disco persistente, cópias diárias do disco, logs do servidor | Todos os dados armazenados da plataforma e das empresas; logs | Estados Unidos (região Virgínia), comprovado no serviço | Executar e guardar a GreenIA |
| OpenRouter | Acesso aos modelos de IA | Conteúdo dos pedidos (seção 6.1) | [PENDÊNCIA: não comprovada nesta auditoria] | Gerar respostas |
| Fabricantes dos modelos liberados pelo Cliente | Execução dos modelos, via OpenRouter | Conteúdo dos pedidos | [PENDÊNCIA: depende do fabricante] | Gerar respostas |
| Google Fonts | Fontes tipográficas carregadas pelas páginas | IP e navegador de quem abre a página | [PENDÊNCIA: não comprovada nesta auditoria] | Exibir as páginas |
| Provedor de email da plataforma | Envio de emails (seção 13) | Endereço de destino e conteúdo do email | [PENDÊNCIA: provedor não identificado] | Enviar códigos e avisos |
| Servidor de email do Cliente (opcional) | Envio dos emails do ambiente dele | Idem | Definido pelo Cliente | Idem |

A TheNeil não vende dados pessoais. [PENDÊNCIA JURÍDICA: confirmar esta afirmação comercial antes de publicar.]

## 20. Cookies e armazenamento no navegador

- **Cookies essenciais:** sessão da empresa, sessão do console e o contexto da empresa (30 dias). São necessários para
  entrar e não são usados para publicidade.
- **Armazenamento local do navegador:** guarda preferências de tela, como a última tela visitada.
- **Rastreamento:** não há ferramentas de análise ou publicidade nas páginas da GreenIA. As fontes tipográficas vêm do
  Google Fonts (seção 19).

## 21. Alterações desta Política

Esta Política pode ser atualizada. A versão vigente e a data ficam no topo do documento.

[PENDÊNCIA JURÍDICA: antecedência, forma de aviso e alinhamento com a cláusula 26 dos Termos de Uso.]
