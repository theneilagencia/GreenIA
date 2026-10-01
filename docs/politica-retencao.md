# Política de retenção de dados e cópias

Responde: **depois que um dado é apagado no ambiente ativo, por quanto tempo ele ainda pode existir em cópias?**
Base: inventário de produção de 2026-10-01 (Render Shell) e o painel do serviço `greenia` no Render.

## Prazos por camada

| Camada | Regra | Prazo da camada | Como é aplicado |
|---|---|---|---|
| Banco em uso | A exclusão (pessoa, retenção da empresa, documento, quick win) apaga a linha; `secure_delete` zera as páginas | Imediato | `src/db.js` (`secure_delete = on`) |
| WAL / SHM | A exclusão consolida o WAL no banco e trunca o arquivo `-wal`; uma rodada de hora em hora consolida todos os bancos | Imediato após a exclusão; no máximo 1 hora, se o checkpoint estiver ocupado | `consolidarWal` (`pragma wal_checkpoint(TRUNCATE)`), sem VACUUM |
| Backup automático | Diário, um arquivo por banco; ficam no máximo 7 cópias por banco e nenhuma com mais de 7 dias | 7 dias (+ até 1 hora da rodada) | `fazerBackup` (contagem) + `src/retencao.js` (idade) |
| Snapshot do Render | Do provedor: captura a cada 24 h, disponível por 7 dias após a captura, imagem do disco inteiro | 7 dias após a captura | Painel do serviço (não configurável pelo código) |
| Backup manual | Pasta em `dados/backups` com `backup.json` (tipo, criação, motivo) | 30 dias desde a criação | `src/retencao.js`; criação por `node scripts/retencao.js manual` |
| Cópia de empresa excluída | `dados/excluidas/<empresa>-….sqlite.gz` com manifesto `….json` (excluída em, expira em) | 30 dias desde a exclusão (período de recuperação) | `excluirEmpresa` + `src/retencao.js` |
| Cópia anterior a uma restauração | `*.antes-da-restauracao` com manifesto | 30 dias | `restaurar` + `src/retencao.js` |
| S3 | **Inativo** em produção (nenhuma variável `BACKUP_DESTINO`/`S3_*`) | — | Não pode ser ligado sem regra de expiração (lifecycle) no bucket igual ou menor que 7 dias |
| Hold | `HOLD.json` (pasta) ou `<arquivo>.hold.json`: motivo, responsável, data e revisão opcional | Até ser liberado | Fora da limpeza; aparece no plano como "manter (hold)" |

## Quanto tempo um dado apagado ainda pode existir

As cópias se somam: o snapshot do provedor copia o disco inteiro, **inclusive os backups locais**. Um dado apagado
no instante *t* pode estar:

| Onde | Até |
|---|---|
| Na aplicação | Some em *t* |
| No banco em uso e no WAL | *t* (no máximo *t* + 1 h) |
| Em snapshot do disco ativo | *t* + 7 dias |
| Em backup automático | *t* + 7 dias + 1 h |
| Em snapshot que contém esse backup | *t* + 14 dias + 1 h → **até 15 dias** |
| Em backup manual ou cópia de empresa excluída, e no snapshot que o contém | *t* + 30 dias + 1 h + 7 dias → **até 38 dias** |
| Em hold | Enquanto o hold durar, com motivo registrado |

Valem só com a limpeza ligada em produção (`RETENCAO_APLICAR=1`) e sem item "sem classificação" no plano.

## Por que estes prazos

- **7 dias (automático):** cobre a recuperação de desastre do dia a dia (erro operacional, corrupção, exclusão
  indevida percebida em dias) e casa com os snapshots do provedor. Passar a regra de "7 arquivos" para "7 arquivos
  e no máximo 7 dias" fecha o caso em que um dia sem backup estica o prazo.
- **30 dias (manual):** cobre a janela de rollback e validação de release e migração (a primeira semana concentra
  os problemas; 30 dias dá folga para conferências de fechamento de mês). Além disso, restaurar uma cópia completa
  antiga apaga o que foi feito depois, e a utilidade cai muito. O que precisar de mais tempo (incidente, pedido
  legal) vai para hold, com motivo.
- **30 dias (empresa excluída):** período de recuperação depois da exclusão definitiva (exclusão por engano,
  pedido de devolução dos dados). Os Termos e a Política de Privacidade precisam dizer isso (Etapas 4 e 5).
- **WAL:** não há motivo operacional para conteúdo apagado ficar no arquivo de gravação; o checkpoint é do próprio
  SQLite, não reescreve o banco e devolve "ocupado" em vez de bloquear.

## Limpeza: dry-run, aplicação, logs e proteções

- **Rodada de hora em hora** no servidor (os dois modos, multiempresa e instalação única): consolida o WAL de
  todos os bancos abertos e monta o plano de limpeza.
  - Sem `RETENCAO_APLICAR=1`: só registra no log o que faria (dry-run).
  - Com `RETENCAO_APLICAR=1`: apaga o que venceu e grava `retention.deleted` (por item) e `retention.run`
    (resumo) na auditoria da plataforma.
- **Linha de comando:** `node scripts/retencao.js plano | aplicar --confirmar | hold | liberar | classificar | manual`.
- **Proteções:**
  - age só em `dados/backups`, `dados/excluidas` e nas cópias `*.antes-da-restauracao`;
  - nunca toca nos bancos em uso, nem nos `-wal`/`-shm` deles, nem em `.chave-mestra`;
  - ignora links simbólicos;
  - pasta manual sem `backup.json`, hold inválido e arquivo fora do padrão viram **alerta** e nunca são apagados;
  - cada item é conferido de novo antes de apagar: um hold criado depois do plano é respeitado;
  - a operação é idempotente.
- **Logs e auditoria:** só caminho, camada, tamanho, data de criação, idade e motivo. Nunca conteúdo.
- **Alerta de backup atrasado:** quando o backup automático mais novo de um banco tem mais de 26 horas.

## Backups existentes em produção (decisão aprovada em 2026-10-01)

| Item | Decisão | Comando no deploy (Etapa 9) |
|---|---|---|
| `dados/backups/pre-release-b105df1-20260930T194342/` | **Hold temporário**: evidência da migração corretiva e de rollback durante o fechamento da liberação de governança, retenção, legal e LP. Revisar e liberar conscientemente depois do release final estabilizado | `node scripts/retencao.js hold dados/backups/pre-release-b105df1-20260930T194342 --motivo "Evidência da migração corretiva b105df1 e rollback durante o fechamento da liberação de governança, retenção, legal e LP" --por "<responsável>" --revisar-em <data após a estabilização>` |
| `dados/backups/pre-deploy-20260930T164609/` | **Backup manual**, 30 dias desde a criação: expira em 2026-10-30T16:46:09Z | `node scripts/retencao.js classificar dados/backups/pre-deploy-20260930T164609 --criado-em 2026-09-30T16:46:09Z --tipo pre-deploy --motivo "Backup antes do deploy de 2026-09-30"` |
| `dados/backups/greenia-20260927-060019.sqlite.gz` | **Política normal** (automático, mais de 7 dias). Antes de apagar: aparecer no dry-run; confirmar que não é banco em uso nem hold; confirmar que os dados dela estão no banco em uso (é a instalação única importada como `emp_dc75…`, banco `dados/greenia.sqlite`) | Nenhum: sai na primeira aplicação, depois das conferências |
| Automáticos por banco (`plataforma/`, `emp_*/`) | Regra automática | — |

Ordem de ativação: backup pré-deploy → deploy com `RETENCAO_APLICAR` desligado → health check → conferir logs → plano
(dry-run) → hold e classificação acima → plano de novo → só então `RETENCAO_APLICAR=1`.

## Ativação em produção (release eb3c6c6, fechada em 2026-10-01)

| Item | Estado |
|---|---|
| Serviço | Render `greenia` (`srv-darrnsfavr4c73fu4m9g`), branch `greenia-lite`, `https://greenia.theneil.com.br` |
| Commit | `eb3c6c6` (`eb3c6c68a4fa69282893a044d4a78ac835fa8652`) antes e depois da ativação; nenhum commit, merge ou mudança de código durante a ativação |
| Backup pré-deploy | `dados/backups/pre-deploy-20261001T114538/` (4 bancos, `integrity_check` ok na origem e na cópia; manual, expira em 2026-10-31T11:45:38Z) |
| Hold | `pre-release-b105df1-20260930T194342`, gravado em 2026-10-01T12:51:44Z por "TheNeil (operação GreenIA)", sem data de revisão: revisar e liberar conscientemente depois da estabilização do release `eb3c6c6` |
| Classificação | `pre-deploy-20260930T164609`: manual, tipo `pre-deploy`, criado em 2026-09-30T16:46:09Z, expira em 2026-10-30T16:46:09Z |
| Variáveis | `RETENCAO_APLICAR=1`, `EXCLUSAO_APLICAR=1`, `PLATAFORMA_URL=https://greenia.theneil.com.br` |
| Reinícios | 2 redeploys de configuração (retenção; depois exclusão), ambos no mesmo commit e de volta a Live |
| Retenção depois de cada reinício | 0 a apagar, 16 mantidos, 0 alertas; nenhuma exclusão inesperada nem erro de boot observado |
| Exclusão automática | ativada com 0 empresas canceladas, 0 agendas, 0 datas estimadas e 0 exclusões elegíveis |

Antes da ativação (diagnóstico só de leitura no servidor): contatos 0 antes e 0 depois da migração (sem perda nem
duplicação; lista antiga removida), `.chave-mestra` presente e protegida, nenhum banco em uso marcado para limpeza,
`integrity_check` ok nos 3 bancos em uso, e o backup legado `greenia-20260927` com todas as linhas presentes no banco
em uso (sai na limpeza normal a partir de 2026-10-04T06:00:19Z).

Limitação: depois da ativação não houve acesso de Shell ao servidor. Os logs confirmam a rodada (0/16/0); as checagens
físicas do disco e de integridade continuam lastreadas no diagnóstico anterior à ativação.

Débito técnico (próximo release, com teste próprio; não é blocker): o `Dockerfile` copia só `scripts/backup.js`,
`scripts/restaurar.js`, `scripts/verificar.js` e `scripts/entrada.sh`. Faltam `scripts/retencao.js` e
`scripts/contatos.js` (plano, hold, classificação, contagem e rollback dos contatos dentro do container). A rodada
automática não depende deles (usa `src/retencao.js`). Correção: `COPY scripts/retencao.js scripts/contatos.js ./scripts/`.

## Como os prazos aparecem em documentos legais

Os limites de 15 dias (cópias diárias) e 38 dias (backup manual e ambiente excluído) são o **pior caso operacional
das cópias acessíveis pela plataforma e pelo provedor**. Não são garantia de destruição física de todos os blocos do
disco do provedor. Os textos legais distinguem: remoção do ambiente ativo; retenção em backups e snapshots; e possível
persistência física de blocos fora do alcance da aplicação.

## Riscos residuais

- **Blocos liberados no disco físico** do provedor (de arquivos apagados ou do WAL truncado) podem conter dados até
  serem reutilizados. Não são acessíveis pela aplicação nem pelo sistema de arquivos, mas podem fazer parte da
  imagem de snapshot.
- **Exportações feitas pela equipe de operação** (arquivo baixado) saem do disco do serviço e não seguem esta
  política. Ficam registradas em "Acessos da equipe de operação"; o destino é responsabilidade de quem pediu.
- **Sem prazo definido ainda:** logs de atividade da empresa (`eventos`), registros de consumo, auditoria da
  plataforma (`audit_log`) e registros de acesso da equipe de operação (`operator_access`, `operator_exports`). Não
  guardam conteúdo de conversa, mas guardam metadados, emails e justificativas. A Política de Privacidade precisa
  tratá-los até que ganhem prazo.
- **A rodada depende do processo no ar.** Fora do ar, a limpeza atrasa até voltar (o snapshot do provedor segue o
  próprio prazo).
- **Hold sem revisão** pode durar indefinidamente: o plano mostra o motivo, o responsável e a data de revisão.
