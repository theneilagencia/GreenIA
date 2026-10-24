import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANOS_COMERCIAIS, CAPACITY_PACK } from '../src/plataforma/catalogo.js';
import { subir } from './ajuda.js';

// A tabela comercial não pode divergir do catálogo usado pela cobrança.
test('página pública de planos corresponde ao catálogo comercial e mantém contratação consultiva', async () => {
  const s = await subir({ paginaInicial: 'vendas' });
  try {
    const resposta = await fetch(`${s.base}/planos.html`);
    assert.equal(resposta.status, 200);
    const html = await resposta.text();
    for (const plano of PLANOS_COMERCIAIS) {
      const nome = plano.name.replace('GreenIA ', '');
      const bloco = html.match(new RegExp(`<article[^>]+aria-labelledby="plano-${nome.toLowerCase()}"[\\s\\S]*?</article>`))?.[0];
      assert.ok(bloco, `plano ausente: ${nome}`);
      assert.ok(bloco.includes(plano.credits.toLocaleString('pt-BR')));
      assert.ok(bloco.includes(`US$ ${plano.price_usd.toLocaleString('pt-BR')}`));
      assert.ok(bloco.includes(`/?plano=${nome.toLowerCase()}#contato`));
    }
    assert.ok(html.includes(`${CAPACITY_PACK.creditos.toLocaleString('pt-BR')} créditos por US$ ${CAPACITY_PACK.preco_usd}`));
    assert.doesNotMatch(html, /checkout\.stripe|buy\.stripe|R\$|mais popular|data-plano/i);
    const inicio = html.split('class="pc-abertura"')[1].split('</section>')[0];
    assert.doesNotMatch(inicio, /US\$|pc-plano/);
    const principal = await (await fetch(`${s.base}/`)).text();
    assert.doesNotMatch(principal, /href="\/planos.html"/);
    assert.match(html, /<meta name="robots" content="noindex,follow">/);
    assert.doesNotMatch(readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8'), /planos.html/);
    assert.doesNotMatch(readFileSync(new URL('../public/faq.html', import.meta.url), 'utf8'), /href="\/planos.html"/);
    assert.doesNotMatch(principal, /US\$|pc-plano/);
    const mensagem = 'Quero conversar sobre o GreenIA Team e a capacidade para a minha empresa.';
    const contato = await fetch(`${s.base}/api/contato`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Pessoa de teste', email: 'teste@exemplo.com.br', empresa: 'Empresa de teste', mensagem }) });
    assert.equal(contato.status, 200);
    assert.equal(s.app.db.prepare('select mensagem from leads').get().mensagem, mensagem);
  } finally { await s.fechar(); }
});
