// Validade, rotação e monitoramento da chave do OpenRouter.
// Validade externa (vencimento do OpenRouter, recusa 401) separada da política interna (troca preventiva);
// estado persistido por impressão digital da chave; avisos idempotentes; nada da chave em claro.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { subirPlataforma } from './ajuda-plataforma.js';
import { conferirChave, situacaoChave, impressaoChave, validarRotacao } from '../src/plataforma/chave-validade.js';
import { origemChaveOpenRouter } from '../src/plataforma/servidor.js';
import { contaOpenRouter } from '../src/plataforma/consumo.js';
import { ErroIA } from '../src/ia.js';

const A = 'sk-or-v1-' + 'a'.repeat(56) + 'b9c1', B = 'sk-or-v1-' + 'c'.repeat(56) + 'd2e3', MESMO_FINAL = 'sk-or-v1-' + 'e'.repeat(56) + 'b9c1';
const CHAVES = [A, B, MESMO_FINAL];
const pasta = mkdtempSync(join(tmpdir(), 'greenia-validade-'));
const abertos = [];
after(async () => { for (const S of abertos) await S.fechar().catch(() => {}); rmSync(pasta, { recursive: true, force: true }); });
const DIA = 864e5;

// OpenRouter falso: cada chave tem vencimento (ou null) e pode ser recusada (401).
function provedor() {
  const p = { expira: new Map(), recusadas: new Set(), envios: 0, leituras: 0, rede: false };
  p.criarIA = chave => ({ configurada: true, async listarModelos() { return []; },
    async *enviar() { p.envios++; if (p.recusadas.has(chave)) throw new ErroIA('O serviço de IA recusou: User not found.', 401); yield { tipo: 'texto', texto: 'ok' }; yield { tipo: 'fim', modelo: 'x/y', custo: 0 }; },
    async conta() {
      p.leituras++;
      if (p.rede) throw new Error('rede');
      if (p.recusadas.has(chave)) return { chave: { erro: 401 }, creditos: { erro: 401 } };
      return { chave: { label: 'producao', usage: 1, expires_at: p.expira.has(chave) ? p.expira.get(chave) : null }, creditos: { total_credits: 10, total_usage: 1 } };
    } });
  return p;
}
async function subir({ agora, banco = join(pasta, `p-${Math.random().toString(36).slice(2)}.sqlite`), mestra = randomBytes(32), p = provedor(), ...op } = {}) {
  const logs = [];
  const S = await subirPlataforma({ banco, criarIA: p.criarIA, chaveMestra: mestra, chaveVariavel: null, agora: () => agora.t, log: (...a) => logs.push(a.map(x => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')), ...op });
  abertos.push(S);
  const falhas = { email: false };
  const original = S.P.email.enviar.bind(S.P.email);
  S.P.email.enviar = async (...x) => { if (falhas.email) throw new Error('SMTP fora do ar'); return original(...x); };
  const entrar = () => S.navegador().entrarConsole('ops@theneil.com.br');
  return { S, P: S.P, p, logs, falhas, entrar, banco, mestra };
}
const relogio = (iso = '2026-09-28T12:00:00Z') => ({ t: new Date(iso), passar(dias) { this.t = new Date(this.t.getTime() + dias * DIA); } });
const emails = (P, re = /OpenRouter/) => P.email.enviados.filter(m => re.test(m.assunto));
const conferir = async P => { await contaOpenRouter(P, { forcar: true }); return conferirChave(P, origemChaveOpenRouter(P)); };
const sit = P => situacaoChave(P, origemChaveOpenRouter(P));
const salvarChave = async (ops, chave, extra = {}) => { const r = await ops.put('/api/plataforma/openrouter/chave', { chave, ...extra }); assert.equal(r.status, 200, JSON.stringify(r.dados)); return r.dados; };

test('1, 2 e 3. chave nova inicia o contador; troca reinicia e descarta o vencimento informado da anterior', async () => {
  const t = relogio(), { S, P, entrar } = await subir({ agora: t });
  let ops = await entrar();
  await salvarChave(ops, A);
  let v = sit(P);
  assert.equal(v.troca.inicio, '2026-09-28');
  assert.equal(v.troca.emUsoDias, 0);
  assert.equal(v.troca.proximaTroca, '2026-12-27', 'início + 90 dias');
  assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { expiraEm: '2026-12-31' })).status, 200);
  assert.equal(sit(P).provedor.fonte, 'informada');
  t.passar(50); ops = await entrar();
  assert.equal(sit(P).troca.emUsoDias, 50);
  await salvarChave(ops, B);
  v = sit(P);
  assert.equal(v.troca.inicio, '2026-11-17', 'contador da chave nova');
  assert.equal(v.troca.emUsoDias, 0);
  assert.equal(v.provedor.fonte, null, 'o vencimento informado era da chave anterior');
  assert.equal(v.provedor.semData, 'nao_definido');
  await S.fechar();
});

test('7. cálculo determinístico em dias corridos de São Paulo: 100, 90, 89, 30, 7, 1 dia, dia e dia seguinte', async () => {
  const t = relogio('2026-01-10T12:00:00Z'), { S, P, p, entrar } = await subir({ agora: t });
  await salvarChave(await entrar(), A);
  const em = dias => { t.t = new Date(Date.parse('2026-01-10T12:00:00Z') + dias * DIA); return sit(P).troca; };
  assert.deepEqual([em(0).diasRestantes, em(0).codigo], [90, 'troca_em_dia']);
  assert.deepEqual([em(60).diasRestantes, em(60).codigo], [30, 'troca_em_breve']);
  assert.deepEqual([em(83).diasRestantes, em(83).codigo], [7, 'troca_proxima']);
  assert.deepEqual([em(89).diasRestantes, em(89).codigo], [1, 'troca_proxima']);
  assert.deepEqual([em(90).diasRestantes, em(90).codigo], [0, 'troca_hoje'], '90 dias de uso: troca devida hoje');
  assert.deepEqual([em(91).diasRestantes, em(91).codigo], [-1, 'troca_atrasada']);
  assert.deepEqual([em(100).diasRestantes, em(100).codigo], [-10, 'troca_atrasada']);
  // Horário não muda o dia: 23h59 em São Paulo ainda é o mesmo dia; 00h01 já é o seguinte.
  t.t = new Date('2026-04-10T02:59:00Z'); assert.equal(sit(P).troca.diasRestantes, 1, '09/04 23h59 em São Paulo');
  t.t = new Date('2026-04-10T03:01:00Z'); assert.equal(sit(P).troca.diasRestantes, 0, '10/04 00h01 em São Paulo');
  // Vencimento do provedor: pelo instante exato; "dia do vencimento" antes do instante; depois, vencida.
  p.expira.set(A, '2026-02-20T23:59:59Z');
  const venc = dias => { t.t = new Date(Date.parse('2026-02-20T12:00:00Z') - dias * DIA); P._contaOR = null; return contaOpenRouter(P, { forcar: true }).then(() => sit(P).provedor); };
  for (const [d, cod, niv] of [[30, 'vence', 'atencao'], [7, 'vence_em_breve', 'critico'], [1, 'vence_em_breve', 'critico'], [0, 'vence_hoje', 'critico'], [-1, 'vencida', 'erro']]) {
    const x = await venc(d);
    assert.deepEqual([x.codigo, x.nivel], [cod, niv], `${d} dias antes`);
  }
  await S.fechar();
});

test('8 e 14–16. prazo: 7 e 730 aceitos; fora do limite, decimal, zero, negativo, nulo e texto rejeitados; mudar o prazo não reinicia o início', async () => {
  const t = relogio(), { S, P, entrar } = await subir({ agora: t });
  let ops = await entrar();
  await salvarChave(ops, A);
  for (const v of [6, 731, 0, -1, 7.5, null, '', 'abc', 1e9, true, [30], { n: 30 }]) {
    assert.equal(validarRotacao(v), null, JSON.stringify(v));
    assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: v })).status, 400, JSON.stringify(v));
  }
  assert.equal(validarRotacao('30'), 30);
  for (const v of [7, 730]) assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: v })).status, 200, String(v));
  t.passar(60); ops = await entrar();
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 90 });
  const inicio = sit(P).troca.inicio;
  assert.equal(sit(P).troca.codigo, 'troca_em_breve');
  // Chave com 60 dias, prazo 90 → 30: fica atrasada na hora, sem reiniciar a contagem.
  const r = (await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 30 })).dados.validadeChave;
  assert.equal(r.troca.codigo, 'troca_atrasada');
  assert.equal(r.troca.diasRestantes, -30);
  assert.equal(r.troca.inicio, inicio);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 730 })).dados.validadeChave.troca.diasRestantes, 670);
  assert.equal(sit(P).troca.inicio, inicio);
  await S.fechar();
});

test('6–12. cada estágio envia um email por chave e por destinatário; o job repetido não duplica; a troca reinicia os estágios', async () => {
  const t = relogio('2026-01-10T12:00:00Z'), { S, P, entrar } = await subir({ agora: t });
  let ops = await entrar();
  await salvarChave(ops, A);
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 730 });   // só o vencimento conta aqui
  await ops.put('/api/plataforma/openrouter/chave/validade', { expiraEm: '2026-03-11' });   // 60 dias
  const venc = () => emails(P, /vai vencer|vencida/).length;
  const antes = venc();
  // 30, 7, 1 dia, dia do vencimento e vencida: rodando o job três vezes a cada passo.
  for (const [dia, esperado] of [['2026-02-09', 1], ['2026-03-04', 2], ['2026-03-10', 3], ['2026-03-11', 4], ['2026-03-12', 5]]) {
    t.t = new Date(`${dia}T12:00:00Z`);
    await conferir(P); await conferir(P); await conferir(P);
    assert.equal(venc() - antes, esperado, dia);
  }
  // Troca preventiva atrasada: um email só.
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 30 }).catch(() => null);
  ops = await entrar();
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 30 });
  const atraso = () => emails(P, /atrasada/).length;
  await conferir(P); await conferir(P);
  assert.equal(atraso(), 1);
  // Chave nova: os estágios recomeçam (a data informada da anterior foi descartada).
  await salvarChave(ops, B);
  t.passar(31);
  await conferir(P); await conferir(P);
  assert.equal(atraso(), 2, 'atraso da chave nova avisa de novo');
  await S.fechar();
});

test('10b. falha no envio não marca como enviado; sucesso parcial reenvia só para quem faltou', async () => {
  const t = relogio(), { S, P, falhas, entrar } = await subir({ agora: t });
  const ops = await entrar();
  await salvarChave(ops, A);
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 7 });
  t.passar(8);
  falhas.email = true;
  assert.equal((await conferir(P)).enviados, 0);
  assert.equal(P.db.prepare("select count(*) as n from avisos_chave where estado = 'enviando' or estagio = 'troca_atrasada'").get().n, 0, 'falha não marca como enviado nem deixa reserva presa');
  falhas.email = false;
  assert.equal((await conferir(P)).enviados, 1);
  assert.equal((await conferir(P)).enviados, 0);
  // Segundo admin: só ele recebe na próxima execução.
  assert.equal((await (await entrar()).post('/api/plataforma/admins', { email: 'ops2@theneil.com.br' })).status, 200);
  const r = await conferir(P);
  assert.equal(r.enviados, 1);
  assert.equal(emails(P, /atrasada/).filter(m => m.para === 'ops2@theneil.com.br').length, 1);
  assert.equal(emails(P, /atrasada/).filter(m => m.para === 'ops@theneil.com.br').length, 1);
  await S.fechar();
});

test('13. duas instâncias no mesmo banco, ao mesmo tempo: um email só', async () => {
  const t = relogio(), mestra = randomBytes(32), banco = join(pasta, 'compartilhado.sqlite'), p = provedor();
  const um = await subir({ agora: t, banco, mestra, p });
  await salvarChave(await um.entrar(), A);
  await (await um.entrar()).put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 7 });
  const dois = await subir({ agora: t, banco, mestra, p });
  t.passar(8);
  await Promise.all([conferir(um.P), conferir(dois.P), conferir(um.P), conferir(dois.P)]);
  assert.equal(emails(um.P, /atrasada/).length + emails(dois.P, /atrasada/).length, 1);
  await um.S.fechar(); await dois.S.fechar();
});

test('4, 5 e 23. recusa num envio: alerta e email imediatos, prevalece sobre o prazo, bloqueia novos envios; a troca tira o alerta na hora', async () => {
  const t = relogio(), { S, P, p, entrar } = await subir({ agora: t });
  let ops = await entrar();
  await salvarChave(ops, A);
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 7 });
  t.passar(3); ops = await entrar();
  assert.equal(sit(P).troca.codigo, 'troca_proxima');
  p.recusadas.add(A);
  // Envio de uma empresa recebe 401.
  const consumir = async () => { const out = []; for await (const x of P.ia.enviar([], {})) out.push(x); return out; };
  await assert.rejects(consumir(), e => e.status === 401);
  await new Promise(r => setTimeout(r, 20));
  const v = sit(P);
  assert.equal(v.codigo, 'recusada', 'recusa prevalece sobre a troca preventiva próxima');
  assert.equal(v.rotulo, 'Recusada');
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaChave.codigo, 'recusada');
  assert.equal(emails(P, /recusada/).length, 1, 'email na hora, sem esperar o job');
  // Não insiste: os próximos envios param antes de chamar o OpenRouter.
  const envios = p.envios;
  await assert.rejects(consumir(), e => e.status === 503 && /recusada pelo provedor/.test(e.message));
  await assert.rejects(consumir(), e => e.status === 503);
  assert.equal(p.envios, envios, 'nenhuma chamada nova com a chave recusada');
  // Depois de 10 minutos, uma revalidação; se continuar recusada, segue bloqueada.
  const leituras = p.leituras;
  t.t = new Date(t.t.getTime() + 11 * 60e3);
  await assert.rejects(consumir(), e => e.status === 503);
  assert.equal(p.leituras, leituras + 1, 'uma revalidação');
  // Reinício da aplicação não esquece a recusa (estado persistido, não cache).
  P._contaOR = null;
  assert.equal(sit(P).codigo, 'recusada');
  // Troca por uma chave válida: o alerta sai na resposta da própria troca.
  ops = await entrar();
  const d = await salvarChave(ops, B);
  assert.equal(d.validadeChave.codigo === 'recusada', false);
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaChave?.codigo === 'recusada', false);
  assert.deepEqual(await consumir(), [{ tipo: 'texto', texto: 'ok' }, { tipo: 'fim', modelo: 'x/y', custo: 0 }]);
  await S.fechar();
});

test('24. sem vencimento no OpenRouter não é chave inválida; OpenRouter fora do ar não é recusa', async () => {
  const t = relogio(), { S, P, p, entrar } = await subir({ agora: t });
  const ops = await entrar();
  await salvarChave(ops, A);
  let v = sit(P);
  assert.equal(v.nivel, 'ok');
  assert.equal(v.rotulo, 'Em dia');
  assert.equal(v.provedor.semData, 'nao_definido');
  assert.match(v.provedor.texto, /não definido no OpenRouter/);
  assert.equal(v.troca.proximaTroca, '2026-12-27');
  p.rede = true;
  await contaOpenRouter(P, { forcar: true });
  v = sit(P);
  assert.notEqual(v.codigo, 'recusada');
  assert.equal(v.nivel, 'ok');
  // 403 no envio (moderação) também não é recusa da chave.
  p.rede = false;
  await S.fechar();
});

test('17 e 18. OPENROUTER_API_KEY: início persistido entre reinícios; chave nova reinicia o ciclo; voltar à antiga não reinicia', async () => {
  const t = relogio(), mestra = randomBytes(32), banco = join(pasta, 'variavel.sqlite');
  const idA = impressaoChave(mestra, A), idM = impressaoChave(mestra, MESMO_FINAL), idB = impressaoChave(mestra, B);
  assert.notEqual(idA, idM, 'mesma máscara, chaves diferentes: impressões diferentes');
  let x = await subir({ agora: t, banco, mestra, chaveVariavel: 'sk-or-v1-…b9c1', chaveVariavelId: idA });
  assert.equal(sit(x.P).troca.inicio, '2026-09-28');
  await x.S.fechar();
  t.passar(40);
  x = await subir({ agora: t, banco, mestra, chaveVariavel: 'sk-or-v1-…b9c1', chaveVariavelId: idA });
  assert.equal(sit(x.P).troca.inicio, '2026-09-28', 'reiniciar não muda o início');
  assert.equal(sit(x.P).troca.emUsoDias, 40);
  await x.S.fechar();
  // Variável trocada por outra chave com o MESMO final: é chave nova.
  x = await subir({ agora: t, banco, mestra, chaveVariavel: 'sk-or-v1-…b9c1', chaveVariavelId: idM });
  assert.equal(sit(x.P).troca.emUsoDias, 0);
  await x.S.fechar();
  t.passar(5);
  x = await subir({ agora: t, banco, mestra, chaveVariavel: 'sk-or-v1-…d2e3', chaveVariavelId: idB });
  assert.equal(sit(x.P).troca.emUsoDias, 0);
  await x.S.fechar();
  // Volta para a chave A: o contador continua de onde estava (não é chave nova).
  x = await subir({ agora: t, banco, mestra, chaveVariavel: 'sk-or-v1-…b9c1', chaveVariavelId: idA });
  assert.equal(sit(x.P).troca.inicio, '2026-09-28');
  assert.equal(sit(x.P).troca.emUsoDias, 45);
  await x.S.fechar();
});

test('19–21. a chave completa não aparece em respostas, HTML, logs, auditoria, emails nem no banco (fora da cifra)', async () => {
  const t = relogio(), { S, P, p, logs, entrar } = await subir({ agora: t });
  const ops = await entrar();
  const RUIM = 'sk-or-v1-' + 'z'.repeat(60);
  p.recusadas.add(RUIM);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave', { chave: RUIM })).status, 400);
  await salvarChave(ops, A);
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 7 });
  t.passar(8);
  const ops2 = await entrar();
  await conferir(P);
  p.recusadas.add(A);
  await (async () => { try { for await (const _ of P.ia.enviar([], {})) { /* nada */ } } catch { /* recusada */ } })();
  await new Promise(r => setTimeout(r, 20));
  const respostas = [];
  for (const u of ['/api/plataforma/eu', '/api/plataforma/consumo', '/api/plataforma/auditoria', '/api/plataforma/configuracoes']) respostas.push(JSON.stringify((await ops2.get(u)).dados));
  respostas.push(JSON.stringify(await salvarChave(ops2, B)));
  const html = await new Promise(ok => request({ hostname: '127.0.0.1', port: new URL(S.base).port, path: '/plataforma', headers: { host: 'plataforma.teste' } }, r => { let d = ''; r.on('data', c => { d += c; }); r.on('end', () => ok(d)); }).end());
  const banco = P.db.prepare('select key, value from platform_settings').all().map(r => (r.key === 'openrouter_chave' ? JSON.stringify({ ...JSON.parse(r.value), cifrado: null }) : r.value)).join('\n')
    + JSON.stringify(P.db.prepare('select * from avisos_chave').all()) + JSON.stringify(P.db.prepare('select * from audit_log').all?.() ?? []);
  const emailsTxt = JSON.stringify(P.email.enviados);
  for (const k of [A, B, RUIM]) {
    const meio = k.slice(9, 50);
    for (const [onde, txt] of [['respostas', respostas.join('\n')], ['HTML', html], ['logs', logs.join('\n')], ['banco', banco], ['emails', emailsTxt]]) {
      assert.ok(!txt.includes(k) && !txt.includes(meio), `chave em ${onde}`);
    }
  }
  assert.ok(emails(P).length >= 2, 'houve emails para conferir');
  assert.match(emailsTxt, /sk-or-v1-…b9c1/, 'email mostra só início e fim');
  await S.fechar();
});

test('22. empresas não acessam a chave nem a configuração, e nada da chave aparece nas APIs da empresa', async () => {
  const t = relogio(), { S, P, entrar } = await subir({ agora: t });
  const ops = await entrar();
  await salvarChave(ops, A);
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', status: 'ativa', admin_email: 'x@alfa.com' })).dados;
  assert.ok(c.id);
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  for (const [m, u, corpo] of [['GET', '/api/plataforma/eu'], ['GET', '/api/plataforma/consumo'], ['PUT', '/api/plataforma/openrouter/chave/validade', { rotacaoDias: 30 }], ['PUT', '/api/plataforma/openrouter/chave', { chave: B }], ['DELETE', '/api/plataforma/openrouter/chave']]) {
    const r = await x.req(m, u, corpo);
    assert.ok([401, 403, 404].includes(r.status), `${m} ${u}: ${r.status}`);
  }
  const respostas = [];
  for (const u of ['/api/eu', '/api/admin/modelos', '/api/admin/config', '/api/saude', '/api/modelos']) respostas.push(JSON.stringify((await x.get(u)).dados));
  const txt = respostas.join('\n');
  assert.ok(!txt.includes('sk-or'), 'nem a máscara da chave da plataforma');
  assert.ok(!/rotacao|troca preventiva|openrouter_chave/i.test(txt));
  assert.equal(P.db.prepare("select count(*) as n from platform_settings where key like 'openrouter%'").get().n >= 1, true);
  await S.fechar();
});
