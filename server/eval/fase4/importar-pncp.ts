// Documentos públicos do PNCP para o Jurídico e para Suprimentos.
//
// 1. Você baixa os arquivos (ver pncp/LISTA.md) e preenche a planilha de controle
//    (pncp/controle.exemplo.csv): um documento por linha, com o caso a que pertence.
// 2. importar: copia os arquivos para a saída (fora do repositório), calcula o
//    sha256 e escreve, por caso, um gabarito.rascunho.json com "A PREENCHER".
//      node --experimental-strip-types eval/fase4/importar-pncp.ts importar --origem <pasta> --controle <csv> [--saida eval/fase4/saida]
// 3. Alguém lê cada documento e preenche o rascunho (trechos curtos, cláusulas,
//    itens do termo de referência e da ata, divergências).
// 4. congelar: recusa rascunho com "A PREENCHER" ou fora do schema; grava os
//    gabaritos em gabaritos/<frente>/, com o sha256 no manifesto do PNCP, e
//    congela a divisão do lote <frente>/pncp. Só depois disso algum caso roda:
//    caso fora da divisão congelada não entra em avaliação.
//      node --experimental-strip-types eval/fase4/importar-pncp.ts congelar [--saida eval/fase4/saida]
// Nenhum documento do PNCP entra no repositório: só o gabarito e o sha256.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { args, gravarJson, sha256, xlsx } from './lib.ts';
import { congelar as congelarDivisao } from './dividir.ts';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
export const PREENCHER = 'A PREENCHER';
export const MODELO: Record<string, string> = { juridico: 'juridico-localizar-clausulas', suprimentos: 'suprimentos-cotacoes-especificacao' };
const CAMPOS_JURIDICO = ['partes', 'vigencia', 'reajuste', 'multa', 'rescisao', 'confidencialidade', 'foro'] as const;
const COLUNAS = ['caso', 'frente', 'tipo_documento', 'arquivo', 'id_pncp', 'url', 'orgao', 'cnpj_orgao', 'esfera', 'ano', 'baixado_em', 'digitalizacao'] as const;
type Linha = Record<typeof COLUNAS[number], string>;

export function lerControle(csv: string): Linha[] {
  const linhas = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  const cab = linhas.shift()!.split(';').map(c => c.trim());
  for (const c of COLUNAS) if (!cab.includes(c)) throw new Error(`planilha de controle sem a coluna ${c}`);
  return linhas.map((l, i) => {
    const v = l.split(';');
    const row = Object.fromEntries(cab.map((c, j) => [c, (v[j] ?? '').trim()])) as Linha;
    if (!/^[a-z0-9-]{3,80}$/.test(row.caso)) throw new Error(`linha ${i + 2}: caso inválido (${row.caso})`);
    if (!MODELO[row.frente]) throw new Error(`linha ${i + 2}: frente deve ser juridico ou suprimentos`);
    if (!['contrato', 'termo_de_referencia', 'ata_registro_precos'].includes(row.tipo_documento)) throw new Error(`linha ${i + 2}: tipo_documento inválido`);
    if (!/^https:\/\//.test(row.url)) throw new Error(`linha ${i + 2}: url do PNCP ausente`);
    return row;
  });
}

// Esqueleto do esperado, com "A PREENCHER" onde alguém precisa ler o documento.
function esqueleto(frente: string, docs: Linha[]) {
  if (frente === 'juridico') {
    if (docs.length !== 1) throw new Error(`caso ${docs[0].caso}: no Jurídico, um documento por caso`);
    return { contrato: docs[0].arquivo, campos: Object.fromEntries(CAMPOS_JURIDICO.map(c => [c, { clausula: PREENCHER, trecho: PREENCHER }])), erroGrave: 'cláusula citada com trecho que não está no contrato' };
  }
  const tr = docs.filter(d => d.tipo_documento === 'termo_de_referencia');
  const ata = docs.filter(d => d.tipo_documento !== 'termo_de_referencia');
  if (tr.length !== 1 || ata.length !== 1) throw new Error(`caso ${docs[0].caso}: em Suprimentos, um termo de referência e uma ata (ou contrato) por caso`);
  return {
    especificacao: { arquivo: tr[0].arquivo, itens: [{ codigo: PREENCHER, descricao: PREENCHER, quantidade: 0, unidade: PREENCHER, pagina: null }] },
    cotacao: { arquivo: ata[0].arquivo, fornecedor: PREENCHER, validade: PREENCHER, itens: [{ codigo: PREENCHER, descricao: PREENCHER, quantidade: 0, unidade: PREENCHER, preco_unitario: 0 }] },
    divergencias: [{ codigo: PREENCHER, tipo: 'quantidade', especificado: PREENCHER, cotado: PREENCHER }],
    erroGrave: 'divergência de quantidade ou unidade não apontada',
  };
}

export function importar(origem: string, controle: string, saida: string) {
  const linhas = lerControle(readFileSync(controle, 'utf8'));
  const casos = new Map<string, Linha[]>();
  for (const l of linhas) casos.set(l.caso, [...(casos.get(l.caso) ?? []), l]);
  const out: string[] = [];
  for (const [caso, docs] of casos) {
    const frente = docs[0].frente;
    if (docs.some(d => d.frente !== frente)) throw new Error(`caso ${caso}: frentes diferentes`);
    const dir = join(saida, 'pncp', frente, caso);
    mkdirSync(dir, { recursive: true });
    const arquivos = docs.map(d => {
      const src = join(origem, d.arquivo);
      if (!existsSync(src)) throw new Error(`caso ${caso}: arquivo não encontrado ${src}`);
      copyFileSync(src, join(dir, basename(d.arquivo)));
      const bytes = readFileSync(src);
      return { nome: basename(d.arquivo), sha256: sha256(bytes), tipo: d.digitalizacao === 'escaneado' ? 'escaneado' : 'digital', origem: 'pncp', bytes: bytes.length };
    });
    const n = out.length + 1;
    gravarJson(join(dir, 'gabarito.rascunho.json'), {
      versao: 1, caso, frente, tenant: 'construtora', modelo: MODELO[frente], procedencia: 'pncp',
      variacao: `pncp, ${[...new Set(docs.map(d => d.tipo_documento))].join(' + ')}, ${arquivos.some(a => a.tipo === 'escaneado') ? 'escaneado' : 'digital'}`,
      arquivos,
      pncp: { documentos: docs.map(d => ({ arquivo: basename(d.arquivo), tipoDocumento: d.tipo_documento, idPncp: d.id_pncp, url: d.url, orgao: d.orgao,
        cnpjOrgao: d.cnpj_orgao || null, esfera: d.esfera || null, ano: Number(d.ano), baixadoEm: d.baixado_em || null })) },
      esperado: esqueleto(frente, docs),
      notas: PREENCHER,
      conferencia: { amostra: n % 5 === 0, por: null, em: null },
    });
    out.push(caso);
  }
  return out;
}

const schema = JSON.parse(readFileSync(join(AQUI, 'gabarito.schema.json'), 'utf8'));
const check = new (Ajv2020 as unknown as typeof Ajv2020.default)({ allErrors: true, strict: false }).compile(schema);

// Congela os rascunhos preenchidos. Recusa tudo se um só estiver incompleto.
export async function congelarPncp(saida: string, gabaritosDir = join(AQUI, 'gabaritos'), opts: { dividir?: boolean } = {}) {
  const base = join(saida, 'pncp');
  const rascunhos = existsSync(base) ? readdirSync(base).flatMap(fr => statSync(join(base, fr)).isDirectory()
    ? readdirSync(join(base, fr)).map(c => join(base, fr, c, 'gabarito.rascunho.json')).filter(existsSync) : []) : [];
  if (!rascunhos.length) throw new Error('nenhum rascunho de gabarito do PNCP na saída (rode importar antes)');
  const problemas: string[] = [];
  const prontos: { dir: string; g: Record<string, unknown> & { caso: string; frente: string; arquivos: { nome: string; sha256?: string; tipo?: string; origem?: string; bytes?: number }[]; esperado: Record<string, unknown> } }[] = [];
  for (const f of rascunhos) {
    const g = JSON.parse(readFileSync(f, 'utf8'));
    if (JSON.stringify(g).includes(PREENCHER)) { problemas.push(`${g.caso}: ainda tem "${PREENCHER}"`); continue; }
    if (!check(g)) { problemas.push(`${g.caso}: ${JSON.stringify(check.errors?.slice(0, 3))}`); continue; }
    prontos.push({ dir: join(f, '..'), g: g as typeof prontos[number]['g'] });
  }
  if (problemas.length) throw new Error(`gabaritos do PNCP não congelados:\n${problemas.join('\n')}`);
  const manifesto: Record<string, string> = existsSync(join(gabaritosDir, 'pncp-manifesto.json')) ? JSON.parse(readFileSync(join(gabaritosDir, 'pncp-manifesto.json'), 'utf8')) : {};
  for (const { dir, g } of prontos) {
    if (manifesto[g.caso]) throw new Error(`${g.caso} já foi congelado; um gabarito congelado não muda`);
    // Suprimentos: a planilha de especificação do caso sai dos itens do termo de referência.
    if (g.frente === 'suprimentos') {
      const esp = g.esperado.especificacao as { itens: { codigo: string; descricao: string; quantidade: number; unidade: string }[] };
      const nome = `especificacao-${g.caso}.xlsx`;
      const bytes = await xlsx({ Itens: [['Código', 'Descrição', 'Quantidade', 'Unidade'], ...esp.itens.map(i => [i.codigo, i.descricao, i.quantidade, i.unidade])] });
      writeFileSync(join(dir, nome), bytes);
      g.arquivos = [...g.arquivos.filter(a => a.nome !== nome), { nome, sha256: sha256(bytes), tipo: 'planilha', origem: 'gerado', bytes: bytes.length }];
    }
    const txt = JSON.stringify(g, null, 2) + '\n';
    writeFileSync(join(dir, 'gabarito.json'), txt);
    unlinkSync(join(dir, 'gabarito.rascunho.json'));
    mkdirSync(join(gabaritosDir, g.frente), { recursive: true });
    writeFileSync(join(gabaritosDir, g.frente, `${g.caso}.json`), txt);
    manifesto[g.caso] = sha256(txt);
  }
  gravarJson(join(gabaritosDir, 'pncp-manifesto.json'), Object.fromEntries(Object.keys(manifesto).sort().map(k => [k, manifesto[k]])));
  if (opts.dividir !== false) congelarDivisao(gabaritosDir);
  return prontos.map(p => p.g.caso);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest, { saida: 'eval/fase4/saida', origem: '', controle: '' });
  if (cmd === 'importar') console.log(`${importar(a.origem, a.controle, a.saida).length} casos do PNCP com gabarito em rascunho em ${join(a.saida, 'pncp')}`);
  else if (cmd === 'congelar') congelarPncp(a.saida).then(c => console.log(`${c.length} gabaritos do PNCP congelados; divisão atualizada`));
  else console.error('use: importar-pncp.ts importar --origem <pasta> --controle <csv> | congelar');
}
