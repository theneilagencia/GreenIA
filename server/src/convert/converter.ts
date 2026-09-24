// Conversões e OCR no próprio servidor, com ferramentas instaladas no sistema
// (apt na imagem). Nada sai da infraestrutura da TheNeil:
//   OCR ............. OCRmyPDF + Tesseract (idioma por), com endireitamento e
//                     rotação; o texto e a confiança vêm do hOCR de cada página
//   imagens ......... ImageMagick (com libheif): TIFF de várias páginas, HEIC,
//                     JPG, PNG, WEBP e GIF viram TIFF de 8 bits sem transparência
//                     antes do OCR, e JPEG para a visão do modelo (fallback)
//   DOC, XLS, ODT ... LibreOffice sem interface, convertidos para DOCX ou XLSX
// Cada chamada roda num diretório temporário próprio, sem shell, com tempo
// máximo, e o diretório é apagado no fim. Os comandos vêm da configuração
// (ex.: OCRMYPDF_CMD="/usr/bin/python3.12 -m ocrmypdf").
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface OcrPage {
  n: number;                  // página no documento original (1 = primeira)
  text: string;
  confidence: number;         // 0 a 100: média da confiança das palavras, ponderada pelo tamanho
  words: number;
  image?: Uint8Array;         // JPEG da página tratada, para o fallback de visão
}

export type OfficeKind = 'doc' | 'xls' | 'odt' | 'ods';

export interface Converter {
  available(): Promise<{ ocr: boolean; images: boolean; office: boolean }>;
  // OCR das páginas indicadas (1 = primeira); sem lista, de todas.
  ocrPdf(bytes: Uint8Array, pages?: number[]): Promise<OcrPage[]>;
  // Imagem de qualquer formato aceito (uma ou várias páginas).
  ocrImage(bytes: Uint8Array): Promise<OcrPage[]>;
  // Imagem para JPEG (uma por página), para enviar à visão do modelo.
  imageToJpeg(bytes: Uint8Array): Promise<Uint8Array[]>;
  officeToOoxml(bytes: Uint8Array, from: OfficeKind): Promise<Uint8Array>;
}

export interface ConverterConfig {
  OCRMYPDF_CMD: string;
  OCR_LANG: string;
  MAGICK_CMD: string;
  SOFFICE_CMD: string;
  CONVERT_TIMEOUT_S: number;
}

export class ConversionError extends Error {
  constructor(message: string) { super(message); this.name = 'ConversionError'; }
}

const split = (cmd: string) => cmd.trim().split(/\s+/);

function run(cmd: string, args: string[], opts: { cwd: string; timeoutS: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }> {
  const [bin, ...pre] = split(cmd);
  return new Promise((resolve, reject) => {
    execFile(bin, [...pre, ...args], {
      cwd: opts.cwd, timeout: opts.timeoutS * 1000, maxBuffer: 32 * 1024 * 1024, killSignal: 'SIGKILL',
      env: { ...process.env, ...opts.env },
    }, (err, stdout, stderr) => {
      if (err) {
        const why = (err as NodeJS.ErrnoException).code === 'ENOENT' ? `${bin} não está instalado`
          : err.killed ? `tempo esgotado (${opts.timeoutS} s)` : (String(stderr).trim().split('\n').pop() || err.message);
        reject(new ConversionError(why));
      } else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const decodeEntities = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

// Texto e confiança de uma página em hOCR (saída do Tesseract): uma linha de
// texto por ocr_line, linha em branco entre parágrafos.
export function parseHocr(hocr: string): { text: string; confidence: number; words: number } {
  const out: string[] = [];
  let weighted = 0, chars = 0, words = 0;
  const wordRe = /<span class=['"]ocrx_word['"][^>]*title=['"][^'"]*x_wconf (\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/span>/g;
  for (const para of hocr.split(/<p class=['"]ocr_par['"]/).slice(1)) {
    for (const line of para.split(/<span class=['"]ocr_(?:line|caption|header|textfloat)['"]/).slice(1)) {
      const ws: string[] = [];
      for (const m of line.matchAll(wordRe)) {
        const w = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim();
        if (!w) continue;
        ws.push(w);
        weighted += Number(m[1]) * w.length; chars += w.length; words++;
      }
      if (ws.length) out.push(ws.join(' '));
    }
    out.push('');
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), confidence: chars ? Math.round(weighted / chars * 10) / 10 : 0, words };
}

export class LocalConverter implements Converter {
  private cfg: ConverterConfig;
  private probe?: Promise<{ ocr: boolean; images: boolean; office: boolean }>;
  constructor(cfg: ConverterConfig) { this.cfg = cfg; }

  available() {
    this.probe ??= (async () => {
      const ok = (cmd: string, args: string[]) => withTmp(dir => run(cmd, args, { cwd: dir, timeoutS: 20 })).then(() => true, () => false);
      const [ocr, images, office] = await Promise.all([
        ok(this.cfg.OCRMYPDF_CMD, ['--version']), ok(this.cfg.MAGICK_CMD, ['-version']), ok(this.cfg.SOFFICE_CMD, ['--version']),
      ]);
      return { ocr, images, office };
    })();
    return this.probe;
  }

  private timeout(pages: number) { return this.cfg.CONVERT_TIMEOUT_S + 20 * Math.max(1, pages); }

  // OCRmyPDF guarda os arquivos de trabalho (-k) no TMPDIR: de lá saem o hOCR e a imagem tratada de cada página.
  private async ocr(dir: string, input: string, pages: number[] | undefined, extra: string[]): Promise<OcrPage[]> {
    const work = join(dir, 'trabalho');
    await mkdir(work, { recursive: true });
    const args = ['-l', this.cfg.OCR_LANG, '--force-ocr', '--deskew', '--rotate-pages', '--rotate-pages-threshold', '8',
      '--pdf-renderer', 'hocr', '-k', '--output-type', 'none', '-q', ...extra];
    if (pages?.length) args.push('--pages', pages.join(','));
    await run(this.cfg.OCRMYPDF_CMD, [...args, input, '-'], { cwd: dir, timeoutS: this.timeout(pages?.length ?? 10), env: { TMPDIR: work } });
    const io = (await readdir(work)).find(d => d.startsWith('ocrmypdf.io.'));
    if (!io) throw new ConversionError('OCR não gerou resultado');
    const base = join(work, io);
    const files = await readdir(base);
    const out: OcrPage[] = [];
    for (const f of files.filter(f => /^\d{6}_ocr_hocr\.hocr$/.test(f)).sort()) {
      const n = Number(f.slice(0, 6));
      const page = parseHocr(await readFile(join(base, f), 'utf8'));
      const png = files.find(x => x === `${f.slice(0, 6)}_ocr.png`) ?? files.find(x => x === `${f.slice(0, 6)}_rasterize.png`);
      let image: Uint8Array | undefined;
      if (png) {
        const jpg = join(dir, `pagina-${n}.jpg`);
        // Até 1568 px no lado maior: o modelo reduz acima disso, e o arquivo fica pequeno.
        await run(this.cfg.MAGICK_CMD, [join(base, png), '-resize', '1568x1568>', '-quality', '82', jpg], { cwd: dir, timeoutS: 60 }).catch(() => {});
        image = await readFile(jpg).then(b => new Uint8Array(b), () => undefined);
      }
      out.push({ n, ...page, image });
    }
    return out;
  }

  async ocrPdf(bytes: Uint8Array, pages?: number[]) {
    return withTmp(async dir => {
      await writeFile(join(dir, 'entrada.pdf'), bytes);
      return this.ocr(dir, 'entrada.pdf', pages, []);
    });
  }

  // Normaliza para TIFF de 8 bits, sem transparência, na orientação da foto (EXIF).
  private async normalize(dir: string, bytes: Uint8Array): Promise<string> {
    await writeFile(join(dir, 'imagem'), bytes);
    await run(this.cfg.MAGICK_CMD, ['imagem', '-auto-orient', '+repage', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
      '-depth', '8', '-compress', 'lzw', 'normalizada.tif'], { cwd: dir, timeoutS: this.timeout(1) });
    return 'normalizada.tif';
  }

  async ocrImage(bytes: Uint8Array) {
    return withTmp(async dir => {
      const tif = await this.normalize(dir, bytes);
      // Foto sem DPI registrado: 300 é a referência do Tesseract para texto de documento.
      return this.ocr(dir, tif, undefined, ['--image-dpi', '300']);
    });
  }

  async imageToJpeg(bytes: Uint8Array) {
    return withTmp(async dir => {
      const tif = await this.normalize(dir, bytes);
      await run(this.cfg.MAGICK_CMD, [tif, '-resize', '1568x1568>', '-quality', '82', 'pagina-%03d.jpg'], { cwd: dir, timeoutS: this.timeout(1) });
      const names = (await readdir(dir)).filter(f => /^pagina-\d{3}\.jpg$/.test(f)).sort();
      return Promise.all(names.map(async f => new Uint8Array(await readFile(join(dir, f)))));
    });
  }

  async officeToOoxml(bytes: Uint8Array, from: OfficeKind) {
    const to = from === 'doc' || from === 'odt' ? 'docx' : 'xlsx';
    return withTmp(async dir => {
      await writeFile(join(dir, `entrada.${from}`), bytes);
      // Perfil próprio por conversão: nada de configuração ou macro compartilhada entre arquivos.
      await run(this.cfg.SOFFICE_CMD, [`-env:UserInstallation=${pathToFileURL(join(dir, 'perfil')).href}`, '--headless', '--norestore', '--nolockcheck',
        '--convert-to', to, '--outdir', join(dir, 'saida'), join(dir, `entrada.${from}`)], { cwd: dir, timeoutS: this.timeout(1) });
      try { return new Uint8Array(await readFile(join(dir, 'saida', `entrada.${to}`))); }
      catch { throw new ConversionError(`o LibreOffice não converteu o arquivo ${from.toUpperCase()}`); }
    });
  }
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'greenia-conv-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
