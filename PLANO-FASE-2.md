# Plano da Fase 2: base de produção multi-cliente

Plano para aprovação antes de escrever código. As decisões que dependem de você estão na seção 5.

## 1. Stack

| Camada | Proposta | Observação |
|---|---|---|
| Backend | **Node 22 LTS** + TypeScript + Fastify, em `server/` | O prompt propõe Node 20, mas o Node 20 saiu de suporte em abril de 2026. O Node 22 tem suporte até abril de 2027. |
| Banco | PostgreSQL 16 + pgvector, com Row-Level Security | Kysely para consultas tipadas; migrações em SQL puro, numeradas e versionadas. |
| Documentos | Armazenamento compatível com S3, com criptografia em repouso | MinIO no ambiente local. |
| Fila | BullMQ + Redis | Leitura e indexação de documentos, tarefas longas e expiração da retenção. |
| Validação | Zod | Configuração de tenant, política de dados e corpo das rotas. |
| Login | Servidor faz o login (OIDC com `openid-client`) e guarda a sessão em cookie `httpOnly` | Nenhum token fica acessível ao JavaScript da página. Entra ID, Google Workspace e código por email usam o mesmo fluxo. |
| Modelo | Interface `LlmProvider`; implementação Anthropic com `@anthropic-ai/sdk` | Provedor e modelo por tenant. Padrão para conversa Verde: o modelo mais leve da Anthropic (hoje, Haiku 4.5). |
| Busca semântica | Interface `EmbeddingProvider` | A Anthropic não oferece modelo de embeddings. Precisa de decisão (seção 5). |
| Frontend | O `.dc.html` da Fase 1, falando com o backend | Detalhes abaixo. |

**Frontend: o runtime do `support.js` serve fora do Claude Design.** Isso já está comprovado: todos os testes de ponta a ponta das Fases 1 e 1B rodam as páginas num servidor comum, fora do Claude Design. Então não há migração de framework:
- **Chamada ao modelo.** `window.claude.complete` dá lugar a `fetch('/api/chat')`, lendo o streaming (SSE) pela resposta.
- **React sem CDN.** O `support.js` só busca o React no unpkg se `window.React` ainda não existir. Com dois `<script>` antes dele, o React passa a ser servido pelo próprio backend, sem CDN em produção e sem editar o `support.js` (arquivo gerado).
- **Modo demonstração.** Um prop `backendUrl` decide o modo. Vazio, como no preview do Claude Design, a página continua usando `window.claude.complete`, e o arquivo segue abrindo e funcionando lá. Preenchido, usa o backend.
- **Textos e marca do tenant.** Frases como "A IA do dia a dia do Grupo", logo, cores, `policyUrl`, `privacyNote` e `privacyDetail` vêm de `GET /api/tenant/config` e deixam de ser fixos no código.
- **Filtro nas duas pontas.** O backend importa o mesmo `lib/greenia-core.js`. A cópia dentro do `.dc.html`, o `npm run sync` e o `check-sync` continuam existindo enquanto o frontend rodar no `support.js`.

## 2. Modelo de dados

Todas as tabelas de dados de cliente têm `tenant_id` e política de RLS.

- **Tenant e acesso:** `tenants` (nome, marca, textos, política de dados padrão, provedor e modelo, cotas, prazos de retenção, em `config jsonb` validado por Zod), `tenant_domains`, `tenant_auth_providers`.
- **Pessoas:** `users`, `areas`, `memberships` (usuário × área × papel), `sessions`, `login_codes`.
  - Papéis: `usuario`, `revisor`, `key_user`, `admin_cliente`, `admin_theneil`.
- **Assistentes:** `assistants` e `assistant_versions` (persona, classes de dado aceitas, ação por tipo detectado, retenção, áreas). A Fase 3 amplia essas tabelas com pipeline, saída e medição.
- **Base de conhecimento:** `kb_documents` (área, dono), `kb_document_versions` (hash, objeto no S3), `kb_chunks` (texto, `tsvector`, `embedding vector`).
- **Saídas e evidência:** `outputs` (saídas retidas, com `expires_at`), `output_sources` (documentos e versões usados).
- **Operação:** `audit_log` (somente inclusão; o encadeamento por hash entra na Fase 3), `usage_events` (tokens e custo), `quota_alerts`.

**Isolamento:**
- O backend conecta com um papel do banco sem `BYPASSRLS`.
- Cada requisição roda numa transação com `SET LOCAL app.tenant_id` e `SET LOCAL app.user_id`. As políticas comparam `tenant_id` com esse valor.
- A permissão por área também fica no banco: `kb_chunks` só retorna linhas de áreas em que o usuário tem vínculo.
- As operações da TheNeil (`admin_theneil`) usam uma conexão separada, sempre registrada na auditoria.

## 3. Como cada item será atendido

1. **Multi-cliente:**
   - Tudo que hoje é "do Grupo" vira configuração do tenant.
   - No cadastro, cada cor usada em texto é validada contra os fundos do tema, com a lógica de `scripts/check-contrast.mjs` movida para `lib/`. Abaixo de 4,5:1, a variante de texto é gerada escurecendo no mesmo matiz, como no 1B.4.
2. **Proxy do modelo:**
   - `POST /api/chat` passa por `LlmProvider`.
   - A persona vai no parâmetro `system`, montada no servidor a partir do tenant e do assistente, e o `seed` da Fase 1 sai.
   - As chaves ficam em variáveis de ambiente (ou no cofre de segredos do provedor de nuvem).
3. **Streaming** por SSE. O typewriter falso sai quando há backend e fica só no modo demonstração.
4. **Autenticação:**
   - Entra ID e Google via OIDC, com validação de assinatura, `aud`, `iss` e `tid` ou `hd` do domínio.
   - Código de 6 dígitos por email, com validade curta e limite de tentativas.
   - Domínios permitidos por tenant, e usuário e tenant resolvidos pela sessão em toda rota.
5. **Papéis e áreas:** checagem de papel nas rotas e filtro por área no banco (RLS), com teste de que quem não é do RH não vê documento do RH.
6. **Política de dados:**
   - O mesmo `decideAction` roda no servidor antes de qualquer chamada ao modelo, com a política do tenant e do assistente.
   - Ações: `bloquear`, `avisar`, `mascarar`, `permitir` e `permitir_com_registro`. Credencial é sempre bloqueada.
   - A confirmação de um aviso vai para a auditoria (tipo e confirmação, nunca o valor).
   - A segunda camada está na seção 4.
7. **Retenção:**
   - Conversa livre não é gravada.
   - Saída de assistente com evidência é gravada com `expires_at`, e uma tarefa na fila apaga o que venceu.
   - A retenção do lado do provedor e o contrato da classe Amarela vão para o relatório.
8. **Base de conhecimento:**
   - Interface `KnowledgeSource`, com implementação híbrida: palavra-chave da Fase 1, `tsvector` e embeddings.
   - Filtro por tenant e área, versão por documento, e registro de documentos e versões usados em cada resposta.
9. **Limites:**
   - Limite de requisições por usuário e por tenant (Redis) e tamanho máximo de mensagem e de arquivo.
   - Cota mensal por tenant, com alerta em 80% e 100%.
10. **Operação:** `.env.example`, `README.md`, `Dockerfile`, `docker-compose.yml` (Postgres com pgvector, Redis, MinIO e o backend), migrações, health check, logs estruturados sem conteúdo de mensagens e rotina de backup documentada.
11. **Testes:**
    - Sem token ou com token de outro tenant: recusado.
    - Isolamento entre tenants, testado no banco real com RLS ligada.
    - Área restrita invisível para quem não é da área.
    - CPF bloqueado no servidor com o filtro do navegador desligado.
    - Streaming de ponta a ponta com provedor simulado.

**Viabilidade neste ambiente:**
- Postgres 16 com pgvector, Redis e Docker funcionam aqui, então os testes vão rodar contra banco, fila e armazenamento reais.
- Os logins do Entra ID e do Google serão testados com um emissor OIDC simulado. O teste com os provedores reais depende de registrar o app em cada um (vai no relatório).

## 4. Segunda camada do filtro: avaliação

O que falta pegar são nomes de pessoa soltos no texto, sem marcador como "colaborador" ou "cliente". Montei dois conjuntos de frases fictícias no estilo de pedidos à GreenIA (`eval/nomes/`) e medi com `node eval/nomes/avaliar.mjs`:
- **teste:** 91 frases e 63 nomes;
- **validação:** 55 frases e 32 nomes, escrito depois dos ajustes e usado só para medir.

| Opção | Conjunto | Nomes achados | Precisão | Frases sem nome com aviso indevido | Tempo |
|---|---|---|---|---|---|
| A. Regras atuais | teste | 6,3% | 100% | 0% | menos de 0,1 ms por frase |
| A. Regras atuais | validação | 0% | – | 0% | menos de 0,1 ms por frase |
| B. Local: listas de nomes + forma do texto | teste, primeira passada | 93,7% | 98,3% | 2,8% | menos de 0,1 ms por frase |
| B. Local, após 3 ajustes feitos com o próprio conjunto de teste | teste (resultado viciado) | 100% | 100% | 0% | menos de 0,1 ms por frase |
| **B. Local (medida honesta)** | **validação** | **50,0%** | **84,2%** | **12,0%** | menos de 0,1 ms por frase |
| C. Modelo de NER em português rodando na TheNeil | não medido | – | – | – | – |

**O que os números dizem:**
- A opção B depende de o prenome estar na lista. No conjunto de validação, metade dos nomes não estava (Genivaldo, Nilton, Dmitri, Pietro, Talita). Ela também confunde nome de lugar ou objeto com pessoa ("Estádio Mário Filho", "Maria Fumaça").
- Não serve sozinha. Pode servir de apoio a um modelo, sem custo.

**Opção C, a recomendada: um modelo de NER em português servido localmente.** Nenhum texto sai para terceiros antes da decisão. Os candidatos são:
- um BERT em português ajustado para entidades (família BERTimbau), rodando com ONNX Runtime num contêiner próprio;
- ou o spaCy `pt_core_news_lg`, que marca pessoas (`PER`).

Os três números que o prompt pede ficam assim:
- **Opção escolhida:** C, com B como apoio.
- **Custo:** uma estimativa, ainda não medida. Um contêiner de 2 vCPU e 4 GB atende a GreenIA de um cliente pequeno, na faixa de R$ 150 a R$ 400 por mês conforme o provedor de nuvem, com dezenas de milissegundos por mensagem curta.
- **Taxa de acerto:** **não medi.** Os modelos ficam no HuggingFace e nos releases do GitHub, e a política de rede deste ambiente bloqueia os dois hosts (`huggingface.co`, `objects.githubusercontent.com`).
  - Para medir, é preciso liberar esses hosts na configuração de rede do ambiente (menu do ambiente na barra de título da sessão → Editar → acesso à rede). Com isso, rodo os dois candidatos nos mesmos conjuntos antes de você decidir.
  - Não vou citar números publicados desses modelos, porque foram medidos em texto jurídico ou jornalístico, não em pedidos do dia a dia.

**Viés dos conjuntos:** escrevi os dois conjuntos e o candidato B, então há viés a favor dele. Antes de decidir a segunda camada, vale um terceiro conjunto escrito por outra pessoa, de preferência com frases reais anonimizadas da Repet.

Conforme o prompt, nada da segunda camada será implementado sem seu aval.

## 5. Decisões que preciso de você

1. **Node 22 em vez de Node 20.** O 20 saiu de suporte em abril de 2026. Recomendo o 22.
2. **Provedor de embeddings para a busca semântica.**
   - Opção (a): um serviço externo, por exemplo o Voyage AI, indicado pela Anthropic. O texto dos documentos da base sai para esse provedor, o que exige revisão da SI.
   - Opção (b): um modelo local. Nada sai, mas precisa do HuggingFace liberado para baixar o modelo.
   - Até decidir, a busca funciona só com palavra-chave e `tsvector`, atrás da mesma interface.
3. **Liberar `huggingface.co` na rede do ambiente.** Isso me permite medir a opção C e, se escolhida, o embedding local.
4. **Login pelo servidor com cookie de sessão** (seção 1) em vez de MSAL no navegador. Recomendo pelo servidor: um fluxo só para os três provedores e nenhum token no JavaScript.
5. **Envio do código por email:** SMTP genérico com variáveis de ambiente (recomendado para começar) ou um serviço específico (SES, SendGrid).
6. **Nuvem e região de produção.** O código não depende de um provedor de nuvem. A região define onde ficam banco, documentos e cofre de segredos, o que interessa à SI e ao contrato com a Repet.

## 6. Ordem de entrega

Um commit por item, na ordem:
1. esqueleto do `server/` e migrações com RLS;
2. tenants e configuração;
3. autenticação;
4. papéis e áreas;
5. proxy do modelo com streaming;
6. política de dados no servidor;
7. base de conhecimento;
8. retenção;
9. limites e cotas;
10. frontend ligado ao backend;
11. operação (Docker, compose, README);
12. testes de isolamento e de ponta a ponta.

Ao final, `RELATORIO-FASE-2.md` e a atualização de `PENDENCIAS-SEGURANCA.md`.
