// Áreas, pessoas, papéis e bases de conhecimento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { arquivo, docx, pdf, png, xlsx } from './arquivos.js';

const enc = encodeURIComponent;
let S, OR, admin, ana, bia, carlos, A, B;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Alfa' })).dados;
  B = (await admin.post('/api/admin/areas', { nome: 'Área Beta' })).dados;
  const criar = async (email, nome, areas) => (await admin.post('/api/admin/pessoas', { email, nome, areas })).dados.id;
  await criar('ana@exemplo.com.br', 'Ana Lima', [{ id: A.id, responsavel: true }]);
  await criar('bia@exemplo.com.br', 'Bia Souza', [{ id: B.id }]);
  await criar('carlos@exemplo.com.br', 'Carlos Dias', [{ id: A.id }]);
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
  await admin.put(`/api/admin/modelos/${enc('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  await admin.post(`/api/admin/modelos/${enc('mistralai/mistral-small')}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida no OpenRouter.' });
});
after(async () => { await S.fechar(); await OR.fechar(); });

const perguntar = async (c, texto) => {
  const conv = (await c.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(c, conv.id, { texto });
  return { ...r, conv, sistema: JSON.stringify(OR.chamadas.at(-1)?.messages[0].content) };
};

test('admin cria áreas e pessoas; domínio fora da lista é recusado; o último admin não sai', async () => {
  assert.equal((await admin.post('/api/admin/pessoas', { email: 'x@outro.com' })).status, 400);
  assert.equal((await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br' })).status, 409);
  assert.equal((await ana.post('/api/admin/areas', { nome: 'Outra' })).status, 403);
  const eu = admin.pessoa.id;
  assert.equal((await admin.put(`/api/admin/pessoas/${eu}`, { papel: 'usuario' })).status, 409);
  const areas = (await ana.get('/api/areas')).dados.areas;
  assert.deepEqual(areas.map(a => [a.nome, a.responsavel]), [['Área Alfa', true]]);
});

test('só o responsável da área (ou o admin) envia documentos; só o admin, para a empresa toda', async () => {
  const doc = arquivo('procedimento.docx', docx(['Procedimento de reembolso: o prazo para pedir reembolso de despesas é de 30 dias.']));
  assert.equal((await carlos.post('/api/bases/documentos', { area_id: A.id, arquivo: doc })).status, 403);
  assert.equal((await ana.post('/api/bases/documentos', { area_id: B.id, arquivo: doc })).status, 403);
  assert.equal((await ana.post('/api/bases/documentos', { toda_empresa: true, arquivo: doc })).status, 403);
  const r = await ana.post('/api/bases/documentos', { area_id: A.id, arquivo: doc, titulo: 'Reembolso de despesas' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.area, 'Área Alfa');
  const beta = arquivo('beta.pdf', pdf(['Regra interna da area Beta: inventario trimestral de ferramentas.']));
  assert.equal((await admin.post('/api/bases/documentos', { area_id: B.id, arquivo: beta, titulo: 'Inventário trimestral' })).status, 200);
  const empresa = arquivo('codigo.txt', Buffer.from('Código de conduta: o horário de atendimento é das 8h às 18h, de segunda a sexta.'));
  assert.equal((await admin.post('/api/bases/documentos', { toda_empresa: true, arquivo: empresa, titulo: 'Código de conduta' })).status, 200);
  // A lista de gestão mostra só as áreas de que a pessoa é responsável.
  assert.deepEqual((await ana.get('/api/bases/documentos')).dados.documentos.map(d => d.titulo), ['Reembolso de despesas']);
  assert.deepEqual((await carlos.get('/api/bases/documentos')).dados.documentos, []);
  assert.equal((await admin.get('/api/bases/documentos')).dados.documentos.length, 3);
});

test('formatos: PDF com texto, DOCX, XLSX, CSV, TXT e MD; imagem e PDF escaneado são recusados com orientação', async () => {
  const ok = [['tabela.xlsx', xlsx([['Produto', 'Prazo'], ['Caneta', 5]])], ['lista.csv', 'item;qtd\ncaneta;5'], ['nota.md', '# Nota\nTexto']];
  for (const [n, c] of ok) assert.equal((await ana.post('/api/bases/documentos', { area_id: A.id, arquivo: arquivo(n, c) })).status, 200, n);
  for (const [n, c] of [['foto.png', png()], ['escaneado.pdf', pdf([])]]) {
    const r = await ana.post('/api/bases/documentos', { area_id: A.id, arquivo: arquivo(n, c) });
    assert.equal(r.status, 415, n);
    assert.equal(r.dados.mensagem, 'Este arquivo parece ser uma imagem. Envie a versão em texto ou em PDF digital');
  }
  assert.equal((await ana.post('/api/bases/documentos', { area_id: A.id, arquivo: arquivo('app.exe', 'MZ\u0000\u0000') })).status, 415);
});

test('quem é da área vê o documento da área; quem não é, não vê; o da empresa toda aparece para todos', async () => {
  let r = await perguntar(carlos, 'Qual o prazo para pedir reembolso de despesas?');
  assert.ok(r.fim.fontes.includes('Reembolso de despesas'));
  assert.match(r.sistema, /30 dias/);
  r = await perguntar(bia, 'Qual o prazo para pedir reembolso de despesas?');
  assert.deepEqual(r.fim.fontes, []);
  assert.ok(!/30 dias/.test(r.sistema), 'nada da base de outra área vai para o modelo');
  r = await perguntar(bia, 'Qual o horário de atendimento?');
  assert.deepEqual(r.fim.fontes, ['Código de conduta']);
  r = await perguntar(carlos, 'Qual o horário de atendimento?');
  assert.deepEqual(r.fim.fontes, ['Código de conduta']);
  r = await perguntar(carlos, 'Como funciona o inventário trimestral de ferramentas?');
  assert.deepEqual(r.fim.fontes, []);
});

test('sem resposta na base, a instrução indica o responsável da área', async () => {
  const r = await perguntar(carlos, 'Qual a regra para férias coletivas?');
  assert.match(r.sistema, /indique quem procurar: Ana Lima \(ana@exemplo\.com\.br\)/);
});

test('substituir e remover documento: a busca acompanha', async () => {
  const d = (await ana.get('/api/bases/documentos')).dados.documentos.find(x => x.titulo === 'Reembolso de despesas');
  await ana.put(`/api/bases/documentos/${d.id}`, { arquivo: arquivo('procedimento.docx', docx(['Procedimento de reembolso: o prazo agora é de 45 dias.'])) });
  let r = await perguntar(carlos, 'Qual o prazo do reembolso?');
  assert.match(r.sistema, /45 dias/);
  assert.ok(!/30 dias/.test(r.sistema));
  assert.equal((await bia.del(`/api/bases/documentos/${d.id}`)).status, 404);
  assert.equal((await ana.del(`/api/bases/documentos/${d.id}`)).status, 200);
  r = await perguntar(carlos, 'Qual o prazo do reembolso?');
  assert.ok(!r.fim.fontes.includes('Reembolso de despesas'));
});

test('sigilosa por documento sigiloso da base: não vai a modelo não homologado; reenvia ao homologado; a chave trava', async () => {
  const doc = arquivo('metas.txt', Buffer.from('Metas comerciais sigilosas: crescer 40% na carteira de grandes contas.'));
  await ana.post('/api/bases/documentos', { area_id: A.id, arquivo: doc, titulo: 'Metas comerciais', sigiloso: true });
  const conv = (await carlos.post('/api/conversas', {})).dados.conversa;
  const n = OR.chamadas.length;
  // A classe pedida resolve direto para um homologado: nenhuma chamada vai a modelo não homologado.
  const ok = await enviarMensagem(carlos, conv.id, { texto: 'Quais são as metas comerciais para grandes contas?' });
  assert.equal(ok.status, 200);
  assert.equal(OR.chamadas.length, n + 1);
  assert.equal(OR.chamadas.at(-1).provider.zdr, true);
  assert.equal(OR.chamadas.at(-1).provider.allow_fallbacks, false);
  assert.equal((await carlos.patch(`/api/conversas/${conv.id}`, { sigilosa: false })).status, 409);
  assert.equal(JSON.parse(um(S.app.db, "select detalhes from eventos where tipo = 'conversation.confidential' order by id desc limit 1").detalhes).motivo, 'documento');
});
