# Auditoria operacional — matriz promessa → evidência (14/10/2026)

Ponto de partida: produção em `d9c46c5`. Cada linha diz até onde a evidência chega. Categorias:
**produção** (comprovado em produção), **local** (só teste local ou simulação), **documento** (procedimento ou texto
pronto), **acesso** (bloqueado por falta de acesso), **n/a** (não aplicável), **humano** (depende de validação humana).
Nada aqui está "100% resolvido" enquanto houver linha em acesso, humano ou contrato.

## Acessos disponíveis na auditoria

| Recurso | Situação |
|---|---|
| Repositório e publicação em `greenia-lite` (deploy automático no Render) | Disponível |
| Páginas públicas e `/api/saude` | Disponível (só leitura) |
| Console da plataforma / sessão de empresa em produção | **Sem acesso** (login por código exige caixa de email; a tentativa no console foi recusada) |
| Caixa de email (Gmail) | **Sem acesso** (conector respondeu "Forbidden") |
| Shell/API do Render | **Sem acesso** (sem chave) |
| AWS/S3 | **Sem acesso válido** (credenciais do ambiente inválidas: `InvalidClientTokenId`) |
| Painel do Resend e do OpenRouter | **Sem acesso** |

## Matriz

| # | Promessa | Implementação | Configuração em produção | Teste | Evidência | Conclusão |
|---|---|---|---|---|---|---|
| 1 | IA sem treino com os dados; ZDR nas rotas sigilosas | `data_collection: deny` em cada chamada; `zdr: true` e fornecedor fixo nas sigilosas | Conta OpenRouter conferida em 14/10: fornecedores que treinam excluídos (pagos e gratuitos — o gratuito foi desligado nesta conferência), sem publicação de prompts, sem uso pela OpenRouter, logging desligado | `test/provedores-ia-sigilo.test.js` + prints do painel | `inventario-ia.md` §8 | **produção** (filtro do serviço; sem DPA, como a LP declara) |
| 2 | Rota sigilosa nunca relaxa em silêncio | Provedor fixo, `allow_fallbacks:false`, sem `models`/`plugins`; `:online` e `openrouter/*` não homologáveis; defesa final em `montarCorpo` e `gerarImagem` | Igual ao código | Negado = 0 requisições + 409 + alerta; 429/503 não cai em modelo não homologado | Testes | **local** |
| 3 | Pesquisa na web e geração de imagem tratadas à parte | Política 6.6 (proposta, não publicada); ajuda do admin corrigida ("filtro do serviço, não garantia contratual") | Geração de imagem ligada por padrão (decisão D4 pendente) | Quick Win sigiloso sem plugin web | Testes | **local** + **documento** |
| 4 | Cópias do disco do provedor: prazo real | Correção pronta em `docs/legal/revisao-pendente/` (sem "15/38 dias"; 6.6 sobre busca e imagem) | **Não publicada**: o ar continua com o texto aprovado, que ainda diz "7 dias após a captura" / "até 15/38 dias" | `test/legais.test.js` confere a proposta e que nada pendente está no ar | Proposta no repositório | **documento**; revisão jurídica pendente (**humano**); pedido ao Render **não enviado** |
| 5 | Eliminação por categoria | `src/retencao.js` + matriz sintética | `RETENCAO_APLICAR`/`EXCLUSAO_APLICAR` precisam estar `1` antes de 30/11/2026 | `test/retencao-matriz.test.js` | Testes | **local**; ativação em produção **acesso** |
| 6 | Backups de todos os bancos, fora do servidor, cifrados | `src/backup.js`, `src/backup-s3.js`: todas as empresas, AES-256-GCM, SHA-256 conferido, expiração lida do bucket | S3 desligado (`BACKUP_DESTINO` vazio): backups no mesmo disco | `test/backup*.test.js` com S3 falso que verifica SigV4 | Testes | **local**; bucket/IAM **acesso** |
| 7 | Alerta de falha por banco | `src/plataforma/backup-estado.js`: auditoria por banco, faixa no console, email aos admins da plataforma (1/dia) | Entra no ar com o deploy | Testes | Testes | **local** até a primeira rodada em produção |
| 8 | Recuperação da chave-mestra | Impressão digital no banco; envelope selado (`scripts/chave-mestra.js`) | Envelope selado gerado em produção em 14/10/2026 21:26 UTC, impressão `cm1-0db5fc0f945893922513477f`, guardado pelo responsável no cofre, separado da senha | Testes + ensaio | Saída do `selar` no Shell do Render | **produção** |
| 9 | Restauração isolada com RTO/RPO | `scripts/ensaio-restauracao.mjs`, `ENSAIO_ISOLADO=1` (sem rede de saída, IA simulada, email em memória) | Ensaio real requer bucket + serviço separado | 24/24 verificações; RTO 0,2 s (pequeno) e 6,5 s (2×79 MB) | Saída do ensaio local | **local**; real **acesso**. Metas 24 h/4 h são propostas |
| 10 | Isolamento entre empresas, permissões × limites | Código existente | Tenants `homologacao-a`/`homologacao-b` | Acesso cruzado nos dois sentidos, usuário comum, limite diário, teto por pessoa e da empresa | `homologacao-producao-20261014.md`: 0 exposição; 401/403/404; negações sem resposta nova nem consumo | **produção** (plano em reserva e concorrência: só **local**) |
| 11 | Quick Win programado com aviso real | Aviso com nome da empresa e link de entrada (a5c335f); evento grava `via` e id da mensagem | Programação no `homologacao-a` executou às 14:07 sem navegador; aviso no novo formato enviado em produção (7bb1c4b) | Execução programada + envio no Shell do Render | Resend `01a13c86-421a-7180-b605-98b97d7343a8`: **Delivered** e na **caixa de entrada** (conferido pelo responsável) | **produção** |
| 12 | Conexões fictícias antigas retiradas | `scripts/conexoes-qa.mjs` (na imagem desde e2363a3) | 12 conexões "QA - Sandbox" na Apy Mine → REVOKED (sem exclusão física) | Inventário → simulação → confirmação → inventário | `homologacao-producao-20261014.md`, Etapa 7 | **produção** |
| 13 | Sistemas externos (ERP etc.) | — | Não contratados | — | — | **n/a** |
| 14 | Compreensão por leigos e uso com leitor de tela | Protocolos em `aceite-humano.md` | — | — | — | **humano** (sem participantes) |

## Testes desta rodada

Ver o relatório final da sessão para os números das suítes completas no commit publicado. Tudo acima marcado como
**local** foi executado em banco temporário, com OpenRouter, S3 e email falsos; nada tocou produção.
