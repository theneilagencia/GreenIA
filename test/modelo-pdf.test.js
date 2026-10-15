// Apresentação em PDF usada como modelo: leitura (fundo sem texto, blocos com fonte, tamanho e cor), PowerPoint no
// mesmo layout com texto editável, adaptação do texto pela IA (mesma rota da conversa) e o fluxo na conversa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um, todos } from '../src/db.js';
import { agrupar, lerModeloPdf, mensagensAdaptacao, adaptarModelo, nomeDaFonte } from '../src/modelo-pdf.js';
import { pptxDeModelo } from '../src/escritorio.js';
import { caminhoChromium } from '../src/visual/chromium.js';
import { deszipar } from './zip-leitor.js';
import { pdfColorido } from './estilo-arquivo.test.js';

const semNavegador = !caminhoChromium() && 'sem Chromium neste ambiente';

test('blocos: palavras da mesma linha juntas, colunas separadas, rótulo espaçado volta a ser palavra, parágrafo em várias linhas', () => {
  const it = (s, x, y, w, extra = {}) => ({ s, x, y, w, tam: 20, fonte: 'AAAAAB+Manrope-Regular', cor: '#111112', ...extra });
  const b = agrupar([
    it('C O N T E X T O', 40, 50, 110, { fonte: 'CourierNewPSMT', cor: '#4F6B00' }),
    it('Preparar', 40, 200, 80), it(' ', 120, 200, 1), it('os', 126, 200, 20), it('Priorizar', 400, 200, 90),   // duas colunas na mesma altura
    it('Primeira linha do', 40, 300, 160), it('parágrafo continua aqui', 40, 324, 200),
  ], 4);
  assert.deepEqual(b.map(x => x.texto), ['CONTEXTO', 'Preparar os', 'Priorizar', 'Primeira linha do parágrafo continua aqui']);
  assert.equal(b[0].espacado, true); assert.equal(b[0].fonte, 'Courier New'); assert.equal(b[0].cor, '#4F6B00');
  assert.equal(b[3].linhas, 2); assert.equal(Math.round(b[3].entrelinha), 24);
  assert.equal(b[1].id, '4.2');
  assert.equal(nomeDaFonte('AAAAAD+InstrumentSerif-Regular'), 'Instrument Serif');
  assert.equal(nomeDaFonte('AAAAAL+Manrope-Bold'), 'Manrope');
});

test('PowerPoint do modelo: fundo por slide, caixas editáveis na posição, fonte e cor do original; texto trocado por id', () => {
  const paginas = [{ w: 960, h: 540, fundo: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), blocos: [
    { id: '1.1', texto: 'Kick-off Repet', linhas: 1, x: 92, y: 120, largura: 400, tam: 44, entrelinha: 52, fonte: 'Instrument Serif', negrito: false, cor: '#FFFFFF', espacado: false },
    { id: '1.2', texto: 'CONTEXTO', linhas: 1, x: 92, y: 60, largura: 100, tam: 9, entrelinha: 11, fonte: 'Courier New', negrito: false, cor: '#C6F24E', espacado: true }] }];
  const z = deszipar(pptxDeModelo(paginas, { textos: { '1.1': 'Kick-off Rafisa & <Iniflex>' } }));
  const s = z.get('ppt/slides/slide1.xml');
  assert.match(s, /<a:blip r:embed="rId2"\/>/);
  assert.ok(z.has('ppt/media/fundo1.jpg'));
  assert.match(z.get('ppt/slides/_rels/slide1.xml.rels'), /Target="\.\.\/media\/fundo1\.jpg"/);
  assert.match(s, /<a:t>Kick-off Rafisa &amp; &lt;Iniflex&gt;<\/a:t>/);
  assert.match(s, /sz="4400".*<a:srgbClr val="FFFFFF"\/><\/a:solidFill><a:latin typeface="Instrument Serif"\/>/);
  assert.match(s, /<a:t>CONTEXTO<\/a:t>/);
  assert.match(s, /spc="126"/);
  assert.match(s, /<a:off x="1168400" /);   // 92 pt
  assert.match(z.get('ppt/presentation.xml'), /<p:sldSz cx="12192000" cy="6858000"\/>/);
  assert.match(z.get('[Content_Types].xml'), /Extension="jpg" ContentType="image\/jpeg"/);
});

test('adaptação: pede todos os ids com limite de tamanho; resposta incompleta tenta de novo; o que falta fica listado', async () => {
  const paginas = [{ blocos: [{ id: '1.1', texto: 'Kick-off Repet' }, { id: '1.2', texto: 'Financeiro · RH/DP' }] }];
  const m = mensagensAdaptacao({ slides: [{ numero: 1, blocos: paginas[0].blocos }], contexto: 'Rafisa usa Iniflex.', pedido: 'faça a da Rafisa' });
  assert.match(m[0].content, /mantendo exatamente a estrutura/);
  assert.match(m[0].content, /\[a definir\]/);
  assert.match(m[1].content, /1\.1 \(máx\. 16\): Kick-off Repet/);
  assert.match(m[1].content, /<material>\nRafisa usa Iniflex\.\n<\/material>/);
  let n = 0;
  const r = await adaptarModelo({ paginas, contexto: '', pedido: '', chamar: async () => ({ texto: ++n === 1 ? 'não sei' : '```json\n{"1.1":"Kick-off Rafisa"}\n```', custo: 0.01 }) });
  assert.equal(n, 2);
  assert.deepEqual(r.textos, { '1.1': 'Kick-off Rafisa' });
  assert.deepEqual(r.faltando, ['1.2']);
  assert.equal(r.custo, 0.02);
});

test('leitura do PDF: fundo sem o texto e o texto com fonte, tamanho e cor do original', { skip: semNavegador }, async () => {
  const [p] = await lerModeloPdf(pdfColorido());
  assert.equal(Math.round(p.w), 792); assert.equal(Math.round(p.h), 612);
  assert.equal(p.fundo.subarray(0, 3).toString('hex'), 'ffd8ff');
  const b = p.blocos.find(x => x.texto === 'Kickoff do projeto');
  assert.ok(b, JSON.stringify(p.blocos));
  assert.equal(b.tam, 24); assert.equal(b.cor, '#000000'); assert.equal(b.fonte, 'Montserrat');
  assert.equal(Math.round(b.x), 40); assert.equal(Math.round(b.y), 612 - 300);
});

// ---------- na conversa ----------
let S, OR, ana, bia;
const ADAPTA = 'Você adapta uma apresentação MODELO';
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const sis = typeof b.messages[0].content === 'string' ? b.messages[0].content : b.messages[0].content.map(p => p.text).join('');
    if (sis.startsWith(ADAPTA)) {
      const ids = [...b.messages[1].content.matchAll(/^(\d+\.\d+) \(máx/gm)].map(m => m[1]);
      return JSON.stringify(Object.fromEntries(ids.map(id => [id, `Kickoff da Rafisa ${id}`])));
    }
    return null;
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('conversa: PDF enviado + "mesma estrutura e layout" -> PPTX no layout do modelo com o texto adaptado; só o dono baixa', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'analise o material', anexos: [{ nome: 'Apresentacao-Kickoff-Repet.pdf', base64: pdfColorido().toString('base64') }] });
  assert.equal(todos(S.app.db, 'select 1 from anexos_arquivos').length, 1, 'PDF guardado como modelo');
  const r = await enviarMensagem(ana, conv.id, { texto: 'Contexto: a Rafisa já usa o Iniflex. Quero uma versão pronta da apresentação da Rafisa, em PPTX, seguindo o exato mesmo layout e a mesma estrutura.' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const resposta = OR.chamadas.find(b => JSON.stringify(b.messages[0]).includes('layout exato de'));
  assert.ok(resposta, 'a resposta sabe que o arquivo é montado no layout');
  const adapt = OR.chamadas.find(b => JSON.stringify(b.messages[0]).includes(ADAPTA));
  assert.match(JSON.stringify(adapt.messages[1]), /Rafisa já usa o Iniflex/);
  assert.deepEqual(adapt.provider, resposta.provider, 'mesma rota de privacidade');
  const a = r.fim.arquivos?.[0];
  assert.ok(a, JSON.stringify(r.fim));
  assert.equal(a.slides, 1); assert.equal(a.modelo, 'Apresentacao-Kickoff-Repet.pdf'); assert.equal(a.sem_adaptacao, 0);
  assert.ok(r.eventos.some(e => e.t === 'etapa' && e.v === 'Lendo o layout do modelo…'));
  const d = await fetch(`${S.base}/api/conversas/${conv.id}/arquivos/${a.id}`, { headers: { cookie: ana.cookie } });
  assert.equal(d.status, 200);
  assert.match(d.headers.get('content-disposition'), /Apresentacao-Kickoff-Repet-adaptada\.pptx/);
  const z = deszipar(Buffer.from(await d.arrayBuffer()));
  assert.match(z.get('ppt/slides/slide1.xml'), /<a:t>Kickoff da Rafisa 1\.1<\/a:t>/);
  assert.match(z.get('ppt/slides/slide1.xml'), /typeface="Montserrat"/);
  assert.ok(z.has('ppt/media/fundo1.jpg'));
  assert.equal((await fetch(`${S.base}/api/conversas/${conv.id}/arquivos/${a.id}`, { headers: { cookie: bia.cookie } })).status, 404);
  const det = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.equal(det.mensagens.filter(m => m.papel === 'assistant').at(-1).arquivos[0].id, a.id);
  // Sem visual genérico: o pedido de modelo não aciona a produção visual nem a peça padrão.
  assert.equal(r.fim.artefatos, undefined);
  await ana.del(`/api/conversas/${conv.id}`);
  assert.equal(um(S.app.db, 'select count(*) n from arquivos_gerados').n, 0, 'sai com a conversa');
  assert.equal(um(S.app.db, 'select count(*) n from anexos_arquivos').n, 0, 'o modelo sai com a conversa');
});
