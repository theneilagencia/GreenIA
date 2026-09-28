// Auditoria final no navegador: imagem e PDF escaneado enviados pelo botão de anexo são lidos (OCR) e
// processados como qualquer arquivo; segredo numa imagem é bloqueado; imagem sem texto recebe a mensagem técnica
// de leitura; com "guardar = não", depois de recarregar, nada do conteúdo aparece; a Administração continua
// separada e o provedor de IA não aparece para a empresa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { MSG_SEM_TEXTO } from '../src/ocr.js';
import { imagem, pdfEscaneado, jpegDe } from '../test/arquivos.js';

const TECNICO = /open\s*router|anthropic|google\/|gemini|claude|haiku|mistral|llama/i;
let N, admin;
before(async () => {
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br' });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'] });
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado' });
});
after(() => N.fechar());

async function enviar(p, texto, arquivos = []) {
  const antes = await p.locator('.rodape-resposta, .aviso-bolha').count();
  if (arquivos.length) {
    await p.setInputFiles('#arquivo', arquivos);
    await p.waitForFunction(n => document.querySelectorAll('#anexos .anexo-chip').length === n, arquivos.length);
  }
  await p.fill('#entrada', texto);
  await p.keyboard.press('Enter');
  await p.waitForFunction(n => document.querySelectorAll('.rodape-resposta, .aviso-bolha').length > n, antes, { timeout: 30000 });
}
const png = (name, nome) => ({ name, mimeType: 'image/png', buffer: imagem(nome) });

test('imagem e PDF escaneado pelo anexo: lidos e processados; segredo em imagem bloqueado; sem texto, aviso técnico; guardar = não', async () => {
  const p = await N.entrar('lia@empresa-exemplo.com.br');
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.waitForSelector('#entrada');
  assert.match(await p.getAttribute('#arquivo', 'accept'), /\.png.*\.jpg/, 'o seletor de arquivo aceita imagem');
  // 1. Foto da ata e PDF escaneado: processados, sem pedir para limpar nada.
  await enviar(p, 'Analise esta reunião e monte um plano de ação.', [png('ata.png', 'reuniao.png')]);
  await enviar(p, 'Resuma o cadastro.', [{ name: 'cadastro.pdf', mimeType: 'application/pdf', buffer: pdfEscaneado([jpegDe('cadastro.jpg')]) }]);
  assert.equal(await p.locator('.rodape-resposta').count(), 2, 'as duas foram respondidas');
  // 2. Segredo numa imagem: a mesma regra do texto digitado.
  await enviar(p, 'Veja o anexo.', [png('acesso.png', 'segredo.png')]);
  assert.match(await p.locator('.aviso-bolha').last().innerText(), /senhas, chaves de acesso e outros segredos nunca são enviados/);
  // 3. Imagem sem texto: limite técnico de leitura, sem falar em política ou segurança.
  await p.fill('#entrada', '');
  while (await p.locator('#anexos [data-tirar]').count()) await p.locator('#anexos [data-tirar]').first().click();   // o bloqueio devolve o anexo ao campo
  await enviar(p, 'Veja o anexo.', [png('foto.png', 'sem-texto.png')]);
  const tecnico = await p.locator('.aviso-bolha').last().innerText();
  assert.equal(tecnico, MSG_SEM_TEXTO);
  // 4. Recarregar: o que foi processado continua (guardar = sim); o segredo não.
  await p.reload();
  await p.waitForSelector('.bolha-eu');
  const depois = await p.evaluate(() => document.body.innerText);
  assert.deepEqual(await p.locator('.bolha-eu .anexo-chip').allInnerTexts().then(a => a.map(t => t.trim())), ['ata.png', 'cadastro.pdf']);
  assert.doesNotMatch(depois, /Primavera2026/);
  assert.doesNotMatch(depois, TECNICO);
  // 5. Guardar = não para CPF: a imagem do cadastro é processada e, depois de recarregar, não está lá.
  assert.equal((await admin.put('/api/admin/config', { naoArmazenar: ['cpf'] })).status, 200);
  await p.goto(`${N.base}/app#/nova`);
  await p.waitForSelector('#entrada');
  await enviar(p, 'Monte a ficha do cliente do anexo.', [png('ficha.png', 'cadastro.png')]);
  assert.equal(await p.locator('.rodape-resposta').count(), 1, 'processou e respondeu');
  await p.reload();
  await p.waitForSelector('.bolha-eu');
  const semGuardar = await p.evaluate(() => document.body.innerText);
  assert.doesNotMatch(semGuardar, /Maria Souza|529\.982|ficha\.png|Monte a ficha/, 'nem conteúdo, nem anexo, nem título');
  assert.match(semGuardar, /não ficam guardados no histórico/);
  await admin.put('/api/admin/config', { naoArmazenar: [] });
  assert.deepEqual(erros, []);
});

test('admin: a Administração mostra os recursos sem o provedor; a tela de uso não mostra detalhe técnico', async () => {
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.waitForSelector('#entrada');
  assert.doesNotMatch(await p.evaluate(() => document.body.innerText), TECNICO, 'tela de uso');
  await p.goto(`${N.base}/app#/modelos`);
  await p.waitForSelector('text=Pode receber:');
  assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /open\s*router/i, 'Administração');
  await p.goto(`${N.base}/app#/conhecimento`);
  await p.waitForSelector('#doc-arquivo', { state: 'attached' });
  assert.match(await p.evaluate(() => document.body.innerText), /Imagem e PDF escaneado são lidos por OCR/);
});
