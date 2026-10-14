# Política de Privacidade da GreenIA

Versão 1.0, de 1º de outubro de 2026 · Vigência a partir de 30 de novembro de 2026

Última atualização do texto: 14 de outubro de 2026

## 1. Quem somos e como falar conosco

A GreenIA é oferecida por **NEIL INOVAÇÃO E TECNOLOGIA LTDA** ("TheNeil", "nós"), pessoa jurídica de direito privado:
- **CNPJ:** 37.749.373/0001-70
- **Sede:** Rua Bernardo Guimarães, 245, Funcionários, Belo Horizonte/MG
- **Contato:** hello@theneil.com.br · www.theneil.com.br
- **Canal de privacidade e de atendimento aos titulares:** hello@theneil.com.br (privacidade, pedidos de titulares,
  contato com o encarregado e qualquer solicitação relacionada a dados pessoais)
- **Encarregado pela proteção de dados (DPO):** Vinicius Guimarães · hello@theneil.com.br

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

O papel de cada parte depende do tratamento:

| Tratamento | Finalidade | Quem define a finalidade | Papel |
|---|---|---|---|
| Conteúdo inserido no ambiente (mensagens, anexos, documentos, quick wins, respostas) | Uso da IA pelo Cliente | Cliente | Cliente: controlador. TheNeil: operadora |
| Configurações do ambiente (regras de dados, política de uso, papéis, retenção) | Governança do uso pelo Cliente | Cliente | Idem |
| Contas dos usuários (email, nome, papel, vínculo) e autenticação | Dar acesso ao ambiente do Cliente e proteger a plataforma | Cliente (quem entra) e TheNeil (como a autenticação funciona) | Misto: operadora para o acesso; possível controladora para a segurança da plataforma |
| Registros de consumo (créditos por área, pessoa e quick win) | Controle de uso pelo Cliente; cobrança pela TheNeil | Ambas | Misto |
| Eventos de atividade do ambiente | Prestação de contas ao Cliente (tela "Atividade") | Cliente | Operadora |
| Auditoria da plataforma (alterações administrativas, IP e navegador de quem agiu) | Segurança e prestação de contas da plataforma | TheNeil | Possível controladora |
| Acessos e exportações da equipe de operação | Segurança, transparência e responsabilização da operação | TheNeil (e visível para o Cliente) | Possível controladora |
| Formulário de contato da página de vendas | Atendimento comercial | TheNeil | Controladora |
| Logs técnicos do servidor e do provedor | Operação, diagnóstico e segurança | TheNeil | Possível controladora |
| Relatos de problema ("Reportar problema") | Suporte interno do Cliente | Cliente | Operadora |

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
| Exportações | Registro: operador, finalidade, justificativa, data, tamanho, hash, resultado, downloads e eliminação. Cópia: o banco completo do ambiente | Registro: banco da plataforma. Cópia: servidor da plataforma | Registro: sim, sem prazo de eliminação. Cópia: até 7 dias depois de encerrada a necessidade (seção 12) | A cópia é entregue a quem a pediu (seção 12) |
| Formulário comercial | Nome, email, empresa, cargo, faixa de pessoas, mensagem, origem do pedido e interações comerciais registradas | Banco da plataforma | Sim, até 24 meses depois da última interação (seção 14) | Resumo de origem no aviso aos admins e destinatários comerciais configurados, sem nome, email ou mensagem do contato. Com consentimento, medição ao Google (seção 20) |
| Logs técnicos | Mensagens de operação do servidor (falhas, rotinas, avisos) | Logs do provedor de hospedagem | Sim, pelo prazo do provedor | Ficam no provedor |

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

Os fabricantes envolvidos dependem dos modelos que cada Cliente libera.

6.2. Antes do envio, valem as regras da seção 5.

6.3. **Filtro "sem coleta":** por padrão, toda chamada pede ao OpenRouter que use só fornecedores que ele classifica
como não coletando os dados, segundo as políticas que esses fornecedores informam. Esse filtro depende de informação
declarada e disponibilizada pelos fornecedores. **Não é uma verificação independente da GreenIA nem uma garantia
contratual.** O administrador do Cliente pode desligá-lo.

6.4. Para informações sigilosas, a GreenIA só usa rotas autorizadas cujos atributos declarados (por exemplo, retenção
zero e ausência de uso para treino) atendem aos requisitos, com o fornecedor fixado. Esses atributos são declarados
pelos fornecedores.

6.5. O tratamento feito pelo OpenRouter (OpenRouter, Inc., Estados Unidos) é regido pelos termos e pela política de
privacidade dele; o feito por cada fabricante, pelas políticas do fabricante.

6.6. **Pesquisa na internet e geração de imagem:** quando o Cliente as libera, a pesquisa dos quick wins envia, pelo
OpenRouter, a um serviço de busca o tema do quick win, o perfil público da empresa e o que a pessoa escreveu na
execução, sem documentos, anexos ou instruções internas; a geração de imagem envia o tema e o estilo da peça. As duas
não são usadas com informações sigilosas, em áreas com proteção reforçada ou com dados que a política do Cliente
manda proteger. O serviço de busca tem política de retenção própria; a retenção zero pedida nas rotas de informações
sigilosas não se aplica a ele.

## 7. Hospedagem e transferência internacional

7.1. A GreenIA é hospedada no **Render**, em servidores nos **Estados Unidos** (região Virgínia), com disco persistente e
cópias diárias do disco feitas pelo provedor.

7.2. Os pedidos à IA passam pelo OpenRouter, que, segundo a política pública dele, processa dados nos Estados Unidos ou
em outros países, e pelos fabricantes dos modelos, que podem estar fora do Brasil, conforme a documentação de cada um.

7.3. Alguns fornecedores utilizados na operação da GreenIA mantêm infraestrutura ou realizam tratamento de dados fora do Brasil. Nessas situações, pode ocorrer transferência internacional de dados. A TheNeil adota os instrumentos e salvaguardas aplicáveis ao tratamento e à transferência desses dados conforme a legislação pertinente e considera, na seleção e configuração dos serviços utilizados, as informações disponibilizadas pelos respectivos fornecedores sobre privacidade, segurança, retenção e tratamento de conteúdo.

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

9.2. **Exportação.** A equipe de operação só exporta a cópia completa do banco do ambiente por pedido do Cliente, por
incidente de segurança ou por obrigação legal, com a finalidade e a justificativa registradas (seção 12). Cada exportação
aparece na mesma tela e gera aviso. Ambiente cancelado não pode ser usado nem pela equipe de operação: a única forma de
recuperar os dados dele é a exportação com finalidade.

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

As cópias abaixo são geridas pela GreenIA. Rotinas automáticas da plataforma eliminam cada uma no fim do prazo.

| Cópia gerida pela GreenIA | Prazo |
|---|---|
| Backup automático diário | Até 7 dias |
| Backup manual de manutenção | 30 dias desde a criação |
| Cópia de recuperação de ambiente excluído | 30 dias desde a exclusão |
| Cópia operacional de uma exportação | Até 7 dias depois de encerrada a necessidade (seção 12) |

**Cópias do disco feitas pelo provedor (Render).** O provedor de hospedagem copia o disco inteiro a cada 24 horas. Essa
cópia inclui o banco em uso e as cópias da tabela acima. Segundo a documentação do provedor, cada cópia fica disponível
por pelo menos 7 dias. O provedor não publica um prazo máximo, e a GreenIA não controla esse prazo.

Por isso, depois que um dado sai do banco em uso ou de uma cópia gerida pela GreenIA, ele ainda pode ficar nas cópias do
disco feitas pelo provedor. O tempo depende do prazo do provedor. Isso vale também para as cópias de exportação já
eliminadas. Se o provedor informar um prazo máximo, esta Política será atualizada.

### 10.3 Preservação

Cópias preservadas por obrigação legal, investigação de incidente ou outra justificativa registrada (com motivo,
responsável e data) ficam fora desses prazos enquanto a preservação for necessária.

### 10.4 Armazenamento físico

Os prazos da tabela da seção 10.2 valem para as cópias geridas pela GreenIA. As cópias do disco feitas pelo provedor
seguem o prazo do provedor. **Nenhum desses prazos é garantia de destruição física de todos os blocos de
armazenamento:** o provedor pode manter blocos já liberados, fora do alcance da aplicação, até que sejam reutilizados.

### 10.5 Registros sem prazo automático

Os seguintes registros **não têm prazo automático de eliminação**:
- eventos de atividade;
- consumo;
- auditoria da plataforma;
- acessos e exportações da equipe de operação;
- relatos de problema.

Eles não guardam o conteúdo das conversas, mas guardam metadados, emails e, no caso dos acessos, as justificativas.
Eles são mantidos enquanto necessários para segurança, operação, prestação de contas e cumprimento de obrigações.

## 11. Suspensão, cancelamento, devolução e exclusão definitiva

- **Suspensão:** ninguém do Cliente entra no ambiente, as sessões são encerradas e os dados continuam guardados.
- **Cancelamento:** o ambiente deixa de poder ser usado na hora, inclusive pela equipe de operação. Os dados ficam
  preservados por **30 dias corridos**, para recuperação ou devolução.
- **Devolução:** dentro desses 30 dias, um administrador cadastrado do Cliente pode pedir uma cópia técnica completa do
  banco de dados do ambiente (arquivo SQLite compactado), confirmando o pedido com um código enviado ao email dele. A
  equipe de operação gera a cópia e a entrega por um link de uso único, válido por até 7 dias, enviado a esse email.
  Ficam registrados o pedido, quem gerou a cópia, o hash do arquivo e a entrega. Não há outro formato de devolução.
- **Exclusão definitiva:** acontece automaticamente depois dos 30 dias, salvo preservação (10.3). Antes disso, um
  administrador cadastrado pode pedir a exclusão antecipada, com código enviado ao email dele e confirmação expressa de
  que ela é irreversível; um pedido informal ao suporte não basta. Preservação por obrigação legal ou incidente impede a
  exclusão, inclusive a antecipada. Ao excluir, a plataforma guarda uma cópia de recuperação por 30 dias; as cópias
  do disco feitas pelo provedor seguem a seção 10.2.

## 12. Exportações

- **Quando:** a cópia completa do banco de um ambiente só é exportada por pedido do Cliente (inclusive a devolução da
  seção 11), por incidente de segurança ou por obrigação legal. Suporte, por si só, não é motivo para exportar.
- **Registro:** cada exportação, com sucesso ou falha, registra operador, finalidade, justificativa e data, aparece em
  "Acessos da equipe de operação" e gera aviso aos administradores do Cliente.
- **Guarda no servidor:** a cópia fica no servidor da plataforma e é eliminada até 7 dias depois de encerrada a
  necessidade que a justificou. Preservação por obrigação legal ou investigação de incidente, com motivo, responsável e
  registro, suspende esse prazo.
- **Cópia baixada:** cada download fica registrado (quem e quando). A cópia baixada sai do controle técnico da plataforma
  e fica sob a responsabilidade de quem a recebeu; quando aplicável, registra-se a declaração de eliminação de quem a
  recebeu. A plataforma não comprova a eliminação de cópias fora do servidor.

## 13. Emails

A GreenIA envia emails para:
- códigos de acesso (login);
- convites;
- avisos de consumo (80% e esgotamento);
- avisos de acesso e exportação pela equipe de operação;
- códigos de confirmação e links de devolução no encerramento de um ambiente;
- relatos de problema (aos administradores do Cliente);
- aviso de novo contato comercial (aos administradores da plataforma e aos destinatários comerciais configurados, com resumo da origem, sem nome, email ou mensagem do contato);
- avisos administrativos da plataforma.

O envio usa o provedor de envio de email da plataforma ou, se o Cliente configurar, o servidor de email da própria
empresa. Os emails que saem do ambiente de uma empresa não levam o nome da plataforma (marca branca).

## 14. Formulário comercial

- **Campos:** nome, email, empresa, cargo (opcional), faixa de pessoas na empresa (opcional) e mensagem (opcional). Parâmetros de campanha e origem da visita podem acompanhar o envio para identificar o canal do pedido.
- **Finalidade:** responder ao contato e marcar apresentação.
- **Destino:** fica no banco da plataforma GreenIA. Os administradores da plataforma e os destinatários comerciais configurados recebem por email só um aviso de
  novo contato e um resumo da campanha de origem, sem nome, email ou mensagem do contato, e consultam os detalhes no console. O aviso indica apenas a presença de identificadores de clique, sem copiá-los para o email. Receber o aviso não concede acesso ao console; o responsável comercial que não tiver acesso deve tratar o pedido com um administrador autorizado.
- **IP:** não é guardado com o contato. O servidor usa o IP só em memória, por uma hora, para limitar o envio a 5
  contatos.
- **Prazo:** o contato é eliminado 24 meses depois da última interação comercial relevante registrada (um novo
  formulário ou uma interação registrada pela equipe comercial). Fica apenas uma contagem agregada, sem dados pessoais.
  Obrigação legal, contrato ou litígio, com motivo registrado, suspendem a eliminação.
- **Emails anteriores:** avisos enviados antes desta versão com os dados do contato estão nas caixas de email dos
  administradores da plataforma, fora do controle técnico da GreenIA; eles seguem o procedimento interno de eliminação
  da TheNeil.

## 15. Bases legais

| Tratamento | Finalidade | Base legal |
|---|---|---|
| Conteúdo no ambiente | Uso da IA pelo Cliente | Definida pelo Cliente, como controlador |
| Contas e autenticação | Execução do contrato com o Cliente; segurança | Execução de contrato / legítimo interesse |
| Consumo e cobrança | Controle de uso e faturamento | Execução de contrato |
| Auditoria e acessos da operação | Segurança e prestação de contas | Legítimo interesse / cumprimento de obrigação |
| Logs técnicos | Operação e segurança | Legítimo interesse |
| Formulário comercial e origem do pedido | Atendimento a pedido do titular e identificação do canal comercial | Procedimentos preliminares a contrato, a pedido do titular / legítimo interesse |
| Medição de publicidade na LP comercial | Associar pedidos de demonstração a anúncios | Consentimento, conforme art. 7º, I, da LGPD |

## 16. Direitos dos titulares

16.1. O titular pode pedir, nos termos da LGPD:
- confirmação da existência de tratamento;
- acesso, correção, anonimização, bloqueio ou eliminação;
- portabilidade;
- informação sobre compartilhamento;
- revisão de decisões automatizadas, quando aplicável.

16.2. **Quando o dado está no ambiente de um Cliente** (por exemplo, conversas e documentos), a empresa
cliente decide sobre esse tratamento, e o pedido deve ser dirigido a ela. A TheNeil apoia o Cliente conforme o
contrato.

16.3. Solicitações relacionadas aos direitos dos titulares podem ser encaminhadas para hello@theneil.com.br, aos cuidados do Encarregado pela proteção de dados, Vinicius Guimarães. A solicitação será analisada de acordo com sua natureza e respondida nos prazos previstos na legislação aplicável. Quando o tratamento estiver relacionado a dados inseridos ou administrados por um Cliente, a TheNeil poderá encaminhar ou coordenar o atendimento com esse Cliente, conforme os papéis aplicáveis ao tratamento.

Para proteger o próprio titular e evitar divulgação ou alteração indevida de dados, a TheNeil poderá solicitar informações adicionais razoavelmente necessárias para confirmar a identidade ou a legitimidade do solicitante antes de atender ao pedido. A verificação deverá ser proporcional à natureza da solicitação e não poderá exigir dados desnecessários para essa finalidade.

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
- encerramento de ambiente com exclusão automática 30 dias depois do cancelamento;
- cópias de exportação com prazo de eliminação;
- registros de atividade sem o conteúdo das conversas.

Esses controles reduzem riscos. **Nenhum sistema está livre de incidentes**, e não prometemos segurança absoluta.

## 18. Incidentes

A TheNeil mantém procedimentos para identificação, registro, análise e tratamento de incidentes que possam comprometer dados pessoais tratados no contexto da GreenIA. Quando um incidente puder gerar risco ou dano relevante aos titulares ou exigir comunicação nos termos da legislação aplicável, serão adotadas as providências cabíveis, inclusive comunicação ao Cliente, às autoridades competentes e aos titulares quando aplicável. O conteúdo, a forma e o momento dessas comunicações considerarão a natureza do incidente, os dados envolvidos, os riscos identificados e as obrigações legais aplicáveis.

## 19. Terceiros

Fornecedores:

| Fornecedor | Função | Categorias de dados | Localidade | Finalidade |
|---|---|---|---|---|
| Render | Hospedagem, disco persistente, cópias diárias do disco, logs do servidor | Todos os dados armazenados da plataforma e das empresas; logs | Estados Unidos (região Virgínia), confirmada no painel do provedor para o serviço e o disco. O local das cópias do disco segue o provedor | Executar e guardar a GreenIA |
| OpenRouter | Acesso aos modelos de IA | Conteúdo dos pedidos (seção 6.1) | Estados Unidos ou outros países, conforme a política pública do OpenRouter | Gerar respostas |
| Fabricantes dos modelos liberados pelo Cliente | Execução dos modelos, via OpenRouter | Conteúdo dos pedidos | Conforme a documentação de cada fabricante | Gerar respostas |
| Provedor de envio de email da plataforma | Envio de emails (seção 13) | Endereço de destino e conteúdo do email | Conforme o provedor contratado | Enviar códigos e avisos |
| Google Ads, somente na LP comercial e com consentimento | Medição de pedidos de demonstração | Dados da visita, identificadores de anúncios e hash do email quando disponível | Conforme as condições do serviço Google; pode envolver transferência internacional | Associar pedidos a anúncios |
| Servidor de email do Cliente (opcional) | Envio dos emails do ambiente dele | Idem | Definido pelo Cliente | Idem |

## 20. Cookies e armazenamento no navegador

- **Cookies essenciais:** sessão da empresa, sessão do console e o contexto da empresa (30 dias). São necessários para
  entrar e não são usados para publicidade.
- **Armazenamento local do navegador:** guarda preferências de tela, como a última tela visitada.
- **Medição na LP comercial:** a página pública de apresentação usa a tag do Google Ads para medir pedidos de demonstração. A tag é carregada somente após a escolha "Aceitar". Sem essa autorização, a tag não é carregada e nenhum evento de conversão é enviado por esta implementação.
- **Conversões otimizadas:** com consentimento, o email informado no formulário pode ser normalizado e convertido em hash SHA-256 no navegador, antes de ser disponibilizado à tag, para associar o pedido ao anúncio. Hash não equivale a anonimização. A coleta depende também da configuração da conta Google Ads.
- **Origem do pedido:** parâmetros utm e a página de entrada são guardados na sessão da aba e enviados com o formulário. A referência da visita é limitada ao domínio de origem. Identificadores gclid, gbraid e wbraid só são adicionados por esta implementação após consentimento. Parâmetros arbitrários e fragmentos da URL não são guardados. Os metadados enviados seguem a retenção do contato comercial da seção 14.
- **Escolha e retirada:** o link "Preferências de cookies" no rodapé da LP permite mudar a escolha. Ao recusar, esta implementação interrompe novos eventos de conversão, remove os cookies de medição próprios acessíveis e comunica a mudança à tag caso ela já tenha sido carregada. Cookies de outros domínios permanecem sujeitos aos controles do navegador e do Google.
- **Limite de escopo:** a tag não é incluída no chat, no console nem nas páginas dos ambientes das empresas. Não são habilitadas análise de uso por Google Analytics nem personalização de anúncios por esta implementação. As fontes tipográficas continuam servidas pelo próprio servidor.

| Nome | Finalidade | Tipo | Duração |
|---|---|---|---|
| greenia_consent_v1 | Guardar a escolha sobre medição publicitária | Armazenamento local | Até a escolha ser substituída ou os dados serem apagados pelo visitante |
| greenia_origem_v1 | Identificar a origem do pedido comercial | Armazenamento de sessão | Sessão da aba, que pode ser restaurada pelo navegador |
| greenia_conversoes_v1 | Evitar repetição do mesmo evento confirmado | Armazenamento de sessão, apenas identificadores de eventos | Sessão da aba, que pode ser restaurada pelo navegador |
| _gcl_au, _gcl_aw e outros _gcl_* eventualmente utilizados | Medição de anúncios | Cookies próprios do site, conforme a tag e sua configuração | Em geral até 90 dias; confirmar os cookies efetivamente utilizados na implantação |
| Cookies dos domínios Google eventualmente utilizados | Medição do Google Ads com consentimento | Cookies de terceiros | Variável conforme o cookie e a configuração do Google; não se limita necessariamente a 90 dias |

O visitante pode consultar a documentação de cookies do Google em https://business.safety.google/adscookies/ e gerenciar os dados do navegador. O envio do formulário funciona mesmo quando a medição é recusada.

## 21. Alterações desta Política

Esta Política pode ser atualizada. A versão vigente e a data ficam no topo do documento. Mudanças materiais são avisadas
aos administradores do Cliente, pelo email cadastrado, com 30 dias de antecedência. Mudanças urgentes, por segurança,
obrigação legal ou risco operacional, podem valer em prazo menor, informado no próprio aviso. A mesma regra vale para os
Termos de Uso (cláusula 26).
