// Diagnóstico de memória do OCR, com arquivos sintéticos (nenhum dado real). Mede o processo do servidor de
// verdade (criarApp), num processo limpo: RSS antes, pico, depois e delta de cada leitura, com os limites padrão
// (ou os das variáveis OCR_*). Mostra também se a memória volta a um patamar estável depois das leituras.
//
//   node --disable-warning=ExperimentalWarning scripts/medir-ocr.js            tabela
//   node --disable-warning=ExperimentalWarning scripts/medir-ocr.js --json     resultado em JSON (usado no teste)
//   node --disable-warning=ExperimentalWarning scripts/medir-ocr.js --rapido   só os casos pequenos
//   node --disable-warning=ExperimentalWarning scripts/medir-ocr.js --gerar pasta
//        grava os arquivos sintéticos na pasta, para validar no ambiente real pelo anexo do chat
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { criarApp } from '../src/servidor.js';
import { extrairTexto } from '../src/texto.js';
import { LIMITES_OCR, metricasOcr, rssMb, decodificarPng, pngDePixels } from '../src/ocr.js';
import { pdfEscaneado, jpegDe, imagem, b64 } from '../test/arquivos.js';

const args = process.argv.slice(2);
const json = args.includes('--json'), rapido = args.includes('--rapido');

// Imagem grande sem guardar arquivo grande: a página A4 repetida lado a lado (colunas × linhas).
function ladrilho(colunas, linhas) {
  const a4 = decodificarPng(imagem('a4.png'), { inflar: (z, max) => inflateSync(z, { maxOutputLength: max }) });
  const W = a4.width * colunas, H = a4.height * linhas, c = a4.channels, out = Buffer.alloc(W * H * c);
  for (let y = 0; y < H; y++) for (let k = 0; k < colunas; k++) a4.data.copy(out, (y * W + k * a4.width) * c, ((y % a4.height) * a4.width) * c, ((y % a4.height) * a4.width + a4.width) * c);
  return pngDePixels({ data: out, width: W, height: H, channels: c });
}
const pagina = jpegDe('a4.jpg'), pequena = jpegDe('reuniao.jpg');
const casos = [
  ['imagem pequena (1000×420)', 'pequena.png', () => imagem('reuniao.png')],
  ['imagem média, A4 300 dpi (8,7 MP)', 'a4.png', () => imagem('a4.png')],
  ...(rapido ? [] : [
    ['imagem grande, 2×1 A4 (17 MP, reduzida)', 'grande.png', () => ladrilho(2, 1)],
    ['imagem acima do limite, 2×2 A4 (35 MP)', 'enorme.png', () => ladrilho(2, 2)],
  ]),
  ['PDF escaneado, 1 página A4', 'pdf-01.pdf', () => pdfEscaneado([pagina])],
  ['PDF escaneado, 5 páginas A4', 'pdf-05.pdf', () => pdfEscaneado(Array(5).fill(pagina))],
  ...(rapido ? [] : [
    ['PDF escaneado, 10 páginas A4', 'pdf-10.pdf', () => pdfEscaneado(Array(10).fill(pagina))],
    ['PDF escaneado, 20 páginas A4', 'pdf-20.pdf', () => pdfEscaneado(Array(20).fill(pagina))],
    ['PDF escaneado, 30 páginas A4 (20 MB, acima do limite em 512 MB)', 'pdf-30.pdf', () => pdfEscaneado(Array(30).fill(pagina))],
    ['PDF escaneado, 31 páginas (acima do limite)', 'pdf-31.pdf', () => pdfEscaneado(Array(31).fill(pequena))],
  ]),
];

if (args.includes('--gerar')) {
  const pasta = args[args.indexOf('--gerar') + 1] || 'ocr-sintetico';
  mkdirSync(pasta, { recursive: true });
  for (const [, arquivo, gerar] of casos) writeFileSync(join(pasta, arquivo), gerar());
  console.log(`Arquivos sintéticos em ${pasta}/ (sem dados reais). Envie do menor para o maior.`);
  process.exit(0);
}

// Os arquivos são gerados num processo à parte e lidos do disco: montar as imagens grandes aqui contaminaria a
// medição (o RSS deste processo tem de ser o do servidor).
const pastaTemp = mkdtempSync(join(tmpdir(), 'greenia-medir-ocr-'));
execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), '--gerar', pastaTemp, ...(rapido ? ['--rapido'] : [])], { stdio: 'ignore' });
const app = criarApp({ log: () => {}, cookieSeguro: false });
await new Promise(r => app.servidor.listen(0, '127.0.0.1', r));
await new Promise(r => setTimeout(r, 300));
const base = rssMb();
const resultado = { limites: LIMITES_OCR, base, casos: [] };
for (const [nome, arquivo] of casos) {
  let b = readFileSync(join(pastaTemp, arquivo));
  const antes = metricasOcr().length, inicio = Date.now();
  let ok = true, mensagem = null, caracteres = 0;
  try { caracteres = (await extrairTexto({ nome: arquivo, base64: b64(b) })).texto.length; } catch (e) { ok = false; mensagem = e.codigo || e.message; }
  const bytes = b.length; b = null;
  global.gc?.();   // como o servidor entre uma requisição e outra
  await new Promise(r => setTimeout(r, 500));
  const m = metricasOcr().slice(antes).at(-1) || {};
  resultado.casos.push({ nome, bytes, ok, recusa: mensagem, caracteres, ms: Date.now() - inicio, rss_antes: m.rss_antes ?? null, rss_pico: m.rss_pico ?? null, rss_depois: rssMb(), motivo: m.motivo ?? null, pixels: m.pixels ?? null, paginas: m.paginas ?? null });
}
resultado.depois = rssMb();
app.servidor.close();
rmSync(pastaTemp, { recursive: true, force: true });
if (json) console.log(JSON.stringify(resultado));
else {
  console.log(`Servidor: RSS base ${base} MB · limite operacional ${LIMITES_OCR.memoriaMaxMb} MB · leitura até ${(LIMITES_OCR.pixelsLeitura / 1e6).toFixed(1)} MP`);
  console.log(['caso', 'MB', 'resultado', 'antes', 'pico', 'depois', 'delta', 'ms'].join('\t'));
  for (const c of resultado.casos) console.log([c.nome, (c.bytes / 1048576).toFixed(2), c.ok ? 'ok' : `recusado (${c.recusa})`, c.rss_antes ?? '-', c.rss_pico ?? '-', c.rss_depois, c.rss_pico ? c.rss_pico - c.rss_antes : '-', c.ms].join('\t'));
  console.log(`Depois de tudo: RSS ${resultado.depois} MB`);
}
process.exit(0);
