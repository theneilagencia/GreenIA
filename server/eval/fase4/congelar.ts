// Gera o corpus completo com as sementes oficiais e grava os gabaritos em
// eval/fase4/gabaritos/ (versionados no repositório, antes de qualquer rodada).
// Os arquivos do corpus ficam fora do repositório; os gabaritos guardam o
// sha256 de cada um, e a mesma semente gera os mesmos arquivos.
//   node --experimental-strip-types eval/fase4/congelar.ts --saida eval/fase4/saida
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, gravarJson } from './lib.ts';
import { gerarRh } from './gerar-rh.ts';
import { gerarJuridico, gerarSuprimentos } from './gerar-construtora.ts';
import { gerarFiscal } from './gerar-fiscal.ts';
import { gerarFinanceiro } from './gerar-financeiro.ts';
import { gerarLgpd } from './gerar-lgpd.ts';
import { gerarContratacao } from './gerar-contratacao.ts';
import { gabaritosEm } from './validar.ts';

export const OFICIAL = {
  rh: { pastas: 15, semente: 4101 }, suprimentos: { especificacoes: 20, semente: 4201 }, juridico: { contratos: 25, semente: 4201 },
  fiscal: { casos: 30, semente: 4301 }, financeiro: { pacotes: 10, semente: 4302 }, lgpd: { casos: 6, semente: 4303 },
  contratacao: { pastas: 15, semente: 4501 },
};
export const GABARITOS = fileURLToPath(new URL('./gabaritos/', import.meta.url));

export async function gerarOficial(saida: string) {
  await gerarRh(saida, OFICIAL.rh.pastas, OFICIAL.rh.semente);
  await gerarSuprimentos(saida, OFICIAL.suprimentos.especificacoes, OFICIAL.suprimentos.semente);
  await gerarJuridico(saida, OFICIAL.juridico.contratos, OFICIAL.juridico.semente);
  await gerarFiscal(saida, OFICIAL.fiscal.casos, OFICIAL.fiscal.semente);
  await gerarFinanceiro(saida, OFICIAL.financeiro.pacotes, OFICIAL.financeiro.semente);
  await gerarLgpd(saida, OFICIAL.lgpd.casos, OFICIAL.lgpd.semente);
  await gerarContratacao(saida, OFICIAL.contratacao.pastas, OFICIAL.contratacao.semente);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida' });
  (async () => {
    await gerarOficial(a.saida);
    rmSync(GABARITOS, { recursive: true, force: true });
    const files = gabaritosEm(a.saida).filter(f => !/-(sintetica|fotos)\//.test(f));
    for (const f of files) {
      const g = JSON.parse(readFileSync(f, 'utf8'));
      mkdirSync(join(GABARITOS, g.frente), { recursive: true });
      copyFileSync(f, join(GABARITOS, g.frente, `${g.caso}.json`));
    }
    copyFileSync(join(a.saida, 'juridico', 'perguntas.json'), join(GABARITOS, 'juridico', 'perguntas.json'));
    gravarJson(join(GABARITOS, 'manifesto.json'), { versao: 1, sementes: OFICIAL, casos: files.length,
      descricao: 'Gabaritos congelados do corpus gerado. O corpus fica fora do repositório; rode congelar.ts para gerar de novo e conferir os sha256.' });
    console.log(`${files.length} gabaritos em ${GABARITOS}`);
  })();
}
