## 8. Atualização técnica de 14 de outubro de 2026: retenção das cópias do disco do provedor

Esta seção registra uma **correção técnica** de um prazo de fornecedor sem sustentação. Não é uma nova aprovação jurídica. **A revisão jurídica desta mudança está pendente.** As seções 1 a 5 e 7 continuam como registro histórico e não foram alteradas.

O que foi corrigido: a Política dizia que a cópia diária do disco feita pelo Render fica "7 dias após a captura" e somava esse número para chegar a "até 15 dias" e "até 38 dias". A documentação pública do Render (render.com/docs/disks) diz que a cópia é feita a cada 24 horas e fica disponível **por pelo menos 7 dias**; não publica prazo máximo. O DPA do Render (cláusula 2.4) não dá prazo para a eliminação. O prazo máximo, portanto, não tinha sustentação.

O que mudou no texto:
- Política 10.2: a tabela lista só as cópias geridas pela GreenIA, com os prazos aplicados pelo código (7 dias, 30 dias, 30 dias e 7 dias depois do fim da necessidade). As cópias do disco do provedor são descritas à parte: a cada 24 horas, disponíveis por pelo menos 7 dias segundo o provedor, sem prazo máximo publicado. Saem "até 15 dias", "até 38 dias" e "até 7 dias depois de eliminadas" para as cópias de exportação.
- Política 10.4, 11 e 19 (tabela de terceiros): o prazo e o local das cópias do disco seguem o provedor.
- Termos 16.2: as cópias do disco seguem o prazo do provedor, que não publica máximo; o texto deixa de dizer "período limitado" para elas. Os Termos ganham a linha "Última atualização do texto".

A versão (1.0) e a vigência já previstas foram preservadas, como na seção 7. O pedido de confirmação ao Render está preparado em `docs/operacao/solicitacao-render-retencao.md` e **não foi enviado**.

| Documento | Versão e atualização | Vigência já prevista | SHA-256 do arquivo-fonte |
|---|---|---|---|
| `docs/legal/termos-de-uso.md` | 1.0, atualização técnica de 14 de outubro de 2026 | A partir de 30 de novembro de 2026 | `3f05c863f04fdc3ca38f926cd8f61fbba26048e2841a7202d92e9273b7f25764` |
| `docs/legal/politica-de-privacidade.md` | 1.0, atualização técnica de 14 de outubro de 2026 | A partir de 30 de novembro de 2026 | `a3804af0d4e2982d7658edb4e634773954a9bfd983e72da2d3da0ab06a602cfd` |

Esta versão ainda não foi publicada em produção: não há deploy a registrar. O manifesto `docs/legal/medicao-lp.json` identifica estes hashes.

## 9. Atualização técnica de 14 de outubro de 2026: provedores de IA

Nota técnica da auditoria operacional (Etapa 4, provedores de IA). Não é nova revisão nem aprovação jurídica; as seções 1 a 8 ficam como estão.

A Política de Privacidade ganhou a cláusula 6.6, que descreve a pesquisa na internet dos quick wins e a geração de imagem: o que é enviado, que as duas não são usadas com informações sigilosas e que a retenção zero das rotas sigilosas não cobre o serviço de busca. Nenhuma outra cláusula mudou. A conta da TheNeil no OpenRouter (registro de pedidos, ZDR, treino, DPA) continua sem verificação, como na seção 6; o inventário e as decisões pendentes estão em `docs/operacao/inventario-ia.md`.

| Documento | Versão e atualização | Vigência já prevista | SHA-256 do arquivo-fonte |
|---|---|---|---|
| `docs/legal/politica-de-privacidade.md` | 1.0, atualização técnica de 14 de outubro de 2026 (cláusula 6.6, somada à correção da seção 8) | A partir de 30 de novembro de 2026 | `4c049b8455b248453be4a35e4d3feea52c954840132b5db5e5836c5343f87b7b` |

Os Termos de Uso não mudaram nesta etapa; vale o hash da seção 8. Esta versão ainda não foi publicada em produção.
