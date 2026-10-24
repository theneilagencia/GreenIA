// Páginas públicas (QA de UX): 404 em HTML com marca e saídas, sem a marca da plataforma no endereço de uma empresa;
// política do ambiente da empresa com texto próprio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';

let V, P, ops, empresa;
before(async () => {
  V = await subir({ paginaInicial: 'vendas' });
  P = await subirPlataforma({ paginaInicial: 'vendas' });
  ops = await P.navegador().entrarConsole('ops@theneil.com.br');
  empresa = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Quatro', slug: 'empresa-quatro', status: 'ativa', admin_email: 'quea@empresa-quatro.com.br', admin_name: 'Quéa' })).dados;
  await ops.put(`/api/plataforma/empresas/${empresa.id}/url`, { custom_domain: 'ia.empresa-quatro.com.br' });
});
after(async () => { await V.fechar(); await P.fechar(); });

const html404 = r => {
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const h = String(r.dados);
  assert.match(h, /<html lang="pt-BR">/);
  assert.match(h, /name="viewport" content="width=device-width/);
  assert.match(h, /<h1[^>]*>Página não encontrada<\/h1>/);
  assert.match(h, /href="[^"]*">Ir para o início<\/a>/);
  return h;
};

test('404 na plataforma: HTML com a marca GreenIA, "Ir para o início" e "Encontrar meu ambiente"', async () => {
  const h = html404(await P.navegador().get('/nao/existe'));
  assert.match(h, /<title>Página não encontrada · GreenIA<\/title>/);
  assert.match(h, /href="\/">Ir para o início</);
  assert.match(h, /href="\/encontrar">Encontrar meu ambiente</);
});

test('404 no endereço de uma empresa: marca da empresa, sem GreenIA, e "Entrar" no lugar de encontrar o ambiente', async () => {
  for (const cam of ['/nao-existe/de-jeito-nenhum', '/vendas.html', '/plataforma']) {
    const h = html404(await P.navegador('ia.empresa-quatro.com.br').get(cam));
    assert.doesNotMatch(h, /GreenIA|greenia-marca/, cam);
    assert.match(h, /<title>Página não encontrada · Empresa Quatro<\/title>/, cam);
    assert.match(h, /href="\/icone"/);
    assert.match(h, /href="\/entrar">Entrar</);
  }
});

test('404 no endereço da plataforma com uma empresa aberta antes: só GreenIA, sem marca nem link do cliente', async () => {
  // QA em produção: greenia.com.br/help/manual.html saiu com o nome e o logo do último cliente aberto no navegador.
  const nav = P.navegador();
  await nav.get('/empresa-quatro');
  const h = html404(await nav.get('/help/manual.html'));
  assert.match(h, /<title>Página não encontrada · GreenIA<\/title>/);
  assert.doesNotMatch(h, /Empresa Quatro|empresa-quatro|\/icone/);
  assert.match(h, /href="\/">Ir para o início</);
  assert.match(h, /href="\/encontrar">Encontrar meu ambiente</);
});

test('404 da instalação única também é HTML com saída', async () => {
  const r = await fetch(`${V.base}/nada-aqui`);
  assert.equal(r.status, 404);
  const h = await r.text();
  assert.match(h, /<html lang="pt-BR">/);
  assert.match(h, /Ir para o início/);
});

test('política do ambiente da empresa: texto próprio, sem "A IA é a assistente de IA" e sem "ninguém"', async () => {
  const emp = P.navegador('ia.empresa-quatro.com.br');
  await emp.entrarEmpresa('quea@empresa-quatro.com.br');
  const p = (await emp.get('/api/politica')).dados;
  const tudo = p.texto + '\n' + p.secao;
  assert.doesNotMatch(tudo, /GreenIA|A IA é a assistente de IA|ninguém|A IA aplica controles/);
  assert.match(p.texto, /A IA da empresa ajuda nas tarefas do dia a dia/);
  assert.match(p.secao, /A plataforma aplica controles técnicos/);
});
