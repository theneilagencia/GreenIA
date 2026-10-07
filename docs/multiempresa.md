# GreenIA multiempresa: auditoria, arquitetura e plano

## 1. Auditoria da aplicação atual

| Tema | Como está hoje |
|---|---|
| Autenticação | Código de 6 dígitos por email (`src/auth.js`), sessão em cookie HttpOnly guardada na tabela `sessoes` do banco da instalação, CSRF por cabeçalho. Um único contexto: a instalação |
| Usuários | Tabela `pessoas` (email, nome, `papel` = `admin` ou `usuario`, ativo). Email único por instalação. Não existe identidade global |
| Roles e permissões | Não existem. Há `papel` binário, responsável de área (`area_pessoas.responsavel`) e grupos. As rotas usam `{ admin: true }`. Operador da plataforma vem de variável (`OPERADOR_EMAIL`) |
| Banco | Um SQLite por instalação (`dados/greenia.sqlite`), com 23 tabelas: pessoas, sessões, áreas, grupos, modelos, documentos, quick wins, conversas, mensagens, uso, eventos, pacotes, leads e outras. Migrações por `pragma user_version` |
| Empresas | Uma empresa = uma instalação (processo + disco próprios). Nome, logo, cor e domínios ficam na tabela `config`. Plano vem de variáveis (`PLANO_*`). Criar empresa exige novo serviço no Render |
| Sem suporte a multiempresa | Login, sessão, pessoas, configuração, marca, plano e página inicial são únicos por processo. Não há slug, URL por empresa, status, plano cadastrado, convite nem auditoria administrativa com antes e depois |
| Riscos | `papel = admin` dá acesso a tudo da instalação; não há permissão granular. Plano e operador dependem de variáveis e reinício. O console do operador lê instalações remotas por token. A página inicial tem texto fixo no código |
| Reaproveitável | Todo o produto da empresa (conversas, quick wins, conhecimento, uso, políticas, modelos, créditos), o design system, o login por código, o roteador, as migrações, os testes |

## 2. Arquitetura proposta

Uma base de código, um processo, dois planos de dados:

1. **Plano de controle (banco da plataforma)** `dados/plataforma.sqlite`: empresas, planos, identidades de usuário, vínculos usuário-empresa, roles, permissões, marca, landing page, configurações, sessões e auditoria. Toda tabela ligada a uma empresa tem `company_id` explícito.
2. **Plano de dados (um banco por empresa)** `dados/empresas/<company_id>.sqlite`: o produto de sempre (conversas, quick wins, conhecimento, uso, créditos, eventos). O banco é aberto pelo `company_id` resolvido no servidor. Uma consulta da empresa A não consegue alcançar dados da empresa B, porque estão em outro arquivo.

Criar uma empresa cria o registro e o banco dela na hora, sem novo deploy. O ID da empresa é imutável; slug e domínio podem mudar sem quebrar relações.

### Resolução do tenant (sempre no servidor)

1. Domínio próprio cadastrado (`app.empresa.com.br`) → empresa dona do domínio.
2. Subdomínio da plataforma (`empresa.greenia.theneil.com.br`, com DNS curinga) → empresa pelo slug.
3. Caminho (`www.greenia.com.br/empresa`) → abre a landing da empresa e grava um cookie de contexto. As chamadas seguintes no mesmo endereço usam esse contexto.

A sessão guarda `company_id`. Se o tenant resolvido for diferente do da sessão, a sessão não vale. Trocar ID ou URL manualmente não dá acesso a outra empresa.

### Hierarquia

- **Nível 1, TheNeil:** `platform_admin` no banco da plataforma. Console em `/plataforma`. Pode entrar em qualquer ambiente, e a entrada é auditada.
- **Nível 2, empresa:** `company_admin` e roles próprias, só dentro do próprio tenant.
- **Nível 3, usuários:** `manager`, `member`, `viewer` ou roles criadas pela empresa.

## 3. Modelo de dados (banco da plataforma)

| Tabela | Campos principais |
|---|---|
| `companies` | id (texto imutável), name, slug (único), custom_domain (único), status (`em_implantacao`, `ativa`, `suspensa`, `cancelada`), plan_id, banco, created_at, updated_at |
| `company_slugs` | slug antigo → company_id (links antigos redirecionam) |
| `plans` | id, name, description, status, price_usd, credits, reserve, limits (json), features (json), rules (json), settings (json) |
| `users` | id, email (único), name, status |
| `platform_members` | user_id, role (`platform_admin`) |
| `company_users` | company_id, user_id, role_id, status (`convidado`, `ativo`, `inativo`), invited_by |
| `roles` | id, company_id (nulo = role de sistema), key, name, description, system |
| `permissions` | key, description, scope (`platform` ou `company`) |
| `role_permissions` | role_id, permission_key |
| `branding` | company_id, logo, favicon, primary_color, secondary_color, display_name, login_title, login_text, privacy_note, locked (json), company_can_edit |
| `landing_pages` | company_id, status, content (json: título, subtítulo, descrição, imagem, chamadas, botões, links, institucional), seo (json) |
| `company_settings` | company_id, settings (json), permissions_granted (json: o que a TheNeil libera para o admin da empresa editar) |
| `platform_settings` | chave, valor |
| `sessions`, `login_codes` | sessão com user_id e company_id (nulo = console da TheNeil) |
| `audit_log` | at, user_id, company_id, action, entity, entity_id, before, after, origin (ip, painel) |

No banco de cada empresa, `pessoas` ganha `user_id` (vínculo com a identidade global). Áreas, grupos e o resto continuam locais.

## 4. Autorização (RBAC)

Permissões por chave, sem `isAdmin`:

- **Plataforma:** `platform.companies.manage`, `platform.plans.manage`, `platform.users.manage`, `platform.settings.manage`, `platform.audit.read`
- **Empresa:** `company.read`, `company.manage`, `company.update`, `user.read`, `user.create`, `user.update`, `user.delete`, `role.manage`, `branding.manage`, `landing_page.manage`, `url.manage`, `settings.manage`, `usage.read`, `audit.read`, `models.manage`, `policy.manage`, `knowledge.manage`, `quickwin.manage`, `chat.use`

Roles de sistema: `company_admin` (todas as de empresa), `manager`, `member`, `viewer`. A empresa cria roles próprias com permissões do catálogo de empresa, nunca de plataforma. O mesmo usuário pode ter roles diferentes em empresas diferentes.

Para uma ação de personalização valer, três coisas precisam estar certas:
1. A pessoa tem a permissão.
2. O plano tem o recurso.
3. A TheNeil liberou o item para a empresa e não bloqueou o campo.

## 5. Rotas

| Área | Páginas | APIs |
|---|---|---|
| TheNeil | `/plataforma` (Empresas, Usuários, Planos, Ambientes, Uso, Auditoria, Configurações) | `/api/plataforma/*` com sessão de plataforma e permissão `platform.*` |
| Empresa (admin) | `/app#/empresa/...` (Visão geral, Usuários, Roles e permissões, Branding, Landing Page, URL e domínio, Configurações) | `/api/empresa/*` com tenant resolvido e permissão de empresa |
| Empresa (produto) | `/app`, `/entrar`, landing em `/` do domínio ou `/<slug>` | as de sempre, agora dentro do tenant |
| Público | landing e tela de login com a marca | `/api/publico`, `/api/publico/landing` |

## 6. Migrações

1. O banco da plataforma nasce com o esquema completo, as permissões, as roles de sistema e dois planos (Team e Company).
2. **Importação da instalação atual:** se `dados/greenia.sqlite` existir e a plataforma estiver vazia, ela vira a primeira empresa. Pessoas viram usuários com vínculo, os admins recebem `company_admin`, e marca e plano são copiados. Nada se perde.
3. Migração 3 do banco de empresa: `pessoas.user_id`.

## 7. Plano de implementação

1. Banco da plataforma, RBAC, validações e auditoria.
2. Registro de tenants: abre o banco da empresa e aplica plano, marca e vínculos.
3. Servidor multiempresa: resolução do tenant, login por empresa e por plataforma, sessões, proteção das rotas.
4. APIs da TheNeil e da empresa.
5. Console da TheNeil (`/plataforma`).
6. Telas de administração da empresa no app.
7. Landing page e login dinâmicos por empresa.
8. Testes do fluxo de aceite e de isolamento, documentação e variáveis.

## 8. O que continua como antes

O modo de instalação única (`criarApp`) continua funcionando para quem já usa, e o servidor multiempresa é ligado com `MULTIEMPRESA=1`. O console antigo de instalações remotas (`/operador`) continua para instalações antigas.

## 9. Como ficou implementado

| Parte | Onde |
|---|---|
| Banco da plataforma | `src/plataforma/db.js` |
| RBAC (permissões, roles de sistema e da empresa) | `src/plataforma/rbac.js` |
| Empresas, planos, usuários, marca, landing, URL, concessões | `src/plataforma/empresas.js` |
| Resolução do tenant, sessões, status e entrega ao ambiente da empresa | `src/plataforma/servidor.js`, `src/plataforma/sessao.js` |
| Login e página pública por empresa | `src/plataforma/api-publica.js` |
| APIs do console | `src/plataforma/api-plataforma.js` |
| APIs do admin da empresa | `src/plataforma/api-empresa.js` |
| Validações (slug reservado, domínio, cores, imagens, links) | `src/plataforma/validar.js` |
| Auditoria com antes e depois | `src/plataforma/auditoria.js` |
| Console | `public/plataforma.html`, `public/plataforma.js` |
| Admin da empresa | `public/empresa.js` e a seção Empresa do app |
| Editores de marca e landing (compartilhados) | `public/editores.js` |
| Testes de aceite, isolamento e segurança | `test/multiempresa.test.js` |

### Garantias testadas

- Sessão presa à empresa: trocar o cookie de contexto, o ID ou a URL não dá acesso a outra empresa (401).
- Um admin de empresa não vê usuários, roles ou conversas de outra, nem usa roles de outra empresa (404 ou 400).
- O console não existe no domínio de uma empresa, e o admin da empresa não usa as APIs da plataforma.
- As permissões são conferidas no servidor em toda rota administrativa, incluindo as telas antigas de gestão (mapa de permissões por rota).
- Suspender a empresa derruba as sessões na hora.
- O slug antigo redireciona para o novo; slugs reservados, duplicados e domínios da plataforma são recusados.
- Os limites e recursos do plano valem na hora: usuários, quick wins, conhecimento, marca, roles e mensagens por minuto.
- O último admin da empresa não pode ser desativado nem rebaixado.
- A auditoria registra quem, empresa, ação, entidade, antes, depois e origem. Imagens entram só com o tamanho.

### Limitações conhecidas

- Domínio próprio: o DNS é conferido pela plataforma e, com a API do Render configurada, o domínio é cadastrado e o certificado emitido sozinhos. Sem a API, o cadastro no Render é manual.
- Subdomínios por empresa exigem DNS curinga e certificado curinga no provedor.
- Todas as empresas rodam no mesmo processo. Além do isolamento de dados e de autorização, cada empresa tem limite de respostas simultâneas e de mensagens por minuto, para uma não degradar as outras; não há isolamento de CPU e memória por empresa.
- Exclusão definitiva só de empresa cancelada, com confirmação e cópia do banco em `dados/excluidas`. Os usuários continuam na plataforma (identidade global); os vínculos com a empresa são apagados.
