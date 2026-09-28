# Auditoria: quem usa não administra a plataforma

Princípio: a pessoa diz o que precisa. A GreenIA decide como fazer, com segurança. Uma decisão que a plataforma
ou a governança da empresa pode tomar não vai para quem usa.

Classificação de cada mensagem ou fluxo:

- **A. Automática**: a GreenIA resolve sozinha e explica depois, em linguagem simples.
- **B. Administrativa**: aparece só no console da empresa ou da plataforma, nunca no fluxo de quem usa.
- **C. Impossibilidade operacional**: bloqueio seguro, com uma explicação simples. O admin é avisado quando precisa agir.
- **D. Escolha real da pessoa**: preferência legítima, que tem um padrão bom e nunca é obrigatória.

Ordem de prioridade da decisão, da mais forte para a mais fraca: segurança e governança, requisitos da tarefa,
capacidade, contexto, preferência, latência. Nunca se afrouxa segurança para resolver disponibilidade.

## Defeitos encontrados e corrigidos

| # | Antes | Problema | Agora | Classe |
|---|---|---|---|---|
| 1 | 409 `precisa_homologado`: "vai usar o modelo homologado X", com `sugestao` para a tela reenviar | Pedia uma decisão técnica e expunha o modelo | A escolha que não serve para dado sigiloso é trocada, no servidor, pelo roteamento automático entre os recursos autorizados. Não há pergunta nem reenvio | A |
| 2 | "Esta conversa tem dados sigilosos e ainda não há modelo homologado. Fale com o admin." | Mandava a pessoa resolver a governança | "Não foi possível processar esta solicitação com segurança. Os recursos de IA desta empresa ainda não estão autorizados a receber este tipo de informação. Nenhum conteúdo foi enviado. O administrador foi informado." O admin recebe email e o bloqueio é auditado | C |
| 3 | 403 `modelo_nao_liberado` / `modelo_sem_acesso` ao pedir uma classe ou modelo | O erro virava pergunta para a pessoa | O pedido segue no automático, dentro do que a pessoa pode usar. O acesso por grupo não é afrouxado e a troca fica registrada (`escolha_substituida`) | A |
| 4 | "Nenhum modelo liberado atende a este pedido agora. Fale com o admin." | Instrução técnica | "Não foi possível processar esta solicitação agora. Nenhum conteúdo foi enviado. O administrador foi informado." e o admin recebe um aviso | C |
| 5 | "passam do tamanho que os modelos liberados aceitam" | Termo técnico | "Este conteúdo é grande demais para ser analisado de uma vez. Envie uma parte do material por vez." O admin não é acionado, porque não é problema de governança | C |
| 6 | "A IA ainda não está configurada: falta a chave OPENROUTER_API_KEY no servidor. Avise o admin." e "O serviço de IA recusou: …" | Expunha provedor, chave e erro bruto | "A IA está temporariamente indisponível. A equipe responsável já foi avisada." O detalhe fica no evento `ai.failed`, e o admin recebe um aviso por dia | C |
| 7 | Explicação "Por que este modelo?" com classe, janela de contexto e tokens | Termos técnicos | Quem conversa vê "Por que esta escolha?" com uma explicação simples. O admin continua vendo a explicação técnica completa, e o registro guarda as duas | A |
| 8 | Seletor "Classe" sempre visível, com "· Homologado" | Parecia obrigatório e expunha a governança | Seletor "Nível", opcional ("Automático (recomendado)"), visível só quando há mais de uma opção. O selo de homologado aparece só para o admin | D |
| 9 | O fornecedor técnico ia na API de mensagens para todos | Vazamento técnico, embora a tela escondesse | O servidor devolve `fornecedor: null` para quem não é admin | B |
| 10 | Quick win fixo numa classe sem modelo: erro 403 para quem usa | O defeito de configuração ia para quem usa | Atende no automático, na mesma governança. Quem gere recebe o aviso `quick_win_sem_modelo` | A e B |
| 11 | Cada empresa precisava homologar um modelo antes da primeira conversa sigilosa | Governança transferida para cada admin | A operadora autoriza modelos para dado sigiloso em todas as empresas pelo console (Configurações → Modelos autorizados). A empresa não consegue retirar essa autorização, mas pode homologar outros modelos | B |
| 12 | Banner do admin "Homologue um modelo do perfil Rápido…" | Não dizia o impacto nem a alternativa | O banner diz que as conversas sigilosas estão bloqueadas com segurança, que nada é enviado e que o admin é avisado. Oferece duas saídas: homologar um modelo ou pedir a autorização da plataforma | B |
| 13 | "Os créditos acabaram: esta resposta usa a classe Rápido" | Termo técnico | "Os créditos deste mês acabaram: até a renovação, as respostas usam o modo econômico." | A |
| 14 | "Mensagem acima de 20000 caracteres." | Seca, sem orientação | "Esta mensagem é longa demais para enviar de uma vez (até 20.000 caracteres). Divida em partes ou envie o material como anexo." | C |

## Camada de resolução do pedido (`src/conversas.js`)

Antes de qualquer bloqueio, a GreenIA percorre as alternativas nesta ordem:

1. A escolha da pessoa, se as regras permitirem.
2. Uma escolha não permitida (classe sem acesso, modelo não liberado, não autorizado para dado sigiloso, fora da
   reserva do plano, quick win sem modelo) vira roteamento automático entre os recursos permitidos.
3. No roteamento, o modelo principal pode dar lugar a:
   - uma reserva, desde que ela também passe pelas regras;
   - um modelo com janela maior, quando o conteúdo não cabe;
   - o mais capaz permitido, quando o ideal não está disponível.
4. Sem alternativa segura, a GreenIA:
   - bloqueia e grava a decisão no roteamento (`bloqueado`), com os candidatos e o motivo de cada exclusão;
   - registra o evento `governance.blocked`;
   - avisa os admins da empresa e a operadora (`governance.admin_alert`), no máximo uma vez por dia por causa;
   - mostra à pessoa uma mensagem simples, que nunca ensina a contornar a regra.

As causas de aviso ao admin (`src/avisos-governanca.js`) são estas:

- `sem_modelo_sigilo`
- `sem_modelo`
- `plano_reserva`
- `quick_win_sem_modelo`
- `ia_fora`

## Mensagens que ficam como estão

| Mensagem | Classe | Motivo |
|---|---|---|
| Dado bloqueado pela política (CPF, credencial): "…não pode ser enviado" | C | A regra é da empresa, e a mensagem diz o que tirar do texto |
| Anexo: "formato não aceito. Use PDF com texto, DOCX, TXT, MD, CSV ou XLSX" / "parece ser uma imagem" | C | Orientação da tarefa, sem termo técnico de IA |
| "Seu acesso está desativado. Fale com o admin." | C | Só o admin pode reativar |
| "Você atingiu o seu teto de gasto de IA deste mês…" | C | É um limite definido pela empresa |
| "Muitas mensagens em pouco tempo…" | C | Proteção da plataforma |
| Chave "Dados sigilosos" na conversa | D | Deixa a pessoa proteger um dado que o sistema não reconhece. Só endurece a regra |
| Nível (Automático, Rápido, Equilibrado, Avançado) | D | Opcional, e o Automático é o padrão |
| Quick wins: "Escolha uma classe de modelo…", "Homologue um modelo…" | B | Só para quem cria e gere quick wins (papel de gestão) |
| Gestão → Modelos, Roteamento, Políticas | B | Console da empresa |
| Console da plataforma (chave de IA, email, modelos autorizados) | B | Console da operadora |

## Testes (`test/usuario-leigo.test.js`)

Os 20 cenários pedidos estão cobertos. Cada teste confere:

- que nenhum texto visto pela pessoa (erro, aviso da conversa, explicação) tem termo técnico (modelo, homologação,
  classe, perfil, janela, token, configurar, liberar, provedor, fornecedor, "fale com o admin");
- que não há `sugestao` de modelo para a pessoa escolher;
- que nada é enviado quando há bloqueio;
- que a decisão fica auditada;
- que o aviso ao admin sai quando a intervenção é necessária, e só uma vez.

| Cenário | Resultado esperado |
|---|---|
| 1. Sigilosa sem modelo elegível para a pessoa | Bloqueio seguro (C) |
| 2. Sigilosa com modelo elegível em outro nível | Usa o autorizado (A) |
| 3 e 7. Principal indisponível, com reserva | A reserva responde (A) |
| 4. Capacidade necessária sem acesso | O mais capaz permitido, com a causa na auditoria (A) |
| 5. Conteúdo maior que a janela do nível econômico | Vai para um modelo que lê tudo (A) |
| 6. Chave recusada pelo provedor | Mensagem simples e aviso ao admin (C) |
| 8 e 16. Principal e reserva fora; nova tentativa | Mensagem simples; depois volta a funcionar (C, depois A) |
| 9. Pessoa sem conhecimento técnico | Pede e é atendida; o seletor não mostra identificadores técnicos (A) |
| 10. Configuração incompleta (quick win sem modelo) | Automático e aviso a quem gere (A e B) |
| 11. Nenhum modelo homologado | Bloqueio, aviso ao admin, sem repetir o email (C) |
| 12. Nível sem permissão para o grupo | Não é usado; o automático resolve (A) |
| 13. Pedido que exige mais capacidade | Sobe de nível sozinho (A) |
| 14. Pedido simples | Nível econômico (A) |
| 15. Anexo de tipo desconhecido | Orientação simples, nada enviado (C) |
| 17. Dado confidencial com escolha de modelo não autorizado | Nunca vai ao não autorizado (A) |
| 18. Automático do provedor | Nunca usado com dado sigiloso; fora disso, explicado sem termos técnicos (A e D) |
| 19. Conteúdo incompatível com todos os modelos | Orientação da tarefa, sem acionar o admin (C) |
| 20. Nenhum modelo liberado | Bloqueio, auditoria e aviso ao admin (C) |
| Extra: plataforma | A operadora autoriza um modelo para todas as empresas, e a empresa não consegue retirá-lo (B) |
