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
// Isolamento (os arquivos vêm de fora e podem ser maliciosos):
//   - ambiente limpo: nenhum segredo do servidor (chave do modelo, banco, SMTP)
//     chega às ferramentas; HOME e TMPDIR ficam no diretório da chamada;
//   - limites por processo (prlimit): memória, CPU, tamanho de arquivo, sem core;
//   - sem rede (unshare -rn), quando o sistema permite. Onde não permite (ECS
//     Fargate), a conversão roda num serviço próprio sem saída de rede
//     (CONVERTER_URL; veja service.ts e infra/terraform/conversor.tf);
//   - ImageMagick só com os formatos de imagem usados, sem delegados, com limites
//     (deploy/imagemagick/policy.xml);
//   - LibreOffice com perfil novo por conversão, macros desligadas e sem buscar
//     conteúdo vinculado (imagens, seções, dados externos).
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  // O que protege as conversões neste processo (ou no serviço remoto).
  isolamento?(): Promise<Isolamento & { remoto?: boolean }>;
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
  CONVERT_ISOLATION?: 'auto' | 'required' | 'off';
  CONVERT_MEM_MB?: number;
  CONVERT_FILE_MB?: number;
}

// O que o isolamento conseguiu aplicar neste sistema.
export interface Isolamento { rede: boolean; limites: boolean; ambienteLimpo: true }

export class ConversionError extends Error {
  constructor(message: string) { super(message); this.name = 'ConversionError'; }
}

const split = (cmd: string) => cmd.trim().split(/\s+/);

export const MAGICK_POLICY_DIR = fileURLToPath(new URL('../../deploy/imagemagick/', import.meta.url));

// Ambiente das ferramentas: só o necessário. Nada de process.env inteiro.
export function ambienteIsolado(dir: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
    HOME: dir, TMPDIR: dir,
    OMP_THREAD_LIMIT: '1',                              // Tesseract: uma thread por página (o OCRmyPDF já paraleliza)
    MAGICK_CONFIGURE_PATH: MAGICK_POLICY_DIR,
    ...extra,
  };
}

interface Sandbox { prefixo: string[]; isolamento: Isolamento }

// Descobre uma vez por processo o que o sistema permite: prlimit e unshare -rn.
let sondagem: Promise<{ prlimit: boolean; unshare: boolean }> | undefined;
export function sondarIsolamento() {
  sondagem ??= (async () => {
    const ok = (bin: string, args: string[]) => new Promise<boolean>(res =>
      execFile(bin, args, { timeout: 5000, env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } }, err => res(!err)));
    const [prlimit, unshare] = await Promise.all([ok('prlimit', ['--version']), ok('unshare', ['-rn', 'true'])]);
    return { prlimit, unshare };
  })();
  return sondagem;
}

// Só para testes: refaz a sondagem (ex.: com PATH sem unshare).
export function redefinirSondagem() { sondagem = undefined; }

async function sandbox(cfg: ConverterConfig, timeoutS: number): Promise<Sandbox> {
  const modo = cfg.CONVERT_ISOLATION ?? 'auto';
  const s = modo === 'off' ? { prlimit: false, unshare: false } : await sondarIsolamento();
  if (modo === 'required' && !(s.unshare && s.prlimit)) {
    throw new ConversionError('isolamento indisponível neste sistema (sem rede ou sem limites); a conversão foi recusada');
  }
  const prefixo: string[] = [];
  if (s.unshare) prefixo.push('unshare', '-rn');
  if (s.prlimit) {
    const mb = (n: number) => String(n * 1024 * 1024);
    prefixo.push('prlimit', `--as=${mb(cfg.CONVERT_MEM_MB ?? 2048)}`, `--cpu=${timeoutS}`, `--fsize=${mb(cfg.CONVERT_FILE_MB ?? 1024)}`, '--core=0', '--');
  }
  return { prefixo, isolamento: { rede: s.unshare, limites: s.prlimit, ambienteLimpo: true } };
}

function run(cfg: ConverterConfig, cmd: string, args: string[], opts: { cwd: string; timeoutS: number; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }> {
  const [bin, ...pre] = split(cmd);
  return sandbox(cfg, opts.timeoutS).then(sb => new Promise((resolve, reject) => {
    const argv = [...sb.prefixo, bin, ...pre, ...args];
    execFile(argv[0], argv.slice(1), {
      cwd: opts.cwd, timeout: opts.timeoutS * 1000, maxBuffer: 32 * 1024 * 1024, killSignal: 'SIGKILL',
      env: ambienteIsolado(opts.cwd, opts.env),
    }, (err, stdout, stderr) => {
      if (err) {
        const why = (err as NodeJS.ErrnoException).code === 'ENOENT' ? `${argv[0]} não está instalado`
          : err.killed ? `tempo esgotado (${opts.timeoutS} s)`
          : /not allowed by the security policy/.test(String(stderr)) ? 'formato recusado pela política de segurança das conversões'
          : (String(stderr).trim().split('\n').pop() || err.message);
        reject(new ConversionError(why));
      } else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  }));
}

// Perfil do LibreOffice para uma conversão: macros desligadas, nada vinculado é
// buscado (BlockUntrustedRefererLinks: sem ele, uma imagem vinculada a um
// endereço interno é baixada durante a conversão), links não são atualizados e
// fórmulas não são recalculadas ao abrir.
export const PERFIL_LIBREOFFICE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>1</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>1</value></prop></item>
</oor:items>
`;

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
      const ok = (cmd: string, args: string[]) => withTmp(dir => run(this.semExigir(), cmd, args, { cwd: dir, timeoutS: 20 })).then(() => true, () => false);
      const [ocr, images, office] = await Promise.all([
        ok(this.cfg.OCRMYPDF_CMD, ['--version']), ok(this.cfg.MAGICK_CMD, ['-version']), ok(this.cfg.SOFFICE_CMD, ['--version']),
      ]);
      return { ocr, images, office };
    })();
    return this.probe;
  }

  // Sondagem das ferramentas e do isolamento: não recusa por falta de isolamento.
  private semExigir(): ConverterConfig { return { ...this.cfg, CONVERT_ISOLATION: this.cfg.CONVERT_ISOLATION === 'off' ? 'off' : 'auto' }; }

  async isolamento() { return (await sandbox(this.semExigir(), 1)).isolamento; }

  private timeout(pages: number) { return this.cfg.CONVERT_TIMEOUT_S + 20 * Math.max(1, pages); }

  // OCRmyPDF guarda os arquivos de trabalho (-k) no TMPDIR: de lá saem o hOCR e a imagem tratada de cada página.
  private async ocr(dir: string, input: string, pages: number[] | undefined, extra: string[]): Promise<OcrPage[]> {
    const work = join(dir, 'trabalho');
    await mkdir(work, { recursive: true });
    const args = ['-l', this.cfg.OCR_LANG, '--force-ocr', '--deskew', '--rotate-pages', '--rotate-pages-threshold', '8',
      '--pdf-renderer', 'hocr', '-k', '--output-type', 'none', '-q', ...extra];
    if (pages?.length) args.push('--pages', pages.join(','));
    await run(this.cfg, this.cfg.OCRMYPDF_CMD, [...args, input, '-'], { cwd: dir, timeoutS: this.timeout(pages?.length ?? 10), env: { TMPDIR: work } });
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
        await run(this.cfg, this.cfg.MAGICK_CMD, [join(base, png), '-resize', '1568x1568>', '-quality', '82', jpg], { cwd: dir, timeoutS: 60 }).catch(() => {});
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
    await run(this.cfg, this.cfg.MAGICK_CMD, ['imagem', '-auto-orient', '+repage', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
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
      await run(this.cfg, this.cfg.MAGICK_CMD, [tif, '-resize', '1568x1568>', '-quality', '82', 'pagina-%03d.jpg'], { cwd: dir, timeoutS: this.timeout(1) });
      const names = (await readdir(dir)).filter(f => /^pagina-\d{3}\.jpg$/.test(f)).sort();
      return Promise.all(names.map(async f => new Uint8Array(await readFile(join(dir, f)))));
    });
  }

  async officeToOoxml(bytes: Uint8Array, from: OfficeKind) {
    const to = from === 'doc' || from === 'odt' ? 'docx' : 'xlsx';
    return withTmp(async dir => {
      await writeFile(join(dir, `entrada.${from}`), bytes);
      // Perfil próprio por conversão: nada de configuração ou macro compartilhada entre arquivos.
      await mkdir(join(dir, 'perfil', 'user'), { recursive: true });
      await writeFile(join(dir, 'perfil', 'user', 'registrymodifications.xcu'), PERFIL_LIBREOFFICE);
      await run(this.cfg, this.cfg.SOFFICE_CMD, [`-env:UserInstallation=${pathToFileURL(join(dir, 'perfil')).href}`, '--headless', '--norestore', '--nolockcheck',
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
