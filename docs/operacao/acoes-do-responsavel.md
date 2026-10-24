# Ações que só o responsável pode fazer — roteiro em ordem de risco

Tudo o que dependia de código está publicado. Os itens abaixo exigem conta, decisão, contrato ou pessoas, e por isso
não foram feitos pela auditoria. Nenhum comando aqui imprime chave ou segredo. Onde houver `<…>`, substitua.

## 1. Chave do Render colada no chat (hoje, 2 min)
dashboard.render.com → Account Settings → API Keys → **Create API Key** (se ainda precisar de uma) → **Delete** na chave
antiga. Guarde a nova só no cofre de senhas.

## 2. Cópia da chave-mestra fora do servidor (hoje, 10 min)
Sem ela, as credenciais gravadas (conectores, chave do OpenRouter do console) não voltam numa recuperação. Tudo no Render.
1. Gere um segredo forte no cofre de senhas (32+ caracteres) e guarde-o como "GreenIA — segredo do envelope".
2. Render → serviço **greenia** → **Environment** → adicione `BACKUP_ENVELOPE_SEGREDO` = esse segredo → salve (o serviço
   reinicia).
3. Render → **Shell**:
   ```
   DADOS=/app/dados node scripts/chave-mestra.js impressao
   DADOS=/app/dados node scripts/chave-mestra.js selar --saida /tmp/envelope.json && cat /tmp/envelope.json && rm /tmp/envelope.json
   ```
4. Copie o JSON (está cifrado) para o cofre como "GreenIA — envelope da chave-mestra", junto da impressão (`cm1-…`).
   O envelope sozinho não abre nada: precisa do segredo do passo 1 (guarde os dois, em itens separados).

## 3. Backup fora do disco de produção — só Render
Aprovado o menor custo (Starter + disco de 1 GB). Implementado: serviço privado `greenia-backup`
(`src/receptor-backup.js`, no `render.yaml`) que recebe a cópia cifrada de cada backup e expira em 7 dias. Passo a
passo para criar/ligar e testar: `guia-passo-a-passo.md`, Tarefa 6.

## 4. Limpeza automática por prazo (antes de 30/11)
Render → Environment: `RETENCAO_APLICAR=1` e `EXCLUSAO_APLICAR=1`. Antes, no Shell, veja o que seria eliminado:
`DADOS=/app/dados node scripts/retencao.js plano` (só leitura: o que seria apagado, mantido e alertado). Se aparecer item "sem classificação", resolva antes de ligar.

## 5. Aviso de tarefa programada
Publicado: o aviso agora traz o nome da empresa e o endereço de entrada (como o convite e o código, que chegam).
Para provar a entrega sem esperar uma programação, no Shell (envia **um** email para a caixa de teste):
```
node --input-type=module -e "import {criarEmail,smtpDeVariaveis} from './src/email.js';const e=criarEmail({lerSmtp:()=>({url:smtpDeVariaveis(process.env),remetente:process.env.SMTP_REMETENTE})});const r=await e.enviar('vinicius+homolog-a-admin@apymine.com','Tarefa programada atualizada na Homologação A','Uma tarefa programada foi atualizada na Homologação A.\n\nPara consultar o status e as pendências, acesse https://www.greenia.com.br/homologacao-a e abra Quick Wins. O conteúdo fica na plataforma.');console.log(r.via,r.id)"
```
Confira a caixa (inclusive Spam) e procure o id impresso no painel do Resend da equipe que tem o domínio
`theneil.com.br`.

## 6. Textos jurídicos (antes de 30/11)
Encaminhe ao jurídico `docs/legal/revisao-pendente/` (LEIA-ME explica cada mudança). O texto no ar ainda diz
"até 15/38 dias" para as cópias do disco do provedor, prazo sem sustentação. Aprovado o texto, a publicação é mecânica
(passos no LEIA-ME).

## 7. Pedido ao Render
Envie, do seu email, o texto de `docs/operacao/solicitacao-render-retencao.md` (pt-BR e inglês) ao suporte do Render.

## 8. OpenRouter
No painel da conta: registro de pedidos/respostas desligado, uso dos dados pela OpenRouter desligado, ZDR/opt-out de
treino na conta e fornecedores ignorados; decida sobre contrato (DPA) — detalhes em `docs/operacao/inventario-ia.md` §7.

## 9. Ensaio real de restauração
Depende do item 3 (serviço de backup no Render): restaurar a cópia num serviço separado do Render, nunca no disco de
produção — roteiro em `docs/operacao/backup-e-restauracao.md` §6–7 (`scripts/ensaio-restauracao.mjs`).

## 10. Aceite humano
5 pessoas leigas por perfil e 3 usuários de leitor de tela, com o protocolo de `docs/operacao/aceite-humano.md`.

## 11. Tenants de homologação
Console → Homologação A e B → **Encerrar ambiente…** (combinado).
