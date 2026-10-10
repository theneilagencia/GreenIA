# Dois contextos para quem é admin: "Usar GreenIA | Administração"

Arquitetura aprovada. Estas regras são invariantes:

1. Admin é uma permissão, não uma segunda conta.
2. Há um único login e uma única sessão.
3. A troca entre contextos leva um clique.
4. A troca não exige logout nem novo login.
5. Quem não é admin nunca vê o alternador.
6. A administração nunca se mistura à experiência normal de uso.
7. Nenhum detalhe técnico de modelo ou provedor aparece na interface de uso.
8. A autorização administrativa fica só no servidor. A tela reage ao 403 e nunca autoriza nada.
9. Cada tela pertence a um único contexto, sem duplicação.
10. Depois do login, todos começam em "Nova conversa". Entrar na administração é uma escolha explícita.

**Admin é uma permissão, não uma segunda conta.** A pessoa entra uma vez, com a mesma sessão, e troca de
contexto com um clique no alternador do topo da barra lateral. A troca não pede novo login e não cria outra sessão.

| | Usar GreenIA | Administração |
|---|---|---|
| Para quê | Uso normal: conversas, quick wins, conhecimento | Configurações, políticas, pessoas, modelos, consumo, atividade |
| Lateral | Igual à de qualquer pessoa: "Nova conversa" e conversas recentes | Fundo diferente, aviso "Administração da empresa — mudanças aqui valem para todas as pessoas" |
| Cabeçalho | Normal | Selo **ADMINISTRAÇÃO** e faixa escura no topo |
| Conversa | Sem informação técnica: nível e explicação simples, iguais às de quem usa | — |

- **Ao trocar,** a pessoa volta para a última tela em que estava naquele contexto (guardada na aba do navegador).
- **Na primeira vez,** o uso abre em "Nova conversa" e a administração abre no primeiro item que a pessoa pode ver.
- **A busca (Ctrl K)** lista os dois contextos. Os itens de administração ficam no grupo "Administração".
- **Não há funcionalidade duplicada.** Cada tela existe num só contexto.

## Segurança: quem decide é o servidor

A tela esconde a administração de quem não é admin, mas esconder não é proteção. A proteção é do servidor:

- **Rotas:** toda rota `/api/admin/*` exige `admin: true`. Com uma empresa só, isso quer dizer ser admin. No
  modo multiempresa, quer dizer ter a permissão da rota (`permissaoAdmin`). Nada disso mudou.
- **Parâmetros:** `?admin=1`, `papel`, `permissoes` ou `contexto` no corpo ou na URL não mudam nada. O
  papel vem só da sessão.
- **Endereços:** quando quem não administra abre um endereço de administração (`#/configuracoes`,
  `#/politicas`…), a tela não decide sozinha. Ela pergunta ao servidor antes de desenhar qualquer coisa da
  administração. O servidor responde **403**, e só então a tela volta para "Nova conversa" com o aviso
  "Esta área é da administração da empresa."
- **Leituras recusadas:** qualquer leitura de `/api/admin/*` recusada com 403 durante o uso, por exemplo porque
  a permissão foi retirada no meio da sessão, também leva de volta ao uso.

**Testes:**

- `test/contexto-admin.test.js` lê do código todas as rotas administrativas e confere o 403 para quem não é
  admin, com e sem parâmetros forjados. Também confere as permissões de membro, leitor e gestor.
- `e2e/fluxo.test.js` confere a troca com um clique sem novo login, o contexto visível e o redirecionamento de
  quem não é admin.
