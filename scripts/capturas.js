// Capturas de tela para revisão: sobe a GreenIA com a IA simulada, monta uma
// empresa fictícia pela API e fotografa as telas principais.
//   node scripts/capturas.js [pasta]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { subirComNavegador } from './navegador.js';
import { cliente } from './cliente.js';
import { salvarConfig } from '../src/config.js';
import { docx } from '../test/arquivos.js';

const PASTA = process.argv[2] || 'capturas';
mkdirSync(PASTA, { recursive: true });
const N = await subirComNavegador({ adminEmail: 'admin@empresa-exemplo.com.br', largura: 1360, altura: 860 });
salvarConfig(N.app.db, { empresa: 'Empresa Exemplo', dominios: ['empresa-exemplo.com.br'] });
const b64 = b => Buffer.from(b).toString('base64');

const admin = await cliente(N.app, N.base).entrar('admin@empresa-exemplo.com.br');
const areas = {};
for (const nome of ['Atendimento', 'Operações', 'Qualidade']) areas[nome] = (await admin.post('/api/admin/areas', { nome })).dados.id;
await admin.post('/api/admin/pessoas', { email: 'marina@empresa-exemplo.com.br', nome: 'Marina Costa', areas: [{ id: areas['Operações'], responsavel: true }] });
await admin.post('/api/admin/pessoas', { email: 'rafael@empresa-exemplo.com.br', nome: 'Rafael Nunes', areas: [{ id: areas['Operações'] }, { id: areas['Atendimento'] }] });
await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
await admin.post(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Fornecedor com retenção zero, conferido no OpenRouter.' });
N.app.db.prepare("update modelos set nome = 'Mistral Small', preco_entrada = 0.0000001, preco_saida = 0.0000003 where id = 'mistralai/mistral-small'").run();

const marina = await cliente(N.app, N.base).entrar('marina@empresa-exemplo.com.br');
await marina.post('/api/bases/documentos', { area_id: areas['Operações'], titulo: 'Procedimento de recebimento', arquivo: { nome: 'recebimento.docx', base64: b64(docx(['Todo pedido recebido deve ser conferido contra a nota em até 2 dias úteis.'])) } });
const modelos = (await marina.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
const qw = (await marina.post('/api/quick-wins', { modelo_inicial: modelos.findIndex(m => m.nome === 'Conferir dois documentos'), areas: [areas['Operações']] })).dados;
await marina.put(`/api/quick-wins/${qw.id}`, { nome: 'Conferência de pedido × nota', para_que_serve: 'Compara o pedido com a nota recebida e lista as diferenças de item, quantidade e preço.',
  sugestoes: ['Confira estes dois documentos e liste as diferenças', 'Os valores dos dois documentos batem?', 'Escreva uma mensagem ao fornecedor sobre as diferenças'] });
await marina.post(`/api/quick-wins/${qw.id}/arquivos`, { arquivo: { nome: 'regras-de-conferencia.docx', base64: b64(docx(['Diferença de preço acima de 2% é relevante.', 'Item faltando sempre é relevante.'])) } });
await marina.put(`/api/quick-wins/${qw.id}`, { status: 'ativo' });
const outro = (await marina.post('/api/quick-wins', { modelo_inicial: modelos.findIndex(m => m.nome === 'Organizar lista de pendências'), areas: [areas['Operações']] })).dados;
await marina.put(`/api/quick-wins/${outro.id}`, { status: 'ativo' });

// Rafael: conversas antigas no quick win, para a lista de retomada.
await admin.post('/api/admin/grupos', { nome: 'Gestores' });
const rafael = await cliente(N.app, N.base).entrar('rafael@empresa-exemplo.com.br');
for (const [titulo, fb] of [['Pedido 4471 da papelaria', 'serviu'], ['Nota de insumos de agosto', 'ajustes']]) {
  const c = (await rafael.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  await rafael.req('POST', `/api/conversas/${c.id}/mensagens`, { texto: 'Confira estes dois documentos e liste as diferenças' });
  await rafael.patch(`/api/conversas/${c.id}`, { titulo, feedback: fb });
}

const p = await N.entrar('rafael@empresa-exemplo.com.br');
// 1. Chat
await p.waitForSelector('#entrada');
await p.fill('#entrada', 'Resuma em 3 linhas as regras de recebimento de pedidos');
await p.keyboard.press('Enter');
await p.waitForSelector('.rodape-resposta');
await p.waitForTimeout(400);
await p.screenshot({ path: join(PASTA, '1-chat.png') });
// 2. Conversa dentro do quick win, com anexo e pedido de ajuste
await p.goto(`${N.base}/app#/qw/${qw.id}/nova`);
await p.waitForSelector('#entrada');
const arq = join(PASTA, 'pedido-exemplo.docx');
writeFileSync(arq, docx(['Pedido 4502: 10 caixas de papel A4 a R$ 25,00; 5 toners a R$ 180,00.']));
await p.setInputFiles('#arquivo', arq);
await p.fill('#entrada', 'Confira estes dois documentos e liste as diferenças em uma tabela');
await p.keyboard.press('Enter');
await p.waitForSelector('.rodape-resposta');
await p.fill('#entrada', 'Tire a coluna de valor');
await p.keyboard.press('Enter');
await p.waitForFunction(() => document.querySelectorAll('.rodape-resposta').length >= 2);
await p.waitForTimeout(400);
await p.screenshot({ path: join(PASTA, '3-conversa-com-ajuste.png') });
// 3. Página do quick win com as conversas retomáveis
await p.goto(`${N.base}/app#/qw/${qw.id}`);
await p.waitForSelector('.lista-item');
await p.waitForTimeout(300);
await p.screenshot({ path: join(PASTA, '4-conversas-retomaveis.png') });
// 4. Configuração do quick win (responsável)
const pm = await N.contexto.newPage();
await N.entrar('marina@empresa-exemplo.com.br', pm);
await pm.goto(`${N.base}/app#/qw/${qw.id}/editar`);
await pm.waitForSelector('#form-qw');
await pm.waitForTimeout(300);
await pm.evaluate(() => { document.querySelector('.app').style.height = 'auto'; document.querySelector('.pagina').style.overflow = 'visible'; [...document.querySelectorAll('#form-qw .linha-botoes')].at(-1).style.position = 'static'; });
await pm.screenshot({ path: join(PASTA, '2-configuracao-quick-win.png'), fullPage: true });
// 5. Celular (360 px): chat
const cel = await N.navegador.newContext({ viewport: { width: 360, height: 740 } });
await cel.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const pc = await N.entrar('rafael@empresa-exemplo.com.br', await cel.newPage());
await pc.goto(`${N.base}/app#/qw/${qw.id}/nova`);
await pc.waitForSelector('#entrada');
await pc.screenshot({ path: join(PASTA, '5-celular-360.png') });
// 6. Painel do admin, uma captura por aba (página inteira).
const ctxAdmin = await N.navegador.newContext({ viewport: { width: 1360, height: 860 } });
await ctxAdmin.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const pa = await N.entrar('admin@empresa-exemplo.com.br', await ctxAdmin.newPage());
for (const [i, aba] of ['areas', 'grupos', 'bases', 'quickwins', 'modelos', 'politica', 'uso', 'eventos', 'config'].entries()) {
  await pa.goto(`${N.base}/admin#/${aba}`);
  await pa.waitForFunction(() => !document.getElementById('conteudo').textContent.startsWith('Carregando'));
  await pa.waitForTimeout(250);
  await pa.screenshot({ path: join(PASTA, `6-painel-${i + 1}-${aba}.png`), fullPage: true });
}
console.log(`capturas em ${PASTA}/`);
await N.fechar();
