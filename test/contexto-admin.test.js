// Admin é uma permissão, não uma segunda conta. A troca "Usar GreenIA | Administração" é só de tela; quem
// decide o acesso é o servidor. Quem não é admin não chega à administração manipulando URL, parâmetros ou API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { permissaoAdmin } from '../src/servidor.js';
import { ROLES_SISTEMA } from '../src/plataforma/rbac.js';

// Todas as rotas /api/admin declaradas no código, com o método.
const SRC = new URL('../src/', import.meta.url).pathname;
const ROTAS = [];
for (const f of readdirSync(SRC).filter(f => f.endsWith('.js'))) {
  for (const m of readFileSync(SRC + f, 'utf8').matchAll(/\br\.(get|post|put|patch|del)\('(\/api\/admin[^']*)'/g))
    ROTAS.push([{ get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' }[m[1]], m[2].replace(/:\w+/g, '1')]);
}

let S, admin, ana;
before(async () => {
  S = await subir();
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(() => S.fechar());

test('as rotas administrativas foram encontradas no código', () => {
  assert.ok(ROTAS.length >= 30, `só ${ROTAS.length}`);
});

test('quem não é admin recebe 403 em toda rota administrativa, com ou sem parâmetros de "admin"', async () => {
  const chamar = { GET: (c, p) => c.get(p), POST: (c, p, b) => c.post(p, b), PUT: (c, p, b) => c.put(p, b), PATCH: (c, p, b) => c.patch?.(p, b) ?? c.put(p, b), DELETE: (c, p) => c.del(p) };
  const corpo = { admin: true, papel: 'admin', permissoes: ['company.manage'], contexto: 'admin' };
  for (const [metodo, p] of ROTAS) {
    for (const caminho of [p, `${p}?admin=1&papel=admin&contexto=admin`]) {
      const r = await chamar[metodo](ana, caminho, corpo);
      assert.equal(r.status, 403, `${metodo} ${caminho} → ${r.status}`);
    }
  }
  // A tentativa não mudou o papel de ninguém.
  assert.equal((await ana.get('/api/eu')).dados.pessoa.admin, false);
});

test('quem não é admin continua sem acesso depois de tentar; o admin segue com a mesma sessão nos dois contextos', async () => {
  assert.equal((await ana.get('/api/admin/config')).status, 403);
  // O admin usa a GreenIA como qualquer pessoa e administra sem novo login: a mesma sessão atende as duas coisas.
  const conv = await admin.post('/api/conversas', {});
  assert.equal(conv.status, 200);
  assert.equal((await admin.get('/api/admin/config')).status, 200);
  assert.equal((await admin.get('/api/conversas')).status, 200);
});

test('multiempresa: membro, leitor e gestor não têm a permissão das rotas de configuração', () => {
  for (const papel of ['member', 'viewer']) {
    const perms = ROLES_SISTEMA[papel][2];
    for (const [metodo, p] of ROTAS) assert.ok(!perms.includes(permissaoAdmin(p, metodo)), `${papel}: ${metodo} ${p}`);
  }
  const gestor = ROLES_SISTEMA.manager[2];
  for (const p of ['/api/admin/config', '/api/admin/politica', '/api/admin/modelos', '/api/admin/sigilo', '/api/admin/governanca'])
    assert.ok(!gestor.includes(permissaoAdmin(p, 'PUT')), p);
});

test('a tela não decide: quem não administra pergunta ao servidor, e cada tela aponta para uma leitura que existe', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(!administra\(\)\) return conferirNoServidor\(h\)/);
  const mapa = /const API_DA_TELA = (\{[^}]+\})/.exec(app)[1];
  const leituras = new Set(ROTAS.filter(([m]) => m === 'GET').map(([, p]) => p));
  for (const [, api] of mapa.matchAll(/:\s*'([^']+)'/g)) assert.ok(leituras.has(`/api/admin/${api}`), api);
  // Depois do login, todos começam no uso normal; a administração é escolha explícita no alternador.
  assert.match(app, /else return irPara\('#\/nova'\);/);
  assert.match(app, /Usar GreenIA/);
});
