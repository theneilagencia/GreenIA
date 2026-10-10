// Documentos legais e rodapé da LP: páginas geradas em dia com docs/legal, rotas no ar, identificação legal igual nos
// três lugares, aviso de rascunho enquanto houver pendência e a LP sem claim que dependa do que ainda não existe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOCUMENTOS, pagina, publicado } from '../scripts/gerar-legais.js';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
const semTags = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const IDENTIDADE = ['NEIL INOVAÇÃO E TECNOLOGIA LTDA', '37.749.373/0001-70', 'Rua Bernardo Guimarães, 245, Funcionários, Belo Horizonte/MG', 'hello@theneil.com.br', 'Vinicius Guimarães'];

let V, P;
before(async () => { V = await subir({ paginaInicial: 'vendas' }); P = await subirPlataforma({ paginaInicial: 'vendas' }); });
after(async () => { await V.fechar(); await P.fechar(); });

test('páginas legais geradas em dia com docs/legal (rode node scripts/gerar-legais.js depois de editar o .md)', () => {
  for (const d of DOCUMENTOS) assert.equal(ler(d.html), pagina(d), `${d.html} desatualizada em relação a ${d.md}`);
});

test('termos e privacidade no ar na instalação de vendas e na plataforma, com noindex e faixa de candidata até a publicação final', async () => {
  for (const base of [V.base]) {
    for (const d of DOCUMENTOS) {
      const r = await fetch(`${base}${d.caminho}`);
      assert.equal(r.status, 200, d.caminho);
      const h = await r.text();
      assert.match(h, new RegExp(d.titulo));
      // Candidata (com pendência ou sem a publicação final marcada em docs/legal/estado.json): noindex e faixa no topo.
      if (/\[(PENDÊNCIA|PENDENTE)/.test(ler(d.md)) || !publicado()) { assert.match(h, /Versão final candidata, ainda não publicada/); assert.match(h, /noindex/); }
    }
  }
  const nav = P.navegador();
  for (const d of DOCUMENTOS) assert.equal((await nav.get(d.caminho)).status, 200, `plataforma ${d.caminho}`);
});

test('identificação legal igual no rodapé da LP, nos Termos e na Política', () => {
  const lp = semTags(ler('public/vendas.html'));
  for (const x of IDENTIDADE) {
    assert.ok(lp.includes(x), `rodapé sem: ${x}`);
    assert.ok(ler('docs/legal/politica-de-privacidade.md').includes(x), `Política sem: ${x}`);
  }
  for (const x of IDENTIDADE.slice(0, 4)) assert.ok(ler('docs/legal/termos-de-uso.md').includes(x), `Termos sem: ${x}`);
  assert.match(ler('public/vendas.html'), /href="\/termos">Termos de Uso</);
  assert.match(ler('public/vendas.html'), /href="\/privacidade">Política de Privacidade</);
  assert.doesNotMatch(lp + ler('docs/legal/termos-de-uso.md') + ler('docs/legal/politica-de-privacidade.md'), /Betim|Montserrat|Rua G, nº 277|Vinicius Guimaraes/, 'endereço antigo e grafia sem acento não voltam');
});

test('LP: acesso da equipe sem aprovação prévia inventada; retenção sem prazo na página; nada de "equipe GreenIA" no app das empresas', () => {
  const lp = semTags(ler('public/vendas.html'));
  assert.match(lp, /[Nn]ão (?:depende de|exige) aprovação prévia/);
  assert.doesNotMatch(lp.replace(/[Nn]ão (?:depende de|exige) aprovação prévia/g, ''), /aprovação prévia|consentimento prévio|autorização (?:prévia|obrigatória)/i);
  assert.doesNotMatch(lp, /\b(?:15|38) dias\b/, 'prazos de cópias ficam na Política (ainda não ativos em produção)');
  for (const p of ['public/app.js', 'public/empresa.js']) assert.doesNotMatch(ler(p).replace(/^\s*\/\/.*$/gm, ''), /equipe GreenIA/, p);
});

test('termos e privacidade só no endereço canônico da plataforma; no endereço de uma empresa levam à plataforma e o resto continua igual', async () => {
  const ops = await P.navegador().entrarConsole('ops@theneil.com.br');
  const c = (await ops.post('/api/plataforma/empresas', { name: 'Empresa Doc', slug: 'empresa-doc', status: 'ativa', admin_email: 'dora@empresa-doc.com.br', admin_name: 'Dora' })).dados;
  assert.equal((await ops.put(`/api/plataforma/empresas/${c.id}/url`, { custom_domain: 'ia.empresa-doc.com.br' })).status, 200);
  await ops.put('/api/plataforma/configuracoes', { subdominio_base: 'ia.plataforma.teste' });
  const plat = P.navegador();
  for (const d of DOCUMENTOS) {
    // Na plataforma: o caminho canônico abre; o arquivo leva ao caminho canônico.
    assert.equal((await plat.get(d.caminho)).status, 200);
    const arq = await plat.get(`${d.caminho}.html`);
    assert.equal(arq.status, 301); assert.equal(arq.headers.get('location'), d.caminho);
    // No domínio próprio e no subdomínio da empresa: redirecionamento para a plataforma, sem servir a cópia local.
    for (const host of ['ia.empresa-doc.com.br', 'empresa-doc.ia.plataforma.teste']) {
      for (const cam of [d.caminho, `${d.caminho}.html`]) {
        const r = await P.navegador(host).get(cam);
        assert.equal(r.status, 301, `${host}${cam}`);
        assert.equal(r.headers.get('location'), `http://plataforma.teste${d.caminho}`);
      }
    }
  }
  // Páginas da plataforma não abrem pelo arquivo no endereço da empresa; as da empresa continuam.
  const emp = P.navegador('ia.empresa-doc.com.br');
  for (const f of ['/vendas.html', '/plataforma.html', '/operador.html', '/encontrar.html']) assert.equal((await emp.get(f)).status, 404, f);
  for (const f of ['/', '/entrar', '/app', '/politica', '/estilo.css', '/fontes/fontes.css']) assert.equal((await emp.get(f)).status, 200, f);
  assert.equal((await emp.get('/api/publico')).dados.empresa, 'Empresa Doc');
  // Login no endereço da empresa continua funcionando.
  assert.equal((await emp.entrarEmpresa('dora@empresa-doc.com.br')).status, 200);
  assert.equal((await emp.get('/api/eu')).status, 200);
});

test('versão final 1.0: sem marcação de pendência, rascunho ou texto interno; vigência de 30/11/2026; publicação marcada', () => {
  for (const d of DOCUMENTOS) {
    const t = ler(d.md);
    assert.doesNotMatch(t, /\[(PENDÊNCIA|PENDENTE|DADO DA)/, d.md);
    assert.doesNotMatch(t, /RASCUNHO|aguardando|(^|\s)a confirmar|grafia|proposta para (validação|revisão) jurídica|não comprovad/i, d.md);
    assert.match(t, /Versão 1\.0, de 1º de outubro de 2026 · Vigência a partir de 30 de novembro de 2026/, d.md);
    const h = ler(d.html);
    assert.match(h, /<meta name="robots" content="index">/, `${d.html}: indexável na versão de release`);
    assert.doesNotMatch(h, /Versão final candidata|Rascunho/, d.html);
  }
  assert.equal(publicado(), true);
  assert.doesNotMatch(ler('docs/legal/politica-de-privacidade.md') + ler('docs/legal/termos-de-uso.md') + ler('public/vendas.html') + ler('docs/claims-lp.md'), /n[ãa]o vende|nunca vende/i, 'sem "não vende dados"');
});

test('registro da aprovação: o hash anotado bate com os documentos (mudou o texto, atualize o registro)', async () => {
  const { createHash } = await import('node:crypto');
  const reg = ler('docs/legal/aprovacao-juridica.md');
  for (const d of DOCUMENTOS) {
    const h = createHash('sha256').update(readFileSync(raiz + d.md)).digest('hex');
    assert.match(reg, new RegExp(`\`${d.md}\` \\| 1\\.0, .*\`${h}\``), `${d.md}: hash registrado desatualizado`);
  }
  assert.match(reg, /\*\*Aprovado\*\*/);
});
