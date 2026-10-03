# Fontes de conhecimento e referência + Imagem final (Quick Win)

## Fontes

Uma **fonte** é o que o Quick Win usa como base, além do que a pessoa envia no dia. É genérica: serve para qualquer
trabalho, sem regra por cenário. Não existe arquitetura paralela:

| Tipo (`tipo`) | Onde fica | Observação |
|---|---|---|
| `file` | `documentos` com `quick_win_id` | PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPG, WEBP (OCR). Tipo conferido pelos bytes. |
| `url` | `documentos` com `tipo_fonte = 'url'` | Lido pela rede segura do Integration Builder (`buscaSegura`). Link real cifrado (`url_cifrada`); só a forma mascarada aparece (`url_exibida`, sem usuário, senha nem query). |
| `company_knowledge` | `quick_wins.bases` (`modo`, `ids`, `papel`) | A base de conhecimento já existente da empresa: toda a base permitida para as áreas, ou documentos escolhidos (só os que a pessoa vê). |
| `conversation_material` | `anexos` (`papel`, `tipo_fonte`, `url_exibida`, `ignorada`) | Arquivos e links enviados na conversa. |

Papel (`papel`) de cada fonte:

| Papel | Rótulo | Efeito |
|---|---|---|
| `KNOWLEDGE_BASE` | Base de conhecimento | Fundamento factual. |
| `REFERENCE` | Referência | Só estilo, estrutura, linguagem e formato. Entra separada no prompt ("NÃO são fatos deste caso"). Número/nome que só existe nela e aparece no resultado é invenção (corrigido). |
| `REQUIRED_SOURCE` | Fonte obrigatória | Precisa ser usada. Não usada → correção automática. Ilegível/ausente (`FAILED`, `UNSUPPORTED`) → resultado **parcial** com o motivo, nunca aprovado. |
| `SUPPLEMENTARY` | Material complementar | Ajuda se houver; ausência ou falha não bloqueia nem gera pergunta. |

Situação (`status`): `UPLOADING`, `PROCESSING`, `READY`, `FAILED`, `UNSUPPORTED` (o link que falha fica registrado com o
motivo, por exemplo "Este link exige login. Para conteúdo restrito, use uma integração configurada pela empresa.").

### API

- `GET /api/quick-wins/:id/fontes` — lista unificada (sem conteúdo nem link real) e os papéis.
- `POST /api/quick-wins/:id/arquivos` — `{ arquivo, titulo?, papel?, sigiloso? }`.
- `POST /api/quick-wins/:id/fontes/link` — `{ url, titulo?, papel? }` (até 20 links por Quick Win).
- `PUT /api/quick-wins/:id/fontes/:doc` — `{ papel }` e/ou `{ arquivo }` (substitui: `versao_fonte + 1`, novo `hash`).
  `:doc = base` muda o papel do conhecimento da empresa.
- `DELETE /api/quick-wins/:id/fontes/:doc`.
- Conversa: `POST /api/conversas/:id/mensagens` aceita `links: [{ url, papel? }]` (até 3) e `anexos[i].papel`. Num
  Quick Win, links `https` colados na mensagem também são lidos.

Só quem gere o Quick Win mexe nas fontes (404/403 para os demais; documento de outro Quick Win → 404).

### Execução

- `contexto()` monta o bloco com códigos `[F1]`, `[F2]`... e o papel de cada fonte, com a instrução de citação
  `(Fonte: <título> — <página, seção ou trecho>)`. Fonte obrigatória grande sempre tem trecho no contexto. A referência
  vai em bloco próprio. Material da conversa: ignorado pela pessoa não vai; referência e fonte principal vão marcadas.
- Conferência (`src/fontes-conferencia.js`, determinística, junto da conferência existente): obrigatória usada,
  obrigatória ilegível, dado copiado da referência, quais fontes foram usadas.
- Resultado: `qualidade.fontes = { usadas, lista, obrigatorias_falharam, alteradas_desde_versao?, links_falharam? }` e a
  tela mostra **Fontes usadas**.
- Comandos na conversa: "use este arquivo", "ignore esse documento", "use só esta planilha", "considere este link
  apenas como referência", "esse PDF é a fonte principal" mudam o papel do material da conversa.

### Versões, cache e privacidade

- Publicar grava o retrato das fontes (`quick_win_versoes.fontes`: id, tipo, papel, título, versão, hash, situação).
  Se as fontes mudam depois, a execução avisa ("As fontes mudaram desde a versão vN; este resultado usou as fontes
  atuais").
- Não há cache de resposta: o contexto é montado a cada execução, então uma fonte nova, trocada ou com outro papel vale
  na próxima execução (o cache do provedor é por conteúdo e se invalida sozinho).
- Fonte grande entra por trechos relevantes, não inteira. Eventos (`source.added`, `source.failed`,
  `source.role_changed`, `source.updated`, `source.removed`) guardam só metadados (sem conteúdo nem link real).

## Imagem final

- Entregável `imagem_final` ("Imagem final" — "Gera a peça visual pronta."), distinto de `imagem`
  ("Imagem (briefing)" — "Gera direção visual e instruções, sem produzir a imagem.").
- Contrato visual: tipo `image` (`imagemFinal: true`, peça de impacto, 1:1 por padrão; 1:1, 4:5, 16:9, 9:16 e
  1.91:1 pelo pedido), exportações PNG e JPG.
- Pipeline: conteúdo → plano → imagem gerada (governada: empresa liberou, provedor existe, conversa não sigilosa, área
  sem proteção reforçada, sem dado protegido, plano fora da reserva) → **composição determinística** (texto, logo e
  chamada nunca saem do modelo de imagem nem do design livre) → conferência → exportação.
- Sem imagem gerada: a peça sai só com tipografia e cores, marcada **parcial**, com o motivo e o **briefing da imagem**;
  o Quick Win fica parcial (`objetivo.motivo = imagem_nao_gerada`). Nunca aprovada como imagem.
- Edição: `POST /api/artefatos/:id/gerar-imagem` (`{ variacao?, estilo? }`) gera outra imagem ou uma variação sob a
  mesma governança; cada uma vira uma versão nova (restaurar volta). Trocar texto, formato e cores pelo editor
  existente.
