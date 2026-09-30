# Migração única do release de copy b105df1

Registro histórico da migração `copy-release-b105df1-landings-v1`, que trocou por texto do modelo b105df1
os campos da landing e da marca que duas empresas ainda herdavam do modelo antigo. Só ids técnicos e nomes
de campo: nenhum nome de empresa ou texto de cliente.

## O que mudou

| Empresa (id técnico) | Campos |
|---|---|
| `emp_dc75e06e913f476d9ab2` | `subtitulo`, `destaques[2]`, `chamadas[2].texto`, `chamadas[3].texto`, `marca.privacy_note` |
| `emp_7137c3d7bcd64bb29f75` | `subtitulo`, `destaques[2]`, `chamadas[2].texto`, `chamadas[3].texto`, `textos.regras_titulo`, `textos.tarefas_sub`, `passos[0].texto`, `regras.sigilo[2]`, `regras.nunca[2]`, `marca.privacy_note` |

15 campos no total. `regras.sigilo[2]` passou a ser, inteiro (112 caracteres): "Com a opção de sigilo ligada pela
empresa, a conversa só usa recursos autorizados; se não houver, nada é enviado".

## Como rodou

- Release `ea986c8` (em cima de `b105df1`), no boot, antes de abrir as empresas e de aceitar tráfego.
- Pre-check sem escrita, ensaio real com ROLLBACK por empresa, aplicação uma empresa por transação e validação
  final (alvos, textos antigos ausentes, auditoria, `integrity_check`, política e config dos tenants intactas).
- Gravação só por `salvarLanding` e `salvarMarca`. Nenhuma política publicada; `sincronizarPolitica` não foi chamada.
- Resultado em produção: `aplicada_agora` em 2026-09-30.

## Rastros no banco da plataforma

- Marcador em `platform_settings`, chave `migracao:copy-release-b105df1-landings-v1` (data, empresas, 15 campos).
  Fica no banco como registro; o código que o lia saiu no commit de limpeza.
- `audit_log`: 4 registros com `origin` `{"painel":"migracao-copy-release-b105df1","migracao":"copy-release-b105df1-landings-v1","modo":"aplicar"}`
  (`landing_page.updated` e `branding.updated` de cada empresa), sem autor. O campo `before` de cada um guarda o
  valor anterior, e serve de base para desfazer só estes campos, se um dia for preciso.
- Backup anterior à migração: `dados/backups/pre-release-b105df1-20260930T194342` (integrity_check ok).

## Depois da migração

No mesmo boot, logo depois da migração, a marca nova (`privacy_note`) segue para a config de cada empresa pela sincronização
normal da plataforma (a mesma de todo boot e de quem salva a marca pelo console). Isso não cria versão de política.
