import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { validarPublicacao, PUBLICACAO_CONTROLADA } from '../src/publicacao-controlada.js';
test('publicação restrita bloqueia outras empresas, inclusive sessão existente, sem ampliar permissões da homologação', async () => {
  const S = await subirPlataforma({ subdominioBase: 'empresas.teste' });
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const plano = (await ops.get('/api/plataforma/planos')).dados.planos[0];
    for (const slug of ['homologacao-a', 'cliente-bloqueado']) {
      const r = await ops.post('/api/plataforma/empresas', { name: slug, slug, plan_id: plano.id, admin_email: `ana@${slug}.exemplo`, status: 'ativa' });
      assert.equal(r.status, 200);
    }
    const cliente = S.navegador(); await cliente.get('/cliente-bloqueado'); await cliente.entrarEmpresa('ana@cliente-bloqueado.exemplo');
    assert.equal((await cliente.get('/api/eu')).status, 200);
    S.P.publicacaoControlada = validarPublicacao({ ativa: true, empresas: ['homologacao-a'] });
    assert.equal((await cliente.get('/api/eu')).status, 503);
    assert.equal((await cliente.post('/api/login/codigo', { email: 'ana@cliente-bloqueado.exemplo' })).status, 503);
    assert.equal((await S.navegador().get('/cliente-bloqueado')).status, 503);
    assert.equal((await S.navegador('cliente-bloqueado.empresas.teste').get('/api/eu')).status, 503);
    const ana = S.navegador(); assert.equal((await ana.get('/homologacao-a')).status, 200);
    assert.equal((await ana.get('/api/eu')).status, 401);
    assert.equal((await ana.entrarEmpresa('ana@homologacao-a.exemplo')).status, 200);
    assert.equal((await ana.get('/api/eu')).status, 200);
    assert.equal((await ana.get('/api/admin/modelos')).status, 200);
    const role = await ana.post('/api/empresa/roles', { name: 'Uso restrito', permissoes: ['company.read', 'chat.use'] });
    assert.equal(role.status, 200);
    assert.equal((await ana.post('/api/empresa/usuarios', { email: 'leitor@homologacao-a.exemplo', name: 'Leitor fictício', role_id: role.dados.id })).status, 200);
    const leitor = S.navegador(); await leitor.get('/homologacao-a');
    assert.equal((await leitor.entrarEmpresa('leitor@homologacao-a.exemplo')).status, 200);
    assert.equal((await leitor.get('/api/eu')).status, 200);
    assert.equal((await leitor.get('/api/admin/modelos')).status, 403);
    assert.equal((await leitor.get('/api/plataforma/empresas')).status, 401);
    assert.equal((await ops.get('/api/plataforma/empresas')).status, 200);
    assert.equal((await ops.get('/api/saude')).dados.acessoRestrito, true);
    // Encerrar a publicação controlada restaura a empresa sem conceder sessão ou privilégios.
    assert.equal(PUBLICACAO_CONTROLADA, null);
    S.P.publicacaoControlada = validarPublicacao(PUBLICACAO_CONTROLADA);
    assert.equal((await cliente.get('/api/eu')).status, 200);
    assert.equal((await S.navegador().get('/cliente-bloqueado')).status, 200);
    assert.equal((await S.navegador('cliente-bloqueado.empresas.teste').get('/api/eu')).status, 401);
    assert.equal((await leitor.get('/api/admin/modelos')).status, 403);
    assert.equal((await leitor.get('/api/plataforma/empresas')).status, 401);
    assert.equal((await ops.get('/api/saude')).dados.acessoRestrito, false);
  } finally { await S.fechar(); }
});
test('configuração inválida não abre acesso por fallback', () => {
  for (const empresas of [[], ['*'], ['Homologacao A'], null]) assert.throws(() => validarPublicacao({ ativa: true, empresas }), /inválida/);
});
