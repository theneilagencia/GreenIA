// Cria a variação de um caso a partir de imagens das mesmas páginas (fotos de
// celular, escaneamentos ou degradação sintética): copia as imagens para um
// caso novo e reescreve o gabarito com os arquivos novos. O resultado esperado
// não muda; o que o documento prova passa a apontar para a imagem.
//   node --experimental-strip-types eval/fase4/variante.ts --caso <pasta do caso> --imagens <pasta> --origem foto-manual --tipo foto
// Imagens com o nome do PDF e outra extensão (conta-de-luz.heic); documento de
// duas páginas: -p1 e -p2 (documentos-pessoais-p1.jpg).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, gravar, gravarJson, type Origem, type TipoArquivo } from './lib.ts';

const IMG = new Set(['.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff']);

export function criarVariante(casoDir: string, imagensDir: string, origem: Origem, tipo: TipoArquivo, sufixo: string): string {
  const g = JSON.parse(readFileSync(join(casoDir, 'gabarito.json'), 'utf8'));
  const imgs = readdirSync(imagensDir).filter(n => IMG.has(extname(n).toLowerCase())).sort();
  const map = new Map<string, string[]>();                             // PDF → imagens
  for (const a of g.arquivos as { nome: string }[]) {
    const base = basename(a.nome, extname(a.nome));
    const mine = imgs.filter(n => { const b = basename(n, extname(n)); return b === base || new RegExp(`^${base}-p\\d+$`).test(b); });
    if (mine.length) map.set(a.nome, mine);
  }
  const caso = `${g.caso}-${sufixo}`;
  const dir = join(casoDir, '..', caso);
  const files = [...map.values()].flat().map(n => ({ nome: n, bytes: new Uint8Array(readFileSync(join(imagensDir, n))), tipo, origem }));
  // PDF sem imagem correspondente segue como digital (a pasta pode ter só parte fotografada).
  const digitais = (g.arquivos as { nome: string; tipo: TipoArquivo }[]).filter(a => !map.has(a.nome) && existsSync(join(casoDir, a.nome)))
    .map(a => ({ nome: a.nome, bytes: new Uint8Array(readFileSync(join(casoDir, a.nome))), tipo: a.tipo }));
  const arquivos = gravar(dir, [...files, ...digitais]);
  const rename = (nome: string | null) => nome && map.has(nome) ? map.get(nome)![0] : nome;
  const esperado = JSON.parse(JSON.stringify(g.esperado), (k, v) => (k === 'arquivo' && typeof v === 'string') ? rename(v) : v);
  gravarJson(join(dir, 'gabarito.json'), { ...g, caso, variacao: `${tipo} (${origem})`, arquivos, esperado,
    notas: `${g.notas ?? ''} Variação de ${g.caso}: ${[...map.keys()].join(', ')} em ${tipo}.`.trim(), conferencia: { ...g.conferencia, por: null, em: null } });
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { caso: '', imagens: '', origem: 'foto-manual', tipo: 'foto', sufixo: 'fotos' });
  if (!a.caso || !a.imagens) { console.error('Uso: --caso <pasta do caso> --imagens <pasta das imagens> [--origem foto-manual] [--tipo foto] [--sufixo fotos]'); process.exit(1); }
  console.log('Variação criada em ' + criarVariante(a.caso, a.imagens, a.origem as Origem, a.tipo as TipoArquivo, a.sufixo));
}
