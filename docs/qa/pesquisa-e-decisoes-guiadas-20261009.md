# Pesquisa e decisões configuradas pela pessoa — 09/10/2026

## Evidência e impacto

Captura das 15:20, produção `7f99701`, conversa 68: a pessoa escreveu “deixe a pesquisa internet habilitada no quick win”. A IA declarou não conseguir e ofereceu alternativas. Não havia uma ação direta no trecho visível para identificar a área ou avaliar a liberação. A correção anterior tratava avisos da execução, mas não este percurso de conversa comum. **Gravidade alta:** bloqueio sem recuperação compreensível.

A revisão do código também revelou conflito de funcionamento: a regra de autonomia reavaliava perguntas sobre tema e podia escolher pela pessoa mesmo quando o processo mandava esperar a escolha. **Gravidade alta:** descumpre uma decisão explicitamente reservada ao usuário.

## Correções e jornada

| Etapa | O que a pessoa vê/faz | O que a plataforma assume |
|---|---|---|
| Pesquisa bloqueada | “Ver como liberar a pesquisa” disponível junto ao campo de mensagem, inclusive em conversa sem conferência | Lê as configurações atuais e identifica todos os bloqueios conhecidos: empresa, áreas vinculadas, sigilo |
| Pedido de liberação escrito | A orientação abre diretamente; texto/anexos são mantidos | Reconhece pedidos explícitos de habilitar/liberar pesquisa e evita uma resposta da IA sem ação |
| Avaliação do bloqueio | Área pelo nome, alcance da mudança e botão que abre a área exata, com foco em Proteção | Não exige procurar a área numa lista. Não permite exceção escondida para um Quick Win |
| Sem permissão | Solicitar revisão ao administrador | Abre formulário existente sem enviar; servidor mantém a recusa de alteração |
| Após revisão | Voltar e conferir pesquisa | Recalcula estado; não modifica resultados anteriores nem executa automaticamente |
| Configurar comportamento na criação | “Como você quer que este trabalho aconteça?” | Aceita sequência e decisões em linguagem cotidiana |
| Alterar comportamento no refinamento | “O que deve mudar no resultado ou na forma de trabalhar?” | Usa caso anterior e prepara proposta; decisão entre etapas exige proposta de processo que preserve a espera |
| Testar sequência | Apresentar opções → esperar escolha → produzir | Pergunta é estado intermediário persistido. A autonomia não escolhe pela pessoa quando a espera foi configurada |
| Modelo ignora a espera | Erro recuperável explica que opções não foram preparadas; etapa seguinte não é entregue | Mantém etapa pendente na nova tentativa; não aprova nem publica silenciosamente |

Exemplo informado na interface: **“Primeiro sugira temas atuais relacionados ao assunto que eu enviar. Espere minha escolha antes de escrever o artigo.”** A pessoa configura o comportamento; ele não é fixado só no Quick Win 490.

## Segurança e alcance

A proteção reforçada continua bloqueando pesquisa. A tela explica que mudar para Padrão afeta TODOS os Quick Wins vinculados à área, e exige confirmação. Não foi criada uma liberação por Quick Win para contornar essa regra. A empresa permitir pesquisa não remove sigilo nem outros controles. O diagnóstico não autoriza pesquisa; a execução continua classificando conteúdo, custos, fontes e permissões. Nenhuma regra real foi enfraquecida neste QA.

## Validação técnica

- **56/56 serviços:** escolha humana, refinamento, QA final, autonomia, pesquisa externa, operações, isolamento e segurança.
- **8/8 jornadas guiadas** passaram após atualizar dois seletores da pergunta de processo.
- **7/7 entradas e permissões:** fontes (4), alerta de resultado (1), pesquisa e comportamento pela interface (2).
- Repetição afetada após defesa contra modelo que ignora a espera: **2/2 aprovados**.
- Larguras 1280/390/320, administrador e pessoa sem permissão; cancelamento de confirmação mantém regra; mudança fictícia salva e persiste; volta ao caso recalcula estado; pedido escrito retoma após navegar.
- Comportamento configurado pela UI: feedback natural → proposta → aplicação ao rascunho → teste aguarda escolha → continuação produz artigo; versão publicada preservada.
- Uma espera inicial usava `innerText` apesar de a conferência poder recolher o resultado: corrigida para verificar o conteúdo e o estado, sem desativar conferência. O conteúdo do artigo fictício não foi certificado como peça editorial pronta.
- Expectativa exata de metadados atualizada para incluir `motivo: null`, já adicionado pela correção anterior. Não foi removida a evidência do motivo.

## Critérios de aceite

1. Na conversa comum, o bloqueio é visível e tem ação identificada.
2. Pedir liberação abre orientação baseada em configuração, sem gasto de IA nem alteração automática.
3. A área correta abre diretamente; foco e alcance da mudança são compreensíveis.
4. Sem permissão não aparece controle de alteração; solicitação não é enviada automaticamente; PUT permanece 403.
5. Cancelar mantém proteção e texto. Erro não deve levar a declarar pesquisa liberada.
6. Estado após voltar é recalculado; configurações permitidas não significam pesquisa já executada.
7. A própria pessoa inclui sequência e espera por escolha pela criação ou pelo refinamento, sem campos técnicos.
8. Antes da escolha, não há entrega final; escolha continua execução com conferência. A IA não amplia ferramentas ou autonomia.
9. Rascunho/teste não muda versão publicada sem a ação de publicação.

Produção desta rodada: pendente da conferência após o deploy. A liberação efetiva da pesquisa para o trabalho real continua dependendo de decisão autorizada sobre a política; este QA não reduz a proteção da área. Qualidade de trend topics reais, validação com participantes e demais itens da auditoria não são encerrados por simulações.
