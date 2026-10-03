// Integration Builder: segurança da rede (SSRF), dos segredos e dos registros. Tudo local, sem sistema real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buscaSegura, motivoBloqueioIp, conferirCabecalhos, ErroRede } from '../src/integracoes/rede.js';
import { redigir } from '../src/integracoes/segredos.js';
import { criarApp } from '../src/servidor.js';
import { salvarConfig } from '../src/config.js';
import { criarConector, definirCapabilities } from '../src/integracoes/conectores.js';
import { configurarCredencial, testarConector } from '../src/integracoes/ciclo.js';
import { executarCapability, limparLimites } from '../src/integracoes/runtime.js';
import { descobrir } from '../src/integracoes/descoberta.js';
import { todos } from '../src/db.js';
import { apiFalsa, OPENAPI_FALSA } from './integracoes-fake.js';

let api;
before(async () => { api = await apiFalsa(); });
after(async () => { await api.fechar(); });

const rejeita = async (p, codigo) => { await assert.rejects(p, e => e instanceof ErroRede && e.codigo === codigo, `esperado ${codigo}`); };
const dnsFixo = ip => async () => [{ address: ip, family: ip.includes(':') ? 6 : 4 }];

test('SSRF: localhost, 127.0.0.1, metadados, rede privada, CGNAT, IPv6 local e mapeado são bloqueados', async () => {
  for (const [url, hosts] of [['https://localhost/x', ['localhost']], ['https://127.0.0.1/x', ['127.0.0.1']], ['https://169.254.169.254/latest/meta-data', ['169.254.169.254']],
    ['https://10.0.0.5/x', ['10.0.0.5']], ['https://192.168.0.10/x', ['192.168.0.10']], ['https://172.16.3.4/x', ['172.16.3.4']], ['https://100.64.1.1/x', ['100.64.1.1']],
    ['https://[::1]/x', ['::1']], ['https://[fe80::1]/x', ['fe80::1']], ['https://[::ffff:127.0.0.1]/x', ['::ffff:127.0.0.1']], ['https://0.0.0.0/x', ['0.0.0.0']]]) {
    await assert.rejects(buscaSegura({ url, hosts, tempoMs: 1000, lookup: dnsFixo('127.0.0.1') }), e => e instanceof ErroRede && ['destino_bloqueado', 'host_invalido'].includes(e.codigo), url);
  }
  // Nome que resolve para endereço interno (inclusive o de metadados): bloqueado na resolução.
  await rejeita(buscaSegura({ url: 'https://api.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000, lookup: dnsFixo('169.254.169.254') }), 'destino_bloqueado');
  await rejeita(buscaSegura({ url: 'https://api.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000, lookup: dnsFixo('10.1.2.3') }), 'destino_bloqueado');
  // Metadados nunca, nem com a rede privada autorizada.
  assert.equal(motivoBloqueioIp('169.254.169.254', { redePrivada: true }), 'metadados_ou_link_local');
  assert.equal(motivoBloqueioIp('fd00:ec2::254', { redePrivada: true }), 'metadados_ou_link_local');
  assert.equal(motivoBloqueioIp('10.0.0.1', { redePrivada: true }), null);
});

test('SSRF: DNS rebinding (um IP bom e um interno, ou troca entre resolução e conexão) não alcança a rede interna', async () => {
  // Qualquer endereço interno na resposta do DNS bloqueia o nome inteiro.
  await rejeita(buscaSegura({ url: 'https://rebind.exemplo.test/x', hosts: ['rebind.exemplo.test'], tempoMs: 1000, lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] }), 'destino_bloqueado');
  // A conexão vai para o IP conferido (lookup fixado): um segundo DNS que mudasse não é consultado.
  let consultas = 0;
  const lookup = async () => { consultas++; return [{ address: consultas === 1 ? '127.0.0.1' : '127.0.0.1', family: 4 }]; };
  await rejeita(buscaSegura({ url: 'https://rebind2.exemplo.test/x', hosts: ['rebind2.exemplo.test'], tempoMs: 1000, lookup }), 'destino_bloqueado');
  assert.equal(consultas, 1);
});

test('allowlist de hosts, protocolo, credencial na URL e redirecionamento para fora ou para IP interno', async () => {
  await rejeita(buscaSegura({ url: 'https://outro.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000 }), 'host_nao_autorizado');
  await rejeita(buscaSegura({ url: 'ftp://api.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000 }), 'protocolo');
  await rejeita(buscaSegura({ url: 'http://api.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000 }), 'protocolo');
  await rejeita(buscaSegura({ url: 'https://u:p@api.exemplo.test/x', hosts: ['api.exemplo.test'], tempoMs: 1000 }), 'credencial_na_url');
  // Servidor local (rede privada autorizada) que redireciona: para fora da allowlist e para metadados.
  const h = ['127.0.0.1'];
  await rejeita(buscaSegura({ url: `${api.base}/redireciona?para=https://evil.exemplo.test/`, hosts: h, redePrivada: true, tempoMs: 2000 }), 'host_nao_autorizado');
  await rejeita(buscaSegura({ url: `${api.base}/redireciona?para=http://169.254.169.254/latest`, hosts: [...h, '169.254.169.254'], redePrivada: true, tempoMs: 2000 }), 'destino_bloqueado');
  // Sem tempo limite não há chamada.
  await rejeita(buscaSegura({ url: `${api.base}/clientes`, hosts: h, redePrivada: true }), 'tempo_obrigatorio');
});

test('cabeçalho com quebra de linha, nome inválido ou proibido é recusado (header injection)', () => {
  for (const h of [{ 'x-a': 'ok\r\nX-Injetado: 1' }, { 'x-a': 'ok\nb' }, { 'x a': 'v' }, { host: 'evil' }, { 'transfer-encoding': 'chunked' }, { 'x-a': 'a'.repeat(9000) }])
    assert.throws(() => conferirCabecalhos(h), ErroRede, JSON.stringify(h).slice(0, 40));
  assert.deepEqual(conferirCabecalhos({ 'X-API-Key': 'abc' }), { 'X-API-Key': 'abc' });
});

test('tempo limite e resposta grande demais', async () => {
  await rejeita(buscaSegura({ url: `${api.base}/lento`, hosts: ['127.0.0.1'], redePrivada: true, tempoMs: 300, cabecalhos: { 'x-api-key': api.chave } }), 'tempo_esgotado');
  await rejeita(buscaSegura({ url: `${api.base}/grande`, hosts: ['127.0.0.1'], redePrivada: true, tempoMs: 5000, maxBytes: 1024 * 1024, cabecalhos: { 'x-api-key': api.chave } }), 'resposta_grande');
});

test('redirecionamento para outro host da allowlist não leva a credencial', async () => {
  // localhost e 127.0.0.1 apontam para o mesmo servidor falso, mas são hosts diferentes para a regra.
  const r = await buscaSegura({ url: `${api.base}/redireciona?para=http://localhost:${api.porta}/eco-auth`, hosts: ['127.0.0.1', 'localhost'], redePrivada: true, tempoMs: 2000,
    cabecalhos: { authorization: 'Bearer segredo-que-nao-pode-seguir' }, lookup: dnsFixo('127.0.0.1') });
  assert.equal(JSON.parse(r.corpo).recebido, null);
});

test('redação: nada de token, senha, chave ou Authorization em log e auditoria', () => {
  const r = redigir({ authorization: 'Bearer abc.def.ghi', headers: { 'X-API-Key': 'k-123456', ok: 'valor' }, texto: 'falhou com Bearer xyz123456789 e chave-ultra-secreta', refresh_token: 'r', senha: 's' }, ['chave-ultra-secreta']);
  const s = JSON.stringify(r);
  for (const x of ['abc.def.ghi', 'k-123456', 'xyz123456789', 'chave-ultra-secreta']) assert.ok(!s.includes(x), x);
  assert.equal(r.headers.ok, 'valor');
});

// ---- Runtime com a API falsa: credencial nunca vaza (log, erro, auditoria, resposta) ------------------------
function appTeste() {
  const logs = [];
  const app = criarApp({ log: (...a) => logs.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) });
  salvarConfig(app.db, { integracoes: { ativa: true, pessoas: [], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: true } });
  return { app, logs };
}
test('credencial não aparece em log, erro, auditoria, resposta nem no banco em claro; erro do sistema externo que ecoa a chave é redigido', async () => {
  limparLimites();
  const { app, logs } = appTeste();
  const d = descobrir(OPENAPI_FALSA(api.base));
  const c = criarConector(app, { id: 1 }, { nome: 'API', sistema: d.sistema, base_url: d.base_url, operacoes: d.operacoes, auth_type: 'api_key', origem: 'generated', config: { rede_privada: true, cabecalho_auth: 'X-API-Key', timeout_ms: 2000 } });
  definirCapabilities(app, { id: 1 }, c.id, [{ operation_id: 'listarClientes' }]);
  configurarCredencial(app, { id: 1 }, c.id, 'chave-errada-que-vaza-123');
  const cap = todos(app.db, 'select id from capabilities')[0].id;
  const r = await executarCapability(app, { capabilityId: cap, modo: 'teste' });
  assert.equal(r.status, 'FAILED'); assert.equal(r.erro.codigo, 'credencial_invalida');
  configurarCredencial(app, { id: 1 }, c.id, api.chave);
  const t = await testarConector(app, { id: 1 }, c.id, {});
  assert.ok(t.passou, JSON.stringify(t.itens));
  const tudo = JSON.stringify([r, t, logs, todos(app.db, 'select * from eventos'), todos(app.db, 'select * from connectors'), todos(app.db, 'select * from connector_runs'), todos(app.db, 'select * from connector_secrets_ref').map(x => x.cifrado + x.mascara)]);
  for (const s of [api.chave, 'chave-errada-que-vaza-123']) assert.ok(!tudo.includes(s), 'segredo vazou');
});

test('caminho com ".." ou parâmetro que tenta trocar de host é recusado (path traversal)', async () => {
  limparLimites();
  const { app } = appTeste();
  const d = descobrir(OPENAPI_FALSA(api.base));
  const c = criarConector(app, { id: 1 }, { nome: 'API', sistema: d.sistema, base_url: d.base_url, operacoes: d.operacoes, auth_type: 'api_key', config: { rede_privada: true, cabecalho_auth: 'X-API-Key' } });
  definirCapabilities(app, { id: 1 }, c.id, [{ operation_id: 'lerCliente' }]);
  configurarCredencial(app, { id: 1 }, c.id, api.chave);
  const cap = todos(app.db, 'select id from capabilities')[0].id;
  for (const id of ['..', '.', '../../admin', '%2e%2e', '1/../../x', 'a\u0000b']) {
    const r = await executarCapability(app, { capabilityId: cap, entrada: { id }, modo: 'teste' });
    assert.ok(r.status === 'FAILED' ? true : !api.estado.chamadas.some(x => x.caminho.includes('..') || x.caminho.includes('admin')), `${id}: ${JSON.stringify(r)}`);
  }
  assert.ok(!api.estado.chamadas.some(x => /\.\.|admin/.test(x.caminho)));
  const ok = await executarCapability(app, { capabilityId: cap, entrada: { id: '7' }, modo: 'teste' });
  assert.equal(ok.status, 'SUCCESS');
});
