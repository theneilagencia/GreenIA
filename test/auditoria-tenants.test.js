// Auditoria final, isolamento entre empresas: com "guardar = não" na empresa A, uma imagem lida por OCR e
// processada não deixa rastro em nenhum banco (da plataforma, da A ou da B), em nenhum arquivo da pasta de
// dados nem na memória do servidor multiempresa; e a política da A não muda nada na B.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subirPlataforma } from './ajuda-plataforma.js';
import { arquivo, imagem } from './arquivos.js';
import { todos } from '../src/db.js';

const MARCAS = /Maria Souza|529\.982\.247-25|Cadastro do cliente/;
const pasta = mkdtempSync(join(tmpdir(), 'greenia-tenants-'));
let S, A, B, ana, carla;

before(async () => {
  S = await subirPlataforma({ banco: join(pasta, 'plataforma.sqlite'), pastaEmpresas: join(pasta, 'empresas') });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const plano = (await ops.get('/api/plataforma/planos')).dados.planos[0].id;
  A = (await ops.post('/api/plataforma/empresas', { name: 'Acme Ltda', slug: 'acme', plan_id: plano, admin_email: 'ana@acme.com', status: 'ativa' })).dados;
  B = (await ops.post('/api/plataforma/empresas', { name: 'Beta SA', slug: 'beta', plan_id: plano, admin_email: 'carla@beta.com', status: 'ativa' })).dados;
  ana = S.navegador(); await ana.get('/acme'); assert.equal((await ana.entrarEmpresa('ana@acme.com')).status, 200);
  carla = S.navegador(); await carla.get('/beta'); assert.equal((await carla.entrarEmpresa('carla@beta.com')).status, 200);
});
after(async () => { await S.fechar(); rmSync(pasta, { recursive: true, force: true }); });

const arquivos = d => readdirSync(d).flatMap(n => statSync(join(d, n)).isDirectory() ? arquivos(join(d, n)) : [join(d, n)]);
function naMemoria(raiz) {
  const vistos = new WeakSet(), achados = [];
  const andar = (v, c, p) => {
    if (p > 8 || v == null) return;
    if (typeof v === 'string') { if (MARCAS.test(v)) achados.push(c); return; }
    if (typeof v !== 'object' || vistos.has(v) || Buffer.isBuffer(v)) return;
    vistos.add(v);
    if (v instanceof Map) { for (const [k, x] of v) andar(x, `${c}.${String(k)}`, p + 1); return; }
    if (v instanceof Set || Array.isArray(v)) { let i = 0; for (const x of v) andar(x, `${c}[${i++}]`, p + 1); return; }
    for (const k of Object.keys(v)) if (!['db', 'servidor', 'email'].includes(k)) andar(v[k], `${c}.${k}`, p + 1);
  };
  andar(raiz, 'P', 0);
  return achados;
}

test('guardar = não na empresa A: imagem por OCR processada sem rastro em nenhum banco, arquivo ou memória; a B não é afetada', async () => {
  assert.equal((await ana.put('/api/admin/config', { naoArmazenar: ['cpf'] })).status, 200);
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await ana.post(`/api/conversas/${conv.id}/mensagens`, { texto: 'Monte a ficha do cliente do anexo.', anexos: [arquivo('ficha.png', imagem('cadastro.png'))] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.match(String(r.dados), /"t":"fim"/, 'processado e respondido');
  // Nenhum banco guarda o conteúdo: plataforma, empresa A e empresa B; nem os arquivos da pasta de dados.
  for (const [nome, db] of [['plataforma', S.P.db], ['A', S.P.tenant(A.id).db], ['B', S.P.tenant(B.id).db]])
    for (const { name } of todos(db, "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'"))
      assert.doesNotMatch(JSON.stringify(todos(db, `select * from "${name}"`)), MARCAS, `${nome}.${name}`);
  for (const f of arquivos(pasta)) assert.doesNotMatch(readFileSync(f).toString('latin1'), MARCAS, f);
  assert.deepEqual(naMemoria(S.P), [], 'memória do servidor multiempresa');
  // A política de retenção é da A: a B segue com a própria configuração.
  assert.deepEqual((await carla.get('/api/admin/config')).dados.naoArmazenar ?? [], []);
  assert.equal((await carla.get(`/api/conversas/${conv.id}`)).status, 404);
});
