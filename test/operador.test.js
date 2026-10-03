// Console do operador: cada cliente é uma instalação; a do operador junta todas por token.
// O cliente nunca vê o console nem valores em dólar; token errado é recusado e bloqueado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { lerInstancias } from '../src/operador.js';
import { um } from '../src/db.js';

const TOKEN = 'token-de-teste-com-mais-de-24-caracteres';
let C, O, adminC, op;
before(async () => {
  C = await subir({ plano: { creditos: 10000, reserva: 2000, precoUsd: 750 }, operacao: { token: TOKEN, custoInfraUsd: 7, pacote: { creditos: 10000, precoUsd: 250 } } });
  exec(C, "insert into uso (em, pessoa_id, conversa_id, custo) values (?, 1, 1, 12.5)", new Date().toISOString());
  O = await subir({ adminEmail: 'suporte@operadora.com', operadores: ['suporte@operadora.com'], operacao: { instancias: lerInstancias(`Cliente A|${C.base}|${TOKEN};Cliente fora|http://127.0.0.1:9|x`) } });
  adminC = await C.cliente().entrar('admin@exemplo.com.br');
  op = await O.cliente().entrar('suporte@operadora.com');
});
after(async () => { await C.fechar(); await O.fechar(); });
function exec(S, sql, ...p) { S.app.db.prepare(sql).run(...p); }

test('INSTANCIAS: nome, url e token por linha ou ponto e vírgula', () => {
  assert.deepEqual(lerInstancias('A|https://a.com/|t1\nB|https://b.com|t2;ruim|ftp://x|t'), [{ nome: 'A', url: 'https://a.com', token: 't1' }, { nome: 'B', url: 'https://b.com', token: 't2' }]);
});

test('rota de token: sem token, token errado e bloqueio após tentativas', async () => {
  assert.equal((await fetch(`${C.base}/api/operador/instancia`)).status, 401);
  const r = await fetch(`${C.base}/api/operador/instancia`, { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.financeiro.custoIa, 12.5);   // em dólar, mesmo com plano
  assert.equal(d.financeiro.receita, 750);
  // Instalação sem token configurado não expõe a rota.
  assert.equal((await fetch(`${O.base}/api/operador/instancia`, { headers: { authorization: 'Bearer qualquer' } })).status, 404);
  for (let i = 0; i < 10; i++) await fetch(`${C.base}/api/operador/instancia`, { headers: { authorization: 'Bearer errado', 'x-forwarded-for': '10.0.0.9' } });
  assert.equal((await fetch(`${C.base}/api/operador/instancia`, { headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '10.0.0.9' } })).status, 429);
});

test('cliente não acessa o console nem com sessão de admin', async () => {
  assert.equal((await adminC.get('/api/operador/instancias')).status, 403);
  assert.equal((await adminC.post('/api/operador/instancias/local/pacotes', { creditos: 10 })).status, 403);
});

test('console junta as instalações e mostra quem não responde', async () => {
  const { instancias } = (await op.get('/api/operador/instancias')).dados;
  assert.equal(instancias.length, 2);
  const a = instancias.find(i => i.nome === 'Cliente A');
  assert.equal(a.ok, true);
  assert.equal(a.resumo.plano.creditos, 10000);
  assert.ok(Math.abs(a.resumo.financeiro.margem - (750 - 12.5 * 1.055 - 7)) < 0.01);
  assert.equal(instancias.find(i => i.nome === 'Cliente fora').ok, false);
});

test('pacote liberado pelo console chega à instalação do cliente, com operador e validade', async () => {
  const r = await op.post('/api/operador/instancias/0/pacotes', { creditos: 10000, validade: '2099-12-31', observacao: 'Pedido 42' });
  assert.equal(r.status, 200);
  assert.equal(r.dados.resumo.financeiro.receitaPacotes, 250);
  const p = um(C.app.db, 'select * from pacotes order by id desc limit 1');
  assert.deepEqual([p.creditos, p.origem, p.operador, p.validade, p.observacao], [10000, 'console', 'suporte@operadora.com', '2099-12-31', 'Pedido 42']);
  assert.ok(C.app.email.enviados.some(m => m.para === 'admin@exemplo.com.br' && /pacote adicional/.test(m.assunto)));
  // O admin do cliente vê o pacote em créditos, sem dólar.
  const uso = (await adminC.get('/api/admin/uso')).dados;
  assert.equal(uso.pacotes[0].creditos, 10000);
  assert.ok(!JSON.stringify(uso).includes('US$'));
  assert.equal(uso.totais.custo, 1250);   // 12,5 dólares = 1.250 créditos
  assert.equal(uso.tendencia.at(-1).custo, 1250);
  assert.equal(uso.porClasse[0].classe, 'outro');
  assert.equal(uso.porQuickWin[0].execucoes, 1);
});

test('troca do modelo por trás de uma classe avisa os admins, sem tom de erro', async () => {
  const r = await adminC.put('/api/admin/modelos-config', { padroes: { equilibrado: 'google/gemini-3.5-flash-lite' } });
  assert.equal(r.status, 200);
  const mail = C.app.email.enviados.find(m => m.para === 'admin@exemplo.com.br' && /modelo de uma classe atualizado/.test(m.assunto));
  assert.ok(mail);
  assert.match(mail.texto, /Classe Equilibrado: agora atendida por/);
  assert.match(mail.texto, /Nada muda na forma de usar/);
});
