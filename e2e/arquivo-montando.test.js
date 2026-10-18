import { autorizarAdvancedFalso } from '../test/advanced-fixture.js';
import { cliente } from '../scripts/cliente.js';
// Arquivo montado depois do texto (apresentação no design de outra): enquanto a montagem acontece, a tela mostra o
// cartão "Preparando o arquivo para baixar…" e o texto não diz "pronto para download"; no fim, o cartão do arquivo.
// QA em produção: a atualização da bolha durante o streaming reescrevia o texto sem o cartão, que nunca aparecia.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { pptx } from '../src/escritorio.js';
import { pdfColorido } from '../test/estilo-arquivo.test.js';
import { caminhoChromium } from '../src/visual/chromium.js';

let N, OR;
before(async () => {
  OR = await openRouterFalso({ responder: () => 'Entendi: vou montar a apresentação no design da referência.\n\nO arquivo está pronto para download abaixo.' });
  N = await subirComNavegador({ ia: OR.ia });
  const admin=await cliente(N.app,N.base).entrar('admin@empresa-exemplo.com.br');
  await autorizarAdvancedFalso(N,admin,admin.pessoa,['anthropic/claude-sonnet-5']);
});
after(async () => { await N?.fechar(); await OR?.fechar(); });

test('montagem do arquivo: cartão de andamento à vista e nenhuma promessa de "pronto" antes do arquivo', { skip: !caminhoChromium() }, async () => {
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
  // Registra o que aparece na tela durante o envio (o cartão pode durar pouco).
  await p.evaluate(() => {
    window.__visto = { cartao: false, prontoAntes: false };
    new MutationObserver(() => {
      if (document.querySelector('.arquivo-montando')) window.__visto.cartao = true;
      const r = [...document.querySelectorAll('.resposta')].at(-1);
      if (r && !r.querySelector('.anexo-resposta') && /pronto para download/i.test(r.innerText) && document.querySelector('.cursor')) window.__visto.prontoAntes = true;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await p.locator('#arquivo').setInputFiles([
    { name: 'Kickoff.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx('# Kickoff\n\nAgenda\n\n# Resultados\n\n- Item A', { titulo: 'Kickoff' }) },
    { name: 'Referencia.pdf', mimeType: 'application/pdf', buffer: pdfColorido() },
  ]);
  await p.waitForFunction(() => document.querySelectorAll('#anexos .anexo-chip').length === 2);
  await p.fill('#entrada', 'Ajuste o documento Kickoff.pptx com o design/layout o mais próximo possível da apresentação Referencia.pdf.');
  await p.click('#enviar');
  await p.waitForSelector('.rodape-resposta', { timeout: 120000 });
  const visto = await p.evaluate(() => window.__visto);
  assert.equal(visto.cartao, true, 'o cartão de andamento apareceu');
  assert.equal(visto.prontoAntes, false, 'sem "pronto para download" antes do arquivo');
  assert.ok(await p.locator('.resposta').last().locator('.anexo-resposta').count() >= 1, 'o arquivo aparece no fim');
  await p.close();
});
