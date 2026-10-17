// Proteção operacional do OCR (limites de infraestrutura, não de política): concorrência de 1 no processo
// inteiro, limites de tamanho, páginas e pixels, redução de imagem grande, PDF página a página, guarda de memória
// antes e vigilância durante a leitura, tempo, cancelamento, erro numa página intermediária, arquivo inválido,
// memória que volta a um patamar estável, e nada de conteúdo em métricas, arquivos temporários ou mensagens.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { extrairTexto } from '../src/texto.js';
import { criarApp } from '../src/servidor.js';
import { lerLimitesOcr, LIMITES_OCR, lerImagens, sessaoOcr, estadoOcr, zerarMaxOcr, metricasOcr, rssMb, ErroOcr, dimensoes, decodificarPng, pngDePixels, imagensDoPdf,
  MSG_GRANDE, MSG_OCUPADO, MSG_SEM_TEXTO } from '../src/ocr.js';
import { arquivo, imagem, pdfEscaneado, jpegDe, pdf } from './arquivos.js';

// Pasta temporária só deste processo: qualquer arquivo que o OCR criasse apareceria nela.
const TEMP = mkdtempSync(join(tmpdir(), 'greenia-ocr-tmp-'));
process.env.TMPDIR = TEMP;
after(() => rmSync(TEMP, { recursive: true, force: true }));
// O processo de teste já ocupa bem mais que o servidor sozinho: folga na guarda, exceto nos testes da guarda.
const L = { ...LIMITES_OCR, memoriaMaxMb: 4000 };
const ler = (nome, b, limites = L, extra = {}) => extrairTexto(arquivo(nome, b), { limitesOcr: limites, ...extra });
const falha = async (p, status, mensagem) => { const e = await p.then(() => null, x => x); assert.ok(e, 'deveria recusar'); assert.deepEqual([e.status, e.message], [status, mensagem]); return e; };
const pequena = jpegDe('reuniao.jpg');
const inflar = (z, max) => inflateSync(z, { maxOutputLength: max });
function ladrilho(colunas, linhas) {   // imagem grande a partir da página A4, sem arquivo grande no repositório
  const a4 = decodificarPng(imagem('a4.png'), { inflar });
  const W = a4.width * colunas, H = a4.height * linhas, c = a4.channels, out = Buffer.alloc(W * H * c);
  for (let y = 0; y < H; y++) for (let k = 0; k < colunas; k++) a4.data.copy(out, (y * W + k * a4.width) * c, ((y % a4.height) * a4.width) * c, ((y % a4.height) * a4.width + a4.width) * c);
  return pngDePixels({ data: out, width: W, height: H, channels: c });
}
const MARCAS = /Carla|Mendes|Maria|Souza|529\.982|Horizonte|relatorio|tarefa/i;

before(() => zerarMaxOcr());

test('limites centralizados e configuráveis por variável de ambiente (padrão: 1 leitura por vez)', () => {
  const p = lerLimitesOcr({});
  assert.deepEqual([p.simultaneas, p.maxImagemMb, p.maxPdfMb, p.maxPdfPaginas], [1, 10, 15, 30]);
  const e = lerLimitesOcr({ OCR_SIMULTANEAS: '2', OCR_MAX_IMAGE_MB: '5', OCR_MAX_PDF_MB: '12', OCR_MAX_PDF_PAGINAS: '8', OCR_MEMORIA_MAX_MB: '300', OCR_PIXELS_LEITURA: '4000000' });
  assert.deepEqual([e.simultaneas, e.maxImagemMb, e.maxPdfMb, e.maxPdfPaginas, e.memoriaMaxMb, e.pixelsLeitura], [2, 5, 12, 8, 300, 4_000_000]);
  assert.equal(lerLimitesOcr({ OCR_SIMULTANEAS: 'abc' }).simultaneas, 1, 'valor inválido volta ao padrão');
  assert.equal(LIMITES_OCR.simultaneas, 1);
});

test('dimensões pelo cabeçalho (sem decodificar) e imagens de um PDF pelos dicionários', () => {
  assert.deepEqual(dimensoes(imagem('reuniao.png')), { formato: 'png', largura: 1000, altura: 420 });
  assert.deepEqual(dimensoes(imagem('reuniao.jpg')), { formato: 'jpeg', largura: 1000, altura: 420 });
  assert.deepEqual(imagensDoPdf(pdfEscaneado([pequena, jpegDe('a4.jpg')])), [{ largura: 1000, altura: 420 }, { largura: 2480, altura: 3508 }]);
});

test('concorrência: 1 leitura por vez no processo, mesmo com pedidos de pessoas e empresas diferentes', async () => {
  zerarMaxOcr();
  // Dois servidores (duas empresas) no mesmo processo, pedidos ao mesmo tempo: a vaga é do processo.
  const a = criarApp({ log: () => {}, limitesOcr: { ...L, filaMax: 10 } }), b = criarApp({ log: () => {}, limitesOcr: { ...L, filaMax: 10 } });
  const pedidos = [a, b, a, b].map((app, i) => app.extrairAnexos([arquivo(`p${i}.png`, imagem('reuniao.png'))]));
  let visto = 0; const t = setInterval(() => { visto = Math.max(visto, estadoOcr().emUso); }, 5);
  const r = await Promise.all(pedidos);
  clearInterval(t);
  assert.equal(r.length, 4);
  for (const x of r) assert.match(x[0].texto, /Carla Mendes/);
  assert.equal(estadoOcr().maxEmUso, 1, 'nunca duas leituras ao mesmo tempo');
  assert.equal(visto, 1);
  assert.deepEqual([estadoOcr().emUso, estadoOcr().esperando], [0, 0], 'vagas devolvidas');
});

test('concorrência: com a fila cheia ou a espera esgotada, resposta técnica controlada (sem fila persistente)', async () => {
  const lim = { ...L, filaMax: 1, esperaMs: 60_000 };
  const r = await Promise.allSettled([1, 2, 3].map(i => ler(`c${i}.png`, imagem('reuniao.png'), lim)));
  const recusas = r.filter(x => x.status === 'rejected');
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 2, 'uma lendo, uma esperando');
  assert.deepEqual(recusas.map(x => [x.reason.status, x.reason.codigo, x.reason.message]), [[503, 'ocr_ocupado', MSG_OCUPADO]]);
  // Espera esgotada.
  const lenta = { ...L, filaMax: 5, esperaMs: 50 };
  const r2 = await Promise.allSettled([1, 2].map(i => ler(`e${i}.png`, imagem('reuniao.png'), lenta)));
  assert.deepEqual(r2.map(x => x.status), ['fulfilled', 'rejected']);
  assert.equal(r2[1].reason.message, MSG_OCUPADO);
  assert.equal(estadoOcr().emUso, 0);
});

test('limites de tamanho, páginas e pixels: recusa técnica antes de abrir o OCR', async () => {
  const n = metricasOcr().length;
  await falha(ler('grande.png', imagem('reuniao.png'), { ...L, maxImagemMb: 0.01 }), 413, MSG_GRANDE);
  await falha(ler('muitas.pdf', pdfEscaneado(Array(4).fill(pequena)), { ...L, maxPdfPaginas: 3 }), 413, MSG_GRANDE);
  await falha(ler('pesado.pdf', pdfEscaneado([pequena]), { ...L, maxPdfMb: 0.01 }), 413, MSG_GRANDE);
  await falha(ler('enorme.png', imagem('reuniao.png'), { ...L, pixelsEntrada: 100_000 }), 413, MSG_GRANDE);
  // PDF pequeno em bytes, mas com imagem de resolução enorme: recusado pelos pixels, sem decodificar.
  await falha(ler('denso.pdf', pdfEscaneado([pequena]), { ...L, pixelsEntrada: 100_000 }), 413, MSG_GRANDE);
  assert.equal(metricasOcr().length, n, 'nenhuma leitura começou');
  // A mensagem é técnica: nada de política, dado, memória ou infraestrutura.
  assert.doesNotMatch(MSG_GRANDE + MSG_OCUPADO + MSG_SEM_TEXTO, /pessoa|sens[ií]ve|anonimi|sigil|pol[ií]tica|remova|mem[oó]ria|render|servidor|fornecedor|modelo/i);
});

test('PDF escaneado: 1, 5, 10, 20 e 30 páginas página a página; acima do limite, recusa técnica', async () => {
  const picos = {};
  for (const n of [1, 5, 10, 20, 30]) {
    const r = await ler(`p${n}.pdf`, pdfEscaneado(Array(n).fill(pequena)));
    const m = metricasOcr().at(-1);
    assert.equal(r.texto.match(/Carla Mendes, gerente de marketing/g)?.length, n, `${n} páginas lidas`);
    assert.equal(m.paginas, n);
    picos[n] = m.rss_pico - m.rss_antes;
  }
  // Uma página por vez: 30 páginas não custam 30 vezes uma.
  assert.ok(picos[30] - picos[1] < 60, `pico cresce pouco com as páginas: ${JSON.stringify(picos)}`);
  await falha(ler('p31.pdf', pdfEscaneado(Array(31).fill(pequena))), 413, MSG_GRANDE);
});

test('imagem acima da resolução de leitura: reduzida (em cinza) antes do OCR, e o texto continua legível', async () => {
  const grande = ladrilho(2, 1);   // 4960×3508 = 17,4 MP
  const r = await ler('grande.png', grande);
  const m = metricasOcr().at(-1);
  assert.equal(m.pixels, L.pixelsLeitura, 'o OCR recebeu a imagem reduzida');
  assert.match(r.texto, /tarefa 12 com prazo ate 12\/10/);
  // JPEG grande: decodificado e reduzido pelo mesmo caminho.
  const a4 = await ler('a4.jpg', imagem('a4.jpg'), { ...L, pixelsLeitura: 4_000_000 });
  assert.equal(metricasOcr().at(-1).pixels, 4_000_000);
  assert.match(a4.texto, /tarefa 30 com prazo ate 02\/10/);
});

test('guarda de memória: sem margem, a leitura não começa; durante a leitura, acima do limite, ela é interrompida', async () => {
  // Antes: limite abaixo do que o processo já usa.
  await falha(ler('a.png', imagem('reuniao.png'), { ...L, memoriaMaxMb: 50 }), 413, MSG_GRANDE);
  assert.deepEqual([metricasOcr().at(-1).motivo, metricasOcr().at(-1).rss_pico], ['memoria', null], 'nenhum worker subiu');
  // Durante: a memória passa do limite no meio da sessão; a leitura é interrompida e o worker encerrado.
  const limite = { ...L, memoriaMaxMb: rssMb() + 220 };
  let lastro = null;
  const e = await sessaoOcr({ tipo: 'teste', bytes: 1, pixels: 1, limites: limite }, async ler => {
    await ler.imagem(imagem('reuniao.png'));
    lastro = Buffer.alloc(400 * 1048576, 1);   // simula um pico durante a leitura
    await new Promise(r => setTimeout(r, 200));
    return ler.imagem(imagem('reuniao.png'));
  }).then(() => null, x => x);
  lastro = null;
  assert.ok(e instanceof ErroOcr && e.motivo === 'memoria', String(e));
  assert.equal(estadoOcr().emUso, 0);
});

test('tempo esgotado, erro de OCR, erro numa página intermediária, cancelamento, imagem inválida e PDF corrompido', async () => {
  // Tempo por página.
  await falha(ler('t.png', imagem('reuniao.png'), { ...L, tempoPaginaMs: 1 }), 422, MSG_SEM_TEXTO);
  // Erro numa página do meio (mesmo laço de páginas do processo de OCR): nada é devolvido pela metade.
  let pagina = 0;
  const quebraNaSegunda = async imgs => { if (++pagina === 2) throw new ErroOcr('erro'); return imgs.map(() => 'pagina lida'); };
  await falha(ler('meio.pdf', pdfEscaneado([pequena, pequena, pequena]), L, { ocr: quebraNaSegunda }), 422, MSG_SEM_TEXTO);
  assert.equal(pagina, 2, 'parou na página com erro');
  // Cancelamento (a pessoa desistiu): a leitura para.
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 300);
  await falha(ler('cancelado.pdf', pdfEscaneado(Array(10).fill(pequena)), L, { sinal: ac.signal }), 422, MSG_SEM_TEXTO);
  assert.equal(metricasOcr().at(-1).motivo, 'cancelado');
  // Imagem inválida e PDF corrompido.
  await falha(ler('ruim.png', Buffer.concat([imagem('reuniao.png').subarray(0, 40), Buffer.alloc(200, 7)])), 422, MSG_SEM_TEXTO);
  const corrompido = await ler('ruim.pdf', Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> lixo', 'latin1')).then(() => null, x => x);
  assert.equal(corrompido.status, 400);
  assert.deepEqual([estadoOcr().emUso, estadoOcr().esperando], [0, 0], 'nenhuma vaga presa');
});

test('memória volta a um patamar estável depois das leituras (sem retenção acidental de objetos)', async () => {
  const depois = [];
  for (let i = 0; i < 6; i++) {
    await ler(`r${i}.pdf`, pdfEscaneado([pequena, pequena]));
    global.gc?.();
    await new Promise(r => setTimeout(r, 150));
    depois.push(rssMb());
  }
  assert.ok(depois[5] - depois[1] < 40, `RSS estável depois das leituras: ${depois.join(', ')}`);
  assert.ok(process.memoryUsage().heapUsed < 200 * 1048576, 'objetos JavaScript liberados');
});

test('sem rastro: nenhum arquivo temporário e nenhuma métrica com conteúdo', () => {
  assert.deepEqual(readdirSync(TEMP), []);
  const metricas = JSON.stringify(metricasOcr());
  assert.doesNotMatch(metricas, MARCAS);
  for (const m of metricasOcr()) assert.deepEqual(Object.keys(m).sort(), ['bytes', 'motivo', 'ms', 'paginas', 'pixels', 'resultado', 'rss_antes', 'rss_depois', 'rss_pico', 'tipo']);
});

test('diagnóstico no servidor real (processo limpo, limites padrão): nada passa do limite operacional', () => {
  const r = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--disable-warning=ExperimentalWarning', 'scripts/medir-ocr.js', '--json', '--rapido'], { encoding: 'utf8', timeout: 240_000 }));
  for (const c of r.casos) {
    assert.ok(c.ok === !/acima do limite/.test(c.nome), `${c.nome}: ${c.recusa}`);
    assert.ok(c.rss_pico < r.limites.memoriaMaxMb, `${c.nome}: pico ${c.rss_pico} MB`);
  }
});
