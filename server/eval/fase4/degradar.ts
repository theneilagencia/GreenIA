// Degradação sintética: renderiza cada página dos PDFs de um caso e simula
// escaneamento ruim ou foto de celular (perspectiva, rotação, ruído, desfoque,
// sombra, compressão JPEG), com parâmetros sorteados pela semente. Serve para
// ter volume enquanto as fotos reais não chegam; o relatório separa as duas origens.
//   node --experimental-strip-types eval/fase4/degradar.ts --saida eval/fase4/saida --frente rh --semente 7
// Requer ImageMagick com Ghostscript (o mesmo da imagem Docker).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, rng } from './lib.ts';
import { criarVariante } from './variante.ts';

const MAGICK = process.env.MAGICK_CMD || 'convert';

export function degradarCaso(casoDir: string, semente: number, tmp: string): string {
  const g = JSON.parse(readFileSync(join(casoDir, 'gabarito.json'), 'utf8'));
  const out = join(tmp, basename(casoDir));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const r = rng(semente);
  for (const a of g.arquivos as { nome: string }[]) {
    if (extname(a.nome).toLowerCase() !== '.pdf') continue;
    const base = basename(a.nome, '.pdf');
    const pages = Number(execFileSync('gs', ['-q', '-dNODISPLAY', '-dNOSAFER', '-c', `(${join(casoDir, a.nome)}) (r) file runpdfbegin pdfpagecount = quit`], { encoding: 'utf8' }).trim()) || 1;
    for (let p = 0; p < pages; p++) {
      const dpi = r.pick([110, 150, 200]);
      const ang = (r.next() * 8 - 4).toFixed(1);                        // até 4 graus
      const k = r.int(10, 60);                                          // deslocamento da perspectiva (px)
      const noise = (r.next() * 0.6 + 0.2).toFixed(2);
      const blur = (r.next() * 1.2).toFixed(1);
      const quality = String(r.int(35, 70));
      const shade = r.int(0, 1) ? ['-fill', 'gray40', '-colorize', String(r.int(5, 20))] : [];
      const name = pages > 1 ? `${base}-p${p + 1}.jpg` : `${base}.jpg`;
      execFileSync(MAGICK, ['-density', String(dpi), `${join(casoDir, a.nome)}[${p}]`, '-background', 'white', '-alpha', 'remove', '-colorspace', 'Gray',
        '-virtual-pixel', 'white', '-distort', 'Perspective', `0,0 ${k},${k / 2}  1000,0 ${1000 - k},0  0,1400 0,1400  1000,1400 1000,${1400 - k}`,
        '-rotate', ang, ...shade, '-attenuate', noise, '+noise', 'Gaussian', '-blur', `0x${blur}`, '-quality', quality, '-strip', join(out, name)], { timeout: 60000 });
    }
  }
  return criarVariante(casoDir, out, 'degradacao-sintetica', 'foto', 'sintetica');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', frente: 'rh', semente: '7' });
  const base = join(a.saida, a.frente);
  const casos = readdirSync(base).filter(n => !n.endsWith('-sintetica') && !n.endsWith('-fotos') && !n.includes('.'));
  const tmp = join(a.saida, '.degradacao');
  casos.forEach((c, i) => console.log(degradarCaso(join(base, c), Number(a.semente) * 100 + i, tmp)));
  rmSync(tmp, { recursive: true, force: true });
}
