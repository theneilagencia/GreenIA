// Processar protegendo (visto em produção: contrato com CPF anexado, a conversa virou sigilosa e, sem recurso
// autorizado para dado sigiloso, o pedido inteiro foi bloqueado). Agora os dados pessoais mascaráveis saem como
// marcadores e voltam só na resposta; nada sai sem mascarar; com recurso autorizado, vale a rota sigilosa de antes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { docx } from './arquivos.js';
import { salvarConfig } from '../src/config.js';
import { exec, todos, um } from '../src/db.js';
import { iaMascarada, Mascara } from '../src/mascaramento.js';
import { POLITICA_SIGILO } from '../src/sigilo.js';

const CPF = '123.456.789-09', CONTA = 'conta corrente 12345-6';
const texto = c => (typeof c === 'string' ? c : (c || []).map(p => p.text || '').join('\n'));

test('mascarar e restaurar: valor igual vira o mesmo marcador; datas e valores ficam', () => {
  const m = new Mascara();
  const t = `CPF ${CPF}; de novo ${CPF}; tel (11) 98765-4321; R$ 96.000,00 em 01/10/2026; CNPJ 12.345.678/0001-95.`;
  const x = m.mascarar(t);
  assert.equal(x, 'CPF [CPF_1]; de novo [CPF_1]; tel [TELEFONE_1]; R$ 96.000,00 em 01/10/2026; CNPJ [CNPJ_1].');
  assert.equal(m.restaurar(x), t);
  assert.equal(m.restaurar('marcador inventado [CPF_9] fica'), 'marcador inventado [CPF_9] fica');
});

test('IA mascarada: o que sai vai mascarado, o que volta é restaurado (mesmo com o marcador partido entre pedaços)', async () => {
  const enviados = [];
  const falsa = { async *enviar(msgs) { enviados.push(msgs); yield { tipo: 'texto', texto: 'O CPF é [CP' }; yield { tipo: 'texto', texto: 'F_1] e está ok.' }; yield { tipo: 'fim', custo: 0 }; } };
  const m = new Mascara(), ia = iaMascarada(falsa, m, ['cpf']);
  let out = '';
  for await (const ev of ia.enviar([{ role: 'system', content: 'x' }, { role: 'user', content: [{ type: 'text', text: `Contrato de Fulano, CPF ${CPF}.` }] }])) if (ev.tipo === 'texto') out += ev.texto;
  assert.equal(out, `O CPF é ${CPF} e está ok.`);
  assert.ok(!JSON.stringify(enviados).includes('789-09'));
});

let S, OR, ana;
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const u = b.messages.map(m => texto(m.content)).join('\n');
    const marc = /\[CPF_\d+\]/.exec(u)?.[0];
    return marc ? `Entendi. O contrato é do titular ${marc}.\n\n## O que foi feito\n- Revisado.` : 'Resposta.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], acoesChat: { cpf: 'proteger', banco: 'proteger' } });
  await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });
const semRecursoSigilo = () => exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, autorizacao_plataforma = null');
const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;

test('sem recurso autorizado para sigilo: processa com os dados mascarados; a resposta traz o valor real; a conversa segue mascarada', async () => {
  semRecursoSigilo();
  const conv = await nova(), n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Revise o contrato anexo e diga de quem é.', anexos: [{ nome: 'contrato.docx', base64: docx([`Contratante: Fulano de Tal, CPF ${CPF}, ${CONTA}.`, 'Valor: R$ 96.000,00.']).toString('base64') }] });
  assert.equal(r.status, 200, JSON.stringify(r.erro || r.falha));
  assert.ok(r.fim, 'respondeu (não bloqueou)');
  const saiu = JSON.stringify(OR.chamadas.slice(n));
  assert.ok(!saiu.includes('789-09') && !saiu.includes('12345-6'), 'nenhum CPF ou conta saiu para a IA');
  assert.match(saiu, /\[CPF_1\]/);
  assert.match(r.texto, new RegExp(`titular ${CPF.replace(/\./g, '\\.')}`), 'a resposta na tela traz o valor real');
  const c = um(S.app.db, 'select sigilosa, mascarada from conversas where id = ?', conv.id);
  assert.deepEqual([c.sigilosa, c.mascarada], [0, 1]);
  const avisos = todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'aviso'", conv.id).map(m => m.texto);
  assert.ok(avisos.some(t => /troca esses dados por marcadores/.test(t)), JSON.stringify(avisos));
  assert.match(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant' order by id desc", conv.id).texto, /123\.456\.789-09/);
  // Mensagem seguinte, sem CPF: o histórico (com o CPF) também sai mascarado.
  const n2 = OR.chamadas.length;
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Resuma em uma frase.' });
  assert.equal(r2.status, 200);
  assert.ok(!JSON.stringify(OR.chamadas.slice(n2)).includes('789-09'), 'o histórico não vaza');
  assert.ok(todos(S.app.db, "select 1 from eventos where tipo = 'policy.masked'").length >= 2);
});

test('dado que não dá para mascarar (documento confidencial) continua exigindo o recurso autorizado; com recurso, a rota sigilosa de antes', async () => {
  semRecursoSigilo();
  const conv = await nova(), n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'DOCUMENTO CONFIDENCIAL. Resuma o plano de aquisição.' });
  assert.ok(r.erro || r.falha, 'bloqueado');
  assert.equal(OR.chamadas.length, n, 'nada saiu');
  // Com recurso autorizado: conversa sigilosa e rota fixa, sem mascarar.
  salvarConfig(S.app.db, { [POLITICA_SIGILO]: true });
  exec(S.app.db, "update modelos set liberado = 1, homologado = 1, homologacao = ? where id = 'anthropic/claude-haiku-4.5'", JSON.stringify({ fornecedor: 'anthropic', endpoint: 'anthropic', retencaoZero: true, semTreino: true }));
  const conv2 = await nova();
  const r2 = await enviarMensagem(ana, conv2.id, { texto: `Confira o CPF ${CPF} do contrato.` });
  assert.equal(r2.status, 200);
  const c = um(S.app.db, 'select sigilosa, mascarada from conversas where id = ?', conv2.id);
  assert.deepEqual([c.sigilosa, c.mascarada], [1, 0]);
});
