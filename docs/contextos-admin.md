# Dois contextos para quem é admin: "Usar GreenIA | Administração"

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
- **Endereços:** um endereço de administração (`#/configuracoes`, `#/politicas`…) aberto por quem não
  administra volta para "Nova conversa".

**Testes:**

- `test/contexto-admin.test.js` lê do código todas as rotas administrativas e confere o 403 para quem não é
  admin, com e sem parâmetros forjados. Também confere as permissões de membro, leitor e gestor.
- `e2e/fluxo.test.js` confere a troca com um clique sem novo login, o contexto visível e o redirecionamento de
  quem não é admin.
