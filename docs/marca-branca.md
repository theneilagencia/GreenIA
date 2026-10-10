# White label no ambiente de cada empresa

No ambiente de uma empresa da plataforma multiempresa, a marca é a da empresa. Quem usa e o admin da empresa
não veem o nome nem o logo da plataforma.

| Onde | Como fica |
|---|---|
| Topo da lateral, login e página da política | Logo da empresa. Sem logo, o nome da empresa |
| Título da aba | O nome da empresa |
| Ícone da IA nas conversas e favicon | O ícone da empresa. Sem ícone, um ícone neutro (`/assets/ia-neutro.svg`) |
| Alternador | "Usar a IA \| Administração" |
| Textos das telas | "a GreenIA" vira "a IA", e "da GreenIA", "na GreenIA" ou "pela GreenIA" viram "da/na/pela plataforma" (`public/marca-branca.js`) |
| Apresentação da IA | "Você é a assistente de IA da {empresa}" |
| Emails do ambiente | Assunto e texto passam pelo mesmo filtro |
| Política de Uso | O texto padrão e a seção automática saem sem o nome da plataforma. Uma empresa que ainda tinha o texto padrão antigo recebe uma nova versão, registrada no histórico |
| Página de entrada da empresa | Sem o selo "com GreenIA" (`data-plataforma`) |

- **O filtro nunca altera o conteúdo das conversas** (o que a pessoa escreveu e o que a IA respondeu), nem
  campos de edição. Um texto que a própria empresa escreveu fica como ela escreveu.
- **Continuam com a marca da plataforma:** o site de vendas, o console da plataforma, o console do operador e
  a instalação própria (sem multiempresa).
- **Teste:** `e2e/marca-branca.test.js` entra num ambiente de empresa pelo navegador e percorre o login, o uso,
  a administração, uma conversa e a política. Ele falha se aparecer "GreenIA" em texto, atributo, título ou
  imagem.
