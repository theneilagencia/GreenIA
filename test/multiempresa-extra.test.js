// Multiempresa, parte 2: domínio próprio (DNS e provedor), exportação e exclusão definitiva,
// e limite de respostas simultâneas por empresa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { subirPlataforma } from './ajuda-plataforma.js';
import { criarProvedorRender } from '../src/plataforma/dominio.js';

// DNS falso: o domínio da empresa aponta (ou não) para a plataforma.
const registros = { cname: { 'ia.cliente.com.br': ['plataforma.teste'] }, a: { 'plataforma.teste': ['10.0.0.1'], 'app.outra.com.br': ['10.9.9.9'] } };
const dns = {
  resolveCname: async d => { if (registros.cname[d]) return registros.cname[d]; throw Object.assign(new Error('ENODATA'), { code: 'ENODATA' }); },
  resolve4: async d => { if (registros.a[d]) return registros.a[d]; throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); },
};
const chamadasProvedor = [];
const provedorDominios = { nome: 'teste', alvos: [], adicionar: async d => chamadasProvedor.push(['adicionar', d]), remover: async d => chamadasProvedor.push(['remover', d]), verificar: async d => chamadasProvedor.push(['verificar', d]) };

// IA lenta, para segurar respostas abertas e testar o limite de simultâneas.
let liberar;
const portao = () => new Promise(r => { liberar = r; });
let espera = null;
const ia = {
  async listarModelos() { return []; },
  async *enviar(m, op) { if (espera) await espera; yield { tipo: 'texto', texto: 'ok' }; yield { tipo: 'fim', modelo: op.modelo, fornecedor: 'teste', custo: 0.001, economia: 0 }; },
};

let S, ops, planos, pasta;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'gia-plat-'));
  S = await subirPlataforma({ dns, provedorDominios, ia, banco: join(pasta, 'plataforma.sqlite') });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  planos = (await ops.get('/api/plataforma/planos')).dados.planos;
});
after(() => S.fechar());

test('domínio próprio: provedor recebe o cadastro, DNS certo vira verificado, errado fica pendente com orientação', async () => {
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Cliente', slug: 'cliente', plan_id: planos[1].id, status: 'ativa' })).dados;
  assert.equal((await ops.put(`/api/plataforma/empresas/${c.id}/url`, { custom_domain: 'ia.cliente.com.br' })).status, 200);
  await S.P.pendenteDominio;
  assert.deepEqual(chamadasProvedor.slice(0, 2), [['adicionar', 'ia.cliente.com.br'], ['verificar', 'ia.cliente.com.br']]);
  let d = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.empresa;
  assert.equal(d.domain_status, 'verificado');
  // Troca para um domínio que aponta para outro lugar: o antigo sai do provedor e o novo fica pendente.
  await ops.put(`/api/plataforma/empresas/${c.id}/url`, { custom_domain: 'app.outra.com.br' });
  await S.P.pendenteDominio;
  assert.ok(chamadasProvedor.some(x => x[0] === 'remover' && x[1] === 'ia.cliente.com.br'));
  d = (await ops.get(`/api/plataforma/empresas/${c.id}`)).dados.empresa;
  assert.equal(d.domain_status, 'pendente');
  assert.match(d.domain_message, /não para plataforma\.teste/);
  const v = await ops.post(`/api/plataforma/empresas/${c.id}/dominio/verificar`);
  assert.equal(v.dados.status, 'pendente');
  const aud = (await ops.get(`/api/plataforma/auditoria?empresa=${c.id}`)).dados.itens.map(x => x.action);
  assert.ok(aud.includes('company.domain_checked'));
  assert.ok(aud.includes('company.domain_provider_added'));
});

test('provedor Render: chamadas corretas à API, sem expor a chave em erro', async () => {
  const pedidos = [];
  const f = async (url, op) => { pedidos.push([op.method, url, op.headers.authorization, op.body]); return { ok: true, status: 201, json: async () => ({}) }; };
  const r = criarProvedorRender({ chave: 'chave-secreta', servico: 'srv-123', fetch: f });
  await r.adicionar('ia.x.com.br'); await r.verificar('ia.x.com.br'); await r.remover('ia.x.com.br');
  assert.deepEqual(pedidos.map(p => [p[0], p[1]]), [
    ['POST', 'https://api.render.com/v1/services/srv-123/custom-domains'],
    ['POST', 'https://api.render.com/v1/services/srv-123/custom-domains/ia.x.com.br/verify'],
    ['DELETE', 'https://api.render.com/v1/services/srv-123/custom-domains/ia.x.com.br']]);
  assert.equal(pedidos[0][2], 'Bearer chave-secreta');
  assert.equal(pedidos[0][3], JSON.stringify({ name: 'ia.x.com.br' }));
  const ruim = criarProvedorRender({ chave: 'chave-secreta', servico: 's', fetch: async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) });
  await assert.rejects(ruim.adicionar('a.b.com'), e => /401/.test(e.message) && !e.message.includes('chave-secreta'));
});

test('respostas simultâneas: acima do limite do plano, 429 só para aquela empresa', async () => {
  const p = (await ops.post('/api/plataforma/planos', { name: 'Uma por vez', credits: 1000, limits: { max_concurrent: 1, messages_per_minute: 100 }, features: { quick_wins: true, knowledge: true } })).dados;
  const a = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa', plan_id: p.id, admin_email: 'x@alfa.com', status: 'ativa' })).dados;
  const b = (await ops.post('/api/plataforma/empresas', { name: 'Bravo', slug: 'bravo', plan_id: p.id, admin_email: 'y@bravo.com', status: 'ativa' })).dados;
  const x = S.navegador(); await x.get('/alfa'); await x.entrarEmpresa('x@alfa.com');
  const y = S.navegador(); await y.get('/bravo'); await y.entrarEmpresa('y@bravo.com');
  const cx = (await x.post('/api/conversas', {})).dados.conversa, cx2 = (await x.post('/api/conversas', {})).dados.conversa;
  const cy = (await y.post('/api/conversas', {})).dados.conversa;
  espera = portao();
  const primeira = x.post(`/api/conversas/${cx.id}/mensagens`, { texto: 'Olá' });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(S.P.emAndamento.get(a.id), 1);
  const segunda = await x.post(`/api/conversas/${cx2.id}/mensagens`, { texto: 'Outra' });
  assert.equal(segunda.status, 429);
  assert.equal(segunda.dados.erro, 'ocupado');
  // A outra empresa não é afetada.
  const daOutra = y.post(`/api/conversas/${cy.id}/mensagens`, { texto: 'Oi' });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(S.P.emAndamento.get(b.id), 1);
  liberar(); espera = null;
  assert.equal((await primeira).status, 200);
  assert.equal((await daOutra).status, 200);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(S.P.emAndamento.get(a.id), 0);
});

test('exportar e excluir: só empresa cancelada, com confirmação; guarda cópia e apaga o banco', async () => {
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Temporária', slug: 'temporaria', plan_id: planos[0].id, admin_email: 'z@temp.com', status: 'ativa' })).dados;
  const z = S.navegador(); await z.get('/temporaria'); await z.entrarEmpresa('z@temp.com');
  await z.post('/api/conversas', {});
  const banco = S.P.db.prepare('select banco from companies where id = ?').get(c.id).banco;
  assert.ok(existsSync(banco));
  // Exportação: SQLite válido, compactado.
  const exp = await ops.post(`/api/plataforma/empresas/${c.id}/exportar`, { tipo: 'solicitacao_cliente', justificativa: 'Cópia pedida pelo cliente antes do encerramento' });
  assert.equal(exp.status, 200);
  assert.equal(exp.headers.get('content-type'), 'application/gzip');
  // Ativa não pode ser excluída; confirmação errada é recusada.
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: 'temporaria' })).status, 409);
  await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
  assert.equal((await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: 'outra' })).status, 400);
  const r = await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: 'temporaria' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.ok(existsSync(r.dados.copia));
  assert.equal(gunzipSync((await import('node:fs')).readFileSync(r.dados.copia)).subarray(0, 15).toString(), 'SQLite format 3');
  assert.ok(!existsSync(banco));
  assert.equal((await S.navegador().get('/temporaria')).status, 404);
  assert.equal((await ops.get(`/api/plataforma/empresas/${c.id}`)).status, 404);
  // A auditoria continua com o registro da exclusão; o slug fica livre.
  const aud = (await ops.get(`/api/plataforma/auditoria?empresa=${c.id}`)).dados.itens.map(x => x.action);
  assert.ok(aud.includes('company.deleted') && aud.includes('company.exported'));
  assert.equal((await ops.post('/api/plataforma/empresas', { name: 'Nova', slug: 'temporaria' })).status, 200);
  assert.ok(readdirSync(join(pasta, 'excluidas')).length >= 1);
});
