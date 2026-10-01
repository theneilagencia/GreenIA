# Termos de Uso da GreenIA

> **RASCUNHO PARA APROVAÇÃO. NÃO PUBLICADO.** Os trechos marcados **[PENDÊNCIA PARA APROVAÇÃO]** dependem de decisão
> jurídica ou comercial e não podem ser preenchidos por inferência técnica. Base técnica: o produto como implementado
> nas Etapas 1 a 3 (governança de acesso, auditoria de produção e política de retenção).
>
> **Correspondência com a produção:** este texto descreve a versão da GreenIA que inclui a governança de acesso da
> equipe de operação, a consolidação do WAL e a política de retenção (Etapas 1 a 3), ainda **não publicada em
> produção** (produção em `227fd36` em 2026-10-01). O documento só pode ser publicado junto com o deploy dessa versão.

Versão: rascunho 0.2, de 1º de outubro de 2026 · Vigência a partir de: [PENDÊNCIA PARA APROVAÇÃO: data de publicação]

## 1. Quem opera a GreenIA

A GreenIA é oferecida por **NEIL INOVAÇÃO E TECNOLOGIA LTDA**, pessoa jurídica de direito privado, inscrita no CNPJ
sob o nº **37.749.373/0001-70**, com sede na Rua G, nº 277, Montserrat, Betim/MG, doravante "TheNeil".
Contato oficial: hello@theneil.com.br · www.theneil.com.br.

## 2. Definições

- **Cliente:** a empresa que contrata a GreenIA para uso das pessoas autorizadas por ela.
- **Ambiente:** o espaço da GreenIA dedicado a um Cliente, com banco de dados separado do de outros Clientes, regras,
  marca e endereço de acesso próprios.
- **Usuário:** a pessoa autorizada pelo Cliente a entrar no Ambiente.
- **Administrador do Cliente:** o Usuário com permissão de administração do Ambiente, conforme os papéis configurados
  pelo Cliente.
- **Equipe de operação:** as pessoas da TheNeil com acesso ao console da plataforma.
- **Conteúdo:** mensagens, anexos, documentos, instruções de quick wins e respostas geradas no Ambiente.
- **Créditos:** unidade de consumo da GreenIA, descrita na cláusula 9.

## 3. Objeto

3.1. A GreenIA é uma plataforma para uso corporativo de inteligência artificial. Ela reúne as conversas da equipe num
Ambiente do Cliente, aplica as regras de dados definidas pelo Cliente a cada mensagem e anexo antes do envio aos
recursos de IA e permite criar quick wins para tarefas recorrentes. O consumo é controlado em créditos, com limites
definidos pelo Cliente.

3.2. As condições comerciais (plano, volume de créditos, preço, forma de pagamento, prazo de contratação e eventuais
serviços adicionais, como implantação assistida ou o diagnóstico Prumo Discovery) constam da proposta ou do contrato
comercial firmado com o Cliente, que prevalece sobre estes Termos no que for específico. [PENDÊNCIA PARA APROVAÇÃO:
hierarquia entre Termos, proposta e contrato.]

## 4. Elegibilidade e acesso

4.1. A GreenIA é destinada a empresas. O Ambiente é criado e liberado pela TheNeil depois da contratação.

4.2. Entram no Ambiente:
- as pessoas com email de um domínio autorizado pelo Cliente;
- as pessoas convidadas por um Administrador do Cliente.

O acesso a um Ambiente não vale em outro.

4.3. O Cliente pode desativar ou remover Usuários a qualquer momento. As sessões abertas desses Usuários são encerradas.

## 5. Contas e autenticação

5.1. O acesso é feito com um código de uso único enviado ao email do Usuário, válido por 10 minutos. Não há senha.

5.2. O Usuário é responsável por manter seguro o acesso ao próprio email. O Cliente é responsável por manter
atualizados os domínios autorizados e por remover quem não deve mais ter acesso.

5.3. A entrega do código depende do serviço de email. Atrasos ou falhas de entrega podem impedir temporariamente o acesso.

## 6. Administradores do Cliente

6.1. Os Administradores do Cliente configuram o Ambiente em telas da própria plataforma. Entre as configurações estão:
- pessoas, áreas e papéis;
- regras de dados;
- política de uso de IA;
- modelos e níveis liberados;
- limites de consumo;
- prazo de retenção das conversas;
- marca, documentos e quick wins.

6.2. A criação e a liberação do Ambiente, o plano de créditos e a liberação de pacotes adicionais são feitas pela
TheNeil. A configuração de recursos autorizados para informações sigilosas e de domínio próprio também conta com o
apoio dela.

6.3. Cada Usuário vê e administra só o que o seu papel permite.

## 7. Responsabilidades do Cliente

7.1. O Cliente é responsável:
- pela definição das regras de dados e da política de uso de IA do Ambiente;
- pelo Conteúdo que os Usuários inserem;
- por orientar os Usuários;
- por cumprir as obrigações legais e regulatórias aplicáveis à sua atividade, inclusive as de proteção de dados pessoais.

7.2. Os controles da GreenIA apoiam as políticas de segurança, confidencialidade e proteção de dados do Cliente, inclusive
as que ele adota para atender à Lei Geral de Proteção de Dados (Lei nº 13.709/2018). A GreenIA não substitui a avaliação
jurídica do Cliente, e não há garantia de conformidade legal pelo simples uso da plataforma.

7.3. O Cliente garante ter base legal e autorização para inserir no Ambiente os dados pessoais e as informações de
terceiros que forem tratados nas conversas, nos anexos e nos documentos.

## 8. Uso de inteligência artificial

8.1. As respostas são geradas por recursos de IA de terceiros e podem conter erros, omissões ou informações imprecisas.
Todo resultado deve ser revisado por quem o utiliza antes de qualquer decisão ou uso externo. A decisão final é sempre
de quem usa.

8.2. A cada pedido, a GreenIA escolhe o nível do recurso de IA (Rápido, Equilibrado ou Avançado) entre os que o Cliente
libera, e explica a escolha nas conversas. O Usuário pode escolher o nível dentro do permitido.

8.3. Antes do envio, a GreenIA confere cada mensagem e cada anexo e aplica a regra que o Cliente definiu para cada tipo
de dado que ela reconhece: processar normalmente, só com proteção ou não enviar. Senhas e chaves de acesso reconhecidas
são bloqueadas, inclusive quando estão em documentos da base, em arquivos de quick win ou no histórico da conversa.

8.4. O reconhecimento de dados é feito por padrões e palavras. Dados fora desses padrões podem não ser reconhecidos.
A conferência reduz riscos e não elimina todos eles.

8.5. Imagens e PDFs escaneados são convertidos em texto no servidor da GreenIA. A imagem não é enviada aos recursos de IA,
mas o texto extraído segue como parte do pedido.

## 9. Quick wins

9.1. Um quick win é uma tarefa recorrente que a área do Cliente ensina à GreenIA uma vez (objetivo, processo, regras e
formato do resultado) e publica para as pessoas autorizadas.

9.2. A equipe usa a versão publicada. Ajustes geram nova versão, e é possível voltar a uma anterior.

9.3. Nos quick wins criados pelo passo a passo guiado, o resultado é conferido contra o formato e as regras definidas
antes de aparecer, e o que não confere fica marcado para revisão. A conferência consome créditos e não substitui a
revisão de quem usa.

9.4. O Cliente é responsável pelo conteúdo das instruções e dos arquivos dos quick wins e pelo uso dos resultados.

## 10. Créditos e limites

10.1. O consumo é medido em créditos. Cada pedido consome créditos conforme o recurso de IA usado e o tamanho do pedido
(incluindo histórico e documentos usados) e da resposta. As conferências automáticas de quick wins também consomem.

10.2. O plano é contratado para a empresa, não por pessoa. O volume mensal de créditos e as condições de renovação e
de pacotes adicionais seguem a proposta comercial. [PENDÊNCIA PARA APROVAÇÃO: o que acontece com créditos mensais não
usados; validade dos pacotes.]

10.3. O Cliente pode definir um limite mensal para a empresa, um limite mensal por pessoa e um máximo de respostas por
pessoa por dia. Os limites são conferidos a cada novo envio. Uma resposta que já começou termina, e envios simultâneos
podem ultrapassar levemente o limite.

10.4. Ao atingir o limite contratado, a GreenIA pode continuar atendendo solicitações elegíveis na classe Rápido, dentro
da reserva operacional do plano, sem alterar as regras de segurança. Esgotada a reserva, novas mensagens pausam até a
renovação ou a liberação de um pacote adicional.

10.5. Avisos de consumo (80% e esgotamento) aparecem na Visão geral e são enviados por email aos administradores,
quando o envio de email está disponível.

## 11. Terceiros e provedores

11.1. A GreenIA depende de fornecedores para funcionar:
- hospedagem e armazenamento: servidores nos Estados Unidos;
- um serviço de acesso a modelos de IA, que encaminha os pedidos aos fabricantes dos modelos;
- serviço de envio de email.

A lista de fornecedores está na Política de Privacidade. [PENDÊNCIA PARA APROVAÇÃO: nomear os subprocessadores nos
Termos ou só na Política de Privacidade.]

11.2. Para responder, o pedido (mensagem, anexos em texto, histórico da conversa, instruções do quick win e trechos de
documentos usados) é enviado ao recurso de IA por meio do serviço de acesso a modelos.

11.3. Por padrão, a GreenIA pede a esse serviço que use só fornecedores que ele classifica como não coletando os dados,
pelas políticas que eles informam. É um filtro, não uma garantia contratual, e o Administrador do Cliente pode desligá-lo.

11.4. Para informações sigilosas, a GreenIA só encaminha a solicitação por rotas autorizadas cujos atributos declarados
(por exemplo, retenção zero e ausência de uso para treino) atendem aos requisitos, com o fornecedor fixado. Esses
atributos são declarados pelos fornecedores e não são verificados pela TheNeil.

11.5. A TheNeil não responde por indisponibilidade, alteração de política ou descumprimento por parte desses
fornecedores, salvo nos limites da lei e do contrato. [PENDÊNCIA PARA APROVAÇÃO: redação de responsabilidade por
terceiros.]

## 12. Confidencialidade

12.1. Nenhuma tela da GreenIA mostra o conteúdo das conversas de um Usuário a colegas ou aos Administradores do Cliente.
Essas telas mostram dados de uso.

12.2. O conteúdo das conversas fica no banco de dados do Ambiente. Ele pode ser alcançado:
- pela exportação completa do banco (cláusula 15);
- pelo acesso técnico à infraestrutura.

12.3. A TheNeil trata o Conteúdo do Cliente como confidencial e o usa para prestar o serviço. Além disso, a TheNeil
trata registros da plataforma (contas, consumo, eventos, auditoria e acessos da equipe de operação, que não contêm o
conteúdo das conversas) para finalidades próprias de segurança, auditoria, operação, prevenção de abuso, controle de
consumo e cobrança e suporte, como descrito na Política de Privacidade. [PENDÊNCIA PARA APROVAÇÃO: cláusula de
confidencialidade recíproca, prazo e exceções legais; papel de cada parte nesses tratamentos.]

## 13. Dados e conteúdo

13.1. O Conteúdo pertence ao Cliente ou a quem ele indicar. A TheNeil não reivindica propriedade sobre o Conteúdo.

13.2. As conversas ficam guardadas no banco do Ambiente pelo prazo de retenção definido pelo Cliente (de 1 a 3.650 dias
sem atividade; padrão de 90 dias). Depois desse prazo, são apagadas automaticamente. O Usuário pode apagar as próprias
conversas a qualquer momento.

13.3. O Cliente pode definir tipos de dado processados sem ficar guardados. A mensagem que os contém, os anexos e a
resposta não entram no histórico nem no banco.

13.4. O papel de cada parte no tratamento de dados pessoais está descrito na Política de Privacidade. [PENDÊNCIA PARA
APROVAÇÃO: enquadramento de Cliente e TheNeil como controlador e operador, por tratamento; necessidade de acordo de tratamento
de dados (DPA).]

## 14. Segurança

14.1. A TheNeil adota controles técnicos, entre eles:
- banco de dados separado por Cliente;
- código de acesso de uso único;
- regras de dados antes do envio;
- bloqueio de senhas e chaves reconhecidas;
- registro de acessos administrativos;
- exclusão com zeragem do espaço no banco em uso;
- cópias de segurança com prazo.

14.2. Nenhum sistema é imune a falhas ou incidentes. A TheNeil não garante segurança absoluta. [PENDÊNCIA PARA
APROVAÇÃO: prazo e forma de comunicação de incidentes de segurança ao Cliente.]

## 15. Acesso da equipe de operação

15.1. A equipe de operação da TheNeil pode entrar no Ambiente pelo console da plataforma para suporte, solicitação do
Cliente, incidente ou outro motivo. O acesso exige tipo e justificativa, dura no máximo 60 minutos, fica registrado e
aparece imediatamente para o Cliente em "Acessos da equipe de operação". Um Administrador do Cliente pode encerrá-lo a
qualquer momento. O acesso **não depende, hoje, de aprovação prévia do Cliente**.

15.2. A equipe de operação pode exportar uma cópia completa do banco do Ambiente, com as conversas, mediante tipo e
justificativa registrados e visíveis para o Cliente. O arquivo exportado sai do servidor e fica sob a responsabilidade
de quem o solicitou. [PENDÊNCIA PARA APROVAÇÃO: em que situações a TheNeil pode exportar sem pedido do Cliente.]

15.3. O detalhamento (escopo do acesso, avisos, registros e o caso de pessoas da TheNeil cadastradas como Usuários)
está na Política de Privacidade.

## 16. Retenção e cópias de segurança

16.1. Ao ser excluído no Ambiente, o dado deixa de ficar disponível na aplicação e é removido do banco de dados em uso.

16.2. Cópias de segurança da plataforma e cópias do disco feitas pelo provedor de hospedagem podem manter o dado por um
período limitado, conforme os prazos por camada descritos na Política de Privacidade. Cópias preservadas por obrigação
legal ou para investigar um incidente, com motivo registrado, ficam fora desses prazos enquanto a preservação for
necessária. Os prazos não constituem garantia de destruição física de blocos de armazenamento do provedor.

[PENDÊNCIA PARA APROVAÇÃO: os prazos por camada da Política só passam a valer depois da ativação da limpeza em produção,
prevista para o deploy controlado.]

## 17. Exclusão

17.1. Conversas: o Usuário pode apagar as próprias. Também são apagadas no fim do prazo de retenção do Ambiente.

17.2. Ambiente: a exclusão definitiva é feita pela TheNeil somente depois do cancelamento, com confirmação. Antes de
apagar, a plataforma guarda uma cópia de recuperação do banco, mantida por período limitado (prazo na Política de Privacidade), salvo preservação
nos termos da cláusula 16.2.

17.3. [PENDÊNCIA PARA APROVAÇÃO: prazo entre o cancelamento e a exclusão definitiva. Hoje não há prazo automático, e o
Ambiente cancelado fica guardado até a exclusão.]

17.4. [PENDÊNCIA PARA APROVAÇÃO: devolução dos dados ao Cliente no encerramento (formato, prazo e forma de entrega).]

## 18. Registros e auditoria

18.1. A GreenIA mantém registros sem o conteúdo das conversas. Estão entre eles:
- consumo por área, pessoa e quick win;
- eventos de atividade do Ambiente (por exemplo, envios bloqueados pelas regras de dados e ciência da política);
- auditoria administrativa da plataforma (alterações de configuração, acessos e exportações da equipe de operação,
  com as justificativas);
- registros de acesso da equipe de operação;
- relatos de problema enviados pelos Usuários (cláusula 22.2).

18.2. Esses registros servem à segurança, à prestação de contas e à cobrança. Nesta versão, eles não têm prazo
automático de eliminação. [PENDÊNCIA PARA APROVAÇÃO: prazo de guarda dos registros.]

## 19. Disponibilidade

19.1. A TheNeil busca manter a GreenIA disponível, mas não oferece garantia de disponibilidade nem nível de serviço
(SLA). [PENDÊNCIA PARA APROVAÇÃO: se houver SLA comercial, ele deve estar no contrato.]

19.2. A plataforma pode ficar indisponível por:
- manutenção ou atualização (inclusive breves interrupções durante publicação de novas versões);
- falha de fornecedores (hospedagem, serviço de acesso a modelos, email);
- limites dos recursos de IA;
- eventos fora do controle da TheNeil.

## 20. Uso proibido

É proibido:
- usar a GreenIA para atividades ilícitas, para violar direitos de terceiros ou para gerar conteúdo que viole a lei;
- tentar burlar as regras de dados, os limites de consumo ou os controles de acesso;
- tentar acessar Ambientes, contas ou dados de outros Clientes;
- inserir código malicioso, fazer engenharia reversa ou sobrecarregar a plataforma deliberadamente;
- usar as respostas como se fossem decisões definitivas sem revisão humana, em especial em temas jurídicos, médicos,
  financeiros ou que afetem direitos de pessoas.

[PENDÊNCIA PARA APROVAÇÃO: lista final de usos proibidos e alinhamento com as políticas dos fornecedores de IA.]

## 21. Propriedade intelectual

21.1. A plataforma GreenIA, sua marca, interface e código pertencem à TheNeil ou a seus licenciantes. O Cliente
recebe licença de uso não exclusiva e intransferível durante a contratação. [PENDÊNCIA PARA APROVAÇÃO: redação da
licença.]

21.2. As configurações do Cliente, como regras, quick wins, marca e documentos, e o Conteúdo permanecem do Cliente.
[PENDÊNCIA PARA APROVAÇÃO: titularidade das respostas geradas e das melhorias derivadas de sugestões do Cliente.]

## 22. Suporte

22.1. O suporte é prestado pelos canais informados pela TheNeil. [PENDÊNCIA PARA APROVAÇÃO: canais, horário e prazos.]

22.2. O Usuário pode relatar problemas pela própria plataforma ("Reportar problema"). O texto do relato fica
registrado no Ambiente, é visto pelos Administradores do Cliente e enviado a eles por email, e por isso não deve conter
informação sigilosa.

## 23. Suspensão

23.1. O Ambiente pode ser suspenso:
- [PENDÊNCIA PARA APROVAÇÃO: hipóteses (inadimplência, uso proibido, risco de segurança, ordem legal) e aviso prévio];
- a pedido do Cliente.

23.2. Durante a suspensão, ninguém do Cliente entra no Ambiente, as sessões são encerradas e os dados continuam
guardados.

## 24. Encerramento

24.1. Com o encerramento da contratação, o Ambiente é cancelado. O acesso dos Usuários termina, e os dados ficam
guardados até a exclusão definitiva (cláusula 17).

24.2. [PENDÊNCIA PARA APROVAÇÃO: prazos de aviso, multa e efeitos financeiros do encerramento.]

## 25. Limitações do produto

25.1. A GreenIA não faz integração com outros sistemas do Cliente. Ela funciona com conversas, arquivos enviados e a
base de conhecimento de cada área.

25.2. A detecção de dados por padrões tem limites (cláusula 8.4).

25.3. A conferência de quick wins não garante resultado correto.

25.4. A retenção zero e a ausência de uso para treino são atributos declarados pelos fornecedores, não verificados.

25.5. Os servidores ficam nos Estados Unidos, e não há opção de hospedagem no Brasil nesta versão.

25.6. Arquivos maiores que 25 MB não são aceitos.

25.7. [PENDÊNCIA PARA APROVAÇÃO: cláusula de limitação de responsabilidade (teto e exclusões), conforme o contrato
comercial e a lei aplicável.]

## 26. Alterações dos Termos

A TheNeil pode alterar estes Termos, informando aos Administradores do Cliente a nova versão e a data de vigência.
[PENDÊNCIA PARA APROVAÇÃO: antecedência mínima do aviso e forma de aceite.]

## 27. Lei aplicável, foro e contato

27.1. [PENDÊNCIA PARA APROVAÇÃO: lei aplicável e foro.]

27.2. Contato: hello@theneil.com.br · www.theneil.com.br.
