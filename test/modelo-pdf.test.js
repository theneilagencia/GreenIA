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

test('blocos em PDFs de origens diferentes: lista sem marcador de texto, marcador de símbolo, tabela, item com recuo, parágrafo que continua', () => {
  const it = (s, x, y, w, extra = {}) => ({ s, x, y, w, tam: 11, fonte: 'DejaVuSans', cor: '#222222', ...extra });
  // Lista cujo marcador é desenhado (não é texto): cada linha é um item, mesmo com o mesmo espaçamento de um parágrafo.
  const lista = agrupar([it('Sul: 38% da receita', 75, 160, 100), it('Sudeste: crescimento de 12% ao ano', 75, 174, 180), it('Nordeste: entrada em 2027', 75, 188, 130)]);
  assert.deepEqual(lista.map(b => b.texto), ['Sul: 38% da receita', 'Sudeste: crescimento de 12% ao ano', 'Nordeste: entrada em 2027']);
  // Marcador em fonte de símbolos (uso privado) vira "•"; a linha recuada de baixo continua o mesmo item.
  const itens = agrupar([it('', 89, 433, 5, { fonte: 'OpenSymbol' }), it(' Item longo com bastante texto para quebrar a', 95, 433, 290), it('linha e continuar embaixo.', 107, 447, 150),
    it('', 89, 462, 5, { fonte: 'OpenSymbol' }), it(' Segundo item', 95, 462, 80)]);
  assert.deepEqual(itens.map(b => b.texto), ['• Item longo com bastante texto para quebrar a linha e continuar embaixo.', '• Segundo item']);
  // Tabela: o espaço desenhado com a largura da célula não junta colunas; cada célula é um bloco, linha por linha.
  const tabela = agrupar([it('Compras', 75, 308, 45), it(' ', 120, 308, 46), it('R$ 1.234,56', 166, 308, 60), it('Financeiro', 75, 327, 55), it(' ', 130, 327, 36), it('R$ 980,00', 166, 327, 52)]);
  assert.deepEqual(tabela.map(b => b.texto), ['Compras', 'R$ 1.234,56', 'Financeiro', 'R$ 980,00']);
  // Parágrafo que quebrou sozinho (palavra de ligação no fim, nome próprio em maiúscula) continua um bloco só.
  const par = agrupar([it('Implementação das melhorias e entrega dos', 40, 100, 230), it('Quick Wins no prazo combinado', 40, 114, 170)]);
  assert.deepEqual(par.map(b => b.texto), ['Implementação das melhorias e entrega dos Quick Wins no prazo combinado']);
  // Negrito um pouco maior no meio da frase não quebra a linha.
  const neg = agrupar([it('Objetivo: reduzir em', 71, 120, 110), it(' ', 181, 120, 3), it('30%', 185, 120, 20, { tam: 11.6, fonte: 'DejaVuSans-Bold' }), it(' até dezembro.', 205, 120, 70)]);
  assert.deepEqual(neg.map(b => b.texto), ['Objetivo: reduzir em 30% até dezembro.']);
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
  assert.match(m[1].content, /1\.1 \[0, 0\] \(máx\. 16\): Kick-off Repet/);
  assert.match(m[1].content, /<material>\nRafisa usa Iniflex\.\n<\/material>/);
  let n = 0;
  const r = await adaptarModelo({ paginas, contexto: '', pedido: '', chamar: async () => ({ texto: ++n === 1 ? 'não sei' : '```json\n{"1.1":"Kick-off Rafisa"}\n```', custo: 0.01 }) });
  assert.equal(n, 3);   // 2 tentativas + 1 rodada só com o que faltou
  assert.deepEqual(r.textos, { '1.1': 'Kick-off Rafisa' });
  assert.deepEqual(r.faltando, ['1.2']);
  assert.equal(r.custo, 0.03);
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
      const ids = [...b.messages[1].content.matchAll(/^(\d+\.\d+) \[/gm)].map(m => m[1]);
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
  // Prévia na conversa: slides com fundo e textos do arquivo; a imagem de fundo vem do próprio arquivo.
  const pv = (await ana.get(`/api/conversas/${conv.id}/arquivos/${a.id}/previa`)).dados;
  assert.equal(pv.slides.length, 1);
  const img = pv.slides[0].formas.find(f => f.tipo === 'imagem');
  assert.equal(img.midia, 'fundo1.jpg');
  assert.ok(pv.slides[0].formas.some(f => f.tipo === 'texto' && f.paragrafos[0].runs[0].t === 'Kickoff da Rafisa 1.1' && f.paragrafos[0].runs[0].fonte === 'Montserrat'));
  const fundo = await fetch(`${S.base}${pv.midia}${img.midia}`, { headers: { cookie: ana.cookie } });
  assert.equal(fundo.status, 200); assert.equal(fundo.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${S.base}${pv.midia}..%2Fslides%2Fslide1.xml`, { headers: { cookie: ana.cookie } })).status, 404);
  assert.equal((await bia.get(`/api/conversas/${conv.id}/arquivos/${a.id}/previa`)).status, 404);
  const det = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.equal(det.mensagens.filter(m => m.papel === 'assistant').at(-1).arquivos[0].id, a.id);
  // Sem visual genérico: o pedido de modelo não aciona a produção visual nem a peça padrão.
  assert.equal(r.fim.artefatos, undefined);
  await ana.del(`/api/conversas/${conv.id}`);
  assert.equal(um(S.app.db, 'select count(*) n from arquivos_gerados').n, 0, 'sai com a conversa');
  assert.equal(um(S.app.db, 'select count(*) n from anexos_arquivos').n, 0, 'o modelo sai com a conversa');
});

test('pedido "mesmo layout" sem o PDF original: a resposta pede o arquivo, nada genérico é montado', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Quero a apresentação da Rafisa em PPTX seguindo o exato mesmo layout do material.' });
  assert.equal(r.status, 200);
  const sis = JSON.stringify(OR.chamadas.at(-1).messages[0]);
  assert.match(sis, /o arquivo original \(PDF\) não está disponível/);
  assert.doesNotMatch(sis, /Peças visuais/);
  assert.equal(r.fim.arquivos, undefined); assert.equal(r.fim.artefatos, undefined);
});

test('conversa com apresentação em PDF: "monte a da Rafisa em PPTX" usa o PDF como modelo, mesmo sem dizer "mesmo layout"', { skip: semNavegador }, async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(ana, conv.id, { texto: 'analise o material', anexos: [{ nome: 'Kickoff-Repet.pdf', base64: pdfColorido().toString('base64') }] });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Agora monte a apresentação da Rafisa em PPTX, com o cenário do projeto dela.' });
  assert.equal(r.status, 200);
  assert.equal(r.fim.arquivos?.[0]?.modelo, 'Kickoff-Repet.pdf');
  // Pedido de análise não monta nada.
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'O que essa apresentação diz sobre prazos?' });
  assert.equal(r2.fim.arquivos, undefined);
});

test('roteiro "Slide N" na resposta vira slides de verdade no PowerPoint comum', async () => {
  const { slides } = await import('../src/escritorio.js');
  const s = slides('Aqui está o roteiro.\n\n## Slide 1: Capa\nFinanceiro · Produção\nKick-off Prumo Discovery / RAFISA\nK I C K - O F F\n---\n**Slide 2: Contexto**\n0 1 · C O N T E X T O\nA RAFISA quer fechar o mês com resultado confiável\n- Apontamento em papel\n---\nSlide 3: Método\n1 Entender\n2 Definir', 'X');
  assert.equal(s.capa, 'Kick-off Prumo Discovery / RAFISA');
  assert.deepEqual(s.slides.map(x => x.titulo), ['Contexto', 'Método']);
  assert.deepEqual(s.slides[0].itens.map(i => i.texto), ['A RAFISA quer fechar o mês com resultado confiável', 'Apontamento em papel']);
  assert.deepEqual(s.slides[1].itens.map(i => i.texto), ['1 Entender', '2 Definir']);
});

test('PDF com foto enorme: a cópia leve reduz a imagem (o original fica intacto) e continua um PDF válido', async () => {
  const { pdfLeve } = await import('../src/pdf-leve.js');
  const { default: sharp } = await import('sharp');
  const foto = await sharp({ create: { width: 4800, height: 2700, channels: 3, background: { r: 20, g: 120, b: 80 } } }).jpeg().toBuffer();
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>',
    '<< /Length 33 >>\nstream\nq 960 0 0 540 0 0 cm /Im1 Do Q\nendstream',
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 4800 /Height 2700 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${foto.length} /Filter /DCTDecode >>\nstream\n`), foto, Buffer.from('\nendstream')])];
  const partes = [Buffer.from('%PDF-1.4\n')], pos = [];
  let tam = partes[0].length;
  objs.forEach((o, i) => { const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(o) ? o : Buffer.from(o), Buffer.from('\nendobj\n')]); pos.push(tam); partes.push(b); tam += b.length; });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF\n`));
  const original = Buffer.concat(partes);
  const { pdf, trocas } = await pdfLeve(original);
  assert.equal(trocas, 1);
  assert.ok(pdf.subarray(0, original.length).equals(original), 'atualização incremental: o original fica intacto');
  assert.match(pdf.subarray(original.length).toString('latin1'), /\/Width 2000 \/Height 1125/);
  assert.match(pdf.toString('latin1'), /\/Prev \d+ >>\nstartxref\n\d+\n%%EOF\n$/);
  if (!semNavegador) { const [p] = await lerModeloPdf(original); assert.equal(Math.round(p.w), 960); }
});

test('sem memória livre para ler o modelo: recusa com motivo, sem abrir o navegador', async () => {
  await assert.rejects(lerModeloPdf(Buffer.from('%PDF-1.4'), { memoria: () => 300 }), e => e.codigo === 'modelo_sem_memoria');
});

test('adaptação: número de página fica; rodapé repetido vai uma vez e vale para todos; item vazio sai do slide; texto longo diminui', async () => {
  const pg = n => ({ w: 960, h: 540, fundo: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), blocos: [
    { id: `${n}.1`, texto: `Título ${n}`, linhas: 1, x: 40, y: 80, largura: 200, tam: 30, entrelinha: 36, fonte: 'Georgia', cor: '#000000' },
    { id: `${n}.2`, texto: 'Prumo Discovery · Repet', linhas: 1, x: 40, y: 520, largura: 200, tam: 10, entrelinha: 12, fonte: 'Courier New', cor: '#666666' },
    { id: `${n}.3`, texto: String(n).padStart(2, '0'), linhas: 1, x: 900, y: 520, largura: 20, tam: 10, entrelinha: 12, fonte: 'Courier New', cor: '#666666' }] });
  const paginas = [pg(1), pg(2), pg(3)];
  let pedido = '';
  const r = await adaptarModelo({ paginas, contexto: '', pedido: '', chamar: async m => { pedido += m[1].content; return { texto: JSON.stringify({ '1.1': 'Título novo com texto bem mais longo que o espaço original do bloco', '2.1': '', '3.1': 'T3', '1.2': 'Prumo Discovery · RAFISA' }) }; } });
  assert.doesNotMatch(pedido, /^\d\.3 /m);                       // número de página não vai
  assert.equal((pedido.match(/Prumo Discovery · Repet/g) || []).length, 1);   // rodapé vai uma vez
  assert.equal(r.textos['3.2'], 'Prumo Discovery · RAFISA');     // e vale para todos os slides
  const z = deszipar(pptxDeModelo(paginas, { textos: r.textos }));
  assert.match(z.get('ppt/slides/slide1.xml'), /<a:t>01<\/a:t>/);
  assert.doesNotMatch(z.get('ppt/slides/slide2.xml'), /Título 2|name="Texto 2\.1"/);   // vazio: sai
  assert.match(z.get('ppt/slides/slide1.xml'), /sz="(2[1-9]\d\d)"[^>]*>[\s\S]*?Título novo/);   // fonte reduzida (de 3000)
});

test('adaptação: parte que falha é dividida e refeita, até um slide por vez', async () => {
  const paginas = [1, 2, 3, 4].map(n => ({ blocos: [{ id: `${n}.1`, texto: `Título ${n}`, x: 10, y: 10 }] }));
  let chamadas = 0;
  const r = await adaptarModelo({ paginas, contexto: '', pedido: '', porParte: 4, chamar: async m => {
    chamadas++;
    const ids = [...m[1].content.matchAll(/^(\d+\.\d+) \[/gm)].map(x => x[1]);
    return { texto: ids.length > 1 ? '{"corta' : JSON.stringify({ [ids[0]]: `Novo ${ids[0]}` }) };   // só responde bem com um slide
  } });
  assert.deepEqual(r.textos, { '1.1': 'Novo 1.1', '2.1': 'Novo 2.1', '3.1': 'Novo 3.1', '4.1': 'Novo 4.1' });
  assert.deepEqual(r.faltando, []);
  assert.ok(chamadas <= 14, String(chamadas));
});

test('adaptação: blocos que a IA pulou voltam numa rodada só com eles', async () => {
  const paginas = [1, 2].map(n => ({ blocos: Array.from({ length: 5 }, (_, k) => ({ id: `${n}.${k + 1}`, texto: `Texto ${n} ${k}`, x: 10, y: 10 + k * 20 })) }));
  const pedidos = [];
  const r = await adaptarModelo({ paginas, contexto: '', pedido: '', chamar: async m => {
    const ids = [...m[1].content.matchAll(/^(\d+\.\d+) \[/gm)].map(x => x[1]);
    pedidos.push(ids);
    // Na primeira vez, pula um bloco de cada slide (passa do corte de 80%); depois responde tudo.
    return { texto: JSON.stringify(Object.fromEntries(ids.filter(id => pedidos.length > 1 || !id.endsWith('.3')).map(id => [id, `Novo ${id}`]))) };
  } });
  assert.deepEqual(pedidos.at(-1), ['1.3', '2.3']);
  assert.equal(Object.keys(r.textos).length, 10);
  assert.deepEqual(r.faltando, []);
});

test('marcador de lista com cor e peso próprios: lido do PDF e repetido no PowerPoint', () => {
  const it = (s, x, y, w, extra = {}) => ({ s, x, y, w, tam: 11, fonte: 'DejaVuSans', cor: '#222222', ...extra });
  const [b] = agrupar([it('1.', 89, 200, 10, { fonte: 'DejaVuSans-Bold', cor: '#1b7950' }), it(' Entender o processo', 99, 200, 110)]);
  assert.equal(b.texto, '1. Entender o processo');
  assert.deepEqual(b.marcador, { cor: '#1B7950', negrito: true });
  const z = deszipar(pptxDeModelo([{ w: 600, h: 400, fundo: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), blocos: [{ ...b, largura: 120 }] }], { textos: { [b.id]: '1. Mapear o fechamento' } }));
  const s = z.get('ppt/slides/slide1.xml');
  assert.match(s, /b="1" sz="1100"[^>]*><a:solidFill><a:srgbClr val="1B7950"\/><\/a:solidFill>[^]*?<a:t>1\. <\/a:t>/);
  assert.match(s, /<a:srgbClr val="222222"\/>[^]*?<a:t>Mapear o fechamento<\/a:t>/);
});
