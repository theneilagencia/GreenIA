// Pendência B2/P1: nenhum conteúdo chega a um recurso de IA sem a política de credenciais, qualquer que seja a
// origem. Mesma regra (filtro.js, contemCredencial) para mensagem, anexo, OCR, documento e trecho da base de
// conhecimento, arquivo e instruções de quick win, histórico e o envio final. Uma parte com segredo bloqueia a
// chamada inteira: nada é enviado, nem o restante, nem por outro recurso, reserva ou nova tentativa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { arquivo, pdf, docx, pptx, xlsx, imagem, pdfEscaneado, jpegDe } from './arquivos.js';
import { salvarConfig } from '../src/config.js';
import { exec, um, todos } from '../src/db.js';
import { contemCredencial, detectar } from '../src/filtro.js';
import { LIMITES_OCR } from '../src/ocr.js';

const FOLGA = { ...LIMITES_OCR, memoriaMaxMb: 4000 };   // o processo de teste já ocupa bem mais que o servidor sozinho
const SEGREDO = /Primavera2026|sk-abcdef|ghp_abcdef|BEGIN PRIVATE KEY|abandon ability|Segredo123/;
let S, OR, admin, ana, areaId;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: { ...OR.ia, configurada: true, listarModelos: (...a) => OR.ia.listarModelos(...a) }, limitesOcr: FOLGA });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  areaId = Number(exec(S.app.db, "insert into areas (nome) values ('Operações')").lastInsertRowid);
  exec(S.app.db, 'insert into area_pessoas (area_id, pessoa_id) values (?, ?)', areaId, ana.pessoa.id);
});
after(async () => { await S.fechar(); await OR.fechar(); });

const nova = async (extra = {}, quem = ana) => (await quem.post('/api/conversas', extra)).dados.conversa;
async function enviar(texto, conv = null, extra = {}, quem = ana) {
  conv ??= await nova();
  const n = OR.chamadas.length, e = S.app.email.enviados.length;
  const r = await enviarMensagem(quem, conv.id, { texto, ...extra });
  const ev = um(S.app.db, "select detalhes from eventos where tipo = 'policy.blocked' and detalhes like ? order by id desc limit 1", `%"conversa":${conv.id},%`);
  return { r, conv, chamadas: OR.chamadas.length - n, bloqueio: ev ? JSON.parse(ev.detalhes) : null, emails: S.app.email.enviados.slice(e) };
}
const documento = async (nome, conteudo, extra = {}) => {
  const r = await admin.post('/api/bases/documentos', { toda_empresa: true, arquivo: arquivo(nome, conteudo), ...extra });
  assert.equal(r.status, 200, `${nome}: ${JSON.stringify(r.dados)}`);
  return um(S.app.db, 'select id from documentos order by id desc limit 1').id;
};
function bloqueado(x, origem, msg) {
  assert.equal(x.r.status, 422, `${msg}: ${JSON.stringify(x.r.erro || x.r.fim)}`);
  assert.equal(x.r.erro.erro, 'dado_bloqueado', msg);
  assert.match(x.r.erro.mensagem, /Por segurança, este envio foi bloqueado: há uma senha, chave de acesso ou outro segredo no pedido/, msg);
  assert.equal(x.chamadas, 0, `${msg}: nada foi enviado a nenhum recurso (nem reserva, nem nova tentativa)`);
  assert.ok(x.bloqueio?.origens.includes(origem), `${msg}: origem ${origem} em ${JSON.stringify(x.bloqueio)}`);
  assert.doesNotMatch(JSON.stringify(x.bloqueio), SEGREDO, `${msg}: o registro não guarda o segredo`);
  assert.doesNotMatch(JSON.stringify(x.r.erro), SEGREDO, `${msg}: a resposta não repete o segredo`);
}

// ------------------------------------------------------------------------------------ Regra única
test('uma regra só: contemCredencial é a mesma regra do tipo "credencial" usada em mensagens e anexos', () => {
  const casos = ['senha: Primavera2026', 'api_key=sk-abcdefghijklmnopqrstuvwxyz123456', 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----',
    'seed phrase: abandon ability able about above absent absorb abstract absurd abuse access accident',
    'https://admin:Segredo123@servidor.exemplo.com/db', 'Reunião de planejamento do trimestre', 'O token de acesso é emitido pelo RH'];
  for (const c of casos) assert.equal(contemCredencial(c), detectar(c).includes('credencial'), c);
});

// ------------------------------------------------------------------------------------ Base de conhecimento
test('base de conhecimento: o documento pode ser guardado, mas o trecho com segredo nunca entra no contexto, em qualquer formato (inclusive OCR)', async () => {
  const linha = 'senha: Primavera2026';
  const formatos = [
    ['atlas.pdf', pdf(['Atlas procedimento', linha]), 'Atlas'],
    ['boreal.docx', docx(['Boreal procedimento', linha]), 'Boreal'],
    ['cometa.pptx', pptx([['Cometa procedimento', linha]]), 'Cometa'],
    ['delta.xlsx', xlsx([['Delta procedimento'], [linha]]), 'Delta'],
    ['eco.txt', `Eco procedimento\n${linha}`, 'Eco'],
    ['fenix.md', `# Fenix procedimento\n${linha}`, 'Fenix'],
    ['gama.csv', `sistema;acesso\nGama procedimento;${linha}`, 'Gama'],
    ['hidra.png', imagem('segredo.png'), 'servidor'],   // "Acesso ao servidor / senha: Primavera2026", lido por OCR
    ['iris.pdf', pdfEscaneado([jpegDe('segredo.jpg')]), 'servidor'],   // PDF escaneado, lido por OCR
  ];
  for (const [nome, conteudo, chave] of formatos) {
    const id = await documento(nome, conteudo);   // guardar é permitido: a política trata do envio à IA
    const x = await enviar(`Explique ${chave}`);
    bloqueado(x, 'base', nome);
    assert.ok(x.bloqueio.documentos.includes(id), `${nome}: documento de origem registrado`);
    if (chave === 'servidor') exec(S.app.db, 'delete from documentos where id = ?', id), exec(S.app.db, 'delete from trechos where documento_id = ?', id);
  }
  // Admin avisado para corrigir a fonte (uma vez por dia por causa), sem o segredo no email.
  const aviso = S.app.email.enviados.filter(m => /documento ou quick win contém uma senha ou chave/.test(m.assunto));
  assert.ok(aviso.length >= 1, 'admin avisado');
  assert.doesNotMatch(JSON.stringify(aviso), SEGREDO);
  // Segredo no título: o título também vai para a IA.
  await documento('kappa.txt', 'Kappa procedimento de manutenção', { titulo: 'Kappa token: ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  bloqueado(await enviar('Explique Kappa'), 'base', 'título com segredo');
});

test('base de conhecimento: pergunta que não recupera o trecho com segredo processa normalmente', async () => {
  await documento('vega.txt', 'Vega procedimento: reinicie o serviço pelo painel e confira o registro.');
  const x = await enviar('Explique Vega');
  assert.equal(x.r.status, 200, JSON.stringify(x.r.erro));
  assert.equal(x.chamadas, 1);
  assert.match(JSON.stringify(OR.chamadas.at(-1).messages), /Vega procedimento/, 'o trecho entrou no contexto');
  assert.doesNotMatch(JSON.stringify(OR.chamadas.at(-1).messages), SEGREDO);
});

// ------------------------------------------------------------------------------------ Quick wins
test('quick win: arquivo, instruções e exemplos com segredo bloqueiam em uso e em teste; sem segredo, processa', async () => {
  const q = (await admin.post('/api/quick-wins', { nome: 'Chamados de TI', areas: [areaId] })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'em_uso', instrucoes: 'Classifique o chamado por urgência.' });
  const semSegredo = await enviar('Chamado: impressora do 2º andar parou.', await nova({ quick_win_id: q.id }));
  assert.equal(semSegredo.r.status, 200, JSON.stringify(semSegredo.r.erro));
  // Arquivo de referência com segredo (vai inteiro para o contexto).
  const r = await admin.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('acessos.txt', 'Acessos da equipe\napi_key=sk-abcdefghijklmnopqrstuvwxyz123456') });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  const arq = um(S.app.db, 'select id from documentos where quick_win_id = ?', q.id).id;
  const emUso = await enviar('Chamado: impressora do 2º andar parou.', await nova({ quick_win_id: q.id }));
  bloqueado(emUso, 'quick_win', 'arquivo do quick win');
  assert.deepEqual(emUso.bloqueio.documentos, [arq]);
  // Modo de teste: quem testa é quem gere o quick win.
  const convTeste = await nova({ quick_win_id: q.id, teste: true }, admin);
  assert.equal(convTeste.quick_win_id, q.id);
  assert.ok(convTeste.teste);
  const emTeste = await enviar('Chamado: monitor sem imagem.', convTeste, {}, admin);
  bloqueado(emTeste, 'quick_win', 'arquivo do quick win em teste');
  exec(S.app.db, 'delete from trechos where documento_id = ?', arq); exec(S.app.db, 'delete from documentos where id = ?', arq);
  // Instruções e exemplos com segredo.
  const put = await admin.put(`/api/quick-wins/${q.id}`, { instrucoes: 'Para consultar o sistema use token: ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  assert.equal(put.status, 200, JSON.stringify(put.dados));
  bloqueado(await enviar('Chamado: teclado com defeito.', await nova({ quick_win_id: q.id })), 'instrucoes', 'instruções do quick win');
  await admin.put(`/api/quick-wins/${q.id}`, { instrucoes: 'Classifique o chamado por urgência.', exemplo_entrada: 'Servidor fora: https://admin:Segredo123@servidor.exemplo.com/db', exemplo_saida: 'Urgente' });
  bloqueado(await enviar('Chamado: teclado com defeito.', await nova({ quick_win_id: q.id })), 'instrucoes', 'exemplo do quick win');
  await admin.put(`/api/quick-wins/${q.id}`, { exemplo_entrada: '', exemplo_saida: '' });
  assert.equal((await enviar('Chamado: teclado com defeito.', await nova({ quick_win_id: q.id }))).r.status, 200, 'corrigido, volta a processar');
});

// ------------------------------------------------------------------------------------ Histórico e contexto composto
test('histórico: um segredo guardado antes (ex.: conteúdo anterior à regra) bloqueia a nova chamada que o reenviaria', async () => {
  const conv = await nova();
  exec(S.app.db, "insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', ?, ?)", conv.id, 'Guarde: senha: Primavera2026', new Date().toISOString());
  const x = await enviar('Resuma a conversa.', conv);
  bloqueado(x, 'historico', 'histórico');
  assert.match(x.r.erro.mensagem, /Comece uma nova conversa/);
});

test('contexto composto: mensagem segura + base com segredo, e mensagem segura + quick win com segredo, são bloqueadas', async () => {
  await documento('lince.txt', 'Lince procedimento\nseed phrase: abandon ability able about above absent absorb abstract absurd abuse access accident');
  bloqueado(await enviar('Explique Lince, por favor. Obrigada!'), 'base', 'mensagem segura + base');
  const q = (await admin.post('/api/quick-wins', { nome: 'Relatórios', areas: [areaId] })).dados;
  await admin.put(`/api/quick-wins/${q.id}`, { status: 'em_uso', instrucoes: 'Resuma o relatório.' });
  await admin.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('chave.txt', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----') });
  bloqueado(await enviar('Resuma o relatório de vendas de setembro.', await nova({ quick_win_id: q.id })), 'quick_win', 'mensagem segura + quick win');
});

// ------------------------------------------------------------------------------------ Defesa final
test('defesa final: um caminho que montasse contexto sem passar pela conferência é barrado antes do envio, e nada fica gravado', async () => {
  const original = S.app.contexto;
  S.app.contexto = { ...original, montar: async () => ({ partes: ['Contexto extra: api_key=sk-abcdefghijklmnopqrstuvwxyz123456'], fontes: [], sigiloso: false, pecas: [] }) };
  try {
    const x = await enviar('Resuma o contexto.');
    bloqueado(x, 'envio_final', 'defesa final');
    assert.equal(um(S.app.db, "select count(*) n from mensagens where conversa_id = ? and papel = 'user'", x.conv.id).n, 0, 'a mensagem gravada foi desfeita');
    assert.equal(um(S.app.db, 'select resultado, motivo_bloqueio from roteamento where conversa_id = ? order by id desc limit 1', x.conv.id).motivo_bloqueio, 'credencial_na_conferencia_final');
    assert.match(JSON.stringify(todos(S.app.db, 'select texto from mensagens where conversa_id = ?', x.conv.id)), /Uma mensagem não foi enviada/);
  } finally { S.app.contexto = original; }
});
