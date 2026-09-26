# GreenIA Lite

A IA do dia a dia da empresa: um chat, as bases de conhecimento de cada área e os quick wins, que são espaços prontos para as tarefas que se repetem. Uma instalação por empresa, um processo Node e um banco SQLite. Os modelos passam todos pelo OpenRouter.

## Ver funcionando em 1 minuto

```sh
npm ci
npm run demo
```

Abra http://127.0.0.1:8080. A demonstração monta uma empresa fictícia com 3 áreas, pessoas, documentos, 4 quick wins e um modelo homologado. A IA é simulada: nada sai da máquina. O código de acesso aparece no terminal. Precisa de Node 22.13 ou mais novo.

## Instalar

Você precisa de uma VM Linux com Docker, um domínio (ex.: `ia.suaempresa.com.br`) apontando para ela e as portas 80 e 443 abertas.

```sh
git clone <este repositório> greenia && cd greenia
cp .env.exemplo .env      # preencha DOMINIO, ADMIN_EMAIL e OPENROUTER_API_KEY
docker compose up -d
```

O Caddy emite e renova o certificado HTTPS sozinho. Em um ou dois minutos, abra `https://<DOMINIO>` e entre com o `ADMIN_EMAIL`.

**Primeiro acesso.** Sem SMTP configurado, o código de acesso aparece no log: `docker compose logs greenia`. No painel do admin, aba **Configurações**, preencha:

- o nome da empresa, o logo, a cor e os domínios de email aceitos;
- o SMTP da empresa (há um botão de teste).

Depois, na aba **Áreas e pessoas**, cadastre as áreas e as pessoas. Na aba **Modelos de IA**, homologue um modelo para as conversas sigilosas. O guia está em [docs/modelos-sugeridos.md](docs/modelos-sugeridos.md).

**A chave do OpenRouter fica só no `.env`.** Nunca no git, em log ou em relatório. Crie uma chave só para a GreenIA, com limite de gasto definido no OpenRouter.

## Atualizar

```sh
git pull
docker compose up -d --build
```

O banco fica no volume `dados` e a estrutura é atualizada sozinha na subida. Faça um backup antes (abaixo).

## Backup e restauração

- **Automático.** Com `BACKUP_HORA=06:00` no `.env`, o próprio processo faz um backup por dia (horário UTC no contêiner). Os arquivos ficam em `dados/backups`, e são guardados os últimos `BACKUP_MANTER` (padrão 14). Com `BACKUP_DESTINO=s3://bucket/pasta` e as variáveis `S3_*`, cada backup também vai para um armazenamento compatível com S3 (AWS S3, Cloudflare R2, Backblaze B2, Magalu Cloud, MinIO). Sucesso e falha ficam no registro de eventos.
- **Manual,** com o servidor no ar: `docker compose exec greenia node scripts/backup.js`.
- **O backup é uma cópia consistente** (`VACUUM INTO`) compactada com gzip. Não é preciso parar nada para fazer.
- **Restaurar:**

  ```sh
  docker compose stop greenia
  docker compose run --rm greenia node scripts/restaurar.js dados/backups/greenia-AAAAMMDD-HHMMSS.sqlite.gz
  docker compose start greenia
  ```

  Também aceita `s3://bucket/pasta/arquivo.sqlite.gz`. A restauração confere a integridade do arquivo antes de trocar o banco e guarda o banco anterior como `greenia.sqlite.antes-da-restauracao`.
- **Teste a restauração** uma vez por trimestre numa máquina à parte. Backup que nunca foi restaurado não é backup.

## Camadas de privacidade no OpenRouter

A GreenIA manda as regras em toda chamada:

- **Conversa normal:** `provider.data_collection: "deny"`, para usar só fornecedores que não treinam com os dados. O admin pode desligar isso no painel, e a mudança fica registrada.
- **Conversa sigilosa:** só modelos homologados, com o fornecedor fixado (`order` e `only`), sem troca de fornecedor (`allow_fallbacks: false`), retenção zero (`zdr: true`) e sem treino. Se o fornecedor fixado cair, a mensagem falha, em vez de ir para outro.

Configure também na conta do OpenRouter (Settings → Privacy):

1. Desligue o uso dos dados para treino e os endpoints gratuitos que treinam.
2. Desligue o registro de entradas e saídas (input/output logging).
3. Se a conta permitir, ligue a exigência de retenção zero para a conta toda.
4. Defina um limite de crédito na chave.

**Como conferir.** Cada resposta registra o modelo e o fornecedor que respondeu, na tela da conversa e no evento `uso` (painel → Eventos). Compare com a página Activity do OpenRouter. Numa conversa sigilosa, o fornecedor tem de ser sempre o homologado.

## Dependências

São 2 em produção:

| Pacote | Por quê |
|---|---|
| `nodemailer` | Envio por SMTP (códigos de acesso, avisos ao admin). Escrever SMTP com TLS e autenticação à mão não compensa. |
| `unpdf` | Extrai o texto dos PDFs das bases e dos anexos. É o pdf.js empacotado para servidor, sem binário nativo. |

O resto usa o próprio Node:

- `node:sqlite`, com busca FTS5;
- `node:http` e `node:crypto`;
- `node:zlib`, que também lê DOCX e XLSX.

Em desenvolvimento há mais uma: `playwright-core`, usada no teste de ponta a ponta e nas capturas de tela.

## Quanto custa a VM

Para até algumas centenas de pessoas, 2 vCPU e 2 a 4 GB de memória bastam: o trabalho pesado é do modelo, no OpenRouter.

| Opção (região Brasil) | Máquina | Preço por mês | Observação |
|---|---|---|---|
| Hostinger VPS KVM 2, São Paulo | 2 vCPU, 8 GB, 100 GB NVMe | R$ 38,99 (promocional) | A renovação chega perto do dobro. Cobrança em reais. |
| AWS Lightsail, São Paulo | 2 vCPU, 2 GB, 60 GB SSD | cerca de US$ 12 | Preço de tabela da Lightsail. Em São Paulo, a franquia de tráfego é a metade (1,5 TB). |
| Oracle Cloud Always Free, São Paulo | Ampere A1 (ARM), até 2 OCPU e 12 GB | R$ 0 | Limite reduzido pela Oracle em 2026. Falta de capacidade é comum. Serve para piloto. |

Pesquisa feita em 26/09/2026, pelo buscador. As páginas de preço não abriram no ambiente onde isto foi escrito, então confira o valor antes de contratar. Fontes:

- [Hostinger VPS no Brasil](https://kildaryoliver.com.br/quanto-custa-vps-hostinger-brasil/)
- [Preços da Lightsail](https://aws.amazon.com/lightsail/pricing/)
- [Tráfego da Lightsail por região](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-data-transfer-allowance.html)
- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Redução do limite da Oracle](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)

Some o gasto com os modelos: veja o painel, aba **Uso e custo**, e os tetos de gasto em **Configurações**.

## Desenvolvimento

```sh
npm test            # testes (servidor, com um OpenRouter falso)
npm run test:e2e    # ponta a ponta no Chromium (precisa de playwright-core e de um Chromium)
npm run capturas    # capturas de tela em capturas/
npm start           # servidor com as variáveis de ambiente (sem OPENROUTER_API_KEY, usa a IA simulada)
```

A variável `BANCO` diz onde fica o SQLite (padrão: `dados/greenia.sqlite`), e `PORTA` a porta do servidor (padrão: 8080).
