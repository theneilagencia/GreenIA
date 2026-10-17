import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { subir } from '../test/ajuda.js';
import { pptx } from '../src/escritorio.js';

let S, nav, admin, continuar, chamada = 0;
before(async () => {
  S = await subir({ ia: {
    async *enviar() {
      chamada++;
      if (chamada === 1) {
        yield { tipo: 'texto', texto: '## O que foi feito\n\n**Estrutura visual:** ajustada.\n\nO arquivo PPTX ajustado está pronto para download abaixo.' };
        await new Promise(r => { continuar = r; });
      } else yield { tipo: 'texto', texto: '{}' };
      yield { tipo: 'fim', custo: 0, modelo: 'simulado' };
    },
  } });
  admin = S.cliente(); await admin.entrar('admin@exemplo.com.br');
  nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
});
after(async () => { continuar?.(); await nav?.close(); await S?.fechar(); });
async function pagina() {
  const ctx = await nav.newContext();
  const [name, value] = admin.cookie.split('=');
  await ctx.addCookies([{ name, value, url: S.base }]);
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', e => p.erros.push(e.message));
  await p.goto(S.base + '/app#/nova'); await p.waitForSelector('#entrada');
  return p;
}

test('durante a geração: progresso visível, Markdown formatado e nenhuma promessa de download', async () => {
  const p = await pagina();
  await p.locator('#arquivo').setInputFiles({ name: 'Kickoff.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx('# Kickoff\n\n## Agenda\nTexto a corrigir') });
  await p.locator('.anexo-chip').waitFor();
  await p.fill('#entrada', 'Corrija a ortografia no próprio arquivo PowerPoint PPTX anexo, mantendo todo o resto igual.');
  await p.click('#enviar');
  await p.locator('.bolha-ia h3').filter({ hasText: 'O que foi feito' }).waitFor();
  assert.equal(await p.locator('.arquivo-montando').isVisible(), true);
  const texto = await p.locator('.bolha-ia').last().innerText();
  assert.doesNotMatch(texto, /pronto para download|##|\*\*/);
  continuar();
  await p.getByText('O arquivo ajustado não foi gerado nesta resposta.', { exact: false }).waitFor();
  assert.equal(await p.locator('.arquivos-resposta').count(), 0, 'sem anexo genérico contendo o resumo');
  assert.equal(await p.locator('.arquivo-montando').count(), 0);
  assert.deepEqual(p.erros, []);
  await p.close();
});

test('conexão sem evento final: informa a interrupção e libera novo pedido', async () => {
  const p = await pagina();
  await p.route('**/api/conversas/*/mensagens', route => route.fulfill({
    status: 200, contentType: 'application/x-ndjson', body: '{"t":"texto","v":"O arquivo está pronto para download."}\n',
  }));
  await p.fill('#entrada', 'Gere um PowerPoint de teste'); await p.click('#enviar');
  await p.getByText('A conexão foi interrompida antes da confirmação de entrega.', { exact: false }).first().waitFor();
  assert.equal(await p.locator('.arquivo-montando').count(), 0);
  await p.fill('#entrada', 'Novo pedido');
  assert.equal(await p.locator('#enviar').isEnabled(), true);
  assert.deepEqual(p.erros, []);
  await p.close();
});
