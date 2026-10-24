// E2E das operações de código pelo navegador (instalação única: o admin tem as permissões). Pedir para rodar os
// testes faz a tela executar o projeto na área isolada (iframe em sandbox) e a saída real aparece na conversa; o
// botão "Rodar os testes" repete; "Publicar site" gera o endereço público, que abre isolado e sai do ar ao despublicar.
// O Python precisa do Pyodide (internet), cortada aqui: o caminho do navegador é o mesmo, com JavaScript.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { salvarConfig } from '../src/config.js';
import { openRouterFalso } from '../test/openrouter-falso.js';
import { todos } from '../src/db.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
const PROJETO = 'Entendi: função soma com testes.\n\n### Arquivo: soma.js\n```js\nexport const soma = (a, b) => a + b;\n```\n\n### Arquivo: soma.test.js\n```js\nimport test from "node:test";\nimport assert from "node:assert/strict";\nimport { soma } from "./soma.js";\ntest("soma 2 + 3", () => assert.equal(soma(2, 3), 5));\n```\n\n## O que foi feito\n- Função e teste.';
const SITE = 'Entendi: site.\n\n```html\n<!DOCTYPE html>\n<html><body><h1 id="t">Consultoria</h1><script>document.getElementById("t").textContent += " ok";</script></body></html>\n```\n\n## O que foi feito\n- Site.';
let N, OR;
before(async () => {
  OR = await openRouterFalso({ responder: b => /site/i.test(texto(b.messages.at(-1).content)) ? SITE : PROJETO });
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', ia: OR.ia });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], empresa: 'Empresa Exemplo' });
});
after(async () => { await N.fechar(); await OR.fechar(); });

async function enviar(p, msg) {
  await p.fill('#entrada', msg);
  await p.click('#enviar');
  await p.waitForFunction(() => !document.querySelector('.cursor') && document.querySelector('#ao-vivo')?.textContent.includes('pronta'), null, { timeout: 30000 });
}

test('rodar os testes: a área isolada executa e a saída real aparece na conversa; o botão repete', async () => {
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
  await enviar(p, 'Crie uma função soma em JavaScript com testes e rode os testes.');
  const saida = p.locator('.linha-aviso.execucao-saida').last();
  await saida.waitFor({ timeout: 30000 });
  assert.match(await saida.innerText(), /Execução dos testes \(JavaScript\) concluída[\s\S]*✔ soma 2 \+ 3[\s\S]*1 passaram, 0 falharam/);
  const ex = todos(N.app.db, 'select status, modo, linguagem from execucoes_codigo');
  assert.deepEqual(ex.map(e => [e.status, e.modo, e.linguagem]), [['ok', 'testes', 'javascript']]);
  // O botão do cartão roda de novo.
  await p.getByRole('button', { name: 'Rodar os testes' }).first().click();
  await p.waitForFunction(() => document.querySelectorAll('.linha-aviso.execucao-saida').length >= 2, null, { timeout: 30000 });
  assert.equal(todos(N.app.db, 'select 1 from execucoes_codigo').length, 2);
  await p.close();
});

test('publicar site pelo botão: endereço público isolado (o script do site roda, sem acesso à GreenIA); despublicar tira do ar', async () => {
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/nova`); await p.waitForSelector('#entrada');
  await enviar(p, 'Crie um site institucional completo, com prévia e arquivos do projeto.');
  await p.getByRole('button', { name: 'Publicar site' }).click();
  await p.locator('.selo-publicado').waitFor();
  const token = todos(N.app.db, 'select token from sites_publicados where removido_em is null')[0].token;
  const v = await N.contexto.newPage();
  const r = await v.goto(`${N.base}/s/${token}`);
  assert.equal(r.status(), 200);
  assert.match(r.headers()['content-security-policy'], /^sandbox allow-scripts/);
  assert.equal(await v.locator('#t').innerText(), 'Consultoria ok', 'o script do próprio site roda');
  assert.equal(await v.evaluate(() => { try { return document.cookie; } catch { return 'bloqueado'; } }), 'bloqueado', 'origem opaca: nada dos cookies da GreenIA');
  await p.getByRole('button', { name: 'Despublicar' }).click();
  await p.getByRole('button', { name: 'Publicar site' }).waitFor();
  assert.equal((await v.goto(`${N.base}/s/${token}`)).status(), 404);
  await v.close(); await p.close();
});
