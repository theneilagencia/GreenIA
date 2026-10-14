# Ações que só o responsável pode fazer — roteiro em ordem de risco

Tudo o que dependia de código está publicado. Os itens abaixo exigem conta, decisão, contrato ou pessoas, e por isso
não foram feitos pela auditoria. Nenhum comando aqui imprime chave ou segredo. Onde houver `<…>`, substitua.

## 1. Chave do Render colada no chat (hoje, 2 min)
dashboard.render.com → Account Settings → API Keys → **Create API Key** (se ainda precisar de uma) → **Delete** na chave
antiga. Guarde a nova só no cofre de senhas.

## 2. Cópia da chave-mestra fora do servidor (hoje, 10 min, sem AWS)
Sem ela, as credenciais gravadas (conectores, chave do OpenRouter do console) não voltam numa recuperação.
1. Gere um segredo forte no cofre de senhas (32+ caracteres) e guarde-o como "GreenIA — segredo do envelope".
2. Render → serviço **greenia** → **Environment** → adicione `BACKUP_ENVELOPE_SEGREDO` = esse segredo → salve (o serviço
   reinicia; com o S3 ligado, o envelope também passa a ir para o bucket a cada backup).
3. Render → **Shell**:
   ```
   DADOS=/app/dados node scripts/chave-mestra.js impressao
   DADOS=/app/dados node scripts/chave-mestra.js selar --saida /tmp/envelope.json && cat /tmp/envelope.json && rm /tmp/envelope.json
   ```
4. Copie o JSON (está cifrado) para o cofre como "GreenIA — envelope da chave-mestra", junto da impressão (`cm1-…`).
   O envelope sozinho não abre nada: precisa do segredo do passo 1 (guarde os dois, em itens separados).

## 3. Backup fora do servidor (esta semana, ~30 min)
AWS (ou Cloudflare R2/Backblaze B2, compatíveis com S3):
1. Crie um bucket privado (bloqueio de acesso público ligado, **sem** Object Lock).
2. Regra de ciclo de vida no prefixo `greenia/`: expirar objetos atuais em **6 dias** e versões antigas em **1 dia**
   (ou 7 dias, se o versionamento estiver desligado). O código confere essa regra antes de cada envio e recusa sem ela.
3. Usuário IAM só para o app com a política de `docs/operacao/backup-e-restauracao.md` (Put/Get em `greenia/*`,
   List no prefixo, leitura da configuração de ciclo de vida/versionamento; **sem Delete**).
4. No cofre: gere `BACKUP_CHAVE_CIFRA` (no Shell: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
5. Render → Environment: `BACKUP_DESTINO=s3://<bucket>/greenia`, `S3_ENDPOINT`, `S3_REGIAO`, `S3_CHAVE`, `S3_SEGREDO`,
   `BACKUP_CHAVE_CIFRA` (e, se quiser, `S3_SSE=AES256`).
6. No dia seguinte (rodada das 06:00 UTC): console da plataforma sem faixa vermelha de backup; auditoria com
   `backup.completed` por banco e o objeto no S3.

## 4. Limpeza automática por prazo (antes de 30/11, de preferência depois do item 3)
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

## 9. Ensaio real de restauração (depois do item 3)
Serviço separado no Render alimentado pelo S3, nunca restaurando o disco de produção — roteiro em
`docs/operacao/backup-e-restauracao.md` §6–7 (`scripts/ensaio-restauracao.mjs`).

## 10. Aceite humano
5 pessoas leigas por perfil e 3 usuários de leitor de tela, com o protocolo de `docs/operacao/aceite-humano.md`.

## 11. Tenants de homologação
Console → Homologação A e B → **Encerrar ambiente…** (combinado).
