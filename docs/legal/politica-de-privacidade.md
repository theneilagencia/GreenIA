# Política de Privacidade da GreenIA

Versão 1.0, de 1º de outubro de 2026 · Vigência a partir de 30 de novembro de 2026

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
| Formulário comercial | Nome, email, empresa, cargo, faixa de pessoas, mensagem e interações comerciais registradas | Banco da plataforma | Sim, até 24 meses depois da última interação (seção 14) | Não: os admins da plataforma recebem só um aviso, sem os dados do contato |
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

| Camada | Prazo da camada |
|---|---|
| Backup automático diário | Até 7 dias |
| Cópia diária do disco feita pelo provedor (Render) | 7 dias após a captura |
| Backup manual de manutenção | 30 dias desde a criação |
| Cópia de recuperação de ambiente excluído | 30 dias desde a exclusão |
| Cópia operacional de uma exportação | Até 7 dias depois de encerrada a necessidade (seção 12) |

As cópias do provedor incluem os backups locais. Com a limpeza ativa, no pior caso operacional, um dado excluído pode permanecer:
- até **15 dias** nas cópias diárias;
- até **38 dias** em backup manual ou na cópia de recuperação de um ambiente excluído.

As cópias operacionais de exportação também ficam nas cópias diárias do disco por até 7 dias depois de eliminadas.

### 10.3 Preservação

Cópias preservadas por obrigação legal, investigação de incidente ou outra justificativa registrada (com motivo,
responsável e data) ficam fora desses prazos enquanto a preservação for necessária.

### 10.4 Armazenamento físico

Os prazos acima valem para as cópias geridas pela plataforma e pelo provedor. **Não são garantia de destruição física de
todos os blocos de armazenamento:** o provedor pode manter blocos já liberados, fora do alcance da aplicação, até que
sejam reutilizados.

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
  diárias seguem a seção 10.2.

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
- aviso de novo contato comercial (aos administradores da plataforma, sem os dados do contato);
- avisos administrativos da plataforma.

O envio usa o provedor de envio de email da plataforma ou, se o Cliente configurar, o servidor de email da própria
empresa. Os emails que saem do ambiente de uma empresa não levam o nome da plataforma (marca branca).

## 14. Formulário comercial

- **Campos:** nome, email, empresa, cargo (opcional), faixa de pessoas na empresa (opcional) e mensagem (opcional).
- **Finalidade:** responder ao contato e marcar apresentação.
- **Destino:** fica no banco da plataforma GreenIA. Os administradores da plataforma recebem por email só um aviso de
  novo contato, sem os dados dele, e consultam o contato no console.
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
| Formulário comercial | Atendimento a pedido do titular | Procedimentos preliminares a contrato, a pedido do titular / legítimo interesse |

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
| Render | Hospedagem, disco persistente, cópias diárias do disco, logs do servidor | Todos os dados armazenados da plataforma e das empresas; logs | Estados Unidos (região Virgínia), confirmada no painel do provedor | Executar e guardar a GreenIA |
| OpenRouter | Acesso aos modelos de IA | Conteúdo dos pedidos (seção 6.1) | Estados Unidos ou outros países, conforme a política pública do OpenRouter | Gerar respostas |
| Fabricantes dos modelos liberados pelo Cliente | Execução dos modelos, via OpenRouter | Conteúdo dos pedidos | Conforme a documentação de cada fabricante | Gerar respostas |
| Provedor de envio de email da plataforma | Envio de emails (seção 13) | Endereço de destino e conteúdo do email | Conforme o provedor contratado | Enviar códigos e avisos |
| Servidor de email do Cliente (opcional) | Envio dos emails do ambiente dele | Idem | Definido pelo Cliente | Idem |

## 20. Cookies e armazenamento no navegador

- **Cookies essenciais:** sessão da empresa, sessão do console e o contexto da empresa (30 dias). São necessários para
  entrar e não são usados para publicidade.
- **Armazenamento local do navegador:** guarda preferências de tela, como a última tela visitada.
- **Rastreamento:** não há ferramentas de análise ou publicidade nas páginas da GreenIA. As fontes tipográficas são
  servidas pelo próprio servidor da GreenIA, sem chamada a terceiros.

## 21. Alterações desta Política

Esta Política pode ser atualizada. A versão vigente e a data ficam no topo do documento. Mudanças materiais são avisadas
aos administradores do Cliente, pelo email cadastrado, com 30 dias de antecedência. Mudanças urgentes, por segurança,
obrigação legal ou risco operacional, podem valer em prazo menor, informado no próprio aviso. A mesma regra vale para os
Termos de Uso (cláusula 26).
