import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as esperar } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { subir } from '../test/ajuda.js';
import { pptx } from '../src/escritorio.js';

let S, nav, admin, continuar, chamada = 0, bloquear = false, cancelado = false;
before(async () => {
  S = await subir({ ia: {
    async *enviar(msgs, op) {
      if (bloquear) {
        yield { tipo: 'texto', texto: 'Preparando o conteúdo solicitado…' };
        try { await esperar(60000, null, { signal: op.sinal }); } catch (e) { cancelado = op.sinal.aborted; throw e; }
      }
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


test('Interromper cancela no servidor e permite enviar o próximo pedido', async () => {
  bloquear = true; cancelado = false;
  const p = await pagina();
  await p.fill('#entrada', 'Explique o processo de compras'); await p.click('#enviar');
  await p.getByText('Preparando o conteúdo solicitado…').waitFor();
  await p.getByRole('button', { name: 'Interromper execução', exact: true }).click();
  await p.getByText('Execução interrompida por você.', { exact: false }).first().waitFor();
  assert.equal(cancelado, true);
  bloquear = false;
  await p.fill('#entrada', 'Agora resuma em uma frase');
  assert.equal(await p.getByRole('button', { name: 'Enviar', exact: true }).isEnabled(), true);
  await p.getByRole('button', { name: 'Enviar', exact: true }).click();
  await p.waitForFunction(() => document.querySelector('#enviar')?.getAttribute('aria-label') === 'Enviar');
  assert.deepEqual(p.erros, []);
  await p.close();
});

test('conversa reaberta em execução mantém Interromper disponível', async () => {
  bloquear = true; cancelado = false;
  const p = await pagina();
  await p.fill('#entrada', 'Explique o processo de atendimento'); await p.click('#enviar');
  await p.getByText('Preparando o conteúdo solicitado…').waitFor();
  await p.reload();
  await p.getByRole('button', { name: 'Interromper execução', exact: true }).waitFor();
  await p.getByRole('button', { name: 'Interromper execução', exact: true }).click();
  await p.getByText('Execução interrompida por você.', { exact: false }).first().waitFor();
  assert.equal(cancelado, true);
  bloquear = false;
  await p.fill('#entrada', 'Novo pedido');
  assert.equal(await p.getByRole('button', { name: 'Enviar', exact: true }).isEnabled(), true);
  assert.deepEqual(p.erros, []);
  await p.close();
});
