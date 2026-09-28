// Email da plataforma (códigos do console): SMTP do console, senão o das variáveis, e o da
// instalação anterior copiado uma vez na migração para multiempresa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { criarApp } from '../src/servidor.js';
import { criarPlataforma } from '../src/plataforma/servidor.js';
import { salvarConfig, lerConfig } from '../src/config.js';
import { lerAjuste, salvarAjuste } from '../src/plataforma/db.js';

const fechar = P => { P.servidor.close(); for (const t of P.tenants.values()) t.db?.close?.(); };

test('SMTP da instalação anterior vira o da plataforma, uma vez, inclusive depois da importação', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gia-smtp-'));
  const arquivo = join(pasta, 'greenia.sqlite'), banco = join(pasta, 'plataforma.sqlite');
  const antigo = criarApp({ banco: arquivo, log: () => {}, adminEmail: 'dono@antiga.com.br' });
  salvarConfig(antigo.db, { empresa: 'Empresa Antiga', smtp: { url: 'smtps://u:s@mail.antiga.com.br:465', remetente: 'IA <ia@antiga.com.br>' } });
  antigo.db.close();
  // Primeira subida: importa e copia.
  let P = criarPlataforma({ banco, log: () => {}, cookieSeguro: false, legado: { banco: arquivo } });
  assert.equal(lerAjuste(P.db, 'smtp', {}).url, 'smtps://u:s@mail.antiga.com.br:465');
  assert.equal(P.lerSmtp().remetente, 'IA <ia@antiga.com.br>');
  // Uma empresa mudar o próprio SMTP depois não altera o da plataforma.
  const id = P.db.prepare('select id from companies').get().id;
  salvarConfig(P.tenant(id).db, { ...lerConfig(P.tenant(id).db), smtp: { url: 'smtp://outro:25', remetente: '' } });
  fechar(P);
  P = criarPlataforma({ banco, log: () => {}, cookieSeguro: false, legado: { banco: arquivo } });
  assert.equal(P.lerSmtp().url, 'smtps://u:s@mail.antiga.com.br:465');
  fechar(P);
});

test('plataforma já importada sem SMTP: a cópia acontece na subida seguinte', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gia-smtp-'));
  const arquivo = join(pasta, 'greenia.sqlite'), banco = join(pasta, 'plataforma.sqlite');
  const antigo = criarApp({ banco: arquivo, log: () => {}, adminEmail: 'dono@antiga.com.br' });
  salvarConfig(antigo.db, { empresa: 'Empresa Antiga', smtp: { url: 'smtp://mail.antiga:587', remetente: '' } });
  antigo.db.close();
  let P = criarPlataforma({ banco, log: () => {}, cookieSeguro: false, legado: { banco: arquivo } });
  // Simula a versão anterior, que importava sem copiar o SMTP.
  salvarAjuste(P.db, 'smtp', { url: '', remetente: '' }); P.db.prepare("delete from platform_settings where key = 'smtp_legado_copiado'").run();
  fechar(P);
  P = criarPlataforma({ banco, log: () => {}, cookieSeguro: false, legado: { banco: arquivo } });
  assert.equal(P.lerSmtp().url, 'smtp://mail.antiga:587');
  fechar(P);
});

test('variáveis do servidor têm prioridade; sem elas, vale o SMTP do console', () => {
  const P = criarPlataforma({ log: () => {}, cookieSeguro: false, smtpPadrao: { url: 'smtp://var:25', remetente: 'Var <v@x.com>' } });
  salvarAjuste(P.db, 'smtp', { url: 'smtp://console:25', remetente: '' });
  assert.equal(P.lerSmtp().url, 'smtp://var:25');
  fechar(P);
  const Q = criarPlataforma({ log: () => {}, cookieSeguro: false });
  salvarAjuste(Q.db, 'smtp', { url: 'smtp://console:25', remetente: '' });
  assert.equal(Q.lerSmtp().url, 'smtp://console:25');
  fechar(Q);
});

test('produção sem SMTP: o console avisa que o email não está configurado, em vez de dizer que enviou', async () => {
  const { subirPlataforma } = await import('./ajuda-plataforma.js');
  const S = await subirPlataforma({ avisarSemEmail: true });
  try {
    const r = await S.navegador().post('/api/plataforma/login/codigo', { email: 'ops@theneil.com.br' });
    assert.equal(r.status, 503);
    assert.match(r.dados.mensagem, /SMTP_URL/);
    assert.equal((await S.navegador().post('/api/plataforma/login/codigo', { email: 'x@fora.com' })).status, 403);
    // O código foi gerado e está no "log" (email simulado), para o primeiro acesso.
    assert.ok(S.P.email.enviados.some(m => m.para === 'ops@theneil.com.br'));
  } finally { await S.fechar(); }
});

test('SMTP recusa o envio: o console mostra o motivo, sem o endereço com a senha', async () => {
  const { subirPlataforma } = await import('./ajuda-plataforma.js');
  const email = { enviados: [], enviar: async () => { throw new Error('Invalid login: 535 5.7.8 authentication failed (smtp://u:segredo@host:587)'); } };
  const S = await subirPlataforma({ email });
  try {
    const r = await S.navegador().post('/api/plataforma/login/codigo', { email: 'ops@theneil.com.br' });
    assert.equal(r.status, 502);
    assert.match(r.dados.mensagem, /535/);
    assert.doesNotMatch(r.dados.mensagem, /segredo/);
  } finally { await S.fechar(); }
});

test('falha no envio do email não gasta o limite de pedidos de código', async () => {
  const { subirPlataforma } = await import('./ajuda-plataforma.js');
  let falhar = true;
  const email = { enviados: [], enviar: async (para, assunto) => { if (falhar) throw new Error('ENOTFOUND'); email.enviados.push({ para, assunto }); } };
  const S = await subirPlataforma({ email });
  try {
    const n = S.navegador();
    for (let i = 0; i < 5; i++) assert.equal((await n.post('/api/plataforma/login/codigo', { email: 'ops@theneil.com.br' })).status, 502);
    falhar = false;
    assert.equal((await n.post('/api/plataforma/login/codigo', { email: 'ops@theneil.com.br' })).status, 200);
  } finally { await S.fechar(); }
});

test('endereço SMTP com caracteres especiais na senha, codificados ou não', async () => {
  const { normalizarSmtpUrl, smtpDeVariaveis } = await import('../src/email.js');
  const ok = 'smtps://noreply%40empresa.com.br:Sx%409pQ2@smtp.provedor.net:465';
  assert.equal(normalizarSmtpUrl('smtps://noreply@empresa.com.br:Sx@9pQ2@smtp.provedor.net:465'), ok);
  assert.equal(normalizarSmtpUrl(ok), ok);
  assert.equal(normalizarSmtpUrl('  smtps://noreply%40empresa.com.br:Sx@9pQ2@smtp.provedor.net:465 '), ok);
  assert.equal(normalizarSmtpUrl('smtp://u:p#:/?x@host:587'), 'smtp://u:p%23%3A%2F%3Fx@host:587');
  assert.equal(new URL(normalizarSmtpUrl('smtps://a@b.com:x@y@z@smtp.x.com:465')).hostname, 'smtp.x.com');
  assert.equal(smtpDeVariaveis({ SMTP_SERVIDOR: 'smtp.provedor.net', SMTP_USUARIO: 'noreply@empresa.com.br', SMTP_SENHA: 'Sx@9pQ2' }), ok);
  assert.equal(smtpDeVariaveis({ SMTP_SERVIDOR: 'smtp.x.com', SMTP_PORTA: '587', SMTP_USUARIO: 'u', SMTP_SENHA: 'p' }), 'smtp://u:p@smtp.x.com:587');
  assert.equal(smtpDeVariaveis({}), '');
});

test('envio por API HTTPS (Resend e Brevo), sem expor a chave em erro', async () => {
  const { criarEmail, smtpDeVariaveis } = await import('../src/email.js');
  assert.equal(smtpDeVariaveis({ EMAIL_API: 'Resend', EMAIL_API_CHAVE: 're_abc', SMTP_URL: 'smtp://x:y@z:25' }), 'resend://re_abc');
  const pedidos = [];
  const f = async (url, op) => { pedidos.push([url, op.headers, JSON.parse(op.body)]); return { ok: true, status: 200, text: async () => '{"id":"1"}' }; };
  const logs = [];
  let e = criarEmail({ lerSmtp: () => ({ url: 'resend://re_abc', remetente: 'GreenIA <noreply@empresa.com.br>' }), log: m => logs.push(m), fetch: f });
  await e.enviar('a@b.com', 'Assunto', 'Texto');
  assert.equal(pedidos[0][0], 'https://api.resend.com/emails');
  assert.equal(pedidos[0][1].authorization, 'Bearer re_abc');
  assert.deepEqual(pedidos[0][2], { from: 'GreenIA <noreply@empresa.com.br>', to: ['a@b.com'], subject: 'Assunto', text: 'Texto' });
  assert.match(logs[0], /enviado para a@b.com via resend/);
  e = criarEmail({ lerSmtp: () => ({ url: 'brevo://xkeysib-1', remetente: 'GreenIA <noreply@empresa.com.br>' }), log: () => {}, fetch: f });
  await e.enviar('a@b.com', 'Assunto', 'Texto');
  assert.equal(pedidos[1][0], 'https://api.brevo.com/v3/smtp/email');
  assert.equal(pedidos[1][1]['api-key'], 'xkeysib-1');
  assert.deepEqual(pedidos[1][2].sender, { name: 'GreenIA', email: 'noreply@empresa.com.br' });
  const ruim = criarEmail({ lerSmtp: () => ({ url: 'resend://re_segredo', remetente: 'x@y.com' }), log: () => {}, fetch: async () => ({ ok: false, status: 403, text: async () => 'invalid key re_segredo' }) });
  await assert.rejects(ruim.enviar('a@b.com', 's', 't'), er => /403/.test(er.message) && !er.message.includes('re_segredo'));
});

test('configurações da empresa: email em campos separados, senha nunca devolvida e mantida quando em branco', async () => {
  const { criarApp } = await import('../src/servidor.js');
  const { cliente } = await import('../scripts/cliente.js');
  const app = criarApp({ banco: ':memory:', cookieSeguro: false, log: () => {}, adminEmail: 'adm@empresa.com.br' });
  await new Promise(r => app.servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  try {
    const adm = await cliente(app, base).entrar('adm@empresa.com.br');
    const put = smtp => adm.put('/api/admin/config', { smtp });
    assert.equal((await put({ modo: 'smtp', servidor: 'smtp.provedor.net', porta: 465, usuario: 'noreply@empresa.com.br', senha: 'a@b#c:d', remetente: 'IA <noreply@empresa.com.br>' })).status, 200);
    const { lerConfig } = await import('../src/config.js');
    assert.equal(lerConfig(app.db).smtp.url, 'smtps://noreply%40empresa.com.br:a%40b%23c%3Ad@smtp.provedor.net:465');
    const tela = (await adm.get('/api/admin/config')).dados.smtp;
    assert.deepEqual(tela, { modo: 'smtp', servidor: 'smtp.provedor.net', porta: 465, usuario: 'noreply@empresa.com.br', temSenha: true, remetente: 'IA <noreply@empresa.com.br>', situacao: { falha: null, ultimoOk: null } });
    assert.doesNotMatch(JSON.stringify((await adm.get('/api/admin/config')).dados), /a%40b|a@b#c/);
    // Senha em branco: mantém a anterior.
    assert.equal((await put({ modo: 'smtp', servidor: 'smtp.provedor.net', porta: 465, usuario: 'noreply@empresa.com.br', senha: '', remetente: 'IA <noreply@empresa.com.br>' })).status, 200);
    assert.match(lerConfig(app.db).smtp.url, /a%40b%23c%3Ad@/);
    // Trocar o usuário exige senha nova.
    assert.equal((await put({ modo: 'smtp', servidor: 'smtp.provedor.net', porta: 465, usuario: 'outro@empresa.com.br', senha: '' })).status, 400);
    // API de envio: chave guardada e escondida.
    assert.equal((await put({ modo: 'api', api: 'resend', chave: 're_x1', remetente: 'IA <noreply@empresa.com.br>' })).status, 200);
    assert.deepEqual((await adm.get('/api/admin/config')).dados.smtp, { modo: 'api', api: 'resend', temChave: true, remetente: 'IA <noreply@empresa.com.br>', situacao: { falha: null, ultimoOk: null } });
    assert.equal((await put({ modo: '' })).status, 200);
    assert.equal(lerConfig(app.db).smtp.url, '');
  } finally { app.servidor.close(); app.servidor.closeAllConnections?.(); }
});
