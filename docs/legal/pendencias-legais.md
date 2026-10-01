# Estado das pendências: Termos de Uso e Política de Privacidade

Acompanha `docs/legal/termos-de-uso.md` e `docs/legal/politica-de-privacidade.md` (versão final candidata 1.0, não
publicada). A aprovação jurídica está registrada em `docs/legal/aprovacao-juridica.md`.

## 1. Decisões aprovadas e incorporadas aos documentos

| Tema | Decisão | Onde | Sustentação técnica |
|---|---|---|---|
| Papéis de controlador e operador | Matriz por tratamento | Política 3; Termos 13.4 | — |
| Bases legais | Tabela por tratamento | Política 15 | — |
| Encaminhamento dos pedidos de titulares sobre dados do ambiente ao Cliente | Aprovado | Política 16.2 | — |
| Registros sem prazo automático (atividade, consumo, auditoria, acessos, exportações, relatos) | Guarda enquanto necessária para segurança, operação, prestação de contas e obrigações | Política 10.5; Termos 18.2 | Nenhuma rotina de eliminação; a descrição é factual |
| Cancelamento → exclusão (G) | 30 dias corridos; sem uso, inclusive da operação; exclusão automática; antecipada só com código e confirmação expressa; hold impede | Política 11; Termos 15.3, 17, 24.1 | `src/plataforma/encerramento.js`; `test/encerramento.test.js` |
| Devolução (H) | Cópia técnica completa (SQLite) a pedido, dentro dos 30 dias, link de uso único até 7 dias | Política 11; Termos 17.4 | Idem |
| Exportações (I) | Só pedido do Cliente, incidente ou obrigação legal; cópia eliminada até 7 dias depois do fim da necessidade; hold suspende; cópia baixada sem prova de eliminação | Política 9.2, 12, 10.2; Termos 15.2 | `src/plataforma/exportacoes.js`; `test/exportacoes.test.js` |
| Contatos comerciais (F) | 24 meses depois da última interação; eliminação com agregado não reidentificável; hold; aviso por email sem dados | Política 4.1, 13, 14 | `src/plataforma/contatos.js`; `test/contatos.test.js` |
| Afirmação comercial sobre venda de dados (K) | Removida, sem substituta | Política 19 | Teste (`test/legais.test.js`) |
| Aviso de alterações (N) | 30 dias por email aos administradores; exceções urgentes (segurança, obrigação legal, risco operacional) | Termos 26; Política 21 | Procedimento (envio aos admins existe; registro de aviso por destinatário é arquitetura futura) |
| Hierarquia Termos × contrato, créditos, fornecedores, terceiros, confidencialidade, SLA, usos proibidos, licença, suporte | Texto existente aprovado | Termos 3.2, 10.2, 11, 12.3, 19, 20, 21, 22 | — |

## 2. Textos aprovados que ainda precisam ser registrados nos documentos

A aprovação existe, mas o texto aprovado destes pontos não foi entregue para registro. Eles aparecem nos documentos como
**[PENDENTE DE REGISTRO DA APROVAÇÃO]** e impedem a publicação até serem preenchidos com o texto aprovado (sem nova
decisão jurídica).

| Documento | Ponto |
|---|---|
| Termos 14.2 | Prazo e forma de comunicação de incidentes de segurança ao Cliente |
| Termos 23.1 | Hipóteses de suspensão e aviso prévio |
| Termos 24.2 | Prazos de aviso, multa e efeitos financeiros do encerramento |
| Termos 25.7 | Limitação de responsabilidade |
| Termos 27.1 | Lei aplicável e foro |
| Política 7.3 | Mecanismo de transferência internacional e instrumentos com Cliente e fornecedores |
| Política 16.3 | Procedimento e prazo de resposta aos titulares |
| Política 16.3 | Verificação de identidade |
| Política 18 | Prazo de comunicação ao Cliente, processo e responsabilidades em incidentes |

## 3. Pendências factuais (operacionais e institucionais)

Marcadas nos documentos como **[PENDÊNCIA FACTUAL]**.

| Item | Onde | Estado | O que fecha |
|---|---|---|---|
| Endereço oficial da TheNeil | Termos 1; Política 1; rodapé da LP | Documentos com Rua G, nº 277, Montserrat, Betim/MG; site institucional com endereço em Belo Horizonte | Cartão CNPJ |
| Grafia do encarregado | Política 1 e 16.3; rodapé da LP | "Vinicius Guimaraes", como informado | Documento oficial |
| Provedor de email da plataforma | Política 13 e 19 | Não identificado | Nomes das variáveis no Render Shell e tela "Email da plataforma" do console |
| Conta da TheNeil no OpenRouter | Política 6.5 | Lado público levantado; conta não verificada | Painel da conta: tipo, registro de pedidos, ZDR, treino, DPA aplicável |
| Região do Render | Política 7.1 e 19 | **Fechado:** Virginia (US East), pelo painel | — |

## 4. Mapa de transferências

| Destino | O quê | Fluxo |
|---|---|---|
| Render (EUA, Virgínia) | Todo o armazenamento: bancos, backups, cópias diárias do disco, cópias de exportação, logs | Permanente enquanto houver serviço |
| OpenRouter (EUA ou outros países, pela política pública dele) | Conteúdo de cada pedido à IA | A cada pedido |
| Fabricantes dos modelos (conforme cada fabricante) | Conteúdo de cada pedido, via OpenRouter | A cada pedido |
| Provedor de email (a identificar) | Destinatário e conteúdo do email (códigos, avisos, relatos, links de devolução) | A cada email |

## 5. Matriz de retenção

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
| Ambiente cancelado até a exclusão definitiva | 30 dias corridos (automática com `EXCLUSAO_APLICAR=1`) |
| Cópia operacional de exportação | Até 7 dias depois de encerrada a necessidade, mais até 7 dias nas cópias diárias do disco |
| Link de devolução | Até 7 dias; a cópia sai do servidor na entrega ou no vencimento |
| Contatos comerciais | 24 meses depois da última interação registrada |
| Hold | Até liberação, com motivo |
| Registros (atividade, consumo, auditoria, acessos, exportações, relatos) | Sem prazo automático (descrito na Política 10.5) |
| Logs do provedor | Prazo do Render (não verificado) |

Os prazos são o pior caso das cópias geridas pela plataforma e pelo provedor, não garantia de destruição física de blocos.

## 6. Condições de publicação

1. Os nove textos aprovados da seção 2 registrados nos documentos.
2. As pendências factuais da seção 3 fechadas.
3. Deploy do release candidato, com `RETENCAO_APLICAR=1` e `EXCLUSAO_APLICAR=1` ativados depois do dry-run.
4. `docs/legal/estado.json` com `publicado: true` e `node scripts/gerar-legais.js`. Aí as páginas perdem o `noindex` e a
   faixa de versão candidata.
