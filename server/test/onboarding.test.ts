import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { extractText, getDocumentProxy } from 'unpdf';
import { createTestDb, seedTenant, type TestDb } from './helpers.ts';
import { addPerson, buildTestApp, loginAs } from './app-helpers.ts';
import { createTenant } from '../src/platform/tenants.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';
import { docx, scannedPdf, textPdf, xlsx } from './fixtures.ts';

let db: TestDb;
let app: FastifyInstance;
let T: Awaited<ReturnType<typeof seedTenant>>;
const people: Record<string, string> = {};
const b64 = (b: Uint8Array | string) => Buffer.from(b).toString('base64');
const post = async (userId: string, url: string, payload: object) => app.inject({ method: 'POST', url, headers: (await loginAs(db, userId)).headers, payload });
const get = async (userId: string, url: string) => app.inject({ url, headers: (await loginAs(db, userId)).headers });

before(async () => {
  db = await createTestDb();
  T = await seedTenant(db.owner, 'repet', { role: 'admin_cliente' });
  await db.owner.query(`insert into areas (tenant_id, slug, name) values ($1, 'rh', 'RH / DP'), ($1, 'fiscal', 'Fiscal')`, [T.tenantId]);
  people.keyRh = await addPerson(db, T.tenantId, 'key.rh@repet.com.br', 'key_user', 'rh');
  app = await buildTestApp(db, { objects: new MemoryObjectStore() });
});
after(async () => { await app?.close(); await db?.drop(); });

test('criação de tenant já com key users por área e Política de Uso inicial', async () => {
  const base = { slug: 'exemplo', name: 'Empresa Exemplo', domains: ['exemplo.com.br'], areas: [{ slug: 'fiscal', name: 'Fiscal' }],
    providers: [{ kind: 'email_code', label: 'Código por email' }], admins: ['admin@exemplo.com.br'] };
  await assert.rejects(createTenant(db.owner, { ...base, keyUsers: [{ email: 'k@outro.com.br', area: 'fiscal' }] }), /fora dos domínios/);
  await assert.rejects(createTenant(db.owner, { ...base, keyUsers: [{ email: 'k@exemplo.com.br', area: 'rh' }] }), /área rh do key user/);
  const r = await createTenant(db.owner, { ...base, keyUsers: [{ email: 'key.fiscal@exemplo.com.br', area: 'fiscal' }, { email: 'admin@exemplo.com.br', area: 'fiscal' }],
    policy: { title: 'Política de Uso de IA', body: 'Use a IA para tarefas do dia a dia, sem dados de clientes.', rules: { restrictedTerms: ['Projeto Aurora'] } } });
  const m = (await db.owner.query(`select u.email, m.role, a.slug from memberships m join users u on u.id = m.user_id left join areas a on a.id = m.area_id where m.tenant_id = $1 order by u.email, m.role`, [r.id])).rows;
  assert.deepEqual(m.map(x => [x.email, x.role, x.slug]), [
    ['admin@exemplo.com.br', 'admin_cliente', null], ['admin@exemplo.com.br', 'key_user', 'fiscal'], ['key.fiscal@exemplo.com.br', 'key_user', 'fiscal'],
  ]);
  const p = (await db.owner.query(`select version, rules from usage_policies where tenant_id = $1`, [r.id])).rows[0];
  assert.deepEqual([p.version, p.rules.restrictedTerms], [1, ['Projeto Aurora']]);
});

test('importação de pessoas por CSV: simulação, relatório por linha e permissão de quem importa', async () => {
  const csv = [
    'E-mail;Nome;Área;Papel',
    'bia@repet.com.br;Bia Souza;RH / DP;usuario',
    'caio@repet.com.br;Caio Lima;rh;revisor',
    'dani@repet.com.br;Dani;;usuario',
    'x@gmail.com;Fora;rh;usuario',
    'sem-arroba;Erro;rh;usuario',
    'eva@repet.com.br;Eva;Jurídico;usuario',
    'fabio@repet.com.br;Fábio;rh;gerente',
    'bia@repet.com.br;Bia Souza;fiscal;key user',
  ].join('\r\n');
  let r = (await post(T.userId, '/api/admin/users/import', { csv, simular: true })).json();
  assert.deepEqual([r.simulado, r.vinculos, r.criados], [true, 4, 0]);
  assert.equal((await db.owner.query(`select 1 from users where email = 'bia@repet.com.br'`)).rowCount, 0);
  r = (await post(T.userId, '/api/admin/users/import', { csv })).json();
  assert.deepEqual([r.criados, r.vinculos], [3, 4]);
  assert.deepEqual(r.erros.map((e: { linha: number; erro: string }) => [e.linha, e.erro]), [
    [5, 'domínio não permitido neste cliente'], [6, 'email inválido'], [7, 'área não encontrada: Jurídico'], [8, 'papel inválido: gerente'],
  ]);
  // Key user do RH só dá papéis de usuário e revisor, e só no RH.
  const k = (await post(people.keyRh, '/api/admin/users/import', { csv: 'email;area;papel\ngil@repet.com.br;rh;usuario\nhana@repet.com.br;fiscal;usuario\nivo@repet.com.br;rh;key_user' })).json();
  assert.equal(k.vinculos, 1);
  assert.deepEqual(k.erros.map((e: { erro: string }) => e.erro), ['sem permissão para dar o papel usuario na área Fiscal', 'sem permissão para dar o papel key_user na área RH / DP']);
  assert.equal((await post(T.userId, '/api/admin/users/import', { csv: 'nome;area\nx;y' })).json().error, 'colunas_obrigatorias');
});

test('importação em lote para a base: PDF, DOCX, XLSX e texto indexados; recusados e erros no relatório', async () => {
  const files = [
    { name: 'Férias.pdf', contentBase64: b64(await textPdf(['Política de férias: pedir com 30 dias de antecedência no portal do colaborador.'])) },
    { name: 'Admissão.docx', contentBase64: b64(await docx(['Documentos de admissão: RG, CPF, comprovante de residência e carteira de trabalho.'])) },
    { name: 'Tabela de benefícios.xlsx', contentBase64: b64(await xlsx({ Benefícios: [['Benefício', 'Valor'], ['Vale-refeição', 'R$ 40 por dia']] })) },
    { name: 'Ponto.md', contentBase64: b64('# Ponto\nAjustes de marcação até o 2º dia útil do mês seguinte.') },
    { name: 'Escaneado.pdf', contentBase64: b64(await scannedPdf()) },
    { name: 'Programa.exe', contentBase64: b64('MZ') },
    { name: 'ponto.md', contentBase64: b64('duplicado') },
  ];
  const r = await post(people.keyRh, '/api/kb/import', { areaSlug: 'rh', files });
  assert.equal(r.statusCode, 202, r.body);
  const body = r.json();
  assert.deepEqual([body.aceitos, body.recusados], [5, 2]);
  assert.match(body.documentos.find((d: { arquivo: string }) => d.arquivo === 'Programa.exe').erro, /tipo não aceito \(\.exe\)/);
  assert.equal(body.documentos.find((d: { arquivo: string }) => d.arquivo === 'ponto.md').erro, 'nome repetido no lote');
  const st = (await get(people.keyRh, `/api/kb/import/${body.lote}`)).json();
  assert.deepEqual(st.resumo, { indexados: 4, pendentes: 0, erros: 1 });
  assert.deepEqual(st.documentos.filter((d: { status: string }) => d.status === 'erro').map((d: { titulo: string; erro: string }) => [d.titulo, d.erro]),
    [['Escaneado', 'arquivo digitalizado sem texto legível pelo OCR: envie a versão com texto']]);
  const search = async (q: string) => (await get(people.keyRh, '/api/kb/search?q=' + encodeURIComponent(q))).json().map((x: { title: string }) => x.title);
  assert.deepEqual(await search('antecedência para pedir férias'), ['Férias']);
  assert.deepEqual(await search('documentos de admissão carteira de trabalho'), ['Admissão']);
  assert.deepEqual(await search('valor do vale-refeição'), ['Tabela de benefícios']);
  assert.equal((await post(people.keyRh, '/api/kb/import', { areaSlug: 'fiscal', files: files.slice(3, 4) })).statusCode, 403);
});

test('guia rápido do assistente em PDF e Markdown, gerado da definição e da política', async () => {
  await post(T.userId, '/api/admin/policy', { title: 'Política de Uso de IA', body: 'Use a IA para tarefas do dia a dia, sem dados de clientes.', rules: { restrictedTerms: ['Projeto Aurora'] } });
  await post(T.userId, '/api/admin/assistants', { slug: 'admissao', name: 'Checklist de admissão', areaSlug: 'rh', status: 'rascunho', definition: {
    description: 'Confere a pasta de documentos de admissão.', dataClasses: ['verde', 'amarela', 'vermelha'], dataPolicy: { cpf: 'permitir_com_registro', email: 'mascarar' },
    inputs: { text: { enabled: false }, files: { enabled: true, required: true, accept: ['pdf', 'imagem'] } },
    pipeline: [{ bloco: 'ler' }, { bloco: 'checklist', params: { itens: [{ id: 'rg', nome: 'RG' }] } }],
    output: { format: 'checklist', files: ['pdf', 'xlsx'] }, review: { checklist: ['Confira a validade da CNH.'] } } });
  const md = (await get(people.keyRh, '/api/assistants/admissao/guide?format=md')).body;
  assert.match(md, /## O que enviar\n- Arquivos: PDF, foto ou imagem digitalizada \(JPG, PNG, TIFF, HEIC\)\. Até 20 arquivos de 20 MB cada\. Pelo menos um arquivo é obrigatório\./);
  assert.match(md, /Nunca: senha ou credencial, [^\n]*RG/);
  assert.ok(!/Nunca:[^\n]*CPF/.test(md), 'CPF é permitido com registro neste assistente');
  assert.match(md, /Mascarados antes do envio: email\./);
  assert.match(md, /Informações restritas listadas na Política de Uso de IA\./);
  assert.ok(!md.includes('Aurora'), 'o guia não expõe os termos restritos');
  assert.match(md, /- Confira a validade da CNH\./);
  assert.match(md, /Itens duvidosos sempre precisam ser vistos no arquivo/);
  const pdf = await get(people.keyRh, '/api/assistants/admissao/guide');
  const text = (await extractText(await getDocumentProxy(new Uint8Array(pdf.rawPayload)), { mergePages: true })).text;
  assert.match(text, /Checklist de admissão/);
  assert.match(text, /Como revisar/);
});

test('roteiro de primeiro acesso: marcado uma vez por pessoa', async () => {
  assert.equal((await get(people.keyRh, '/api/session')).json().onboardingDone, false);
  assert.equal((await post(people.keyRh, '/api/me/onboarding', {})).statusCode, 200);
  assert.equal((await get(people.keyRh, '/api/session')).json().onboardingDone, true);
});
