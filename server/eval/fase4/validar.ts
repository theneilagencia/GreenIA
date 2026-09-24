// Valida os gabaritos contra o schema e confere que o sha256 de cada arquivo
// bate com o arquivo em disco.
//   node --experimental-strip-types eval/fase4/validar.ts --saida <pasta do corpus>
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { args, sha256 } from './lib.ts';

const schema = JSON.parse(readFileSync(new URL('./gabarito.schema.json', import.meta.url), 'utf8'));
const ajv = new (Ajv2020 as unknown as typeof Ajv2020.default)({ allErrors: true, strict: false });
const check = ajv.compile(schema);

export function gabaritosEm(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? gabaritosEm(p) : n === 'gabarito.json' ? [p] : [];
  });
}

export function validar(dir: string): { casos: number; erros: string[] } {
  const erros: string[] = [];
  const files = gabaritosEm(dir);
  for (const f of files) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    if (!check(g)) erros.push(`${f}: ${ajv.errorsText(check.errors)}`);
    for (const a of g.arquivos ?? []) {
      const p = join(dirname(f), a.nome);
      if (!existsSync(p)) erros.push(`${f}: arquivo ausente ${a.nome}`);
      else if (sha256(readFileSync(p)) !== a.sha256) erros.push(`${f}: sha256 diferente em ${a.nome}`);
    }
  }
  return { casos: files.length, erros };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida' });
  const r = validar(a.saida);
  console.log(`${r.casos} casos; ${r.erros.length} erros`);
  for (const e of r.erros) console.log('  ' + e);
  if (r.erros.length) process.exitCode = 1;
}
