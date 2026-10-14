# Guia passo a passo — tarefas no Render e na GreenIA

Feito para quem não é da área técnica. Siga na ordem. Cada tarefa diz **quanto tempo leva**, **onde clicar** e
**como saber que deu certo**. Quando houver um comando, copie e cole exatamente como está.

Antes de começar, tenha à mão:
- o acesso ao painel do Render (dashboard.render.com);
- o seu cofre de senhas (1Password, Bitwarden ou similar);
- o acesso ao email de teste `vinicius+homolog-a-admin@apymine.com`.

> **Como colar um comando no Shell do Render:** no painel do serviço, clique em **Shell** (menu da esquerda). Abre
> uma tela preta com um cursor piscando. Clique dentro dela, cole o comando (Ctrl+V ou Cmd+V) e aperte **Enter**.
> Espere aparecer de novo a linha que termina com `#` antes de colar o próximo.
>
> Mensagens com `ExperimentalWarning: SQLite is an experimental feature` são normais. Pode ignorar.

---

## Tarefa 0 — Conferir se a última versão entrou no ar (2 minutos)

1. Abra **dashboard.render.com** e clique no serviço **greenia**.
2. No menu da esquerda, clique em **Events**.
3. Procure as linhas mais recentes, com os códigos **1feeda3** ou **00f7dd1**.
   - Se aparecer **"Deploy live"**, está tudo certo. Siga para a Tarefa 1.
   - Se aparecer **"Deploy failed"** ou **"Build failed"**, clique na linha e depois em **Logs**. Tire um print das
     últimas linhas e me mande.
   - Se não aparecer nenhuma das duas, clique em **Manual Deploy** (botão no alto) e depois em
     **Deploy latest commit**.
4. **Como saber que deu certo:** abra https://www.greenia.com.br/api/saude no navegador. O texto deve mostrar
   `"versao":"1feeda3"` (ou um código mais novo).

---

## Tarefa 1 — Trocar a chave do Render que foi colada no chat (3 minutos)

Uma chave colada numa conversa deve ser trocada. É como trocar a senha depois de mostrá-la a alguém.

1. No painel do Render, clique na sua **foto ou iniciais** no canto superior direito.
2. Clique em **Account Settings**.
3. Procure a seção **API Keys**.
4. Na chave que começa com `rnd_lCaJ…`, clique em **Delete** (ou no ícone de lixeira) e confirme.
5. Só se você usa chave de API em algum outro lugar: clique em **Create API Key**, dê o nome
   `GreenIA 2026-10`, copie a chave nova e guarde-a **só** no cofre de senhas. Não cole em conversas nem em emails.

**Como saber que deu certo:** a chave `rnd_lCaJ…` não aparece mais na lista.

---

## Tarefa 2 — Guardar uma cópia segura da chave-mestra (10 minutos)

A chave-mestra protege as senhas que a GreenIA guarda, como as credenciais de integrações e a chave do serviço de IA.
Se o servidor se perder sem uma cópia dela, essas senhas não voltam. Aqui você guarda uma cópia **trancada**
(envelope selado) e, separada dela, a **senha que abre o envelope**.

### 2.1 Criar a senha do envelope
1. No cofre de senhas, crie um item novo com o título **"GreenIA — senha do envelope da chave-mestra"**.
2. Use o gerador do cofre para criar uma senha de **40 caracteres** (letras e números) e salve o item.

### 2.2 Informar essa senha ao Render
1. No painel do Render, abra o serviço **greenia**.
2. No menu da esquerda, clique em **Environment**.
3. Clique em **Add Environment Variable**.
4. Em **Key**, digite exatamente: `BACKUP_ENVELOPE_SEGREDO`
5. Em **Value**, cole a senha de 40 caracteres do item 2.1.
6. Clique em **Save Changes**. Se o Render perguntar, escolha **Save and deploy**. O serviço reinicia sozinho em
   alguns minutos.

### 2.3 Gerar o envelope selado
1. Espere a Tarefa 0 mostrar a versão no ar de novo (alguns minutos depois do reinício).
2. Abra o **Shell** do serviço e cole:
   ```
   DADOS=/app/dados node scripts/chave-mestra.js impressao
   ```
   Vai aparecer uma "impressão digital" que começa com `cm1-`. **Copie essa linha.**
3. Ainda no Shell, cole:
   ```
   DADOS=/app/dados node scripts/chave-mestra.js selar --saida /tmp/envelope.json && cat /tmp/envelope.json && rm /tmp/envelope.json
   ```
   Vai aparecer um texto entre chaves `{ … }`. Esse é o envelope trancado.
4. No cofre de senhas, crie **outro** item, com o título **"GreenIA — envelope da chave-mestra"**. Cole nele:
   - o texto inteiro do envelope (de `{` até `}`);
   - a impressão digital `cm1-…` do passo 2.

**Como saber que deu certo:** o cofre tem dois itens separados, a senha (2.1) e o envelope (2.3). O comando do
passo 3 não mostrou nenhuma mensagem de erro.

> Nunca guarde a senha e o envelope no mesmo item. Separados, um sozinho não abre nada.

---

## Tarefa 3 — Ligar a limpeza automática por prazo (10 minutos, antes de 30/11/2026)

A GreenIA promete apagar cópias antigas dentro dos prazos da Política de Privacidade. Esta tarefa liga essa limpeza
automática.

### 3.1 Ver antes o que seria apagado (não apaga nada)
1. Abra o **Shell** do serviço e cole:
   ```
   DADOS=/app/dados node scripts/retencao.js plano
   ```
2. Leia o resumo que aparece: quantos itens seriam **apagados**, **mantidos** e quantos geram **alerta**.
   - Se aparecer algum item **"sem classificação"**, pare aqui e me mande um print. Esse item precisa de uma decisão
     antes de ligar a limpeza.
   - Se não aparecer, siga para 3.2.

### 3.2 Ligar a limpeza
1. Abra **Environment** no serviço **greenia**.
2. Clique em **Add Environment Variable**. Key: `RETENCAO_APLICAR`, Value: `1`.
3. Clique de novo em **Add Environment Variable**. Key: `EXCLUSAO_APLICAR`, Value: `1`.
4. Clique em **Save Changes** e depois em **Save and deploy**.

**Como saber que deu certo:** no dia seguinte, abra **Logs** no serviço e procure a palavra `retenção`. A linha deve
dizer quantos itens foram apagados e **não** deve dizer `dry-run`.

---

## Tarefa 4 — Provar que o aviso de tarefa programada chega (5 minutos)

O aviso agora traz o nome da empresa e o link do ambiente. Para comprovar a entrega sem esperar uma tarefa programada,
você envia **um** email de teste para a sua caixa de homologação.

1. Confira que a Tarefa 0 mostra a versão **1feeda3** ou mais nova no ar.
2. Abra o **Shell** e cole este comando (é uma linha só):
   ```
   node --input-type=module -e "import {criarEmail,smtpDeVariaveis} from './src/email.js';const e=criarEmail({lerSmtp:()=>({url:smtpDeVariaveis(process.env),remetente:process.env.SMTP_REMETENTE})});const r=await e.enviar('vinicius+homolog-a-admin@apymine.com','Tarefa programada atualizada na Homologação A','Uma tarefa programada foi atualizada na Homologação A.\n\nPara consultar o status e as pendências, acesse https://www.greenia.com.br/homologacao-a e abra Quick Wins. O conteúdo fica na plataforma.');console.log(r.via,r.id)"
   ```
3. Vai aparecer `resend` seguido de um código. **Anote o código.**
4. Abra o Gmail da apymine e procure por: `in:anywhere "Tarefa programada atualizada"`
5. Abra o **Resend** (resend.com), entre na equipe que tem o domínio **theneil.com.br**, clique em **Emails** e
   procure o código anotado no passo 3.

**Como saber que deu certo:** o email está na caixa de entrada e, no Resend, aparece como **Delivered**.
- Se ele foi parar em **Spam**, me avise: ajusto o remetente e o texto.
- Se no Resend aparecer **Bounced**, me mande um print dessa tela.

---

## Tarefa 6 — Ligar a cópia dos backups num segundo serviço do Render (20 minutos)

Hoje o backup diário fica no mesmo disco do banco. Esta tarefa cria um **segundo serviço privado** no Render, com
disco próprio, que recebe uma cópia **trancada (cifrada)** de cada backup. Ele não tem endereço público e guarda cada
cópia por 7 dias.
Custo aprovado: plano **Starter** com disco de **1 GB**. Antes de confirmar, o Render mostra o preço exato na tela.

### 6.1 Ver se o Render já criou o serviço sozinho
1. No painel do Render, olhe a lista de serviços. Se já existe um chamado **greenia-backup**, pule para 6.3.
2. Se não existe, abra **Blueprints** no menu da esquerda.
   - Se aparecer um Blueprint ligado ao repositório **GreenIA**, clique nele e depois em **Sync** (ou
     **Manual Sync**). O Render mostra o que vai criar: confira que é **greenia-backup**, plano **Starter**, disco de
     **1 GB**, e confirme. Depois, pule para 6.3.
   - Se não houver Blueprint, siga 6.2.

### 6.2 Criar o serviço à mão (só se 6.1 não criou)
1. Clique em **New +** (no alto) e depois em **Private Service**.
2. Escolha o repositório **GreenIA** e o branch **greenia-lite**.
3. Preencha:
   - **Name:** `greenia-backup`
   - **Region:** a mesma do serviço greenia (**Virginia**)
   - **Runtime/Language:** Docker
   - **Instance Type:** **Starter**
4. Em **Advanced**:
   - **Docker Command:** `node --disable-warning=ExperimentalWarning src/receptor-backup.js`
   - **Add Disk:** Name `backups`, Mount Path `/app/dados`, Size **1** GB
   - **Environment Variables:**
     - `S3_CHAVE` = `greenia-backup`
     - `S3_SEGREDO` = clique em **Generate** (o Render cria um valor aleatório)
     - `RECEPTOR_DIAS` = `7`
5. Clique em **Create Private Service** e espere aparecer **Live**.
6. Abra o serviço **greenia-backup** e procure o **endereço interno** (Internal Address / "Connect" → Internal). Ele
   tem o formato `greenia-backup-xxxx:10000`. Copie-o.
7. Ainda no greenia-backup, abra **Environment** e copie o valor de `S3_SEGREDO` (clique no olho para mostrar).
8. Agora abra o serviço **greenia** → **Environment** e adicione:
   - `BACKUP_DESTINO` = `s3://greenia-backups/greenia`
   - `S3_ENDPOINT` = o endereço interno copiado no passo 6
   - `S3_CHAVE` = `greenia-backup`
   - `S3_SEGREDO` = o valor copiado no passo 7
   - `BACKUP_CHAVE_CIFRA` = clique em **Generate**
9. Clique em **Save Changes** e depois em **Save and deploy**.

### 6.3 Guardar a chave da cópia no cofre (não pule)
1. No serviço **greenia** → **Environment**, mostre o valor de **BACKUP_CHAVE_CIFRA** (ícone do olho) e copie.
2. No cofre de senhas, crie o item **"GreenIA — chave de cifra dos backups"** e cole o valor.
   Sem essa chave, as cópias do segundo serviço não abrem numa recuperação.

### 6.4 Testar na hora
1. Abra o **Shell** do serviço **greenia** e cole:
   ```
   node scripts/backup.js
   ```
2. **Como saber que deu certo:** a resposta tem duas linhas: `Backup feito: …` e `Enviado para: s3://greenia-backups/greenia/…`.
   - Se aparecer `Não enviado ao S3: …`, me mande um print dessa linha.
3. No dia seguinte, depois das 03:00 (horário de Brasília), o console da plataforma não deve mostrar a faixa vermelha
   de backup.

---

## Tarefa 5 — Tarefas fora do sistema

### 5.1 Revisão jurídica (antes de 30/11/2026)
1. No GitHub do projeto, abra a pasta `docs/legal/revisao-pendente/`.
2. Envie ao advogado os arquivos `LEIA-ME.md`, `politica-de-privacidade.md` e `termos-de-uso.md`. O LEIA-ME explica
   cada mudança em linguagem simples.
3. Quando o advogado aprovar, me avise. A publicação é minha.

### 5.2 Pedido ao Render sobre o prazo das cópias do disco
1. No GitHub, abra `docs/operacao/solicitacao-render-retencao.md`.
2. Copie o texto em inglês.
3. No painel do Render, abra o menu de ajuda (ícone **?** ou **Help**) e escolha a opção de contato com o
   suporte. Cole o texto e envie.
4. Quando responderem, me mande a resposta.

### 5.3 Ajustes de privacidade no OpenRouter
1. Entre em **openrouter.ai** com a conta da GreenIA.
2. Abra **Settings** e depois a seção de **privacidade** (Privacy).
3. Deixe **desligado** o registro de pedidos e respostas (logging) e o uso dos seus dados pela OpenRouter.
4. Se houver uma opção de **Zero Data Retention** para a conta toda, ligue.
5. Tire um print da tela final e me mande. O print vira a prova na auditoria.

### 5.4 Aceite com pessoas reais
1. Convide **5 pessoas que não são da área de tecnologia** e **3 pessoas que usam leitor de tela** no dia a dia.
2. Use o roteiro de `docs/operacao/aceite-humano.md`: são 7 tarefas simples, cada pessoa faz sozinha e você só anota.
3. Me mande as anotações. Eu transformo em correções.

### 5.5 Encerrar os ambientes de homologação
1. Entre em **www.greenia.com.br/plataforma** com o seu email de administrador.
2. Abra **Empresas** → **Homologação A**.
3. Desça até **Encerrar o ambiente** e clique em **Encerrar ambiente…**. Confirme.
4. Repita com **Homologação B**.

**Como saber que deu certo:** as duas empresas aparecem como **Cancelada** na lista.
