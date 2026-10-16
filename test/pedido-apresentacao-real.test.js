// O pedido real que falhou em produção: PowerPoint + PDF de outra apresentação como referência de layout + contrato
// com CPF + proposta, com "o design/layout o mais próximo possível da apresentação X.pdf". Esperado: a apresentação
// é montada no layout do PDF (arquivo para baixar), o CPF não sai para a IA, e a resposta nunca promete um arquivo
// que não existe (se a montagem falhar, ela diz isso no fim, e o aviso vem depois da resposta).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { exec, todos } from '../src/db.js';
import { docx, pptx } from '../src/escritorio.js';
import { caminhoChromium } from '../src/visual/chromium.js';
import { pdfColorido } from './estilo-arquivo.test.js';

const semNavegador = !caminhoChromium();
const ADAPTA = 'Você adapta uma apresentação MODELO';
const PEDIDO = 'preciso que os seguintes ajustes sejam feitos no documento Apresentacao-Kickoff-Rafisa.pptx: 1) quero o design/layout o mais proximo possivel com a apresentacao Apresentacao-Kickoff-Repet.pdf 2) Evidências, documentos, dados, relatórios e sistemas, acho que fica muito amplo. Use a proposta e o contrato anexo como forma de enriquecer estes pontos. os capitulos, pulam do 7 pro 9. e nos dois ultimos, as divisórias tem o mesmo nome do slide seguinte, pra uma apresentação falada fica repetitivo.';
const CPF = '123.456.789-09';
let S, OR, ana, falharAdaptacao = false;
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const sis = typeof b.messages[0].content === 'string' ? b.messages[0].content : b.messages[0].content.map(p => p.text).join('');
    if (sis.startsWith(ADAPTA)) {
      if (falharAdaptacao) return 'sem json';
      const ids = [...b.messages[1].content.matchAll(/^(\d+\.\d+) \[/gm)].map(m => m[1]);
      return JSON.stringify(Object.fromEntries(ids.map(id => [id, `Kickoff Rafisa ${id}`])));
    }
    return 'Entendi: vou montar a apresentação da Rafisa no layout da Repet.\n\nO arquivo está pronto para download abaixo.\n\n## O que foi feito\n- Ajustes.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], acoesChat: { cpf: 'proteger' } });
  exec(S.app.db, 'update modelos set homologado = 0, homologacao = null, autorizacao_plataforma = null');   // como na empresa: sem recurso de sigilo
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });
const anexos = () => [
  { nome: 'Apresentacao-Kickoff-Rafisa.pptx', base64: pptx('# Kickoff Rafisa\n\nAgenda\n\n# 07 · Papéis\n\nTexto\n\n# 09 · Escopo\n\nTexto', { titulo: 'Rafisa' }).toString('base64') },
  { nome: 'Apresentacao-Kickoff-Repet.pdf', base64: pdfColorido().toString('base64') },
  { nome: 'Contrato_Rafisa_assinado.docx', base64: docx(`# Contrato\n\nContratante: Fulano de Tal, CPF ${CPF}.\n\nEscopo: diagnóstico com até seis visitas.`, { titulo: 'Contrato' }).toString('base64') },
];

test('pedido real: monta no layout do PDF (arquivo para baixar), sem CPF para a IA, sem conversa bloqueada', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const n = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO, anexos: anexos() });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const a = r.fim?.arquivos?.[0];
  assert.ok(a, `arquivo gerado: ${JSON.stringify(r.fim)}`);
  assert.equal(a.modelo, 'Apresentacao-Kickoff-Repet.pdf', 'no layout do PDF de referência');
  const d = await fetch(`${S.base}/api/conversas/${conv.id}/arquivos/${a.id}`, { headers: { cookie: ana.cookie } });
  assert.equal(d.status, 200);
  assert.ok(!JSON.stringify(OR.chamadas.slice(n)).includes('789-09'), 'o CPF não saiu para a IA');
});

test('arquivo não gerado: a resposta não promete arquivo, diz que não foi gerado, e o aviso vem depois dela', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  // Ajuste no próprio PowerPoint; a IA da edição não devolve operações (falha garantida).
  const r = await enviarMensagem(ana, conv.id, { texto: 'Corrija a ortografia no próprio arquivo anexo, mantendo todo o resto igual.', anexos: [anexos()[0]] });
  assert.equal(r.status, 200);
  assert.ok(!r.fim?.arquivos?.length, 'nenhum arquivo');
  const final = r.eventos.filter(e => e.t === 'substituir').at(-1)?.v;
  const msgs = todos(S.app.db, 'select papel, texto from mensagens where conversa_id = ? order by id', conv.id);
  const resp = msgs.filter(m => m.papel === 'assistant').at(-1).texto;
  assert.doesNotMatch(resp, /pronto para download/);
  assert.match(resp, /O arquivo não foi gerado nesta resposta\.\*\* Não foi possível aplicar as alterações/);
  assert.equal(final, resp, 'a tela recebe a versão corrigida');
  assert.ok(msgs.findLastIndex(m => m.papel === 'aviso') < msgs.findIndex(m => m.papel === 'assistant') || !msgs.some(m => m.papel === 'aviso' && /arquivo original/.test(m.texto)), 'o motivo vai na resposta, não num aviso solto acima dela');
});

test('mesmo pedido numa mensagem seguinte (PDF já guardado na conversa): também monta no layout do PDF', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'analise o material', anexos: anexos() });
  const r = await enviarMensagem(ana, conv.id, { texto: PEDIDO });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(r.fim?.arquivos?.[0]?.modelo, 'Apresentacao-Kickoff-Repet.pdf', JSON.stringify(r.fim));
});
