// OCR e conversões com as ferramentas reais do sistema (Tesseract, OCRmyPDF,
// ImageMagick, LibreOffice). Sem as ferramentas instaladas, os testes são
// pulados e dizem o que falta; na imagem Docker elas estão presentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile as readFs, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { LocalConverter, parseHocr } from '../src/convert/converter.ts';
import { readFile } from '../src/blocks/ler.ts';
import { docx, inputFile, testEnv, xlsx } from './fixtures.ts';

const exec = promisify(execFile);
const conv = new LocalConverter({
  OCRMYPDF_CMD: process.env.OCRMYPDF_CMD ?? 'ocrmypdf', OCR_LANG: 'por',
  MAGICK_CMD: process.env.MAGICK_CMD ?? 'convert', SOFFICE_CMD: process.env.SOFFICE_CMD ?? 'soffice', CONVERT_TIMEOUT_S: 120,
});
const tools = await conv.available();
const heifEnc = await exec('heif-enc', ['--version']).then(() => true, e => (e as NodeJS.ErrnoException).code !== 'ENOENT');
const OPTS = { paginasMax: 20, ocrMinConfidence: 70, visionFallback: false };

// Documento "escaneado": texto desenhado numa imagem, levemente torto e com ruído.
async function scanImage(format: 'png' | 'tif' | 'pdf', lines: string[], opts: { rotate?: number; noise?: number } = {}): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'greenia-teste-'));
  try {
    const args = ['-size', '1700x900', 'xc:white', '-font', 'DejaVu-Sans', '-pointsize', '40', '-fill', 'black'];
    lines.forEach((l, i) => args.push('-annotate', `+80+${120 + i * 100}`, l));
    args.push('-rotate', String(opts.rotate ?? 1.5), '+repage', '-attenuate', String(opts.noise ?? 0.3), '+noise', 'Gaussian', '-colorspace', 'Gray', '-depth', '8', '-density', '200', '-units', 'PixelsPerInch');
    await exec('convert', [...args, join(dir, 'a.png')]);
    if (format === 'png') return new Uint8Array(await readFs(join(dir, 'a.png')));
    await exec('convert', [join(dir, 'a.png'), join(dir, 'a.png'), '-compress', 'lzw', join(dir, 'a.tif')]);        // 2 páginas
    if (format === 'tif') return new Uint8Array(await readFs(join(dir, 'a.tif')));
    await exec('ocrmypdf', ['--image-dpi', '200', '--output-type', 'pdf', '-q', '--skip-text', '--tesseract-timeout', '0', join(dir, 'a.tif'), join(dir, 'a.pdf')], { env: { ...process.env, TMPDIR: dir } });
    return new Uint8Array(await readFs(join(dir, 'a.pdf')));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const CONTA = ['CONTA DE LUZ - Referência 08/2026', 'Titular: Maria Fictícia Souza', 'Valor total: R$ 187,45'];

test('hOCR: texto por linha, parágrafos e confiança ponderada pelo tamanho da palavra', () => {
  const w = (t: string, c: number) => `<span class='ocrx_word' id='w' title='bbox 0 0 1 1; x_wconf ${c}'>${t}</span>`;
  const hocr = `<div class='ocr_page'><p class='ocr_par' id='p1'><span class='ocr_line' id='l1' title="bbox 0 0 1 1">${w('Valor', 90)} ${w('R&amp;S', 60)}</span>
    <span class='ocr_line' id='l2'>${w('total', 80)}</span></p><p class='ocr_par' id='p2'><span class='ocr_line' id='l3'>${w('Fim', 100)}</span></p></div>`;
  const r = parseHocr(hocr);
  assert.equal(r.text, 'Valor R&S\ntotal\n\nFim');
  assert.equal(r.words, 4);
  assert.equal(r.confidence, Math.round((90 * 5 + 60 * 3 + 80 * 5 + 100 * 3) / 16 * 10) / 10);
});

test('OCR real: PDF escaneado (2 páginas) e TIFF de várias páginas, em português', { skip: !(tools.ocr && tools.images) && 'OCRmyPDF ou ImageMagick ausente' }, async () => {
  const pdf = await scanImage('pdf', CONTA);
  const { env, calls } = testEnv(undefined, { converter: conv });
  const d = await readFile(inputFile('conta.pdf', pdf), OPTS, env);
  assert.equal(d.via, 'ocr');
  assert.equal(d.pages.length, 2);
  assert.match(d.pages[0].text, /Titular: Maria Fictícia Souza/);
  assert.match(d.pages[1].text, /R\$ 187,45/);
  assert.ok(d.pages.every(p => (p.confianca ?? 0) >= 70), `confiança: ${d.pages.map(p => p.confianca)}`);
  assert.equal(calls.length, 0);

  const tif = await readFile(inputFile('conta.tif', await scanImage('tif', CONTA)), OPTS, env);
  assert.equal(tif.convertedFrom, 'TIFF');
  assert.equal(tif.pageCount, 2);
  assert.match(tif.text, /Referência 08\/2026/);
});

test('OCR real: página ilegível fica abaixo do limiar e traz a imagem para o fallback', { skip: !(tools.ocr && tools.images) && 'OCRmyPDF ou ImageMagick ausente' }, async () => {
  const ruim = await scanImage('png', ['tre 4 ug 9 x'], { rotate: 0, noise: 6 });
  const pages = await conv.ocrImage(ruim);
  assert.equal(pages.length, 1);
  assert.ok(pages[0].confidence < 70, `confiança ${pages[0].confidence}`);
  assert.ok(pages[0].image && pages[0].image[0] === 0xff && pages[0].image[1] === 0xd8, 'JPEG da página');
});

test('HEIC real (foto de celular): convertido e lido pelo OCR', { skip: !(tools.ocr && tools.images && heifEnc) && 'heif-enc, OCRmyPDF ou ImageMagick ausente' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'greenia-teste-'));
  try {
    await writeFile(join(dir, 'a.png'), await scanImage('png', CONTA));
    await exec('heif-enc', ['-q', '70', join(dir, 'a.png'), '-o', join(dir, 'a.heic')]);
    const { env } = testEnv(undefined, { converter: conv });
    const d = await readFile(inputFile('IMG_0412.HEIC', new Uint8Array(await readFs(join(dir, 'a.heic')))), OPTS, env);
    assert.equal(d.kind, 'imagem');
    assert.equal(d.convertedFrom, 'HEIC');
    assert.match(d.text, /Maria Fictícia Souza/);
    assert.equal((await conv.imageToJpeg(new Uint8Array(await readFs(join(dir, 'a.heic')))))[0][0], 0xff);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('LibreOffice real: DOC, ODT, XLS e ODS convertidos e lidos', { skip: !tools.office && 'LibreOffice ausente' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'greenia-teste-'));
  try {
    await writeFile(join(dir, 'f.docx'), await docx(['Ficha cadastral de admissão', 'Cargo: Analista administrativo']));
    await writeFile(join(dir, 'p.xlsx'), await xlsx({ Itens: [['Código', 'Quantidade'], ['P-001', 100], ['P-002', 50]] }));
    for (const [to, src] of [['doc', 'f.docx'], ['odt', 'f.docx'], ['xls', 'p.xlsx'], ['ods', 'p.xlsx']]) {
      await exec('soffice', [`-env:UserInstallation=file://${dir}/perfil`, '--headless', '--convert-to', to, '--outdir', dir, join(dir, src)]);
    }
    const { env } = testEnv(undefined, { converter: conv });
    for (const name of ['f.doc', 'f.odt']) {
      const d = await readFile(inputFile(name, new Uint8Array(await readFs(join(dir, name)))), OPTS, env);
      assert.equal(d.kind, 'docx');
      assert.equal(d.convertedFrom, name.slice(2).toUpperCase());
      assert.match(d.text, /Cargo: Analista administrativo/);
    }
    for (const name of ['p.xls', 'p.ods']) {
      const d = await readFile(inputFile(name, new Uint8Array(await readFs(join(dir, name)))), OPTS, env);
      assert.equal(d.kind, 'xlsx');
      assert.deepEqual(d.sheets![0].rows, [{ 'Código': 'P-001', Quantidade: 100 }, { 'Código': 'P-002', Quantidade: 50 }]);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
