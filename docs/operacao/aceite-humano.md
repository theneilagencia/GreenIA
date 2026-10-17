# Protocolos de aceite humano — compreensão por leigos e uso com leitor de tela

Estado: **pendente**. Nenhuma sessão com participantes reais foi feita. Testes automatizados (axe, contraste,
alvos de toque, navegação por teclado) não substituem estas sessões.

## 1. Compreensão por pessoas leigas (não nativas digitais)

- **Participantes:** 5 pessoas por perfil (usuário comum; admin de empresa), que usem computador no trabalho mas não
  sejam da área de tecnologia; idade e escolaridade variadas. Ambiente de homologação com dados sintéticos.
- **Moderação:** pensar em voz alta; o moderador não explica a interface. Gravação de tela com consentimento.
- **Tarefas (cada uma com critério de sucesso sem ajuda e tempo):**
  1. Entrar pela primeira vez e fazer um pedido simples (resumir um texto colado).
  2. Anexar um arquivo e pedir uma comparação.
  3. Usar uma tarefa pronta (Quick Win) e avaliar o resultado (👍/👎).
  4. Encontrar uma conversa antiga e renomeá-la.
  5. Admin: aprovar os modelos sugeridos para dados sigilosos e explicar com as próprias palavras o que aprovou.
  6. Admin: agendar um Quick Win e dizer quando e onde o resultado vai chegar.
  7. Ler a Política de Privacidade (seção de cópias) e responder: "depois que eu apago, por quanto tempo pode existir
     cópia?" — a resposta esperada inclui que o prazo das cópias do provedor depende do fornecedor.
- **Medidas:** taxa de sucesso sem ajuda, tempo, erros, perguntas "pra que lado vou?", escala SEQ (1–7) por tarefa e
  SUS ao final. **Critério de aceite proposto:** ≥ 80% de sucesso sem ajuda em cada tarefa e SUS ≥ 70; toda resposta
  errada na tarefa 7 vira correção de texto.

## 2. Leitor de tela

- **Participantes:** 3 pessoas que usam leitor de tela no dia a dia (NVDA no Windows; VoiceOver no macOS e no iOS).
- **Tarefas:** as tarefas 1, 3, 4 e 6 acima, mais: abrir o menu da conta e trocar o tema; usar o menu "+" para anexar;
  ouvir o aviso "Resposta copiada"; preencher e enviar o diálogo do 👎.
- **Verificar:** ordem de leitura, nomes dos botões de ícone, anúncios das regiões vivas, foco ao abrir/fechar
  diálogos, tabelas lidas com cabeçalho, nada que dependa só de cor.
- **Critério de aceite proposto:** todas as tarefas concluídas sem ajuda visual; nenhuma barreira "bloqueadora"
  (WCAG 2.2 A/AA) aberta.

## Registro

Resultados em `docs/qa/aceite-humano-<data>.md` com participantes anonimizados, tarefas, medidas, barreiras e
correções. Só depois disso o aceite humano pode ser marcado como concluído.
