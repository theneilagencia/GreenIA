# Pendências legais: Termos de Uso e Política de Privacidade

Acompanha `docs/legal/termos-de-uso.md` e `docs/legal/politica-de-privacidade.md` (rascunhos, não publicados).

## 1. Matriz de pendências

| Item | Status | Impacto | Jurídico? | Produto? | Dado da TheNeil? |
|---|---|---|---|---|---|
| Identificação (razão social, CNPJ, endereço, contato) | Aberto | Bloqueia publicação dos dois documentos e do rodapé da LP | Não | Não | **Sim** |
| Contato de privacidade e encarregado (DPO) | Aberto | Bloqueia publicação | Sim | Não | **Sim** |
| Controlador e operador por tratamento | Proposta (matriz na Política, seção 3) | Define obrigações de cada parte | **Sim** | Não | Não |
| Acordo de tratamento de dados (DPA) com clientes | Aberto | Formaliza o papel de operadora | **Sim** | Não | Não |
| Bases legais | Proposta (Política, seção 15) | Não publicar sem aprovação | **Sim** | Não | Não |
| Transferência internacional (Render nos EUA; OpenRouter e fabricantes) | Fato registrado; mecanismo aberto | Exigência de transparência e de mecanismo jurídico | **Sim** | Não | Não |
| Termos com o OpenRouter e localização dele e do Google Fonts | Aberto | Mapa de terceiros incompleto | Sim | Não | Sim (contratos) |
| Provedor de email da plataforma | **Não identificado** | Mapa de terceiros incompleto | Não | Sim (confirmar a variável `SMTP_URL` sem expor segredo) | Sim |
| Incidentes: prazo de comunicação, processo e responsáveis | Aberto | Cláusula sem prazo | **Sim** | Sim (procedimento) | Não |
| Registros sem prazo (atividade, consumo, auditoria, acessos, exportações, relatos, contatos comerciais) | **Pendência de governança** | **Bloqueia publicação da Política** (definir prazo ou redação aprovada) | Sim | **Sim** | Não |
| Prazo entre cancelamento e exclusão definitiva | Aberto (hoje sem prazo automático) | Ambiente cancelado guardado indefinidamente | Sim | **Sim** | Não |
| Devolução dos dados no encerramento | Aberto | Cláusula sem procedimento | Sim | Sim | Não |
| Exportações: política de guarda e eliminação fora do servidor; hipóteses de exportação sem pedido do cliente | Aberto | Arquivo exportado fica fora da retenção | Sim | Sim (processo) | Não |
| Direitos dos titulares: canal, responsável, prazo, verificação de identidade | Aberto | Seção sem procedimento | **Sim** | Não | **Sim** (canal) |
| "A TheNeil não vende dados pessoais" | A confirmar | Afirmação comercial | Sim | Não | Sim |
| Ativação da limpeza em produção (`RETENCAO_APLICAR=1`) e classificação dos backups atuais | Aprovado, executa no deploy | **Os prazos de 15 e 38 dias só valem depois disso** | Não | **Sim** | Não |
| Antecedência e forma de aviso de alterações | Aberto | Alinhar Termos (26) e Política (21) | Sim | Não | Não |

## 2. Mapa de transferências

| Destino | O quê | Fluxo |
|---|---|---|
| Render (EUA, Virgínia) | Todo o armazenamento: bancos, backups, cópias diárias do disco, logs | Permanente enquanto houver serviço |
| OpenRouter (localização a comprovar) | Conteúdo de cada pedido à IA | A cada pedido |
| Fabricantes dos modelos (localização variável) | Conteúdo de cada pedido, via OpenRouter | A cada pedido |
| Google Fonts (localização a comprovar) | IP e navegador de quem abre as páginas | Ao carregar as páginas |
| Provedor de email (a identificar) | Destinatário e conteúdo dos emails (códigos, avisos, relatos, contatos) | A cada email |

## 3. Matriz de retenção (resumo)

| Item | Prazo |
|---|---|
| Conversas no ambiente | Prazo da empresa cliente (1 a 3.650 dias sem atividade; padrão de 90) |
| Documentos e quick wins | Até remoção |
| WAL | Imediato após a exclusão; máximo 1 h |
| Backup automático | 7 dias |
| Snapshot do Render | 7 dias |
| Pior caso nas cópias diárias | 15 dias |
| Backup manual | 30 dias |
| Cópia de ambiente excluído | 30 dias |
| Pior caso em backup manual ou ambiente excluído | 38 dias |
| Hold | Até liberação, com motivo |
| Registros (atividade, consumo, auditoria, acessos, exportações, relatos) | **Sem prazo (pendência)** |
| Contatos comerciais | 500 mais recentes, **sem prazo de tempo (pendência)** |
| Logs do provedor | Prazo do Render (**não verificado**) |
| Ambiente cancelado e não excluído | **Sem prazo (pendência)** |

Os prazos de 15 e 38 dias são o pior caso das cópias geridas pela plataforma e pelo provedor, não garantia de destruição
física de blocos.

## 4. Inconsistências entre os Termos e a Política (propostas, sem correção silenciosa)

| # | Tipo | Onde | Proposta |
|---|---|---|---|
| 1 | **Conflito de termos** | Os Termos (cláusula 1) chamam a TheNeil de "Operadora". Na Política, "operadora" é o papel da LGPD | Nos Termos, usar "TheNeil" ou "Fornecedora" e reservar "operadora" ao sentido da LGPD |
| 2 | Termos diferentes para o mesmo conceito | Termos: "Cliente", "Usuário", "Ambiente". Política: "empresa cliente", "usuário", "ambiente" | Unificar: "Cliente (empresa cliente)" nos dois, com a mesma definição |
| 3 | Conflito de escopo | Termos 12.3: a TheNeil usa o Conteúdo "apenas para prestar o serviço". A Política mostra finalidades próprias (segurança, auditoria, cobrança) sobre registros, que não são Conteúdo | Manter 12.3 restrito ao Conteúdo e remeter os registros à Política |
| 4 | Obrigação só na Política | Google Fonts aparece na Política (19) e não nos Termos (11.1) | Nos Termos, remeter à lista de fornecedores da Política |
| 5 | Obrigação só na Política | Relatos de problema e contatos comerciais sem prazo (Política 10.5 e 14); os Termos 18.1 não citam os relatos | Incluir "relatos de problema" na lista de registros dos Termos 18.1 |
| 6 | Duplicação | Acesso da equipe de operação descrito por completo nos dois (Termos 15; Política 9) | Aceitável por transparência; manter os dois textos idênticos nos pontos factuais |
| 7 | Duplicação | Retenção e cópias (Termos 16; Política 10) | Nos Termos, versão curta com remissão à Política, para evitar divergência futura |
| 8 | Obrigação só nos Termos | Uso proibido e responsabilidade do Cliente pela base legal do conteúdo (Termos 7.3 e 20) | Na Política 16.2, remeter à responsabilidade da empresa cliente como controladora |
| 9 | Pendência em comum | Aviso de alterações (Termos 26; Política 21) | Decidir uma regra única para os dois |
| 10 | Pendência em comum | Prazo entre cancelamento e exclusão (Termos 17.3; Política 11) | Mesma decisão nos dois |
| 11 | Obrigação só na Política | Cookies e armazenamento no navegador (Política 20) | Os Termos não precisam repetir |
| 12 | Afirmação a confirmar | "Não vende dados" (Política 19) não aparece nos Termos | Confirmar antes de publicar; se confirmada, pode entrar nos Termos 12 |

## 5. Pontos que impedem a publicação

1. Identificação legal da TheNeil e contato de privacidade (Etapa 6).
2. Papéis (controlador e operador), DPA e bases legais aprovados pelo jurídico.
3. Mecanismo de transferência internacional.
4. Prazos dos registros sem prazo, ou redação aprovada pelo jurídico.
5. Prazo entre cancelamento e exclusão definitiva.
6. Prazo e processo de comunicação de incidentes.
7. Provedor de email identificado; localização do OpenRouter e do Google Fonts conforme documentação deles.
8. Canal e procedimento de atendimento aos titulares.
9. Limpeza de retenção ativa em produção (`RETENCAO_APLICAR=1`) com os backups atuais classificados. Sem isso, os
   prazos de 15 e 38 dias não se sustentam.
10. Correção do conflito "Operadora" nos Termos (item 4.1).
