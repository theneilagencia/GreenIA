// Governança contextual no navegador: upload de PDF e PPTX com dados reais simulados numa área reforçada,
// conteúdo sensível, bloqueio, histórico após recarregar, "processar sem guardar", mensagens simples e a visão
// do admin. Quem usa escreve normalmente, sem limpar o texto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirComNavegador } from '../scripts/navegador.js';
import { cliente } from '../scripts/cliente.js';
import { salvarConfig } from '../src/config.js';
import { exec } from '../src/db.js';
import { POLITICA_SIGILO } from '../src/sigilo.js';
import { MSG_USUARIO } from '../src/avisos-governanca.js';
import { pdf, pptx } from '../test/arquivos.js';

const TECNICO = /open\s*router|anthropic|google\/|gemini|claude|haiku|mistral|llama/i;
let N, admin;
before(async () => {
  N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br' });
  salvarConfig(N.app.db, { dominios: ['empresa-exemplo.com.br'], [POLITICA_SIGILO]: true });
  exec(N.app.db, 'update modelos set homologado = 0, homologacao = null, autorizacao_plataforma = null');   // nenhum recurso autorizado para sigilo
  admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Comercial', sigilosa: true })).dados.id;   // proteção reforçada
  await admin.post('/api/admin/pessoas', { email: 'lia@empresa-exemplo.com.br', nome: 'Lia Prado', areas: [{ id: area }] });
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
  await p.waitForFunction(n => document.querySelectorAll('.rodape-resposta, .aviso-bolha').length > n, antes);
}
const textoVisivel = p => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('.bolha-ia:not(.aviso-bolha)').forEach(e => e.remove()); return c.innerText; });

test('uso real: PDF e PPTX com dados pessoais processam em área reforçada; histórico, bloqueios e retenção após recarregar', async () => {
  const p = await N.entrar('lia@empresa-exemplo.com.br');
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.waitForSelector('#entrada');
  // 1. PDF da reunião com nomes, cargos e emails corporativos; PPTX com CPF e email pessoal.
  const ata = { name: 'reuniao-comercial.pdf', mimeType: 'application/pdf', buffer: pdf(['Reuniao comercial com a Construtora Horizonte',
    'Carla Mendes, gerente de marketing (carla.mendes@empresa-exemplo.com.br): campanha ate 15/10',
    'Bruno Alves, diretor comercial: proposta ate 03/10', 'Decisao: lancamento online']) };
  await enviar(p, 'Analise esta transcrição e transforme-a em um plano de ação com decisões, tarefas, responsáveis e prazos. Não invente informações.', [ata]);
  const deck = { name: 'cadastro-cliente.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    buffer: pptx([['Cadastro do cliente', 'Maria Souza, CPF 529.982.247-25', 'maria.souza@hotmail.com, (11) 98765-4321']]) };
  await enviar(p, 'Resuma a apresentação.', [deck]);
  assert.equal(await p.locator('.rodape-resposta').count(), 2, 'as duas foram respondidas');
  assert.equal(await p.locator('.selo-sigilosa').count(), 0, 'dado pessoal não torna a conversa sigilosa');
  assert.doesNotMatch(await textoVisivel(p), /remova|retire|tire o dado|anonimi/i);
  // 2. Segredo: bloqueado, com mensagem simples.
  await enviar(p, 'O acesso do servidor é senha: Primavera2026');
  assert.match(await p.locator('.aviso-bolha').last().innerText(), /senhas, chaves de acesso e outros segredos nunca são enviados/);
  // 3. Conteúdo sensível sem recurso compatível: não é enviado; a mensagem é a da política, em linguagem simples.
  await enviar(p, 'Organize o laudo médico do colaborador por data.');
  assert.equal(await p.locator('.aviso-bolha').last().innerText(), MSG_USUARIO.sigilo);
  // 4. Recarregar: mensagens, anexos e respostas continuam; as tentativas bloqueadas aparecem sem o conteúdo.
  await p.reload();
  await p.waitForSelector('.bolha-eu');
  assert.equal(await p.locator('.bolha-eu').count(), 2);
  assert.deepEqual(await p.locator('.bolha-eu .anexo-chip').allInnerTexts().then(a => a.map(t => t.trim())), ['reuniao-comercial.pdf', 'cadastro-cliente.pptx']);
  assert.equal(await p.locator('.rodape-resposta').count(), 2);
  const depois = await textoVisivel(p);
  assert.match(depois, /Uma mensagem não foi enviada/);
  assert.doesNotMatch(depois, /Primavera2026|laudo médico/, 'o conteúdo bloqueado não foi guardado');
  assert.equal(await p.locator('.selo-sigilosa').count(), 0, 'bloqueio não torna a conversa sigilosa');
  assert.doesNotMatch(depois, TECNICO, 'nenhum provedor ou modelo para quem usa');
  // 5. Retenção: a empresa não guarda CPF. Processa e responde; depois de recarregar, o conteúdo não está lá.
  assert.equal((await admin.put('/api/admin/config', { naoArmazenar: ['cpf'] })).status, 200);
  await p.goto(`${N.base}/app#/nova`);
  // Troca de hash na mesma página: espera a conversa nova substituir a anterior antes de contar as respostas.
  await p.waitForFunction(() => document.querySelector('#entrada') && !document.querySelector('.bolha-eu, .rodape-resposta, .aviso-bolha'));
  await enviar(p, 'Monte a ficha do cliente Maria Souza, CPF 529.982.247-25.');
  assert.equal(await p.locator('.rodape-resposta').count(), 1, 'processou e respondeu');
  await p.reload();
  await p.waitForSelector('.bolha-eu');
  const semGuardar = await p.evaluate(() => document.body.innerText);
  assert.doesNotMatch(semGuardar, /Maria Souza|529\.982/, 'o conteúdo não ficou no histórico');
  assert.match(semGuardar, /não ficam guardados no histórico/);
  await admin.put('/api/admin/config', { naoArmazenar: [] });
  assert.deepEqual(erros, []);
});

test('admin da empresa: vê o que cada recurso pode receber, sem o provedor; as políticas oferecem as três ações e a retenção', async () => {
  const p = await N.entrar('admin@empresa-exemplo.com.br');
  await p.goto(`${N.base}/app#/modelos`);
  await p.waitForSelector('text=Pode receber:');
  const modelos = await p.evaluate(() => document.body.innerText);
  assert.match(modelos, /Pode receber: conteúdo comum, dados pessoais/);
  assert.doesNotMatch(modelos, /open\s*router/i);
  await p.goto(`${N.base}/app#/politicas`);
  await p.waitForSelector('#form-dados');
  const pol = await p.locator('#form-dados').innerText();
  for (const t of ['Processar normalmente', 'Só com proteção', 'Não enviar', 'Guardar no histórico', 'Dado pessoal restrito']) assert.match(pol, new RegExp(t));
});
