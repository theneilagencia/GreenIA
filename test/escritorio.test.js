// Arquivos do Office a partir da resposta: estrutura do pacote (todas as partes declaradas existem, XML bem formado,
// relações apontam para partes reais), conteúdo editável (texto, não imagem), valores da planilha como números de
// verdade e o download autenticado na conversa (só o dono, só resposta guardada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { subir } from './ajuda.js';
import { salvarConfig } from '../src/config.js';
import { exec } from '../src/db.js';
import { deszipar } from './zip-leitor.js';
import { arquivo } from './arquivos.js';
import { blocos, docx, pptx, slides, valorDaCelula, xlsx, nomeDoArquivo } from '../src/escritorio.js';

// XML bem formado o bastante para o Office: declaração, etiquetas balanceadas, sem caractere de controle.
function conferirXml(nome, s) {
  assert.match(s, /^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n</, nome);
  assert.doesNotMatch(s, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, nome);
  const pilha = [];
  for (const m of s.replace(/^<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) assert.equal(pilha.pop(), m[2], `${nome}: </${m[2]}> sem abertura`);
    else pilha.push(m[2]);
  }
  assert.deepEqual(pilha, [], `${nome}: etiquetas abertas`);
  assert.doesNotMatch(s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, ''), /&/, `${nome}: & sem escape`);
}
function conferirPacote(buf) {
  const z = deszipar(buf);
  for (const [n, s] of z) if (/\.(xml|rels)$/.test(n)) conferirXml(n, s);
  for (const m of z.get('[Content_Types].xml').matchAll(/PartName="\/([^"]+)"/g)) assert.ok(z.has(m[1]), `parte declarada e ausente: ${m[1]}`);
  for (const [n, s] of z) {
    if (!n.endsWith('.rels')) continue;
    const base = posix.dirname(posix.dirname(n));
    for (const m of s.matchAll(/Target="([^"]+)"/g)) assert.ok(z.has(posix.normalize(posix.join(base === '.' ? '' : base, m[1]))), `${n} aponta para parte ausente: ${m[1]}`);
  }
  return z;
}

const RESPOSTA = `# Plano de redução de retrabalho

Objetivo: reduzir **retrabalho** em *30%* até dezembro & sem <atraso>.

## Diagnóstico
- Retrabalho concentrado em compras
- [ ] Mapear fornecedores

1. Primeiro passo
2. Segundo passo

## Custos por área

| Área | Custo | Variação | Data | Código |
| --- | --- | --- | --- | --- |
| Compras | R$ 1.234,56 | -12,5% | 03/11/2026 | 00123 |
| Financeiro | R$ 980,00 | 7% | 15/12/2026 | 4567 |

\`\`\`
| não | é tabela |
| --- | --- |
\`\`\``;

test('planilha: número, reais, porcentagem e data viram valor; código, documento longo e data impossível ficam texto', () => {
  assert.deepEqual(valorDaCelula('1.234,56'), { v: 1234.56, fmt: '#,##0.00' });
  assert.deepEqual(valorDaCelula('R$ 1.234,56'), { v: 1234.56, fmt: '"R$" #,##0.00;-"R$" #,##0.00' });
  assert.deepEqual(valorDaCelula('-R$ 10,00').v, -10);
  assert.deepEqual(valorDaCelula('R$ -10,00').v, -10);
  assert.deepEqual(valorDaCelula('-12,5%'), { v: -0.125, fmt: '0.0%' });
  assert.deepEqual(valorDaCelula('1.234'), { v: 1234, fmt: '#,##0' });
  assert.deepEqual(valorDaCelula('1,5'), { v: 1.5, fmt: '#,##0.0' });
  assert.deepEqual(valorDaCelula('2.5'), { v: 2.5, fmt: '#,##0.0' });
  assert.deepEqual(valorDaCelula('1,234.50'), { v: 1234.5, fmt: '#,##0.00' });
  assert.deepEqual(valorDaCelula('**42**'), { v: 42, fmt: '#,##0' });
  assert.deepEqual(valorDaCelula('0,75'), { v: 0.75, fmt: '#,##0.00' });
  assert.deepEqual(valorDaCelula('03/11/2026'), { v: 46329, fmt: 'dd/mm/yyyy' });   // 03/11/2026 no Excel
  for (const t of ['00123', '123.456.789-09', '12345678901234567', '31/02/2026', '10 unidades', 'R$', '1.2.3', '']) assert.equal(valorDaCelula(t).v, undefined, t);
  assert.equal(valorDaCelula('=SOMA(A1)').t, '=SOMA(A1)');   // texto, nunca fórmula
});

test('blocos: título, lista com checklist, tabela, código (tabela dentro de código não é tabela)', () => {
  const b = blocos(RESPOSTA);
  assert.deepEqual(b.map(x => x.tipo), ['titulo', 'paragrafo', 'titulo', 'lista', 'lista', 'titulo', 'tabela', 'codigo']);
  assert.deepEqual(b[3].itens, ['Retrabalho concentrado em compras', '☐ Mapear fornecedores']);
  assert.equal(b[4].ordenada, true);
  assert.equal(b[6].linhas.length, 3);
});

test('Word: pacote válido, título, seções como estilos de título, lista numerada, tabela nativa e texto escapado', () => {
  const z = conferirPacote(docx(RESPOSTA, { titulo: 'Conversa' }));
  const d = z.get('word/document.xml');
  assert.match(d, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Plano de redução de retrabalho/);
  assert.match(d, /<w:pStyle w:val="Heading2"\/><\/w:pPr><w:r><w:t xml:space="preserve">Diagnóstico/);
  assert.match(d, /<w:b\/><\/w:rPr><w:t xml:space="preserve">retrabalho<\/w:t>/);
  assert.match(d, /sem &lt;atraso&gt;/);
  assert.equal((d.match(/<w:tbl>/g) || []).length, 1);
  assert.match(d, /<w:tblHeader\/>/);
  assert.match(z.get('word/numbering.xml'), /<w:startOverride w:val="1"\/>/);
  assert.doesNotMatch(d, /<w:drawing|<pic:/);   // nada de imagem: tudo editável
  // Sem título no texto, o nome da conversa vira o título.
  assert.match(deszipar(docx('Só um parágrafo.', { titulo: 'Minha conversa' })).get('word/document.xml'), /Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Minha conversa/);
});

test('Excel: valores numéricos com formato, cabeçalho fixo e filtro, uma aba por tabela', () => {
  const tabelas = blocos(RESPOSTA).filter(b => b.tipo === 'tabela').map(b => ({ linhas: b.linhas }));
  const z = conferirPacote(xlsx([...tabelas, { nome: 'Tabela 1', linhas: [['A'], ['1']] }]));
  const f = z.get('xl/worksheets/sheet1.xml');
  assert.match(f, /<c r="B2" s="\d+"><v>1234.56<\/v><\/c>/);
  assert.match(f, /<c r="C2" s="\d+"><v>-0.125<\/v><\/c>/);
  assert.match(f, /<c r="D2" s="\d+"><v>46329<\/v><\/c>/);
  assert.match(f, /<c r="E2" t="inlineStr"><is><t xml:space="preserve">00123<\/t><\/is><\/c>/);
  assert.match(f, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(f, /<autoFilter ref="A1:E3"\/>/);
  assert.match(z.get('xl/styles.xml'), /formatCode="&quot;R\$&quot; #,##0.00;-&quot;R\$&quot; #,##0.00"/);
  // Nomes de aba únicos (o Excel recusa repetidos, ignorando maiúsculas).
  assert.match(z.get('xl/workbook.xml'), /name="Tabela 1".*name="Tabela 1 2"/);
  assert.throws(() => xlsx([]));
});

test('PowerPoint: capa com a abertura, um slide por seção, tabela nativa, conteúdo longo continua no slide seguinte', () => {
  const longa = `${RESPOSTA}\n\n## Próximos passos\n${Array.from({ length: 30 }, (_, i) => `- Passo ${i + 1} com um texto de tamanho médio para ocupar a linha do slide inteiro e um pouco mais`).join('\n')}`;
  const s = slides(longa, 'Conversa');
  assert.equal(s.capa, 'Plano de redução de retrabalho');
  assert.match(s.abertura, /^Objetivo/);
  assert.deepEqual(s.slides.slice(0, 2).map(x => x.titulo), ['Diagnóstico', 'Custos por área']);
  assert.ok(s.slides.filter(x => x.titulo === 'Próximos passos (continuação)').length >= 2);
  for (const sl of s.slides) if (sl.itens) assert.ok(sl.itens.reduce((n, it) => n + Math.ceil(it.texto.length / 82), 0) <= 12, sl.titulo);
  const z = conferirPacote(pptx(longa, { titulo: 'Conversa', subtitulo: 'Gerado na GreenIA' }));
  const nSlides = [...z.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  assert.equal(nSlides, s.slides.length + 1);
  assert.equal((z.get('ppt/presentation.xml').match(/<p:sldId /g) || []).length, nSlides);
  const tabela = [...z.values()].find(x => x.includes('<a:tbl>'));
  assert.match(tabela, /<a:t>R\$ 1.234,56<\/a:t>/);
  assert.match(z.get('ppt/slides/slide1.xml'), /<a:t>Plano de redução de retrabalho<\/a:t>/);
  assert.doesNotMatch([...z.values()].join(''), /<p:pic>/);
});

test('tabela longa no PowerPoint: dividida em slides com o cabeçalho repetido', () => {
  const t = `## Vendas\n\n| Mês | Valor |\n| --- | --- |\n${Array.from({ length: 20 }, (_, i) => `| ${i + 1} | ${i * 10} |`).join('\n')}`;
  const s = slides(t, 'X').slides;
  assert.equal(s.length, 3);
  for (const sl of s) assert.deepEqual(sl.tabela[0], ['Mês', 'Valor']);
  assert.deepEqual(s.map(x => x.tabela.length - 1), [8, 8, 4]);
});

test('nome do arquivo: sem acento nem símbolo', () => {
  assert.equal(nomeDoArquivo('Relatório: vendas/2026 "final"', 'docx'), 'Relatorio-vendas2026-final.docx');
  assert.equal(nomeDoArquivo('', 'xlsx'), 'greenia.xlsx');
});

// ---------- download na conversa ----------
let S, ana, bia;
before(async () => {
  S = await subir(); salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  bia = await S.cliente().entrar('bia@exemplo.com.br');
});
after(async () => { await S.fechar(); S.app.db.close(); });
async function resposta(texto = RESPOSTA, papel = 'assistant') {
  const conversa = (await ana.post('/api/conversas')).dados.conversa.id;
  const mensagem = Number(exec(S.app.db, 'insert into mensagens (conversa_id, papel, texto, criado_em) values (?, ?, ?, ?)', conversa, papel, texto, new Date().toISOString()).lastInsertRowid);
  return { conversa, mensagem, url: f => `/api/conversas/${conversa}/mensagens/${mensagem}/arquivo/${f}`, tabela: i => `/api/conversas/${conversa}/mensagens/${mensagem}/tabelas/${i}/xlsx` };
}
const baixar = async (c, url) => { const r = await fetch(S.base + url, { headers: { cookie: c.cookie } }); return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) }; };

test('download: Word, PowerPoint e Excel da resposta, com tipo, nome e sem cache', async () => {
  const r = await resposta();
  for (const [f, mime] of [['docx', /wordprocessingml/], ['pptx', /presentationml/], ['xlsx', /spreadsheetml/]]) {
    const d = await baixar(ana, r.url(f));
    assert.equal(d.status, 200, f);
    assert.match(d.headers.get('content-type'), mime);
    assert.match(d.headers.get('content-disposition'), new RegExp(`^attachment; filename="Nova-conversa\\.${f}"$`));
    assert.equal(d.headers.get('cache-control'), 'no-store');
    conferirPacote(d.buf);
  }
  const t = await baixar(ana, r.tabela(0));
  assert.equal(t.status, 200);
  assert.match(deszipar(t.buf).get('xl/worksheets/sheet1.xml'), /<v>1234.56<\/v>/);
});

test('download: outra pessoa, visitante, mensagem da pessoa, conteúdo não guardado, formato e tabela inexistentes', async () => {
  const r = await resposta();
  assert.equal((await baixar(bia, r.url('docx'))).status, 404);
  assert.equal((await baixar(S.cliente(), r.url('docx'))).status, 401);
  assert.equal((await baixar(ana, r.url('exe'))).status, 404);
  assert.equal((await baixar(ana, r.tabela(1))).status, 404);   // a "tabela" dentro do código não conta
  assert.equal((await baixar(ana, r.tabela('01'))).status, 404);
  const p = await resposta(RESPOSTA, 'user');
  assert.equal((await baixar(ana, p.url('docx'))).status, 404);
  const v = await resposta('[Conteúdo processado e não guardado, pela política de retenção da empresa.]');
  assert.equal((await baixar(ana, v.url('pptx'))).status, 404);
  const semTabela = await resposta('Só texto.');
  assert.equal((await baixar(ana, semTabela.url('xlsx'))).status, 404);
  assert.equal((await baixar(ana, semTabela.url('docx'))).status, 200);
  await ana.del(`/api/conversas/${r.conversa}`);
  assert.equal((await baixar(ana, r.url('docx'))).status, 404);
});

test('ida e volta: a planilha gerada aqui, lida como anexo, traz datas como datas e valores certos', async () => {
  const { extrairTexto } = await import('../src/texto.js');
  const b = xlsx([{ nome: 'Custos', linhas: [['Área', 'Custo', 'Data'], ['Compras', 'R$ 1.234,56', '03/11/2026'], ['TI', '980', '15/12/2026 ']] }]);
  const { texto } = await extrairTexto(arquivo('custos.xlsx', b));
  assert.match(texto, /# Planilha: Custos/);
  assert.match(texto, /Compras;1234\.56;03\/11\/2026/);
  assert.match(texto, /TI;980;15\/12\/2026/);
});

test('planilha de outro programa: nome da aba pela relação (não pelo número do arquivo) e data no formato embutido 14', async () => {
  const { extrairTexto } = await import('../src/texto.js');
  const { zipar } = await import('../src/escritorio.js');
  const X = '<?xml version="1.0" encoding="UTF-8"?>';
  const folha = linhas => `${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhas}</sheetData></worksheet>`;
  const b = zipar([
    { nome: '[Content_Types].xml', dados: `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>` },
    { nome: 'xl/workbook.xml', dados: `${X}<workbook xmlns:r="r"><sheets><sheet name="Resumo" sheetId="1" r:id="rId2"/><sheet name="Dados" sheetId="2" r:id="rId1"/></sheets></workbook>` },
    { nome: 'xl/_rels/workbook.xml.rels', dados: `${X}<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>` },
    { nome: 'xl/styles.xml', dados: `${X}<styleSheet><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="4"/></cellXfs></styleSheet>` },
    { nome: 'xl/worksheets/sheet1.xml', dados: folha('<row r="1"><c r="A1" t="inlineStr"><is><t>Data</t></is></c><c r="B1" t="inlineStr"><is><t>Valor</t></is></c></row><row r="2"><c r="A2" s="1"><v>46329</v></c><c r="B2" s="2"><v>46329</v></c></row>') },
    { nome: 'xl/worksheets/sheet2.xml', dados: folha('<row r="1"><c r="A1" t="inlineStr"><is><t>Total geral</t></is></c></row>') },
  ]);
  const { texto } = await extrairTexto(arquivo('livro.xlsx', b));
  assert.match(texto, /# Planilha: Resumo\nTotal geral/);
  assert.match(texto, /# Planilha: Dados\nData;Valor\n03\/11\/2026;46329/);   // número comum continua número
});

test('cor da empresa nos arquivos (legível sobre o branco); sem identidade, a cor padrão', async () => {
  const claro = deszipar(docx('# T', { cor: '#FFD400' })).get('word/styles.xml');
  assert.doesNotMatch(claro, /w:val="FFD400"/);   // amarelo puro não tem contraste para título: escurecido
  assert.match(deszipar(pptx('## A\n- b', { cor: '#C8102E' })).get('ppt/slides/slide2.xml'), /<a:srgbClr val="C8102E"\/>/);
  assert.match(deszipar(docx('# T')).get('word/styles.xml'), /w:val="1B7950"/);
  salvarConfig(S.app.db, { corMarca: '#C8102E' });
  const r = await resposta('## Seção\n- item');
  assert.match(deszipar((await baixar(ana, r.url('pptx'))).buf).get('ppt/slides/slide2.xml'), /C8102E/);
  salvarConfig(S.app.db, { corMarca: null });
});
