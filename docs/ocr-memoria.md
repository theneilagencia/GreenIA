# OCR: proteção operacional da memória

Esta página trata só de limites técnicos de capacidade: não muda classificação, governança, elegibilidade nem
retenção. O fluxo continua sendo `arquivo → OCR → classificação → governança → elegibilidade → processamento`.
Uma recusa técnica acontece antes do OCR e nunca libera o conteúdo; quando o OCR roda, o texto lido passa pelas
mesmas regras do texto digitado, inclusive o bloqueio de segredos.

## Como funciona

- **Uma leitura por vez no processo inteiro** (`OCR_SIMULTANEAS=1`), para todas as pessoas e empresas.
  - Quem chega depois espera a vez, só em memória (até `OCR_ESPERA_MS`, com no máximo `OCR_FILA_MAX` esperando).
  - Passando disso, recebe a resposta técnica de ocupado. Não existe fila persistente.
- **Processo de OCR por arquivo** (`src/ocr-processo.js`). É nele que a imagem é decodificada, reduzida e lida.
  - Recebe o arquivo pela IPC, nunca por disco.
  - Acaba no fim do arquivo, e o sistema recupera toda a memória dele. Em erro, tempo esgotado, cancelamento ou
    estouro de memória, é encerrado à força.
  - Dentro do servidor isso não acontecia: depois de um PDF de 30 páginas, o RSS ficava em ~420 MB.
- **Conferências antes do OCR, sem decodificar nada.**
  - Tamanho do arquivo.
  - Número de páginas escaneadas.
  - Resolução de cada imagem: no PDF, pelos dicionários; na imagem, pelo cabeçalho.
  - Um PDF pequeno em bytes, mas com muitas páginas ou imagens enormes, é recusado do mesmo jeito.
- **PDF página a página.** Cada página é decodificada, reduzida, lida e liberada antes da próxima.
  - A memória do processo de OCR ainda cresce um pouco a cada página (+225 MB com 1 página, +287 com 5, +317
    com 10).
  - Por isso ele é trocado a cada `OCR_PAGINAS_POR_PROCESSO` (3) páginas: o pico de um PDF de 30 páginas fica no
    nível de 3 páginas.
- **Resolução de leitura** (`OCR_PIXELS_LEITURA`, 4 MP, ~200 dpi numa A4). Uma imagem ou página maior é reduzida
  em tons de cinza antes do OCR.
  - A 9, 6, 4 e 2,5 MP, a página de teste teve 44/44 linhas exatas; a memória variou pouco (+145 a +157 MB),
    porque o custo fixo do tesseract domina. A 4 MP, o tempo e as cópias da imagem são menores.
  - Não aumentar para "melhorar" o OCR sem medir: a precisão já é a mesma.
- **Guarda de memória.** Antes de começar, a leitura estimada (medida, com margem) precisa caber abaixo de
  `OCR_MEMORIA_MAX_MB`. Durante a leitura, a memória do servidor mais a do processo de OCR é conferida a cada
  50 ms. Acima do limite, a leitura é interrompida.
- **Métricas** (log `ocr`, desligável com `OCR_METRICAS=0`). Registram só números: tipo, bytes, páginas, pixels,
  RSS antes, pico e depois, duração, resultado e motivo. Nunca o texto, a imagem ou dado classificado.

## Mensagens (técnicas, nunca de governança)

| Situação | Mensagem |
|---|---|
| Arquivo, páginas ou resolução acima do limite; memória sem margem | Este arquivo é grande demais para ser processado com segurança neste momento. Tente um arquivo menor ou divida o documento em partes. |
| Outra leitura em andamento e fila cheia ou espera esgotada | A leitura de imagens e PDFs escaneados está ocupada agora. Tente de novo em alguns instantes. |
| Sem texto legível, OCR indisponível, erro, tempo esgotado ou cancelamento | Este arquivo não contém texto que o GreenIA consiga ler neste momento. |

Nenhuma delas cita fornecedor, modelo, memória, servidor ou infraestrutura.

## Limites (variáveis de ambiente)

| Variável | Padrão | O que limita |
|---|---|---|
| `OCR_SIMULTANEAS` | 1 | Leituras ao mesmo tempo no processo. Não aumentar sem nova medição. |
| `OCR_MAX_IMAGE_MB` | 10 | Tamanho de uma imagem |
| `OCR_MAX_PDF_MB` | 15 | Tamanho máximo de um PDF com páginas escaneadas. É um teto, não uma capacidade garantida: pelo chat, a guarda de memória pode recusar antes (ver "Validação em produção") |
| `OCR_MAX_PDF_PAGINAS` | 30 | Máximo de páginas escaneadas por PDF. Também é um teto: em produção foram validadas até 10 páginas |
| `OCR_PIXELS_LEITURA` | 4000000 | Resolução entregue ao OCR (acima disso, a imagem é reduzida) |
| `OCR_PIXELS_ENTRADA` | 24000000 | Maior imagem que o servidor aceita decodificar para reduzir |
| `OCR_MEMORIA_MAX_MB` | 450 | Memória total (servidor + OCR) que a leitura não pode passar. Ajustar ao plano: ~88% da RAM da instância |
| `OCR_PAGINAS_POR_PROCESSO` | 3 | Páginas lidas por processo de OCR antes de trocá-lo (a memória dele volta ao sistema) |
| `OCR_ESPERA_MS` | 60000 | Espera pela vez |
| `OCR_FILA_MAX` | 2 | Leituras esperando a vez (cada uma segura o arquivo na memória) |
| `OCR_TEMPO_PAGINA_MS` | 60000 | Tempo por página |
| `OCR_TEMPO_TOTAL_MS` | 240000 | Tempo por arquivo |
| `OCR_METRICAS` | 1 | Log técnico de cada leitura |

## Medição local (arquivos sintéticos, servidor real num processo limpo, limites padrão)

RSS base do servidor: 74 MB. Pico = servidor + processo de OCR. "Depois" = servidor após a leitura.

Esta medição chama a extração direto, sem o envio pelo chat. Por isso não conta a memória que o servidor ocupa
guardando o arquivo recebido (corpo em base64, JSON e o arquivo decodificado). A capacidade real pelo chat é a da
seção "Validação em produção", e é menor.

| Caso | Resultado | Antes | Pico | Depois | Tempo |
|---|---|---|---|---|---|
| Imagem pequena (1000×420) | ok | 74 | 242 | 74 | 1,4 s |
| Imagem A4 a 300 dpi (8,7 MP, reduzida para 4 MP) | ok | 78 | 265 | 76 | 6,0 s |
| Imagem 2×1 A4 (17 MP, reduzida) | ok | 78 | 323 | 72 | 10,1 s |
| Imagem 2×2 A4 (35 MP) | recusa técnica, sem abrir | – | – | 72 | 0,5 s |
| PDF escaneado, 1 página A4 | ok | 74 | 309 | 74 | 6,1 s |
| PDF escaneado, 5 páginas A4 | ok | 92 | 353 | 76 | 27 s |
| PDF escaneado, 10 páginas A4 | ok | 111 | 385 | 94 | 54 s |
| PDF escaneado, 20 páginas A4 (13 MB) | ok | 151 | 427 | 77 | 105 s |
| PDF escaneado, 30 páginas A4 (20 MB) | recusa técnica, sem abrir | – | – | 117 | 0,6 s |
| PDF escaneado, 31 páginas | recusa técnica, sem abrir | – | – | 124 | 0,6 s |

- **Menor pico:** 242 MB. **Maior pico:** 427 MB, abaixo do limite operacional de 450.
- **Depois de cada leitura:** o servidor volta a 72–94 MB. Antes da mudança para o processo de OCR, ficava em
  ~420 MB depois de um PDF de 30 páginas.
- **Concorrência:** com 2 e com 4 pedidos simultâneos (de empresas diferentes), no máximo 1 leitura por vez; os
  outros esperam ou recebem a resposta técnica (`test/ocr-protecao.test.js`).
- **Dentro do servidor (antes):** o worker do tesseract ficava no processo do servidor. O custo era de ~135 MB
  fixos na primeira leitura; o RSS estabilizava em ~170 MB, sem vazamento de objetos JavaScript (heap estável em
  5 MB), mas crescia com PDFs longos.

## Diagnóstico

`node --disable-warning=ExperimentalWarning scripts/medir-ocr.js` mede o servidor real (criarApp) num processo
limpo, com arquivos sintéticos. `--gerar pasta` grava os mesmos arquivos para validar no ambiente real pelo
anexo do chat, do menor para o maior.

## Validação em produção (Render, 512 MB, commit `fce51b8`, 29/09/2026)

Arquivos de `--gerar`, enviados pelo chat de uma empresa, um por vez, sem concorrência e com os limites padrão.

**OCR validado em produção até 10 páginas escaneadas, nas condições testadas.** Documentos maiores podem ser
recusados pela guarda de memória antes do processamento.

| Caso | Tamanho | Resultado | Tempo |
|---|---|---|---|
| Imagem pequena (1000×420) | 0,03 MB | ok, texto lido e usado na resposta | 4,0 s |
| Imagem A4 a 300 dpi | 0,68 MB | ok, 44 linhas lidas | 12,0 s |
| PDF escaneado, 1 página A4 | 0,66 MB | ok | 12,9 s |
| PDF escaneado, 5 páginas A4 | 3,3 MB | ok | 50,6 s |
| PDF escaneado, 10 páginas A4 | 6,6 MB | ok; `/api/saude` respondeu 200 durante toda a leitura | 99,9 s |
| PDF escaneado, 20 páginas A4 | 13,1 MB | recusa técnica (guarda de memória), sem abrir | 1,4 s |
| PDF escaneado, 30 páginas A4 | 19,7 MB | recusa técnica (tamanho), sem abrir | 2,3 s |
| Imagem 2×2 A4 (35 MP) | 1,8 MB | recusa técnica (resolução), sem abrir | 0,3 s |
| Imagem e PDF escaneado com uma senha fictícia | < 0,1 MB | lidos pelo OCR e bloqueados como credencial, sem chamar a IA | ~2 s |

- **Tempo em produção:** ~10 s por página, cerca do dobro do tempo local.
- **Disponibilidade:** nenhum erro 5xx e nenhum reinício. `/api/saude` respondeu com a mesma versão depois de
  cada envio.
- **Segredo:** a senha fictícia não apareceu na resposta, na conversa, nos eventos de auditoria, no roteamento nem
  na governança.
- **Não medido em produção:** a memória do serviço (sem acesso às métricas do Render), concorrência e
  isolamento entre empresas.

### Por que 20 páginas foi recusado

- A recusa veio da guarda de memória (`motivo: memoria`), antes de começar a leitura. Não foram os limites de
  tamanho ou de páginas: 13,1 MB e 20 páginas estão abaixo de 15 MB e 30.
- Pelo chat, o servidor guarda o arquivo recebido na memória antes do OCR. Reproduzido localmente pelo mesmo
  caminho: o servidor estava em ~204 MB, e a leitura estimada (~276 MB) passaria de `OCR_MEMORIA_MAX_MB` (450).
- **Não é falha funcional.** É a proteção funcionando: o arquivo não é processado, a pessoa recebe a mensagem
  técnica de arquivo grande e a instância não corre risco.
- **O ponto exato entre 10 e 20 páginas não foi medido.** Depende do tamanho do arquivo e da memória do servidor
  no momento.
- **Melhoria futura, fora deste release:** reduzir a memória ocupada pelo envio do arquivo, para aproximar a
  capacidade pelo chat da medição local. Não mudar `OCR_MEMORIA_MAX_MB`, a concorrência nem os outros limites
  sem nova medição em produção.

Numa próxima validação, observar também no painel do Render a memória, reinícios e erros 5xx, e no log as linhas
`ocr`. Se o pico passar de ~440 MB ou houver reinício, baixar `OCR_PAGINAS_POR_PROCESSO` para 1 ou
`OCR_MEMORIA_MAX_MB`, antes de mexer em qualquer outra coisa.
