// Falha de envio de email no login da empresa: fallback do email próprio para o da plataforma, mensagem
// clara (não 500) quando nada funciona, motivo registrado para o admin da plataforma, sem segredos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { semSegredos } from '../src/plataforma/email-falhas.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { explicarFalhaEmail } from '../src/email.js';

let S;
after(async () => { await S?.fechar(); });

test('login da empresa com email falhando: 503 claro, motivo registrado sem segredos, aviso no console; volta ao normal quando o envio funciona', async () => {
  const falha = { plataforma: null };
  const email = { enviados: [], async enviar(para, assunto, texto) { if (falha.plataforma) throw new Error(falha.plataforma); this.enviados.push({ para, assunto, texto }); } };
  S = await subirPlataforma({ email });
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Apy', slug: 'apy', status: 'ativa', admin_email: 'x@apy.com' })).dados;
  assert.ok(c.id);
  falha.plataforma = 'resend respondeu 403: {"message":"The apy.com domain is not verified"} re_AbCdEf123456789 smtps://usuario:SenhaSecreta@smtp.exemplo.com';
  const x = S.navegador(); await x.get('/apy');
  const r = await x.post('/api/login/codigo', { email: 'x@apy.com' });
  assert.equal(r.status, 503, 'não é mais 500');
  assert.match(r.dados.mensagem, /Não foi possível enviar o código por email/);
  const cfg = (await ops.get('/api/plataforma/configuracoes')).dados;
  const f = cfg.smtp.falhas[0];
  assert.match(f.detalhe, /domain is not verified/, 'o motivo real aparece');
  assert.ok(!f.detalhe.includes('SenhaSecreta') && !f.detalhe.includes('re_AbCdEf123456789'), 'sem senha nem chave');
  assert.ok((await ops.get('/api/plataforma/eu')).dados.alertaEmail, 'aviso no topo do console');
  // O envio volta a funcionar: o código sai e o aviso some.
  falha.plataforma = null;
  assert.equal((await x.post('/api/login/codigo', { email: 'x@apy.com' })).status, 200);
  assert.equal((await ops.get('/api/plataforma/eu')).dados.alertaEmail, null);
});

test('email próprio da empresa falhando: o código sai pelo email da plataforma e a falha fica registrada', async () => {
  const cId = (await (await S.navegador().entrarConsole('ops@theneil.com.br')).get('/api/plataforma/empresas')).dados.empresas.find(e => e.slug === 'apy').id;
  const t = S.P.tenant(cId);
  salvarConfig(t.db, { smtp: { ...lerConfig(t.db).smtp, url: 'smtps://ninguem:errada@127.0.0.1:1', remetente: 'Apy <x@apy.com>' } });
  const x = S.navegador(); await x.get('/apy');
  const antes = S.P.email.enviados.length;
  const r = await x.post('/api/login/codigo', { email: 'x@apy.com' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(S.P.email.enviados.length, antes + 1, 'saiu pelo email da plataforma');
  const cfg = (await (await S.navegador().entrarConsole('ops@theneil.com.br')).get('/api/plataforma/configuracoes')).dados;
  assert.match(cfg.smtp.falhas[0].origem, /email próprio da empresa/);
  assert.ok(!cfg.smtp.falhas[0].detalhe.includes('errada'));
});

test('admin da empresa: vê a falha do email próprio (explicada, sem segredo) e o teste não cai em silêncio no email da plataforma', async () => {
  const adm = S.navegador(); await adm.get('/apy');
  assert.equal((await adm.entrarEmpresa('x@apy.com')).status, 200);
  // A falha do teste anterior (o código saiu pela plataforma) aparece para o admin da empresa.
  let st = (await adm.get('/api/admin/config')).dados.smtp.situacao;
  assert.ok(st.falha, 'a empresa fica sabendo');
  assert.equal(st.falha.caiuNaPlataforma, true);
  assert.match(st.falha.motivo, /Não foi possível conectar a 127\.0\.0\.1:1/);
  assert.ok(!JSON.stringify(st).includes('errada') && !JSON.stringify(st).includes('ninguem'));
  // O teste do email da empresa falha de verdade (502, com o motivo) e nada sai pela plataforma.
  const antes = S.P.email.enviados.length;
  const r = await adm.post('/api/admin/smtp/teste');
  assert.equal(r.status, 502);
  assert.match(r.dados.mensagem, /Não foi possível conectar a 127\.0\.0\.1:1.*Resend ou Brevo/);
  assert.equal(S.P.email.enviados.length, antes, 'o teste não troca para o email da plataforma');
});

test('explicações de falha de email: senha recusada, domínio não verificado, conexão bloqueada, remetente recusado', () => {
  const smtp = { url: 'smtps://eu%40apy.com:segredo@smtp.gmail.com:465' };
  assert.match(explicarFalhaEmail(Object.assign(new Error('Invalid login: 535-5.7.8'), { code: 'EAUTH', responseCode: 535 }), smtp), /O Gmail recusou a senha: a senha informada não é uma senha de app/);
  assert.match(explicarFalhaEmail(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }), smtp), /conectar a smtp\.gmail\.com:465.*bloqueando SMTP de saída/);
  assert.match(explicarFalhaEmail(Object.assign(new Error('553 Sender not owned'), { code: 'EENVELOPE', responseCode: 553 }), smtp), /não aceitou o remetente/);
  // Senha que não tem o formato de senha de app (16 letras): o motivo diz isso, sem mostrar a senha.
  const normal = explicarFalhaEmail(Object.assign(new Error('535'), { code: 'EAUTH', responseCode: 535 }), { url: 'smtps://eu%40apy.com:MinhaSenha2026@smtp.gmail.com:465' });
  assert.match(normal, /não é uma senha de app \(a senha de app do Google tem 16 letras\)/);
  assert.ok(!normal.includes('MinhaSenha2026'));
  assert.match(explicarFalhaEmail(Object.assign(new Error('535'), { code: 'EAUTH', responseCode: 535 }), { url: 'smtps://eu%40apy.com:abcdefghijklmnop@smtp.gmail.com:465' }), /O Gmail recusou o usuário ou a senha/);
  const api = { url: 'resend://re_chave_secreta_123456' };
  const m = explicarFalhaEmail(new Error('resend respondeu 403: {"message":"The apymine.com domain is not verified"}'), api);
  assert.match(m, /domínio do email remetente não está verificado na conta do Resend/);
  assert.match(explicarFalhaEmail(new Error('resend respondeu 401: {"message":"API key is invalid"}'), api), /recusou a chave de API/);
  for (const t of [m, explicarFalhaEmail(new Error('x'), smtp)]) assert.ok(!t.includes('segredo') && !t.includes('re_chave'));
});

test('semSegredos tira senha de URL, chaves de API e Bearer', () => {
  const t = semSegredos('smtps://user:p4ss@host:465 falhou; key re_abcdefghij123; Authorization: Bearer abc.def.ghi; xkeysib-0123456789abcdef');
  assert.ok(!/p4ss|re_abcdefghij123|abc\.def\.ghi|xkeysib-0123456789abcdef/.test(t), t);
});
