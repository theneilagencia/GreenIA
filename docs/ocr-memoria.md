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
- **Leitura legível ou nada.** Cada leitura é avaliada pela confiança do próprio tesseract: a da página
  (mínimo 45), a de cada palavra (pelo menos 40% dos caracteres em palavras com confiança 70 ou mais) e pelo menos
  uma palavra confiável com 3 letras ou dígitos.
  - Medido: texto real tem confiança de página 90–95 e 94–100% dos caracteres em palavras confiáveis. Uma
    radiografia fotografada de lado teve 30 e 5%; o critério antigo (só a página, mínimo 30) deixava esse ruído ir
    para a IA, que respondia que o "texto" estava embaralhado. Um gráfico só com barras mandava "ul".
  - Leitura ilegível vira vazia: nada vai para a IA e a pessoa recebe a mensagem de imagem sem texto legível.
- **Nova tentativa quando a primeira leitura falha.** A primeira leitura é a mesma de antes (arquivos que já eram
  lidos dão exatamente o mesmo texto). Se ela sai ilegível, o processo de OCR procura uma leitura legível numa versão
  reduzida da imagem (a "sonda", 1 MP, rápida):
  - em cinza sem girar: o tesseract converte mal algumas imagens coloridas (texto claro sobre fundo colorido, como
    uma placa numa foto), que em cinza ficam com confiança 93;
  - girada em 90°, 270° e 180° (180° só se as outras não deram nada): texto de lado, como numa foto de celular.
  - A orientação vencedora é lida de novo em resolução cheia, se couber no tempo; senão, fica o texto da sonda (que
    também passou pelo filtro).
  - Só em imagens PNG e JPEG e em PDFs com uma única página escaneada (em PDFs longos o tempo se multiplicaria).
  - Tempo: uma nova tentativa só começa se couber em 70% do tempo por página, estimando pela sonda mais longa. Assim a
    leitura termina com a mensagem certa, e não por tempo esgotado.
  - Nenhum dado de orientação novo é instalado: a rotação é feita nos pixels em cinza. Os pixels da redução são
    reaproveitados; a imagem grande nunca é decodificada duas vezes.
- **Tempos e memória medidos localmente** (em produção o OCR é cerca de 2 vezes mais lento):

  | Caso | Resultado | Tempo | Pico |
  |---|---|---|---|
  | Imagem pequena de lado (90°, 180°, 270°) | lida, mesmo texto da imagem de pé | 1,2–4,3 s | até 288 MB |
  | Página A4 de lado (8,7 MP) | lida inteira | 28–30 s | até 278 MB |
  | Foto sem texto (1 MP, colorida) | recusada, mensagem de imagem sem texto | 23 s | 269 MB |
  | Foto só com ruído (12 MP) | recusada, mensagem de imagem sem texto | 38–41 s | até 315 MB |

  - **Limitação conhecida:** com o limite por página pela metade (simulando a lentidão de produção), a página A4 de
    lado não coube no tempo e recebeu a mensagem de imagem sem texto (nada foi para a IA). Fotos menores de lado são
    lidas. A leitura inicial de uma página de lado é a parte cara (ruído é lento para o tesseract: 20 s contra 5 s na
    orientação certa). Otimização futura: procurar a orientação antes da leitura cheia em imagens grandes, medindo
    o custo para documentos de pé.
- **Métricas** (log `ocr`, desligável com `OCR_METRICAS=0`). Registram só números: tipo, bytes, páginas, pixels,
  RSS antes, pico e depois, duração, resultado e motivo. Nunca o texto, a imagem ou dado classificado.

## Mensagens (técnicas, nunca de governança)

| Situação | Mensagem |
|---|---|
| Arquivo, páginas ou resolução acima do limite; memória sem margem | Este arquivo é grande demais para ser processado com segurança neste momento. Tente um arquivo menor ou divida o documento em partes. |
| Outra leitura em andamento e fila cheia ou espera esgotada | A leitura de imagens e PDFs escaneados está ocupada agora. Tente de novo em alguns instantes. |
| Imagem que passou pelo OCR sem texto legível (foto, gráfico, exame de imagem, radiografia) | Não há texto legível nesta imagem. O GreenIA lê o texto de imagens e PDFs escaneados, mas não interpreta o conteúdo visual, como fotos, gráficos, exames ou radiografias. Se a imagem tem texto, envie uma versão mais nítida. |
| PDF escaneado sem texto legível em nenhuma página | Não há texto legível neste PDF escaneado. O GreenIA lê o texto de imagens e PDFs escaneados, mas não interpreta o conteúdo visual, como fotos, gráficos, exames ou radiografias. Se o documento tem texto, envie uma versão mais nítida. |
| PDF digital vazio, OCR indisponível, erro, tempo esgotado ou cancelamento | Este arquivo não contém texto que o GreenIA consiga ler neste momento. |

Nenhuma delas cita fornecedor, modelo, memória, servidor ou infraestrutura.

Custo de memória da avaliação por palavra (medido localmente, contra a versão anterior, na mesma máquina): o pico
do processo de OCR subiu de 12 a 26 MB (PDF de 10 páginas: 379 → 397 MB), abaixo do limite operacional. O processo
de OCR termina no fim de cada arquivo; o servidor não retém essa memória.

## Validação da leitura legível e da rotação (local, 29/09/2026)

Com arquivos sintéticos, contra a versão anterior (`5f943e6`) na mesma máquina:

- **Regressão:** 25 de 25 arquivos que já eram lidos deram exatamente o mesmo texto: imagens PNG e JPEG, imagem de
  17 MP, PDFs escaneados de 1, 2 e 5 páginas, WEBP, PDF digital, DOCX, XLSX, PPTX e TXT.
- **Rotação:** 27 de 27 (texto comum, cadastro com CPF e credencial; PNG, JPEG e PDF de uma página; 90°, 180° e
  270°) com o texto certo e a mesma classificação da imagem de pé. Na versão anterior, todas davam ruído; a
  credencial de cabeça para baixo ia invertida para a IA, sem ser detectada.
- **Conteúdo visual com texto:** gráfico com título, legenda e números; foto de documento; placa numa foto; desenho
  técnico com anotações; radiografia com etiquetas, de pé e de lado: o texto é lido e o visual não vira texto.
- **Só visual:** gráfico só com barras, radiografia sem etiquetas, ruído e foto sem texto: recusados antes da IA.
- **Pelo chat (servidor, classificação e envio reais, IA simulada que registra as chamadas):** 42 de 42.
  - Credencial fictícia nas 12 combinações (0°, 90°, 180°, 270° × PNG, JPEG, PDF): bloqueada, nenhuma chamada à IA,
    nada guardado ou registrado com o segredo.
  - CPF nas 8 combinações: as mesmas políticas da imagem de pé.
  - Imagens sem texto: nenhuma chamada à IA, mensagem de imagem sem texto.
  - Imagens com texto: só o texto vai para a IA, nunca a imagem.
  - PDF digital vazio, imagem corrompida e tempo esgotado: a mensagem geral de sempre.
- **Defeitos que já existiam (não mudaram, a tratar à parte):**
  - TIFF é anunciado como aceito, mas não é lido (antes e agora: mensagem de arquivo sem texto).
  - O OCR às vezes insere um espaço num número (`CPF 529.982 .247-25` num PDF escaneado de pé), e o detector de CPF
    não reconhece o número assim. A classificação está congelada; a tolerância a espaços é uma decisão à parte.

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
