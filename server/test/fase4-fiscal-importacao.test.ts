// Fase 4, Fiscal: os pedidos do corpus chegam em cinco layouts de exportação
// diferentes (CSV Latin-1 com título e rodapé, XLSX com aba campo | valor, texto
// de largura fixa, JSON em caixas, XML). Cada layout entra por um mapeamento
// criado pela API de configuração, testado com um arquivo de exemplo. O mesmo
// assistente, criado do modelo do catálogo, confere todos, sem mudança de código,
// e as divergências batem com o gabarito. Só o conjunto de desenvolvimento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createTestDb, enableReaders, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { normKey } from '../src/blocks/values.ts';
import { gerarFiscal } from '../eval/fase4/gerar-fiscal.ts';
import { conjuntoDe } from '../eval/fase4/dividir.ts';

const EVAL = new URL('../eval/fase4/', import.meta.url).pathname;
let db: TestDb, app: FastifyInstance, dir = '';
let T: Awaited<ReturnType<typeof seedTenant>>;
const u: Record<string, string> = {};
const call = async (who: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: (await loginAs(db, u[who])).headers, payload });

interface Gab { caso: string; arquivos: { nome: string }[]; esperado: { tipoCaso: string; pedido: { arquivo: string; layout: string; mapeamento: string; registros: unknown[] }; divergencias: { chave: string; tipo: string }[]; pedirXml: string[] } }
let casos: { dir: string; g: Gab }[] = [];

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fase4-fiscal-'));
  await gerarFiscal(dir, 30, 4301);
  const base = join(dir, 'fiscal');
  casos = readdirSync(base).filter(c => statSync(join(base, c)).isDirectory()).sort()
    .map(c => ({ dir: join(base, c), g: JSON.parse(readFileSync(join(base, c, 'gabarito.json'), 'utf8')) as Gab }))
    .filter(c => conjuntoDe(c.g.caso) === 'desenvolvimento');          // o reservado fica para a rodada final
  db = await createTestDb();
  T = await seedTenant(db.owner, 'avaliacao', { role: 'admin_cliente' });
  u.admin = T.userId;
  await enableReaders(db.owner, T.tenantId);
  // Avaliação em lote: o limite por minuto não é o que se mede aqui.
  app = await buildTestApp(db, { fake: new FakeProvider(), objects: new MemoryObjectStore(), rateLimiter: { async hit() { return { ok: true, retryAfterSec: 0 }; } } });
  await call('admin', 'POST', '/api/admin/areas', { name: 'Compras' });
  u.key = await addPerson(db, T.tenantId, 'key.compras@avaliacao.com.br', 'key_user', 'compras');
  u.user = await addPerson(db, T.tenantId, 'ana@avaliacao.com.br', 'usuario', 'compras');
});
after(async () => { await app?.close(); await db?.drop(); if (dir) rmSync(dir, { recursive: true, force: true }); });

// O que o assistente apontou, no vocabulário do gabarito.
function obtidas(sections: { id: string; data: { divergencias: { chave: string; campo: string; motivo: string }[] } }[]) {
  const out: string[] = [];
  for (const d of sections.find(s => s.id === 'itens')!.data.divergencias) {
    const tipo = d.campo === '(registro)' ? (/sem par em Pedido/.test(d.motivo) ? 'so_na_nota' : 'so_no_pedido')
      : ({ Quantidade: 'quantidade', 'Valor unitário': 'preco_fora_tolerancia', 'Descrição': 'descricao' } as Record<string, string>)[d.campo] ?? d.campo;
    out.push(`${tipo}:${normKey(d.chave)}`);
  }
  for (const d of sections.find(s => s.id === 'cabecalho')!.data.divergencias) {
    const tipo = ({ 'Valor total': 'valor_total', 'Emissão dentro do prazo de entrega': 'prazo_emissao', 'Número do pedido': 'pedido', 'CNPJ do fornecedor': 'cnpj' } as Record<string, string>)[d.campo] ?? d.campo;
    out.push(`${tipo}:cabecalho`);
  }
  return out.sort();
}

test('cinco layouts entram por mapeamentos criados pela API; o mesmo assistente confere todos', async () => {
  const layouts = [...new Set(casos.map(c => c.g.esperado.pedido.layout))].sort();
  assert.equal(casos.length, 18);
  assert.ok(layouts.length >= 3, `layouts: ${layouts.join(', ')}`);
  // Mapeamentos: um por layout, pela API, com um arquivo de exemplo do próprio layout.
  const slugDe: Record<string, string> = {};
  for (const l of layouts) {
    const ex = casos.find(c => c.g.esperado.pedido.layout === l)!;
    const cfg = JSON.parse(readFileSync(join(EVAL, ex.g.esperado.pedido.mapeamento), 'utf8'));
    const { nome, ...config } = cfg;
    const bytes = readFileSync(join(ex.dir, ex.g.esperado.pedido.arquivo));
    const r = await call('key', 'POST', '/api/admin/import-mappings', { slug: l, nome: String(nome ?? l).slice(0, 120), config,
      arquivoExemplo: { nome: ex.g.esperado.pedido.arquivo, base64: bytes.toString('base64') } });
    assert.equal(r.statusCode, 201, `${l}: ${r.body}`);
    slugDe[l] = r.json().slug;
  }
  // Assistente do catálogo, sem nenhum ajuste: o schema normalizado é o do modelo.
  const a = await call('admin', 'POST', '/api/admin/assistants', { slug: 'conferencia', name: 'Conferência de nota × pedido', areaSlug: 'compras', status: 'ativo', modelo: { slug: 'conferencia-nota-pedido' } });
  assert.equal(a.statusCode, 201, a.body);

  const porLayout: Record<string, { casos: number; certos: number }> = {};
  const falhas: string[] = [];
  for (const { dir: cd, g } of casos) {
    const files = g.arquivos.map(f => ({ name: f.nome, mime: 'application/octet-stream', contentBase64: readFileSync(join(cd, f.nome)).toString('base64') }));
    const r = await call('user', 'POST', '/api/runs', { assistant: 'conferencia', files });
    assert.equal(r.statusCode, 202, `${g.caso}: ${r.body}`);
    const d = (await call('user', 'GET', `/api/runs/${r.json().runId}`)).json();
    assert.equal(d.status, 'rascunho', `${g.caso}: ${d.error}`);
    const ler = d.result.sections.find((s: { bloco: string }) => s.bloco === 'ler');
    const imp = ler.data.find((x: { arquivo: string }) => x.arquivo === g.esperado.pedido.arquivo).importacao;
    const l = g.esperado.pedido.layout;
    porLayout[l] ??= { casos: 0, certos: 0 };
    porLayout[l].casos++;
    // O pedido entrou pelo mapeamento do seu layout, com todos os registros.
    assert.equal(imp.length, 1, `${g.caso}: ${JSON.stringify(imp)}`);
    assert.equal(imp[0].versao, 1);
    assert.equal(imp[0].registros, g.esperado.pedido.registros.length, g.caso);
    assert.equal(imp[0].errosDeLinha, 0, g.caso);
    let certo: boolean;
    if (g.esperado.tipoCaso === 'danfe_sem_xml') {
      // Só o DANFE: o assistente pede o XML ao fornecedor.
      const danfe = ler.data.find((x: { danfe?: unknown }) => x.danfe);
      certo = !!danfe && danfe.danfe.situacao === 'pedir o XML ao fornecedor' && g.esperado.pedirXml.includes(danfe.danfe.chave);
    } else {
      const esperado = g.esperado.divergencias.map(x => `${x.tipo}:${x.chave === 'cabecalho' ? 'cabecalho' : normKey(x.chave)}`).sort();
      const achado = obtidas(d.result.sections);
      certo = JSON.stringify(esperado) === JSON.stringify(achado);
      if (!certo) falhas.push(`${g.caso} (${l}): esperado ${esperado.join(', ') || 'nada'}; achado ${achado.join(', ') || 'nada'}`);
    }
    if (certo) porLayout[l].certos++;
  }
  console.log('Fiscal por layout:', JSON.stringify(porLayout));
  assert.deepEqual(falhas, []);
  for (const l of layouts) assert.equal(porLayout[l].certos, porLayout[l].casos, l);
});
