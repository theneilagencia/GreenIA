# GreenIA — jornadas para usuários leigos, 09/10/2026

Base de implementação: `31f8f46`, branch `greenia-lite`.

## Mudanças entregues

- Agendar parte da tarefa selecionada, mostra a versão publicada e o objetivo completo disponível em detalhes. Separa texto repetido de materiais/consultas realmente preparados. Não promete atualização de arquivo salvo, conexão inexistente ou entrega garantida de email.
- Conferência do horário usa o relógio e o fuso do servidor, sem criar rotina. Ativação exige gravação confirmada; erro mantém dados, diferencia rotina salva/pausada e permite nova tentativa. Identificador de pedido evita duplicação quando a resposta da criação se perde; reuso por outra pessoa ou com outro conteúdo é recusado.
- Bloqueios de agendamento explicam impacto e recuperação. Links de política, consumo e integrações respeitam permissões. Execução, aprovação, criptografia, limites e isolamento continuam no servidor.
- Refinar mostra diagnóstico e trecho do caso anterior, distingue casos por título e horário, apresenta o que muda sem exigir a escolha inicial de campo técnico e mantém edição avançada disponível. Reaproveita o material anterior e repete o teste; não publica automaticamente.
- Publicar apresenta ressalvas de conferência incompleta e solicita ciência na interface, registrada no evento de publicação. Isso não é um novo bloqueio corporativo da API nem substitui as aprovações existentes. Após publicar, remove o aviso da versão anterior.
- Requisitos futuros conservam até 500 caracteres por rótulo; execução oferece o objetivo integral. Textos já cortados em versões antigas não são reconstruídos artificialmente.
- Anexar arquivo, adicionar link, enviar e sair têm texto visível. Guia e exemplos ficam recolhidos; tarefas podem começar sem tutorial obrigatório.
- Falha ao abrir tela oferece repetir a mesma rota e voltar ao contexto; falhas da empresa também oferecem repetir. Erros de gravação conservam edição nos fluxos existentes.
- Preparação usa “disponível para conferir”, sem percentual de conclusão ou selo de revisão fictício. Integração sem uso é identificada como opcional. Registros históricos de governança não somam pendências acionáveis.
- Créditos do mês incluem uso e testes e apresentam as categorias. Detalhes extensos ficam recolhidos; a projeção acima do plano aponta para consumo. Ciclo do plano e mês da consulta são distinguidos.
- Modelos manuais ficam recolhidos no modo recomendado. Segurança continua disponível. Eventos recebem títulos cotidianos com código rastreável.
- Perfil substitui “Role” na interface. Alterar perfil solicita confirmação e cancelar não grava; falha restaura a seleção. Editar permissões de perfil existente informa pessoas afetadas.
- Salvar página publicada diz que atualiza a página e pede confirmação. Configurações são organizadas por assunto; domínios, retenção e integrações mostram consequências antes de salvar. Cancelar preserva a edição sem mudar o servidor.
- Pedidos de conexão são abertos diretamente no pedido correspondente, mantendo a verificação de autorização antes de concluir. Revisão de acesso deixa explícito que vínculos locais e perfil de entrada precisam de conferências próprias.

## Evidência de validação local

Dados e sistemas externos simulados; não são prova de execução externa ou entrega de email em produção.

| Verificação | Resultado |
|---|---|
| Suíte completa de servidor, concorrência 1, Chromium disponível | 805/805 aprovados, sem falha, cancelamento ou skip |
| Regressões finais de servidor: conferência desconhecida, acompanhamento e programação | 28/28 aprovados |
| Servidor: programação e refinamento | 31/31 aprovados |
| Navegador: interface, refinamento, uso e programação | 16/16 aprovados |
| Navegador: recuperação, ações visíveis, cancelamento, histórico, administração | 18/18 aprovados |
| Navegador: primeiro acesso, governança e configurações | 12/12 aprovados |
| Interface | 29 telas em 1280, 390 e 320 px; conteúdo contido, controles, recuperação e foco |

A primeira rodada de 111 cenários encontrou expectativas antigas de campos agora recolhidos, rótulos e recuperação. Os cenários afetados foram corrigidos para percorrer a nova interface e repetidos, mantendo verificações de efeito, acesso e persistência. A tentativa inicial de instalar Chromium pelo primeiro espelho retornou arquivo incompleto; o instalador oficial concluiu pelo espelho alternativo. Tentativas sem o navegador não são evidência de validação.

## Critérios de aceitação verificados

1. Conferir não cria nem ativa agendamento; data, fuso e material aparecem antes de ativar.
2. Repetir criação não gera outra rotina; outra pessoa não recupera material/conversa do responsável.
3. A rotina persiste e a execução ocorre no servidor, sem depender da aba aberta; relógio simulado verifica vencimento, dia e fuso.
4. Falha na ativação mantém uma única rotina pausada e permite recuperar.
5. Refinamento usa o caso escolhido e material anterior; mantém a versão publicada e governança até uma publicação explícita.
6. Conferência parcial ou desconhecida não recebe linguagem de ausência de problemas.
7. Cancelar mudança de acesso/integração não grava; erro não afirma sucesso.
8. Ícones essenciais têm texto; teclado, foco e telas estreitas permanecem utilizáveis.

## Limites e acompanhamento

- Nomes genéricos e requisitos já cortados em versões antigas exigem revisão do conteúdo por quem conhece o trabalho. O objetivo integral está disponível; nenhuma versão corporativa existente foi reescrita automaticamente.
- Pedido editorial confundido com necessidade técnica exige conferir o sistema e a ação com o responsável. O atalho abre o pedido certo, mas não inventa sistema nem concede acesso.
- Revisão local não certifica o perfil de entrada. As duas conferências ficam explícitas e conectadas às telas existentes.
- Detalhes de consumo estão recolhidos; refinamentos adicionais de paginação/filtros históricos podem ser feitos sem remover registros.
- Não há declaração de conformidade WCAG integral nem substituição de teste de compreensão com pessoas leigas. Referências aplicadas: WCAG 2.2, rótulos/instruções, identificação de erros, foco e tamanho de alvo; divulgação progressiva e reconhecimento da ação/resultado.
- Verificação após publicação, disparo no horário real e email: registrar separadamente quando observados. Não usar “Executar agora” como prova de disparo pelo relógio.

## Situação da publicação

Implementação registrada no commit `35e201c`, branch local `fix/ux-guided-audit`. A consulta do GitHub confirmou que o repositório `theneilagencia/GreenIA` é público e pertence à conta conectada, com permissão administrativa. A revisão automática rejeitou o push porque a autorização de implementação não foi considerada autorização explícita de publicação pública do código. Não foi usado outro canal para contornar a rejeição. A versão observada na GreenIA continua `31f8f46`; as novas correções ainda não foram publicadas. Disparo pelo relógio real e aviso por email dependem da publicação e verificação posterior.
