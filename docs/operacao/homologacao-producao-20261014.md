# Homologação em produção — 14/10/2026 (Etapas 5 e 6)

Executado em produção (https://www.greenia.com.br, versões ca16608 → 427e0d2) com dois tenants exclusivos de
homologação criados pelo responsável no console: `homologacao-a` e `homologacao-b` (plano GreenIA Starter). Só dados
sintéticos, com marcador próprio por tenant (`MARCA-HOMOLOG-A-…` / `MARCA-HOMOLOG-B-…`). Entrada pelo login normal
por código; códigos repassados pelo responsável e usados uma vez, sem registro. Cookies e CSRF só na memória do
processo (`scripts/qa-sessao.mjs`). Módulos: `scripts/qa-modulos/homolog-*.mjs`. Saídas (só ids e status) em
`qa-producao-saida/homolog-*` (fora do repositório).

Pessoas: admin A, admin B e usuário comum B (endereços `+` da caixa de teste do responsável). Dois cadastros digitados
errado no B foram **desativados** (não excluídos). Usuário comum no A não foi exercitado.

## Etapa 5 — isolamento, permissões e limites

**Preparação (cada tenant):** área "Restrita X"; documento na base da área; conversa com anexo contendo o marcador
(uma resposta curta de IA); Quick Win "Resumo sintético X" publicado com versões 1 e 2.

**Acesso cruzado** (`homolog-cruzado`), nos dois sentidos (B→A e A→B):

| Situação | Resultado |
|---|---|
| Sessão própria, ids do outro tenant (programação: ler, alterar, executar, pausar; conversa programada) | 404 em todos |
| Sessão própria, ids homônimos (conversa 1, Quick Win 1) | Abre o recurso **do próprio** tenant; marcador do outro ausente |
| Mesma sessão, contexto trocado para o endereço do outro tenant (15 rotas de leitura e escrita: eu, conversas, mensagem, documentos, Quick Wins, programações, executar, áreas, eventos, uso, integrações) | 401 em todas |
| Sem sessão, no contexto do outro tenant | 401 |
| Rota de plataforma com sessão de empresa | 401 |
| Marcador do outro tenant em alguma resposta | **Nenhuma** (resultado `sem_exposicao` nos dois sentidos) |
| Sessão própria depois de voltar ao próprio endereço | 200 |

**Usuário comum (B), sem perfil de admin** (`homolog-usuario permissoes`): admin/áreas, eventos, uso, alterar
configuração, criar pessoa, enviar documento à área restrita, editar e publicar Quick Win, programar, integrações →
**403**; ler documento da área restrita e a conversa do admin → **404**.

**Limites × consumo** (`homolog-config` + `homolog-usuario enviar` + `homolog-uso`), configuração original
`{limiteDiarioPessoa: 0, tetoPessoaMensal: 0, tetoMensal: 0}`:

| Configuração | Envio do usuário comum | Respostas de IA na empresa (antes → depois) |
|---|---|---|
| limite diário = 1 | 1º envio: 200, respondeu | 1 → 2 |
| limite diário = 1 | 2º envio: **429 `limite_diario`** | 2 → 2 |
| teto mensal por pessoa mínimo | **429 `teto_pessoa`** | 2 → 2 |
| teto mensal da empresa mínimo | **429 `teto_mensal`** | 2 → 2 |
| configuração original restaurada | 200, respondeu | — |

Cada negação gerou `policy.blocked` com o motivo e nenhuma resposta nova. Observação: o cliente de QA repete
automaticamente um 429 (trata como limite de rajada), por isso há 4 registros por negação.

**Não executado em produção** (coberto só por teste local): plano em reserva (exigiria consumir a franquia),
concorrência acima do plano, política de dados com CPF sintético diferente por tenant, conferência pelo console da
plataforma (consumo e auditoria) — fica para uma sessão do admin da plataforma.

## Etapa 6 — programação com aviso real

| Item | Evidência |
|---|---|
| Programação | `c8db8a9c-d571-4661-abb7-fc2dcacc760b`, diária 14:07 America/Sao_Paulo, limite 50 créditos, 1 por dia; criada 14:01 com o ambiente **ativo** (antes, em implantação, foi recusada com `responsavel_inativo` — correto) |
| Execução no servidor, sem navegador | `12fea756-919d-4749-9de6-297bf1a009c4`: prevista 17:07:00Z, criada 17:07:16Z, concluída 17:07:20Z, 0,2 crédito |
| Aviso | `quickwin.scheduled_notification_sent` às 17:07:20Z com `execucao` e `programacao` acima, `via: resend`, `mensagem: 01a13b61-ff79-7e8a-a271-5e3184dc3aae` — **aceito pelo provedor** |
| Chegada à caixa | **Pendente de confirmação humana** (caixa do admin A; assunto "Atualização de tarefa programada"). Entrega ao servidor de destino: sem acesso ao painel do Resend |
| Duplicação | Executar manualmente com o limite diário já usado → 409 `ocupada`, nenhuma execução nova |
| Nova versão publicada (v3) | Executar e reativar → 409 `versao_alterada`; nenhuma execução nova |
| Estado final | Programação **pausada** (`ativa: false`) |

**Não executado em produção:** cancelamento antes do horário com execução na fila, falta de material, permissão
revogada do responsável, orçamento esgotado na execução programada, reinício do serviço com fila, visão de outro
usuário do mesmo tenant sobre o resultado (cobertos por `test/qw-programacao.test.js`).

**Observações de produto (não bloqueiam):**
- Depois de uma nova versão, a lista ainda mostra a programação como ativa, embora toda execução seja recusada com
  `versao_alterada` (falha fechada). Vale um selo "precisa de revisão".
- Pausada, a programação continua informando `proxima_em`.
- No console, o resumo da empresa sobrepunha endereço e banco longos; corrigido e publicado em 427e0d2.

## Estado deixado

Tenants `homologacao-a` e `homologacao-b` ativos, com dados sintéticos (decidir: manter para próximas homologações ou
encerrar pelo console). Programação de teste pausada. Limites do B na configuração original. Sessões encerradas.
