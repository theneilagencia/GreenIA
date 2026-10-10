import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { exec } from '../src/db.js';
import { extrairTabelas, gerarCsv } from '../public/tabelas.js';

const TEXTO = 'Resumo\n\n| Nome | Variação |\n| --- | --- |\n| Iris | -12,5% |\n\nOutra tabela\n\n| Campo | Valor |\n| --- | --- |\n| Formula | =1+1 |';
let S, ana, bia, admin;
before(async () => {
  S = await subir(); salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); S.app.db.close(); });
async function resposta(texto = TEXTO, papel = 'assistant') {
  const conversa = (await ana.post('/api/conversas')).dados.conversa.id;
  const mensagem = Number(exec(S.app.db, 'insert into mensagens (conversa_id, papel, texto, criado_em) values (?, ?, ?, ?)', conversa, papel, texto, new Date().toISOString()).lastInsertRowid);
  return { conversa, mensagem, url: i => `/api/conversas/${conversa}/mensagens/${mensagem}/tabelas/${i}/csv` };
}

test('CSV: índices das tabelas, UTF-8, proteção contra fórmula e números negativos', () => {
  const tabelas = extrairTabelas(TEXTO);
  assert.equal(tabelas.length, 2);
  assert.equal(gerarCsv(tabelas[0]), '\uFEFFNome;Variação\r\nIris;-12,5%');
  assert.equal(gerarCsv(tabelas[1]), "\uFEFFCampo;Valor\r\nFormula;'=1+1");
  assert.equal(gerarCsv([['\t=1+1', '@SUM(A1)', 'a;b', 'a"b', 'a\rb', null]]), "\uFEFF'\t=1+1;'@SUM(A1);\"a;b\";\"a\"\"b\";\"a\rb\";");
});

test('CSV de conversa: download autenticado contém só a tabela pedida, sem cache', async () => {
  const r = await resposta();
  for (const i of [0, 1]) {
    const d = await ana.get(r.url(i));
    assert.equal(d.status, 200);
    // Fetch decodifica e remove o BOM; os bytes da resposta continuam com ele.
    assert.equal(d.dados, gerarCsv(extrairTabelas(TEXTO)[i]).slice(1));
    assert.match(d.headers.get('content-type'), /^text\/csv; charset=utf-8$/);
    assert.equal(d.headers.get('content-disposition'), 'attachment; filename="tabela.csv"');
    assert.equal(d.headers.get('cache-control'), 'no-store');
  }
  const bytes = new Uint8Array(await (await fetch(S.base + r.url(0), { headers: { cookie: ana.cookie } })).arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
});

test('CSV de conversa: outro usuário, admin e visitante não acessam o conteúdo', async () => {
  const r = await resposta();
  for (const c of [bia, admin]) assert.equal((await c.get(r.url(0))).status, 404);
  assert.equal((await S.cliente().get(r.url(0))).status, 401);
  const outra = await resposta();
  assert.equal((await ana.get(`/api/conversas/${outra.conversa}/mensagens/${r.mensagem}/tabelas/0/csv`)).status, 404);
});

test('CSV de conversa: índices inválidos, mensagem da pessoa, conteúdo não guardado e exclusão não expõem dados', async () => {
  const r = await resposta();
  for (const i of ['-1', '0.5', '01', '2', 'NaN']) assert.equal((await ana.get(r.url(i))).status, 404);
  const pessoa = await resposta(TEXTO, 'user');
  assert.equal((await ana.get(pessoa.url(0))).status, 404);
  const vazio = await resposta('[Conteúdo processado e não guardado, pela política de retenção da empresa.]');
  assert.equal((await ana.get(vazio.url(0))).status, 404);
  await ana.del(`/api/conversas/${r.conversa}`);
  assert.equal((await ana.get(r.url(0))).status, 404);
});
