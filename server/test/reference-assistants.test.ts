// Os quatro assistentes de referência (3.10), só por configuração, de ponta a
// ponta com o provedor simulado: envio, pipeline, revisão e exportação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { FakeProvider, type LlmCompleteRequest } from '../src/llm/provider.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { demoAssistants, seedDemo } from '../src/demo/seed.ts';
import { loadCatalogFiles } from '../src/catalog/catalog.ts';
import { SAMPLES, RH_PHOTO_TRANSCRIPTION, danfePdf, nfeKey } from '../src/demo/samples.ts';

let db: TestDb;
let app: FastifyInstance;
const objects = new MemoryObjectStore();
const fake = new FakeProvider();
let tenantId = '';
const u: Record<string, string> = {};
const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });

// Provedor simulado: responde conforme a etapa, com base no que recebeu.
function reply(req: LlmCompleteRequest): string {
  const text = req.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
  if (/transcreve/.test(req.system)) return RH_PHOTO_TRANSCRIPTION;
  if (/formulário/.test(req.system)) {
    if (!/Documento: dre-agosto-2026\.pdf/.test(text)) return JSON.stringify({ campos: { periodo: null, receita_total: null, despesa_total: null, resultado: null }, origem: [] });
    return JSON.stringify({
      campos: { periodo: '2026-08', receita_total: 1240000, despesa_total: 1105500, resultado: 134500 },
      origem: [
        { campo: 'periodo', pagina: 1, trecho: 'Demonstração do Resultado - agosto de 2026' },
        { campo: 'receita_total', pagina: 1, trecho: 'Receita operacional líquida: R$ 1.240.000,00' },
        { campo: 'despesa_total', pagina: 1, trecho: 'Custos e despesas totais: R$ 1.105.500,00' },
        { campo: 'resultado', pagina: 1, trecho: 'Resultado do mês: R$ 134.500,00' },
      ],
    });
  }
  if (/resumos para análise/.test(req.system)) {
    return ['## Visão geral do mês', 'Resultado de R$ 134.500,00 em agosto.', '## Receitas e despesas', 'Receita de R$ 1.240.000,00 e despesas de R$ 1.105.500,00.',
      '## Caixa', 'Saldo final de R$ 534.500,00 na semana 4.', '## Inadimplência', 'Dois clientes em atraso, somando R$ 25.700,00.',
      '## Pontos de atenção', 'Saídas acima das entradas na semana 4.', '## Informações que faltam', 'Sem informação no material.'].join('\n');
  }
  return '{}';
}

async function runWith(userId: string, slug: string, text = '') {
  const files = (await SAMPLES[slug]()).map(f => ({ name: f.name, mime: f.mime, contentBase64: Buffer.from(f.bytes).toString('base64') }));
  const r = await post(userId, '/api/runs', { assistant: slug, text, files });
  assert.equal(r.statusCode, 202, `${slug}: ${r.body}`);
  const d = (await get(userId, `/api/runs/${r.json().runId}`)).json();
  assert.equal(d.status, 'rascunho', `${slug}: ${d.error}`);
  return d;
}
const section = (d: { result: { sections: { id: string; kind: string; data: any; flags: { reason: string; ref?: string }[] }[] } }, kind: string) => d.result.sections.find(s => s.kind === kind)!;

before(async () => {
  db = await createTestDb();
  fake.completeReply = reply;
  app = await buildTestApp(db, { objects, fake });
  tenantId = (await seedDemo(db.owner, objects)).tenantId;
  const id = async (email: string) => (await db.owner.query(`select id from users where tenant_id = $1 and email = $2`, [tenantId, email])).rows[0].id as string;
  for (const area of ['fiscal', 'rh', 'financeiro', 'lgpd']) {
    u[`key_${area}`] = await id(`key.${area}@demonstracao.com.br`);
    u[area] = await addPerson(db, tenantId, `pessoa.${area}@demonstracao.com.br`, 'usuario', area);
  }
  for (const who of Object.values(u)) assert.equal((await post(who, '/api/policy/ack', { version: 1 })).statusCode, 200);
});
after(async () => { await app?.close(); await db?.drop(); });

test('os quatro assistentes vêm de modelos do catálogo (JSON) e validam no mesmo schema do painel', async () => {
  const plan = demoAssistants();
  assert.deepEqual(plan.map(a => a.slug), ['checklist-admissao', 'conferencia-nfe', 'evidencias-lgpd', 'resumo-financeiro']);
  const templates = loadCatalogFiles().filter(t => t.kind === 'assistente' && plan.some(a => a.modelo === t.slug));
  assert.equal(templates.length, 4);
  const blocks = new Set(templates.flatMap(t => ((t as { definition: { pipeline: { bloco: string }[] } }).definition).pipeline.map(s => s.bloco)));
  assert.deepEqual([...blocks].sort(), ['buscar', 'checklist', 'classificar', 'conferir', 'exportar', 'extrair', 'ler', 'resumir']);
  const list = (await get(u.key_fiscal, '/api/assistants')).json();
  assert.ok(list.some((a: { slug: string; status: string }) => a.slug === 'conferencia-nfe' && a.status === 'piloto'));
  assert.deepEqual(list.find((a: { slug: string }) => a.slug === 'conferencia-nfe').origem, { tipo: 'modelo', modelo: { slug: 'conferencia-nota-pedido', versao: 1, versaoNova: null } });
});

test('Fiscal: NF-e de entrada (XML) × pedido de compra (XLSX), com divergências e origem', async () => {
  const d = await runWith(u.fiscal, 'conferencia-nfe');
  assert.equal(fake.completions.length, 0, 'conferência não usa o modelo');
  const [itens, cab] = d.result.sections.filter((s: { kind: string }) => s.kind === 'divergencias');
  assert.deepEqual(itens.data.divergencias.map((x: { chave: string; campo: string }) => `${x.chave}:${x.campo}`), [
    'P-002:Quantidade', 'P-003:Valor unitário', 'P-009:(registro)', 'P-005:(registro)',
  ]);
  assert.equal(itens.data.divergencias[1].motivo, 'diferença de 0,002 (4,00%), acima da tolerância');
  assert.equal(itens.data.divergencias[0].esquerda.origem, 'nfe-000123.xml › item 2');
  assert.equal(itens.data.divergencias[0].direita.origem, 'pedido-4500123.xlsx › Itens › linha 3');
  assert.deepEqual(cab.data.divergencias.map((x: { campo: string; motivo: string }) => [x.campo, x.motivo]), [['Valor total', 'diferença de 63,9 (4,04%), acima da tolerância']]);
  assert.equal(cab.data.divergencias[0].direita.origem, 'pedido-4500123.xlsx › Cabeçalho › linha 4');
  assert.equal(d.divergences, 5);
  // Revisão: o key user descarta o P-009 (palete retornável, sem pedido por acordo) e aprova com edição.
  const edited = structuredClone(d.result.sections);
  edited[1].data.divergencias = edited[1].data.divergencias.filter((x: { chave: string }) => x.chave !== 'P-009');
  assert.equal((await post(u.key_fiscal, `/api/runs/${d.id}/review`, { decisao: 'aprovado_com_edicao', resultadoEditado: { sections: edited }, motivo: 'P-009 é palete retornável, sem pedido por acordo.' })).statusCode, 200);
  const x = await get(u.fiscal, `/api/runs/${d.id}/export?format=xlsx`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
  assert.equal(wb.worksheets.find(w => w.name.startsWith('Itens da nota'))!.rowCount, 4);  // 3 divergências + cabeçalho
  const csv = (await get(u.fiscal, `/api/runs/${d.id}/export?format=csv`)).body;
  assert.match(csv, /P-003;Valor unitário/);
});

test('Fiscal: DANFE em PDF sem o XML vira pendência "pedir o XML ao fornecedor", sem chamar o modelo', async () => {
  const before = fake.completions.length;
  const files = [...await SAMPLES['conferencia-nfe'](), { name: 'danfe-000124.pdf', mime: 'application/pdf', bytes: await danfePdf({ numero: '124', emissao: '2026-09-16', total: 'R$ 890,00' }) }]
    .map(f => ({ name: f.name, mime: f.mime, contentBase64: Buffer.from(f.bytes).toString('base64') }));
  const r = await post(u.fiscal, '/api/runs', { assistant: 'conferencia-nfe', files });
  assert.equal(r.statusCode, 202, r.body);
  const d = (await get(u.fiscal, `/api/runs/${r.json().runId}`)).json();
  assert.equal(fake.completions.length - before, 0);
  const docs = section(d, 'documentos');
  assert.deepEqual(docs.data.find((x: { arquivo: string }) => x.arquivo === 'danfe-000124.pdf').danfe, { chave: nfeKey('124'), xml: null, situacao: 'pedir o XML ao fornecedor' });
  assert.ok(docs.flags.some(f => f.ref === 'danfe-000124.pdf' && /pedir o XML ao fornecedor/.test(f.reason)));
  assert.equal(d.pendings, 1);
});

test('RH/DP: checklist de admissão a partir de uma pasta de arquivos', async () => {
  const before = fake.completions.length;
  const d = await runWith(u.rh, 'checklist-admissao');
  assert.equal(fake.completions.length - before, 1, 'só a foto vai para a visão (fallback: o OCR não leu a foto)');
  const c = section(d, 'checklist').data;
  assert.deepEqual(Object.fromEntries(c.itens.map((i: { id: string; status: string }) => [i.id, i.status])),
    { rg: 'presente', cpf: 'presente', residencia: 'presente', ctps: 'presente', aso: 'ausente', titulo: 'duvidoso', banco: 'duvidoso' });
  assert.equal(c.itens.find((i: { id: string }) => i.id === 'residencia').evidencias[0].arquivo, 'foto-comprovante.png');
  assert.equal(d.pendings, 3);
  const acts = (await db.owner.query(`select action from audit_log where target = $1 order by seq`, [`execucao:${d.id}`])).rows.map(a => a.action);
  assert.ok(acts.includes('conteudo_visual_enviado'));
  assert.equal((await post(u.key_rh, `/api/runs/${d.id}/review`, { decisao: 'aprovado' })).statusCode, 200);
  const pdf = await get(u.rh, `/api/runs/${d.id}/export?format=pdf`);
  const text = (await extractText(await getDocumentProxy(new Uint8Array(pdf.rawPayload)), { mergePages: true })).text;
  assert.match(text, /Situação: ausente/);
  assert.match(text, /ASO/);
});

test('Financeiro: resumo padronizado de um conjunto de documentos, com indicadores extraídos e origem', async () => {
  const d = await runWith(u.financeiro, 'resumo-financeiro', 'Destacar o caixa.');
  const ex = section(d, 'campos');
  assert.equal(ex.data.length, 1);                                                          // só o PDF (tipos do bloco)
  assert.deepEqual(ex.data[0].campos, { periodo: '2026-08', receita_total: 1240000, despesa_total: 1105500, resultado: 134500 });
  assert.equal(ex.data[0].valido, true);
  assert.ok(ex.data[0].origem.every((o: { confere: boolean }) => o.confere));
  const r = section(d, 'resumo');
  assert.deepEqual(r.data.topicos.map((t: { titulo: string }) => t.titulo), ['Visão geral do mês', 'Receitas e despesas', 'Caixa', 'Inadimplência', 'Pontos de atenção', 'Informações que faltam']);
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.data.fontes, ['dre-agosto-2026.pdf', 'fluxo-caixa-agosto.xlsx', 'inadimplencia-agosto.csv']);
  assert.equal((await post(u.key_financeiro, `/api/runs/${d.id}/review`, { decisao: 'aprovado' })).statusCode, 200);
  const docx = await get(u.financeiro, `/api/runs/${d.id}/export?format=docx`);
  const body = (await mammoth.extractRawText({ buffer: Buffer.from(docx.rawPayload) })).value;
  assert.match(body, /Resumo para a reunião de resultados/);
  assert.match(body, /Receita de R\$ 1\.240\.000,00/);
});

test('LGPD & Compliance: organização de evidências com índice, busca por documento e pacote ZIP', async () => {
  const d = await runWith(u.lgpd, 'evidencias-lgpd', 'lista de presença do treinamento');
  const idx = section(d, 'classificacao');
  assert.deepEqual(idx.data.indice.map((r: { arquivo: string; categoria: string | null; periodo: string | null }) => [r.arquivo, r.categoria, r.periodo]).sort(), [
    ['acordo-fornecedor-nuvem.docx', 'contratos', '2026-02'],
    ['controle-chaves.xlsx', null, null],
    ['lista-presenca-treinamento.pdf', 'treinamentos', '2026-05'],
    ['politica-de-privacidade-v3.pdf', 'politicas', '2026-03'],
    ['relatorio-incidente-julho.pdf', 'incidentes', '2026-07'],
  ]);
  assert.ok(idx.flags.some((f: { ref?: string; reason: string }) => f.ref === 'controle-chaves.xlsx' && f.reason === 'documento não classificado'));
  const busca = section(d, 'busca').data.resultados;
  assert.ok(busca.some((b: { origem: string; titulo: string }) => b.origem === 'envio' && b.titulo === 'lista-presenca-treinamento.pdf'));
  assert.ok(busca.some((b: { origem: string; titulo: string }) => b.origem === 'base' && /Registro das operações/.test(b.titulo)));
  // Revisão: o documento sem categoria vai para "Registro de operações" antes de aprovar.
  const edited = structuredClone(d.result.sections);
  const row = edited.find((s: { kind: string }) => s.kind === 'classificacao').data.indice.find((r: { arquivo: string }) => r.arquivo === 'controle-chaves.xlsx');
  Object.assign(row, { categoria: 'registros', categoriaNome: 'Registro de operações', nomeSugerido: 'registros/sem-periodo_controle-chaves.xlsx' });
  assert.equal((await post(u.key_lgpd, `/api/runs/${d.id}/review`, { decisao: 'aprovado_com_edicao', resultadoEditado: { sections: edited } })).statusCode, 200);
  const z = await get(u.lgpd, `/api/runs/${d.id}/export?format=zip`);
  const zip = await JSZip.loadAsync(z.rawPayload);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
  assert.deepEqual(names, [
    'LEIAME.txt', 'contratos/2026-02_acordo-fornecedor-nuvem.docx', 'incidentes/2026-07_relatorio-incidente-julho.pdf', 'indice.csv',
    'politicas/2026-03_politica-de-privacidade-v3.pdf', 'registros/sem-periodo_controle-chaves.xlsx', 'treinamentos/2026-05_lista-presenca-treinamento.pdf',
  ]);
  const xlsx = await get(u.lgpd, `/api/runs/${d.id}/export?format=xlsx`);
  assert.equal(xlsx.statusCode, 200);
});

test('medição fica no quick win que usa o assistente: sem ponto de partida até o baseline ser registrado; execução anterior ao quick win não conta', async () => {
  const o = (await post(u.key_fiscal, '/api/opportunities', { areaSlug: 'fiscal', titulo: 'Conferência de notas contra pedidos', processo: 'Entrada de notas', problema: 'Conferência manual', evidencia: 'hipotese' })).json();
  await post(u.key_fiscal, `/api/opportunities/${o.id}/avaliar`, { notas: { valor: 4, complexidade: 2, risco: 2, dependencias: 2 }, nota: 'Avaliada pelo key user.' });
  assert.equal((await post(u.key_fiscal, `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Conferir notas', responsavel: 'key.fiscal@demonstracao.com.br', nota: 'Tentativa do key user.' })).statusCode, 403);   // key user propõe, não seleciona
  const admin = (await db.owner.query(`select id from users where tenant_id = $1 and email = 'admin@demonstracao.com.br'`, [tenantId])).rows[0].id;
  const s = await post(admin, `/api/opportunities/${o.id}/selecionar`, { objetivo: 'Conferir notas sem retrabalho', responsavel: 'key.fiscal@demonstracao.com.br', recursos: { assistentes: ['conferencia-nfe'] }, nota: 'Selecionada para medir.',
    indicadores: [{ key: 'tempo', label: 'Tempo por nota', unit: 'min', direction: 'menor_melhor', auto: 'tempo_processamento' }] });
  assert.equal(s.statusCode, 201, s.body);
  const r = (await get(u.key_fiscal, `/api/quick-wins/${s.json().id}`)).json();
  assert.equal(r.semPontoDePartida, true);
  assert.equal(r.execucoes.execucoes, 0);                               // as execuções de antes não tinham quick win
  await runWith(u.fiscal, 'conferencia-nfe');                            // a próxima, sim: a área de quem executa aponta um só
  assert.equal((await get(u.key_fiscal, `/api/quick-wins/${s.json().id}`)).json().execucoes.execucoes, 1);
  assert.equal((await get(u.key_lgpd, '/api/audit/verify')).json().ok, true);
});
