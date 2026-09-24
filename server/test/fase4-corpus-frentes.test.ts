// Geradores do corpus da Fase 4 para Fiscal, Financeiro e LGPD: os gabaritos
// validam no schema, os arquivos saem iguais com a mesma semente, todo PDF e
// DOCX tem a marca d'água, e o que o gabarito diz está de fato nos arquivos:
//   Fiscal      cada mapeamento (formato do núcleo) lido sobre o pedido dá os
//               registros do gabarito; as divergências refeitas do XML (parser da
//               plataforma) contra esses registros são as do gabarito; diferença
//               de preço dentro da tolerância não é divergência; caso só com a
//               DANFE pede o XML com a chave certa.
//   Financeiro  cada valor esperado está na página indicada do PDF.
//   LGPD        os documentos esperados existem; planilha sem relação tem
//               categoria nula e nenhum termo da taxonomia.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { gerarFiscal, LAYOUTS, mapeamento, type Layout } from '../eval/fase4/gerar-fiscal.ts';
import { gerarFinanceiro, TOPICOS } from '../eval/fase4/gerar-financeiro.ts';
import { gerarLgpd, CATEGORIAS, TERMOS_TAXONOMIA, PERGUNTAS_TOTAL } from '../eval/fase4/gerar-lgpd.ts';
import { aplicarMapeamento, mesPorExtenso, semAcento } from '../eval/fase4/lib-extra.ts';
import { gabaritosEm, validar } from '../eval/fase4/validar.ts';
import { MARCA, brl } from '../eval/fase4/lib.ts';
import { parseNFe } from '../src/readers/nfe-parser.ts';
import { findAccessKey, isAccessKey } from '../src/readers/danfe-key.ts';
import { mapeamentoConfigSchema } from '../src/imports/schema.ts';

const FISCAL = 10, PACOTES = 2, LOTES = 6;
let A = '', B = '';
const norm = (s: string) => s.replace(/\s+/g, ' ');
const normPt = (s: string) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
async function paginas(path: string): Promise<string[]> {
  return (await extractText(await getDocumentProxy(new Uint8Array(readFileSync(path))), { mergePages: false })).text.map(norm);
}
async function textOf(path: string): Promise<string> {
  if (path.endsWith('.pdf')) return (await paginas(path)).join(' ');
  if (path.endsWith('.docx')) return norm((await mammoth.extractRawText({ buffer: readFileSync(path) })).value);
  if (path.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    return wb.worksheets.map(ws => [ws.name, ...(ws.getSheetValues() as unknown[][]).filter(Boolean).map(r => r.filter(v => v !== null && v !== undefined).join(' '))].join(' ')).join(' ');
  }
  return readFileSync(path, 'utf8');
}
type Gab = { caso: string; arquivos: { nome: string; sha256: string; tipo: string }[]; esperado: any; conferencia: { amostra: boolean } };
const load = (dir: string, frente: string) => gabaritosEm(join(dir, frente)).sort().map(f => ({ dir: join(f, '..'), g: JSON.parse(readFileSync(f, 'utf8')) as Gab }));

before(async () => {
  A = mkdtempSync(join(tmpdir(), 'fase4-frentes-a-'));
  B = mkdtempSync(join(tmpdir(), 'fase4-frentes-b-'));
  for (const d of [A, B]) {
    await gerarFiscal(d, FISCAL, 4301);
    await gerarFinanceiro(d, PACOTES, 4302);
    await gerarLgpd(d, LOTES, 4303);
  }
});
after(() => { rmSync(A, { recursive: true, force: true }); rmSync(B, { recursive: true, force: true }); });

test('gabaritos validam no schema e os sha256 batem com os arquivos', () => {
  const r = validar(A);
  assert.equal(r.casos, FISCAL + PACOTES + LOTES);
  assert.deepEqual(r.erros, []);
});

test('mesma semente, mesmos arquivos e mesmos gabaritos', () => {
  const sums = (d: string) => gabaritosEm(d).map(f => readFileSync(f, 'utf8')).sort();
  assert.deepEqual(sums(A), sums(B));
});

test('marca d’água em todo PDF e DOCX; nenhum arquivo fora do gabarito; amostra de 20%', async () => {
  for (const frente of ['fiscal', 'financeiro', 'lgpd']) {
    const casos = load(A, frente);
    assert.equal(casos.filter(c => c.g.conferencia.amostra).length, Math.floor(casos.length / 5), frente);
    for (const { dir, g } of casos) {
      assert.deepEqual(g.arquivos.map(a => a.nome).sort(), readdirSync(dir).filter(n => n !== 'gabarito.json').sort(), g.caso);
      for (const a of g.arquivos.filter(a => /\.(pdf|docx)$/.test(a.nome))) assert.ok((await textOf(join(dir, a.nome))).includes(MARCA), `${g.caso}/${a.nome} sem marca d'água`);
    }
  }
});

test('Fiscal: os mapeamentos validam no formato do núcleo e cada um lê o pedido como no gabarito', async () => {
  for (const l of LAYOUTS) assert.ok(mapeamentoConfigSchema.safeParse(mapeamento(l)).success, l);
  const casos = load(A, 'fiscal');
  assert.deepEqual([...new Set(casos.map(c => c.g.esperado.pedido.layout))].sort(), [...LAYOUTS]);
  const formatos = new Set<string>();
  for (const { dir, g } of casos) {
    const p = g.esperado.pedido;
    formatos.add(mapeamento(p.layout as Layout).formato);
    assert.equal(p.mapeamento, `mapeamentos/${p.layout}.json`);
    const regs = await aplicarMapeamento(new Uint8Array(readFileSync(join(dir, p.arquivo))), mapeamento(p.layout as Layout));
    assert.deepEqual(regs, p.registros, g.caso);
  }
  assert.deepEqual([...formatos].sort(), ['csv', 'json', 'txt_largura_fixa', 'xlsx', 'xml']);
});

test('Fiscal: divergências refeitas do XML contra o pedido são as do gabarito; preço dentro da tolerância não entra; só DANFE pede o XML certo', async () => {
  const key = (c: unknown) => { const s = normPt(String(c)); return /^\d+$/.test(s) ? String(Number(s)) : s; };
  const casos = load(A, 'fiscal');
  const tipos = new Set<string>();
  for (const { dir, g } of casos) {
    const e = g.esperado;
    const n = Number(g.caso.slice(-2));
    const danfe = await textOf(join(dir, e.nota.danfe));
    const chave = findAccessKey(danfe);
    assert.equal(chave, e.nota.chave, `${g.caso}: chave da DANFE`);
    assert.ok(isAccessKey(chave!));
    if (n % 5 === 1) { assert.equal(e.tipoCaso, 'limpo'); assert.deepEqual(e.divergencias, []); assert.deepEqual(e.dentroDaTolerancia, []); }
    if (e.tipoCaso === 'danfe_sem_xml') {
      assert.ok(!g.arquivos.some(a => a.tipo === 'xml'), `${g.caso}: não pode ter XML`);
      assert.equal(e.nota.xml, null);
      assert.deepEqual(e.pedirXml, [chave]);
      assert.deepEqual(e.divergencias, []);
      continue;
    }
    assert.deepEqual(e.pedirXml, []);
    const nfe = parseNFe(readFileSync(join(dir, e.nota.xml), 'utf8'));
    assert.equal(nfe.chave, e.nota.chave);
    assert.equal(nfe.totais.nota, e.nota.valorTotal);
    const regs = e.pedido.registros as Record<string, any>[];
    const achadas: string[] = [], dentro: string[] = [];
    const porChave = new Map(regs.map(r => [key(r.codigo), r]));
    const usados = new Set<unknown>();
    for (const it of nfe.itens) {
      const r = porChave.get(key(it.codigo));
      if (!r) { achadas.push(`so_na_nota:${key(it.codigo)}:null:${it.codigo}`); continue; }
      usados.add(r);
      if (it.quantidade !== r.quantidade) achadas.push(`quantidade:${key(it.codigo)}:${r.quantidade}:${it.quantidade}`);
      const dif = Math.abs(it.valorUnitario! - r.valorUnitario);
      if (dif > 1e-9) (dif <= r.valorUnitario * 0.01 + 1e-9 ? dentro : achadas).push(`${dif <= r.valorUnitario * 0.01 + 1e-9 ? 'preco_dentro_tolerancia' : 'preco_fora_tolerancia'}:${key(it.codigo)}:${r.valorUnitario}:${it.valorUnitario}`);
      assert.equal(normPt(it.descricao), normPt(r.descricao), `${g.caso}: descrição de ${it.codigo}`);
    }
    for (const r of regs) if (!usados.has(r)) achadas.push(`so_no_pedido:${key(r.codigo)}:${r.codigo}:null`);
    const emissao = nfe.dataEmissao.slice(0, 10);
    const dias = Math.round((Date.parse(emissao) - Date.parse(regs[0].dataPedido)) / 86400000);
    if (dias < 0 || dias > 30) achadas.push(`prazo_emissao:cabecalho:${regs[0].dataPedido}:${emissao}`);
    if (Math.abs(regs[0].totalPedido - nfe.totais.nota!) > 1 + 1e-9) achadas.push(`valor_total:cabecalho:${regs[0].totalPedido}:${nfe.totais.nota}`);
    assert.equal(regs[0].pedido, nfe.pedido);
    assert.equal(regs[0].cnpjFornecedor, nfe.emitente.cnpj);
    const doGabarito = (l: { tipo: string; chave: string; esperado: unknown; encontrado: unknown }[]) => l.map(d => `${d.tipo}:${key(d.chave)}:${d.esperado}:${d.encontrado}`).sort();
    assert.deepEqual(doGabarito(e.divergencias), achadas.sort(), `${g.caso}: divergências`);
    assert.deepEqual(doGabarito(e.dentroDaTolerancia), dentro.sort(), `${g.caso}: dentro da tolerância`);
    for (const d of e.dentroDaTolerancia) assert.ok(!e.divergencias.some((x: { chave: string; campo: string }) => x.chave === d.chave && x.campo === 'valorUnitario'), `${g.caso}: preço dentro da tolerância listado`);
    if (e.tipoCaso === 'divergencias') assert.ok(e.divergencias.length > 0, g.caso);
    for (const d of [...e.divergencias, ...e.dentroDaTolerancia]) tipos.add(d.tipo);
  }
  for (const t of ['quantidade', 'preco_fora_tolerancia', 'preco_dentro_tolerancia', 'so_na_nota', 'so_no_pedido', 'prazo_emissao', 'valor_total']) assert.ok(tipos.has(t), `sem caso de ${t}`);
  assert.ok(casos.some(c => c.g.esperado.tipoCaso === 'danfe_sem_xml'));
});

test('Financeiro: cada valor esperado está na página indicada; tópicos do modelo; caixa e inadimplência batem', async () => {
  const casos = load(A, 'financeiro');
  assert.equal(casos.length, PACOTES);
  for (const { dir, g } of casos) {
    const e = g.esperado;
    assert.deepEqual(e.topicos, TOPICOS);
    const cache = new Map<string, string[]>();
    let total = 0;
    for (const a of g.arquivos.filter(a => a.nome.endsWith('.pdf'))) { cache.set(a.nome, await paginas(join(dir, a.nome))); total += cache.get(a.nome)!.length; }
    assert.ok(total >= 30 && total <= 300, `${g.caso}: ${total} páginas`);
    assert.equal(e.campos.length, cache.size * 4);
    for (const c of e.campos as { arquivo: string; campo: string; valor: string | number | null; pagina: number | null; trecho: string | null }[]) {
      if (c.pagina === null) { assert.equal(c.valor, null); continue; }
      const pag = cache.get(c.arquivo)![c.pagina - 1];
      assert.ok(pag?.includes(c.trecho!), `${g.caso}: ${c.arquivo} ${c.campo} "${c.trecho}" não está na página ${c.pagina}`);
      assert.equal(c.trecho, c.campo === 'periodo' ? mesPorExtenso(String(c.valor)) : `R$ ${brl(Number(c.valor))}`);
    }
    // Receita - despesa = resultado, nos dois PDFs que trazem os totais.
    const v = (arq: string, campo: string) => e.campos.find((c: { arquivo: string; campo: string }) => c.arquivo === arq && c.campo === campo).valor;
    for (const arq of g.arquivos.map(a => a.nome).filter(n => /^(dre|balancete)-/.test(n))) assert.ok(Math.abs(v(arq, 'receita_total') - v(arq, 'despesa_total') - v(arq, 'resultado')) < 0.005);
    const csvNome = g.arquivos.find(a => a.nome.endsWith('.csv'))!.nome;
    const bytes = readFileSync(join(dir, csvNome));
    const csv = bytes[0] === 0xef ? bytes.toString('utf8').slice(1) : bytes.toString('latin1');
    const linhas = csv.trim().split(/\r?\n/).slice(2).map(l => l.split(';'));
    const soma = linhas.reduce((s, l) => s + Number(l[3].replace(/\./g, '').replace(',', '.')), 0);
    const fato = (d: RegExp) => e.fatos.find((f: { descricao: string }) => d.test(f.descricao)).valor;
    assert.ok(Math.abs(soma - fato(/^Total em atraso/)) < 0.005);
    assert.equal(fato(/^Quantidade de títulos/), linhas.length);
    const caixa = await textOf(join(dir, g.arquivos.find(a => a.nome.endsWith('.xlsx'))!.nome));
    assert.ok(caixa.includes(String(fato(/^Saldo final/))), `${g.caso}: saldo final no fluxo de caixa`);
  }
});

test('LGPD: documentos esperados existem, categorias da taxonomia, sem relação sem categoria e sem termo da taxonomia; 20 perguntas', async () => {
  const casos = load(A, 'lgpd');
  assert.equal(casos.length, LOTES);
  let perguntas = 0, semRelacao = 0, docs = 0;
  const termos = TERMOS_TAXONOMIA.map(normPt);
  for (const { dir, g } of casos) {
    const e = g.esperado;
    const nomes = new Set(g.arquivos.map(a => a.nome));
    assert.equal(e.documentos.length, 10);
    assert.deepEqual(e.documentos.map((d: { arquivo: string }) => d.arquivo).sort(), [...nomes].sort());
    for (const d of e.documentos as { arquivo: string; categoria: string | null; periodo: string | null; nome: string | null }[]) {
      docs++;
      const t = normPt(await textOf(join(dir, d.arquivo)));
      if (d.categoria === null) {
        semRelacao++;
        assert.equal(d.periodo, null); assert.equal(d.nome, null);
        for (const termo of termos) assert.ok(!new RegExp(`(^|[^a-z0-9])${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t), `${g.caso}/${d.arquivo} tem "${termo}"`);
        continue;
      }
      assert.ok((CATEGORIAS as readonly string[]).includes(d.categoria));
      assert.ok(d.nome!.startsWith(`${d.categoria}/${d.periodo}_`) && d.nome!.endsWith(d.arquivo.slice(d.arquivo.lastIndexOf('.'))), d.nome!);
      const [ano, mes] = d.periodo!.split('-');
      assert.ok(t.includes(`/${mes}/${ano}`) || t.includes(`${mes}/${ano}`), `${g.caso}/${d.arquivo}: período ${d.periodo} não está no texto`);
    }
    for (const q of e.perguntas as { pergunta: string; documentos: string[] }[]) {
      perguntas++;
      for (const a of q.documentos) {
        assert.ok(nomes.has(a), `${g.caso}: pergunta aponta ${a}`);
        assert.notEqual(e.documentos.find((d: { arquivo: string }) => d.arquivo === a).categoria, null);
      }
    }
  }
  assert.equal(docs, 60);
  assert.equal(perguntas, PERGUNTAS_TOTAL);
  assert.ok(semRelacao > 0);
});
