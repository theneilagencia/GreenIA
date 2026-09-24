# Implantação de um cliente

Checklist para colocar qualquer empresa na GreenIA. Nada aqui depende de setor, de área ou de cliente. O que é próprio de um cliente fica no arquivo de implantação dele, em `implantacoes/<cliente>/`, fora do código.

Ordem sugerida: contrato, infraestrutura (uma vez por ambiente), tenant, áreas, pessoas, bases, assistentes, oportunidades e quick wins, operação.

## 1. Contrato e segurança da informação

- [ ] Contrato com o cliente: TheNeil como operadora, Anthropic e AWS como suboperadoras, regiões, transferência internacional para o processamento do modelo (`PENDENCIAS-SEGURANCA.md`, seção 6).
- [ ] Contrato comercial com a Anthropic com retenção mínima e acordo de processamento de dados, antes de liberar a classe Amarela.
- [ ] SI do cliente revisou as seções 4, 8 e 9 de `PENDENCIAS-SEGURANCA.md`, em especial a visão do modelo para escaneados e o acesso da TheNeil aos incidentes.
- [ ] Prazo dos backups comunicado ao cliente. A exclusão e a retenção não alcançam backups antes de expirarem.
- [ ] Plano contratado: cota mensal de consumo e, se houver, cota de quick wins em andamento (`PUT /api/platform/tenants/<slug>/quick-wins-quota`).

## 2. Infraestrutura (uma vez por ambiente)

- [ ] Imagem Docker construída e publicada no ECR.
- [ ] RDS Postgres 16, ElastiCache Redis com TLS, bucket S3 com SSE-KMS e chave própria, SES com SPF, DKIM e DMARC no domínio de envio.
- [ ] Segredos no Secrets Manager: chave do modelo, segredos OIDC de cada cliente, senhas do banco.
- [ ] Migrações aplicadas e o worker da fila rodando (indexação, execuções, retenção, exportação, âncoras).
- [ ] `/health/ready` com `ocr`, `imagens` e `office` em `ok`.
- [ ] Conta AWS separada com o bucket de âncoras da auditoria (Object Lock, modo compliance) e o papel de publicação.
- [ ] Logs com retenção definida; alarmes de erro 5xx e de fila parada. Restauração de backup testada uma vez.

## 3. Tenant

- [ ] Arquivo `implantacoes/<cliente>/tenant.json` preenchido e validado (`npm test` confere todos os arquivos de implantação).
- [ ] Tenant criado: `DATABASE_OWNER_URL=... node src/scripts/create-tenant.ts ../implantacoes/<cliente>/tenant.json`.
- [ ] Host próprio, domínios de email, marca e textos. As cores são ajustadas para contraste na criação; conferir os ajustes impressos.
- [ ] Login pelo provedor do cliente (Entra ID, Google, outro OIDC ou código por email) registrado e testado com uma conta real. O segredo vai por variável de ambiente (`clientSecretEnv`), nunca no arquivo.
- [ ] Primeira âncora da auditoria publicada.

## 4. Áreas

- [ ] Áreas definidas com o cliente: nome, descrição, subáreas e se a subárea herda as permissões da área mãe. O tenant começa vazio; um modelo de áreas do catálogo é opcional (Administração, Áreas, "Aplicar modelo").
- [ ] Key user e revisores de cada área.
- [ ] Nenhuma área precisa de código. Se alguma precisar, é falha de generalização da plataforma: registrar e corrigir no núcleo.

## 5. Pessoas e políticas

- [ ] Pessoas importadas por CSV, primeiro com "simular".
- [ ] Política de Uso de IA do cliente publicada, com termos restritos, e ciência das pessoas do piloto.
- [ ] Política de dados e retenção revisadas pela SI do cliente.
- [ ] Tipos de dado próprios do cliente cadastrados (Administração, Tipos de dado e leitores): padrão, validação opcional e ação padrão. Testar com um texto antes de ligar.
- [ ] Leitores especializados ligados só se o cliente usar os formatos (ex.: XML fiscal).

## 6. Bases de conhecimento

- [ ] Documentos de procedimento importados em lote na base de cada área, com o relatório de erros resolvido.
- [ ] Compartilhamento entre áreas ou com a empresa toda decidido documento a documento.

## 7. Assistentes

- [ ] Cada assistente criado pelo painel: do zero, a partir de um modelo do catálogo da TheNeil ou duplicando outro. O assistente é do cliente e não muda quando o modelo muda; o painel só avisa que há versão nova.
- [ ] Ajustes do cliente registrados no arquivo de implantação (colunas reais, tolerâncias, listas, taxonomias).
- [ ] Uma rodada com documentos reais de cada área, revisada pelo key user, antes de mudar o status para piloto.
- [ ] Guia rápido de cada assistente gerado e enviado às pessoas do piloto.

## 8. Oportunidades e quick wins

- [ ] Critérios de avaliação conferidos com o cliente (Administração, Critérios de avaliação): nomes, escala, pesos e sentido.
- [ ] Oportunidades registradas pelos key users, cada uma com processo, problema, quem executa hoje, volume e evidência (comprovada ou hipótese).
- [ ] Oportunidades avaliadas; as selecionadas viram quick win com responsável, áreas, objetivo, indicadores escolhidos pelo cliente, recursos, revisores e prazo.
- [ ] Ponto de partida (valor "antes", com origem) registrado para cada indicador. Sem isso, o relatório mostra "sem ponto de partida" e não há comparação.
- [ ] Data da decisão de cada quick win (manter, descartar ou ampliar) combinada com o responsável.

## 9. Operação do piloto

- [ ] Reunião de abertura com os key users: fluxo de revisão, Reportar incidente e roteiro do primeiro acesso.
- [ ] Verificação da auditoria (`/api/audit/verify`) no primeiro dia e semanalmente.
- [ ] Relatório mensal de consumo conferido com o simulador no fim do primeiro mês.
- [ ] Relatórios do tenant (portfólio de oportunidades e resultados dos quick wins) enviados ao patrocinador do cliente no fim de cada ciclo.
