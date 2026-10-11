// Migração dos textos padrão das empresas que já existiam (a plataforma ainda não está em produção, então uma nova
// ciência da política é aceitável): login com a concordância certa e política com o texto escrito para a empresa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { exec, um, todos } from '../src/db.js';
import { migrarTextoLogin } from '../src/plataforma/empresas.js';
import { politicaAtual, TEXTO_PADRAO, TEXTO_PADRAO_EMPRESA } from '../src/politica.js';
import { semMarcaDaPlataforma } from '../public/marca-branca.js';

async function empresa(S, slug) {
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  return (await ops.post('/api/plataforma/empresas', { name: 'Empresa Antiga', slug, status: 'ativa', admin_email: `admin@${slug}.test` })).dados;
}

test('login: o texto padrão antigo vira o atual; texto editado pela empresa não muda', async () => {
  const S = await subirPlataforma();
  try {
    const a = await empresa(S, 'antiga-a'), b = await empresa(S, 'antiga-b');
    const antigo = 'Esta é a IA de uso interno de Empresa Antiga. Você recebe um código de acesso de 6 dígitos no email, sem senha para decorar.';
    exec(S.P.db, 'update branding set login_text = ? where company_id = ?', antigo, a.id);
    exec(S.P.db, 'update branding set login_text = ? where company_id = ?', 'Texto da própria empresa.', b.id);
    migrarTextoLogin(S.P); migrarTextoLogin(S.P);
    assert.match(um(S.P.db, 'select login_text from branding where company_id = ?', a.id).login_text, /^Esta é a IA de uso interno da equipe Empresa Antiga\./);
    assert.equal(um(S.P.db, 'select login_text from branding where company_id = ?', b.id).login_text, 'Texto da própria empresa.');
  } finally { await S.fechar(); }
});

test('política: texto padrão anterior ganha nova versão com o texto da empresa, uma vez só', async () => {
  const S = await subirPlataforma();
  try {
    const e = await empresa(S, 'antiga-pol');
    const t = S.P.tenant(e.id);
    politicaAtual(t);
    exec(t.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', semMarcaDaPlataforma(TEXTO_PADRAO), politicaAtual(t).secao, new Date().toISOString());
    const antes = um(t.db, 'select max(versao) as v from politica_versoes').v;
    const v = politicaAtual(t);
    assert.equal(v.versao, antes + 1);
    assert.equal(v.texto, TEXTO_PADRAO_EMPRESA);
    assert.equal(politicaAtual(t).versao, v.versao, 'não cria outra versão na próxima leitura');
    // Texto próprio da empresa não é trocado.
    exec(t.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', 'Texto da empresa.', v.secao, new Date().toISOString());
    assert.equal(politicaAtual(t).texto, 'Texto da empresa.');
    assert.ok(todos(t.db, 'select 1 from politica_versoes').length >= 3);
  } finally { await S.fechar(); }
});
