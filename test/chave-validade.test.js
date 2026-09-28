// Validade e rotação da chave do OpenRouter: vencimento informado pelo OpenRouter ou pelo admin,
// rotação por idade, aviso no topo do console e no card, e um email por estágio aos admins da plataforma.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { subirPlataforma } from './ajuda-plataforma.js';
import { conferirChave, situacaoChave } from '../src/plataforma/chave-validade.js';
import { origemChaveOpenRouter } from '../src/plataforma/servidor.js';
import { contaOpenRouter } from '../src/plataforma/consumo.js';

const BOA = 'sk-or-v1-' + 'a'.repeat(56) + 'b9c1', OUTRA = 'sk-or-v1-' + 'c'.repeat(56) + 'd2e3';
let agora = new Date('2026-09-28T12:00:00Z');
const estado = { expira: null, recusar: false };
const criarIA = chave => ({ configurada: true, async listarModelos() { return []; }, async *enviar() {},
  async conta() {
    if (estado.recusar) return { chave: { erro: 401 }, creditos: { erro: 401 } };
    return { chave: { label: chave === BOA ? 'producao' : 'nova', usage: 1, ...(estado.expira ? { expires_at: estado.expira } : {}) }, creditos: { total_credits: 10, total_usage: 1 } };
  } });
let S, ops;
after(async () => { await S?.fechar(); });
// Avançar o relógio também vence a sessão do console: entra de novo.
const avancar = async dias => { agora = new Date(agora.getTime() + dias * 864e5); S.P._contaOR = null; ops = await S.navegador().entrarConsole('ops@theneil.com.br'); };
const conferir = async () => { const cfg = origemChaveOpenRouter(S.P); return conferirChave(S.P, cfg, await contaOpenRouter(S.P, { forcar: true })); };
const emailsChave = () => S.P.email.enviados.filter(m => /chave do OpenRouter/i.test(m.assunto));

test('sem vencimento: rotação por idade (padrão 90 dias), aviso no topo do console e email uma vez', async () => {
  S = await subirPlataforma({ criarIA, chaveMestra: randomBytes(32), chaveVariavel: null, agora: () => agora });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  assert.equal((await ops.put('/api/plataforma/openrouter/chave', { chave: BOA })).status, 200);
  let v = (await ops.get('/api/plataforma/consumo')).dados.validadeChave;
  assert.equal(v.nivel, 'ok');
  assert.equal(v.rotacaoDias, 90);
  assert.equal(v.expiraEm, null);
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaChave, null, 'em dia: sem aviso no topo');
  await avancar(80);
  v = (await ops.get('/api/plataforma/consumo')).dados.validadeChave;
  assert.equal(v.codigo, 'rotacao_proxima');
  await avancar(11);
  v = (await ops.get('/api/plataforma/consumo')).dados.validadeChave;
  assert.equal(v.codigo, 'rotacao_atrasada');
  assert.match(v.texto, /há 91 dias/);
  const eu = (await ops.get('/api/plataforma/eu')).dados;
  assert.equal(eu.alertaChave.codigo, 'rotacao_atrasada', 'aviso no topo do console');
  const antes = emailsChave().length;
  await conferir(); await conferir();
  assert.equal(emailsChave().length, antes + 1, 'um email por estágio, não um por hora');
  assert.match(emailsChave().at(-1).assunto, /trocar a chave/);
  assert.ok(!emailsChave().at(-1).texto.includes(BOA), 'o email mostra só a máscara');
  assert.match(emailsChave().at(-1).texto, /sk-or-v1-…b9c1/);
});

test('vencimento informado pelo admin: 30, 7, 1 dia e vencida, cada estágio com um email; trocar a chave zera tudo', async () => {
  // Rotação longa, para que só o vencimento conte.
  assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 7 })).status, 200);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 3 })).status, 400);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave/validade', { expiraEm: '31/12/2026' })).status, 400);
  assert.equal((await ops.put('/api/plataforma/openrouter/chave', { chave: OUTRA })).status, 200);   // chave nova: idade zero
  await ops.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 730 });
  const vence = new Date(agora.getTime() + 40 * 864e5).toISOString().slice(0, 10);
  let r = await ops.put('/api/plataforma/openrouter/chave/validade', { expiraEm: vence });
  assert.equal(r.status, 200);
  assert.equal(r.dados.validadeChave.fonteVencimento, 'informada');
  assert.equal(r.dados.validadeChave.nivel, 'ok');
  const base = emailsChave().length;
  const passos = [[11, 'vence', 'atencao'], [23, 'vence_em_breve', 'critico'], [6, 'vence_em_breve', 'critico'], [2, 'vencida', 'erro']];   // ~30, ~7, ~1 dia e vencida (a data vale até o fim do dia)
  for (const [dias, codigo, nivel] of passos) {
    await avancar(dias);
    const s = await conferir();
    assert.equal(s.codigo, codigo, `${dias} dias depois`);
    assert.equal(s.nivel, nivel);
    await conferir();
  }
  assert.equal(emailsChave().length, base + 4, '30 dias, 7 dias, 1 dia e vencida: 4 emails');
  assert.match(emailsChave().at(-1).assunto, /a IA parou/);
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaChave.nivel, 'erro');
  // Chave nova: a data informada era da chave antiga e deixa de valer; os estágios recomeçam.
  assert.equal((await ops.put('/api/plataforma/openrouter/chave', { chave: BOA })).status, 200);
  const v = (await ops.get('/api/plataforma/consumo')).dados.validadeChave;
  assert.equal(v.expiraEm, null);
  assert.equal(v.nivel, 'ok');
  assert.equal(v.idadeDias, 0);
});

test('vencimento informado pelo OpenRouter tem prioridade; chave recusada vira alerta de erro', async () => {
  estado.expira = new Date(agora.getTime() + 5 * 864e5).toISOString();
  S.P._contaOR = null;
  let v = (await ops.get('/api/plataforma/consumo?forcar=1')).dados.validadeChave;
  assert.equal(v.fonteVencimento, 'openrouter');
  assert.equal(v.codigo, 'vence_em_breve');
  assert.equal(v.diasParaVencer, 5);
  estado.recusar = true;
  S.P._contaOR = null;
  v = (await ops.get('/api/plataforma/consumo?forcar=1')).dados.validadeChave;
  assert.equal(v.codigo, 'recusada');
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaChave.codigo, 'recusada');
  estado.recusar = false; estado.expira = null;
});

test('chave da variável de ambiente: idade contada de quando a plataforma a viu; empresa não vê o alerta', async () => {
  await S.fechar();
  agora = new Date('2026-09-28T12:00:00Z');
  S = await subirPlataforma({ criarIA, chaveMestra: randomBytes(32), chaveVariavel: 'sk-or-v1-…0000', agora: () => agora });
  const cfg = origemChaveOpenRouter(S.P);
  assert.equal(situacaoChave(S.P, cfg).idadeDias, 0);
  agora = new Date(agora.getTime() + 95 * 864e5);
  assert.equal(situacaoChave(S.P, cfg).codigo, 'rotacao_atrasada');
  // Empresa não tem acesso à chave nem ao aviso.
  const o = await S.navegador().entrarConsole('ops@theneil.com.br');
  const c = (await o.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', status: 'ativa', admin_email: 'x@alfa.com' })).dados;
  assert.ok(c.id);
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  assert.notEqual((await x.put('/api/plataforma/openrouter/chave/validade', { rotacaoDias: 30 })).status, 200);
});
