// Edição fiel do arquivo anexado (auditoria em produção: "faça os ajustes exclusivamente no arquivo anexo" era
// ignorado e a GreenIA devolvia outro arquivo, com outro layout). O original é aberto e só o pedido muda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { docx, pptx, xlsx, zipar, MIMES } from '../src/escritorio.js';
import { alteraDadoNaoPedido, aplicarEdicao, mudancasDaPlanilha, conteudoParaEdicao, editarArquivo, problemasDaPlanilha, deslocarFormula, lerPacote, pedeEdicaoNoArquivo, trocarTextoDoParagrafo } from '../src/edicao-arquivo.js';
import { extrairTexto } from '../src/texto.js';

const texto = c => (typeof c === 'string' ? c : (c || []).map(p => p.text || '').join('\n'));
const parte = (buf, nome) => lerPacote(buf).find(e => e.nome === nome)?.dados.toString('utf8');
const ler = async (nome, buf) => (await extrairTexto({ nome, base64: buf.toString('base64') })).texto;
const DOC = () => docx('# Proposta comercial\n\nPrazo de pagamento: 30 dias.\n\n## Escopo\n\n- Oito turmas\n- Material digital', { titulo: 'Proposta' });

test('parágrafo com vários runs: só o trecho mudado troca, a formatação do resto fica', () => {
  const p = '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Prazo:</w:t></w:r><w:r><w:t xml:space="preserve"> 30 dias corridos</w:t></w:r></w:p>';
  const r = trocarTextoDoParagrafo(p, 'Prazo: 45 dias corridos', 'w');
  assert.match(r, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>Prazo:<\/w:t><\/w:r>/, 'o run em negrito não muda');
  assert.match(r, /<w:t xml:space="preserve"> 45 dias corridos<\/w:t>/);
  assert.match(r, /^<w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr>/, 'o estilo do parágrafo fica');
  // Mudança que atravessa runs: o texto novo entra no primeiro run atingido; nada some.
  const r2 = trocarTextoDoParagrafo(p, 'Pagamento em 45 dias corridos', 'w');
  assert.equal(r2.replace(/<[^>]+>/g, ''), 'Pagamento em 45 dias corridos');
  // PowerPoint: mesmo princípio, com <a:t>.
  const a = '<a:p><a:r><a:rPr lang="pt-BR" b="1"/><a:t>AgroSense — 2026</a:t></a:r><a:endParaRPr lang="pt-BR"/></a:p>';
  assert.equal(trocarTextoDoParagrafo(a, 'AgroSense — 2027', 'a'), '<a:p><a:r><a:rPr lang="pt-BR" b="1"/><a:t>AgroSense — 2027</a:t></a:r><a:endParaRPr lang="pt-BR"/></a:p>');
  // Parágrafo vazio recebe texto com o estilo de fim de parágrafo.
  assert.match(trocarTextoDoParagrafo('<a:p><a:endParaRPr lang="pt-BR" sz="2000"/></a:p>', 'Novo', 'a'), /<a:r><a:rPr lang="pt-BR" sz="2000"\/><a:t>Novo<\/a:t><\/a:r><a:endParaRPr/);
});

test('Word: trocar, inserir com o mesmo estilo e remover; o resto do pacote fica byte a byte', async () => {
  const orig = DOC();
  const c = conteudoParaEdicao('docx', orig);
  const id = /\[(p\d+)\][^\n]*Prazo de pagamento/.exec(c)[1], item = /\[(p\d+)\][^\n]*Oito turmas/.exec(c)[1], mat = /\[(p\d+)\][^\n]*Material digital/.exec(c)[1];
  const r = aplicarEdicao('docx', orig, [{ op: 'trocar', id, texto: 'Prazo de pagamento: 45 dias.' }, { op: 'inserir_depois', id: item, texto: 'Relatório final' }, { op: 'remover', id: mat }, { op: 'trocar', id: 'p999', texto: 'x' }], { pedido: 'mude o prazo para 45 dias' });
  assert.equal(r.feitas, 3);
  assert.deepEqual(r.ignoradas.map(o => o.motivo), ['trecho_nao_encontrado']);
  const t = await ler('x.docx', r.dados);
  assert.match(t, /45 dias/); assert.doesNotMatch(t, /30 dias/); assert.match(t, /Oito turmas\nRelatório final/); assert.doesNotMatch(t, /Material digital/);
  // Item inserido herda o estilo de lista do vizinho.
  const doc = parte(r.dados, 'word/document.xml');
  const estiloDe = s => /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:pPr>([\s\S]*?)<\/w:pPr>(?:(?!<\/w:p>)[\s\S])*?Relatório final|$/.exec(s)?.[1];
  assert.ok(estiloDe(doc) && /numPr|pStyle/.test(estiloDe(doc)), 'o parágrafo novo tem o mesmo pPr do item da lista');
  for (const n of ['word/styles.xml', 'word/numbering.xml', '[Content_Types].xml']) assert.equal(parte(r.dados, n), parte(orig, n), `${n} não muda`);
});

test('PowerPoint: troca texto, junta slides (remove o segundo e as partes dele) e reordena', async () => {
  const orig = pptx('# Abertura\n\nTexto inicial\n\n# Resultados\n\n- Item A\n\n# Planos\n\n- Plano B\n\n# Encerramento\n\nObrigado', { titulo: 'Deck' });
  const c = conteudoParaEdicao('pptx', orig);
  const n = c.match(/## Slide \d+/g).length;
  const sRes = Number(/## Slide (\d+)\n(?:\[[^\n]*\n)*?\[s\d+\.p\d+\] Resultados/.exec(c)[1]), sPla = Number(/## Slide (\d+)\n(?:\[[^\n]*\n)*?\[s\d+\.p\d+\] Planos/.exec(c)[1]);
  const idRes = new RegExp(`\\[(s${sRes}\\.p\\d+)\\] Resultados`).exec(c)[1], idItem = new RegExp(`\\[(s${sRes}\\.p\\d+)\\] [^\\n]*Item A`).exec(c)[1];
  const r = aplicarEdicao('pptx', orig, [{ op: 'trocar', id: idRes, texto: 'Resultados e planos' }, { op: 'inserir_depois', id: idItem, texto: 'Plano B' }, { op: 'remover_slide', slide: sPla }, { op: 'remover_slide', slide: 99 }]);
  assert.equal(r.feitas, 3);
  const t = await ler('x.pptx', r.dados);
  assert.match(t, /Resultados e planos/); assert.match(t, /Item A\n.*Plano B/);
  assert.equal((t.match(/\[Slide/g) || []).length, n - 1, 'um slide a menos');
  assert.equal(lerPacote(r.dados).length, lerPacote(orig).length - 2, 'o slide removido e as relações dele saem do pacote');
  assert.equal(parte(r.dados, 'ppt/theme/theme1.xml'), parte(orig, 'ppt/theme/theme1.xml'), 'o tema fica igual');
  // Não deixa a apresentação vazia.
  const vazio = aplicarEdicao('pptx', orig, Array.from({ length: n }, (_, i) => ({ op: 'remover_slide', slide: i + 1 })));
  assert.equal(vazio.feitas, 0);
});

test('Excel: fórmula corrigida no lugar, estilo da célula preservado, recálculo ao abrir e funções perigosas recusadas', async () => {
  const orig = xlsx([{ nome: 'Fluxo', linhas: [['Conta', 'Jan', 'Fev'], ['Receita', '100', '200'], ['Custo', '40', '50'], ['Resultado', '=B2+B3', '=C2+C3']] }], { titulo: 'Fluxo' });
  const c = conteudoParaEdicao('xlsx', orig);
  assert.match(c, /## Aba: Fluxo/); assert.match(c, /B4: =B2\+B3/);
  const estiloAntes = /<c r="B4"[^>]*?\bs="(\d+)"/.exec(parte(orig, 'xl/worksheets/sheet1.xml'))?.[1];
  const r = aplicarEdicao('xlsx', orig, [{ op: 'celula', aba: 'Fluxo', ref: 'B4', formula: '=B2-B3' }, { op: 'celula', aba: 'fluxo', ref: 'C4', formula: 'SOMA(C2;-C3)' },
    { op: 'celula', aba: 'Fluxo', ref: 'D1', valor: 'Observação' }, { op: 'celula', aba: 'Fluxo', ref: 'E2', valor: 12.5 },
    { op: 'celula', aba: 'Fluxo', ref: 'B2', formula: 'WEBSERVICE("http://exemplo.com")' }, { op: 'celula', aba: 'Outra', ref: 'A1', valor: 1 }]);
  assert.equal(r.feitas, 4);
  assert.deepEqual(r.ignoradas.map(o => o.motivo).sort(), ['aba_nao_encontrada', 'formula_recusada']);
  const s = parte(r.dados, 'xl/worksheets/sheet1.xml');
  assert.match(s, new RegExp(`<c r="B4"${estiloAntes ? ` s="${estiloAntes}"` : ''}><f>B2-B3</f></c>`), 'o estilo da célula (formato numérico) fica');
  assert.match(s, /<c r="C4"[^>]*><f>SUM\(C2,-C3\)<\/f><\/c>/, 'função em português vira a do Excel');
  assert.match(s, /<c r="D1"[^>]*t="inlineStr"><is><t xml:space="preserve">Observação<\/t><\/is><\/c>/);
  assert.match(s, /<row r="1"[^>]*>[\s\S]*<c r="C1"[\s\S]*<c r="D1"[\s\S]*<\/row>/, 'célula nova entra na ordem das colunas');
  assert.match(s, /<c r="E2"[^>]*><v>12.5<\/v><\/c>/);
  assert.match(s, /<c r="B2"[^>]*><v>100<\/v><\/c>/, 'a fórmula perigosa não entra; o valor original fica');
  assert.match(parte(r.dados, 'xl/workbook.xml'), /fullCalcOnLoad="1"/);
  assert.equal(parte(r.dados, 'xl/styles.xml'), parte(orig, 'xl/styles.xml'));
  await ler('x.xlsx', r.dados);
});

test('fórmula compartilhada: as células que dependiam do mestre ganham a própria fórmula antes da troca', () => {
  assert.equal(deslocarFormula('SUM(B2:B6)+$A$1*C2', 0, 1), 'SUM(C2:C6)+$A$1*D2');
  assert.equal(deslocarFormula('IF(A2>0,"B2",LOG10(A2))', 1, 0), 'IF(A3>0,"B2",LOG10(A3))');
  assert.equal(deslocarFormula('Plan1!B2', 2, 0), 'Plan1!B4');
  const orig = xlsx([{ nome: 'Aba', linhas: [['a', 'b', 'c'], ['1', '2', '3']] }]);
  const sheet = parte(orig, 'xl/worksheets/sheet1.xml').replace(/<\/sheetData>/, '<row r="3"><c r="A3"><f t="shared" ref="A3:C3" si="0">A1+A2</f><v>0</v></c><c r="B3"><f t="shared" si="0"/><v>0</v></c><c r="C3"><f t="shared" si="0"/><v>0</v></c></row></sheetData>');
  const pac = lerPacote(orig).map(e => e.nome === 'xl/worksheets/sheet1.xml' ? { ...e, dados: Buffer.from(sheet) } : e);
  const r = aplicarEdicao('xlsx', zipar(pac), [{ op: 'celula', aba: 'Aba', ref: 'A3', formula: 'A2*2' }]);
  const s = parte(r.dados, 'xl/worksheets/sheet1.xml');
  assert.match(s, /<c r="A3"><f>A2\*2<\/f><\/c>/); assert.match(s, /<c r="B3"><f>B1\+B2<\/f>/); assert.match(s, /<c r="C3"><f>C1\+C2<\/f>/);
});

test('dado não pedido (visto em produção): "corrija a ortografia" não troca o e-mail; juntar slides leva os números; o marcador fica', () => {
  assert.equal(alteraDadoNaoPedido('• Contato: comercial@agrosense.exemplo', 'Contato: comercial@agrosense.com.br', { pedido: 'corrija a ortografia', resposta: 'domínio agrosense.com.br' }), 'comercial@agrosense.com.br');
  assert.equal(alteraDadoNaoPedido('Vencimento em 30 dias', 'Vencimento em 45 dias', { pedido: 'altere o vencimento de 30 para 45 dias' }), null);
  assert.equal(alteraDadoNaoPedido('Vencimento em 30 dias', 'Vencimento em 60 dias', { pedido: 'corrija a ortografia' }), '60');
  assert.equal(alteraDadoNaoPedido('', 'Essencial: R$ 38/ha/ano', { pedido: 'junte os slides', arquivo: '• Essencial: R$ 38/ha/ano — sensores' }), null);
  const orig = pptx('# Contato\n\n• Contato: comercial@exemplo.test · (43) 3000-0000\n\n• Prazo de 30 dias', { titulo: 'Deck' });
  const c = conteudoParaEdicao('pptx', orig);
  const idC = /\[(s\d+\.p\d+)\] [^\n]*Contato:/.exec(c)[1], idP = /\[(s\d+\.p\d+)\] [^\n]*Prazo/.exec(c)[1];
  const r = aplicarEdicao('pptx', orig, [{ op: 'trocar', id: idC, texto: 'Contato: comercial@empresa.com.br · (43) 3000-0000' }, { op: 'trocar', id: idP, texto: 'Prazo de 30 dias corridos' }, { op: 'inserir_depois', id: idP, texto: 'Item novo' }],
    { pedido: 'corrija a ortografia e acrescente "Item novo"', arquivo: c });
  assert.deepEqual(r.ignoradas.map(o => o.motivo), ['dado_nao_pedido']);
  const t = conteudoParaEdicao('pptx', r.dados);
  assert.match(t, /comercial@exemplo\.test/, 'o e-mail original fica');
  assert.match(t, /• Prazo de 30 dias corridos/, 'o marcador do original fica');
  assert.match(t, /• Item novo/, 'o item novo ganha o marcador do vizinho');
});

test('leitura da planilha: célula com fórmula sem valor guardado mostra a fórmula (antes parecia vazia)', async () => {
  const orig = xlsx([{ nome: 'Fluxo', linhas: [['Conta', 'Jan'], ['Receita', '100'], ['Imposto', '=B2*0.6']] }]);
  const t = await ler('x.xlsx', orig);
  assert.match(t, /Imposto;=B2\*0\.6/);
  const comValor = Buffer.from(zipar(lerPacote(orig).map(e => e.nome === 'xl/worksheets/sheet1.xml' ? { nome: e.nome, dados: Buffer.from(e.dados.toString().replace(/<f>B2\*0\.6<\/f>/, '<f>B2*0.6</f><v>60</v>')) } : { nome: e.nome, dados: e.dados })));
  assert.match(await ler('x.xlsx', comValor), /Imposto;60 \(=B2\*0\.6\)/);
});

test('juntar slides (visto em produção): identificador errado volta para a IA corrigir; se continuar errado, nada é removido', async () => {
  const orig = pptx('# Resultados\n\n- Caso A\n\n# Planos\n\n- Plano X: R$ 38\n- Plano Y: R$ 54\n\n# Fim\n\nObrigado', { titulo: 'Deck' });
  const c = conteudoParaEdicao('pptx', orig);
  const linhas = c.split('\n'), id = t => /^\[([^\]]+)\]/.exec(linhas.find(l => l.includes(t)))[1];
  const idA = id('Caso A'), sPla = Number(/^s(\d+)/.exec(id('] Planos'))[1]);
  const certo = { operacoes: [{ op: 'inserir_depois', id: idA, texto: 'Plano X: R$ 38\nPlano Y: R$ 54' }, { op: 'remover_slide', slide: sPla }] };
  const errado = { operacoes: [{ op: 'inserir_depois', id: 's99.p1', texto: 'Plano X: R$ 38' }, { op: 'remover_slide', slide: sPla }] };
  // 1ª resposta com id errado; a correção (com o motivo) acerta.
  const vistas = [];
  let n = 0;
  const r = await editarArquivo({ tipo: 'pptx', nome: 'deck.pptx', dados: orig, pedido: 'junte os slides Resultados e Planos', resposta: 'Vou juntar.', chamar: async m => { vistas.push(m); return { texto: JSON.stringify(n++ ? certo : errado) }; } });
  assert.equal(r.status, 'ok'); assert.equal(r.ignoradas.length, 0);
  assert.match(vistas[1].at(-1).content, /s99\.p1[\s\S]*identificador inexistente/, 'a IA recebe o que falhou e por quê');
  const t = conteudoParaEdicao('pptx', r.dados);
  assert.match(t, /Caso A\n\[[^\]]+\] Plano X: R\$ 38\n\[[^\]]+\] Plano Y: R\$ 54/);
  assert.equal((t.match(/## Slide/g) || []).length, (c.match(/## Slide/g) || []).length - 1);
  // Sempre errado: o slide de origem fica (nada se perde) e o aviso diz por quê.
  const r2 = await editarArquivo({ tipo: 'pptx', nome: 'deck.pptx', dados: orig, pedido: 'junte os slides', resposta: 'Vou juntar.', chamar: async () => ({ texto: JSON.stringify({ operacoes: [...errado.operacoes, { op: 'trocar', id: idA, texto: '- Caso A revisado' }] }) }) });
  assert.equal(r2.status, 'ok');
  assert.ok(r2.motivos.includes('remocao_suspensa'));
  const t2 = conteudoParaEdicao('pptx', r2.dados);
  assert.match(t2, /Plano Y: R\$ 54/, 'o conteúdo do slide de origem continua no arquivo');
  assert.equal((t2.match(/## Slide/g) || []).length, (c.match(/## Slide/g) || []).length);
});

test('planilha: a conferência acha circular e #REF!; o que sobrou depois da edição volta para a IA corrigir', async () => {
  const base = xlsx([{ nome: 'Fluxo', linhas: [['Conta', 'Jan'], ['Receita', '100'], ['Custo', '40'], ['Total', '=SUM(B2:B4)'], ['Margem', '=B4/B2']] }]);
  const orig = zipar(lerPacote(base).map(e => e.nome === 'xl/worksheets/sheet1.xml' ? { nome: e.nome, dados: Buffer.from(e.dados.toString().replace('<f>B4/B2</f>', '<f>#REF!+B2</f>')) } : { nome: e.nome, dados: e.dados }));
  const p = problemasDaPlanilha(orig);
  assert.deepEqual(p.map(x => x.ref).sort(), ['B4', 'B5']);
  assert.match(p.find(x => x.ref === 'B4').problema, /circular.*própria célula/);
  const vistas = [];
  const r = await editarArquivo({ tipo: 'xlsx', nome: 'f.xlsx', dados: orig, pedido: 'corrija a planilha e preserve o layout', resposta: 'Vou corrigir.', chamar: async m => {
    vistas.push(m);
    return { texto: JSON.stringify({ operacoes: vistas.length === 1 ? [{ op: 'celula', aba: 'Fluxo', ref: 'B5', formula: 'B4/B2' }] : [{ op: 'celula', aba: 'Fluxo', ref: 'B4', formula: 'B2-B3' }] }) };
  } });
  assert.equal(r.status, 'ok');
  assert.match(vistas[1].at(-1).content, /Fluxo!B4: referência circular/, 'a segunda rodada recebe o problema exato');
  assert.deepEqual(problemasDaPlanilha(r.dados), []);
  assert.deepEqual(r.conferencia, { antes_da_edicao: 2, depois: 0 });
});

test('planilha: fórmula fora do padrão da linha é apontada; total na ponta da linha não', () => {
  const linhas = [['Conta', 'Jan', 'Fev', 'Mar', 'Abr', 'Total'], ['Receita', '100', '120', '130', '90', '=SUM(B2:E2)'],
    ['Comissão', '=B2*0.6', '=C2*0.6', '=D2*0.06', '=E2*0.6', '=SUM(B3:E3)'], ['Saldo', '=B2-B3', '=C2-C3', '=D2-D3', '=D2-E3', '=SUM(B4:E4)']];
  const p = problemasDaPlanilha(xlsx([{ nome: 'Fluxo', linhas }]));
  assert.deepEqual(p.map(x => x.ref).sort(), ['D3', 'E4']);
  assert.match(p.find(x => x.ref === 'D3').problema, /diferente das vizinhas.*=D2\*0\.06.*padrão de B3 \(=B2\*0\.6\)/);
});

test('planilha: valor fixo no meio de fórmulas é apontado; saldo acumulado (primeira coluna diferente) não é alarme', () => {
  const linhas = [['Conta', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai'], ['Receita', '100', '120', '130', '90', '80'],
    ['Comissão', '=B2*0.6', '=C2*0.6', '9850', '=E2*0.6', '=F2*0.6'], ['Resultado', '=B2-B3', '=C2-C3', '=D2-D3', '=E2-E3', '=F2-F3'],
    ['Saldo', '=B4+10', '=B5+C4', '=C5+D4', '=D5+E4', '=E5+F4']];
  const p = problemasDaPlanilha(xlsx([{ nome: 'Fluxo', linhas }]));
  assert.deepEqual(p.map(x => x.ref), ['D3']);
  assert.match(p[0].problema, /valor fixo \(9850\)/);
});

test('planilha: alíquota implausível numa linha de imposto é apontada', () => {
  const linhas = [['Conta', 'Jan', 'Fev'], ['Receita', '100', '120'], ['Impostos (Simples)', '=B2*0.6', '=C2*0.6'], ['Comissão', '=B2*0.5', '=C2*0.5']];
  const p = problemasDaPlanilha(xlsx([{ nome: 'Fluxo', linhas }]));
  assert.deepEqual(p.map(x => x.ref), ['B3']);
  assert.match(p[0].problema, /alíquota implausível na linha "Impostos \(Simples\)"/);
});

test('planilha: a lista do que mudou sai do próprio arquivo (fórmula e valor)', () => {
  const antes = xlsx([{ nome: 'Fluxo', linhas: [['Conta', 'Jan'], ['Receita', '100'], ['Imposto', '=B2*0.6'], ['Nota', '12.5']] }]);
  const depois = aplicarEdicao('xlsx', antes, [{ op: 'celula', aba: 'Fluxo', ref: 'B3', formula: 'B2*0.06' }, { op: 'celula', aba: 'Fluxo', ref: 'B4', valor: '' }]).dados;
  assert.deepEqual(mudancasDaPlanilha(antes, depois).map(x => `${x.ref}: ${x.antes} → ${x.depois}`), ['B3: =B2*0.6 → =B2*0.06', 'B4: 12.5 → (vazia)']);
});

test('planilha: total que deixa de fora uma linha do próprio bloco é apontado', () => {
  const linhas = [['Conta', 'Jan', 'Fev'], ['', '', ''], ['Folha', '38000', '38000'], ['Nuvem', '6200', '6400'], ['Aluguel', '5500', '5500'], ['Total de despesas', '=SUM(B4:B5)', '=SUM(C3:C5)']];
  const p = problemasDaPlanilha(xlsx([{ nome: 'Fluxo', linhas }]));
  assert.deepEqual(p.map(x => x.ref), ['B6']);
  assert.match(p[0].problema, /deixa de fora a linha 3 \(Folha\)/);
});

test('slide novo: cópia do layout de um slide, com textos novos, na posição pedida (resto intacto)', async () => {
  const orig = pptx('# Abertura\n\nTexto inicial\n\n# Escopo\n\n- Item A\n\n# Fim\n\nObrigado', { titulo: 'Deck' });
  const c = conteudoParaEdicao('pptx', orig), linhas = c.split('\n');
  const id = t => /^\[([^\]]+)\]/.exec(linhas.find(l => l.includes(t)))[1];
  const tit = id('] Escopo'), item = id('Item A'), sEsc = Number(/^s(\d+)/.exec(tit)[1]);
  const total = (c.match(/## Slide/g) || []).length;
  const r = aplicarEdicao('pptx', orig, [{ op: 'novo_slide', copiar_de: sEsc, depois_de: sEsc, textos: { [tit]: 'Evidências', [item]: 'Relatórios do sistema' } }], { pedido: 'inclua um slide de evidências', arquivo: c });
  assert.equal(r.feitas, 1, JSON.stringify(r.ignoradas));
  const t = conteudoParaEdicao('pptx', r.dados);
  assert.equal((t.match(/## Slide/g) || []).length, total + 1);
  assert.match(t, new RegExp(`## Slide ${sEsc + 1}\\n(?:\\[[^\\n]*\\n)*?\\[[^\\]]+\\] Evidências[\\s\\S]*Relatórios do sistema`));
  assert.match(t, /Item A/, 'o slide de origem fica como estava');
  // O arquivo abre e a relação do slide novo aponta para o mesmo layout do de origem.
  await ler('x.pptx', r.dados);
  const novo = lerPacote(r.dados).map(e => e.nome).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort().at(-1);
  assert.match(parte(r.dados, '[Content_Types].xml'), new RegExp(novo.replace(/[./]/g, '\\$&')));
});

test('pedido: ajuste no próprio arquivo x criar outro / analisar', () => {
  const sim = ['Quero que estes ajustes sejam feitos exclusivamente no arquivo anexo: troque o título do primeiro slide para "AgroSense 2027" e corrija a ortografia, mantendo todo o resto igual. Devolva o PowerPoint.',
    'Agora, ainda no arquivo da AgroSense que anexei, junte os slides "Resultados" e "Planos" em um só.',
    'Audite a planilha Excel anexada. Identifique erros de fórmulas, inconsistências financeiras, referências quebradas, duplicidades e problemas no fluxo de caixa. Corrija os problemas comprovados, preserve o layout e entregue a planilha revisada acompanhada de um relatório de alterações.',
    'Troque o prazo da cláusula 4 para 60 dias.', 'Corrija os erros de digitação do documento'];
  const nao = ['Transforme a proposta comercial anexada em uma minuta de contrato de prestação de serviços. Preserve escopo, valores, responsabilidades, prazos. Gere um DOCX editável.',
    'Analise a apresentação PowerPoint anexada. Melhore significativamente a clareza, organização, narrativa e qualidade visual, preservando a identidade da marca e as informações essenciais. Entregue uma nova versão em PPTX editável.',
    'Resuma o documento anexado em 5 tópicos.', 'Qual é o prazo de pagamento do documento?', 'Use o agente nesta proposta.'];
  for (const t of sim) assert.equal(pedeEdicaoNoArquivo(t, { temAnexoAgora: true }), true, t);
  for (const t of nao) assert.equal(pedeEdicaoNoArquivo(t, { temAnexoAgora: true }), false, t);
  // Sem anexo nesta mensagem, só com referência ao arquivo ou a uma parte dele.
  assert.equal(pedeEdicaoNoArquivo('ajuste o tom', { temAnexoAgora: false }), false);
  assert.equal(pedeEdicaoNoArquivo('ajuste o título do slide 2', { temAnexoAgora: false }), true);
});

// ---------- pela conversa, de ponta a ponta ----------
let S, OR, ana, falharJson = false;
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const sis = texto(b.messages[0]?.content), u = texto(b.messages.filter(m => m.role === 'user').at(-1)?.content);
    if (/Você aplica ajustes num arquivo/.test(sis)) {
      if (falharJson) return 'não sei';
      const ops = [];
      const prazo = /\[(p\d+)\][^\n]*Prazo de pagamento: 30 dias/.exec(u); if (prazo) ops.push({ op: 'trocar', id: prazo[1], texto: 'Prazo de pagamento: 45 dias.' });
      const titulo = /\[(p\d+)\][^\n]*Proposta comercial$/m.exec(u); if (titulo && /revisada/.test(u)) ops.push({ op: 'trocar', id: titulo[1], texto: 'Proposta comercial revisada' });
      if (/B4: =B2\+B3/.test(u)) ops.push({ op: 'celula', aba: 'Fluxo', ref: 'B4', formula: 'B2-B3' });
      return JSON.stringify({ operacoes: ops });
    }
    return 'Entendi: vou ajustar o próprio arquivo. Alterações: prazo de 30 → 45 dias.\n\n## O que foi feito\n- Prazo alterado.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });
const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;
const edicoes = () => OR.chamadas.filter(b => /Você aplica ajustes num arquivo/.test(texto(b.messages[0]?.content)));

test('conversa: "exclusivamente no arquivo anexo" devolve o próprio Word ajustado, e o pedido seguinte parte dessa versão', async () => {
  const conv = await nova(), orig = DOC();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Quero que este ajuste seja feito exclusivamente no arquivo anexo: mude o prazo de pagamento para 45 dias, mantendo todo o resto igual.', anexos: [{ nome: 'proposta.docx', base64: orig.toString('base64') }] });
  assert.equal(r.status, 200, JSON.stringify(r.erro || r.falha));
  const a = r.fim.arquivos?.[0];
  assert.equal(a?.tipo, 'edicao', JSON.stringify(r.fim));
  assert.equal(a.formato, 'docx'); assert.equal(a.alteracoes, 1); assert.equal(a.nome, 'proposta-ajustado.docx');
  assert.match(texto(OR.chamadas.filter(b => !/Você aplica/.test(texto(b.messages[0]?.content))).at(-1).messages[0].content), /ajustes no próprio arquivo "proposta.docx"/, 'a resposta sabe que o arquivo será ajustado');
  const baixar = await ana.bin(`/api/conversas/${conv.id}/arquivos/${a.id}`);
  assert.equal(baixar.headers.get('content-type'), MIMES.docx);
  assert.match(baixar.headers.get('content-disposition'), /filename="proposta-ajustado\.docx"/);
  const buf = baixar.dados;
  assert.match(await ler('x.docx', buf), /45 dias/);
  assert.equal(parte(buf, 'word/styles.xml'), parte(orig, 'word/styles.xml'));
  // Pedido seguinte, sem anexo: parte da versão ajustada (os 45 dias continuam).
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Agora, ainda no arquivo que anexei, mude o título para "Proposta comercial revisada".' });
  const a2 = r2.fim.arquivos?.[0];
  assert.equal(a2?.tipo, 'edicao', JSON.stringify(r2.fim));
  const t2 = await ler('x.docx', (await ana.bin(`/api/conversas/${conv.id}/arquivos/${a2.id}`)).dados);
  assert.match(t2, /Proposta comercial revisada/); assert.match(t2, /45 dias/);
  // O histórico mostra o cartão do arquivo ajustado.
  const d = (await ana.get(`/api/conversas/${conv.id}`)).dados;
  assert.ok((d.mensagens || d.conversa?.mensagens || []).some(m => (m.arquivos || []).some(x => x.tipo === 'edicao')) || JSON.stringify(d).includes('"edicao"'));
});

test('conversa: planilha corrigida no lugar; "transforme em contrato" não edita o original; falha da IA vira aviso', async () => {
  const conv = await nova();
  const plan = xlsx([{ nome: 'Fluxo', linhas: [['Conta', 'Jan'], ['Receita', '100'], ['Custo', '40'], ['Resultado', '=B2+B3']] }], { titulo: 'Fluxo' });
  const r = await enviarMensagem(ana, conv.id, { texto: 'Corrija a fórmula do resultado da planilha anexada e preserve o layout.', anexos: [{ nome: 'fluxo.xlsx', base64: plan.toString('base64') }] });
  const a = r.fim.arquivos?.[0];
  assert.equal(a?.tipo, 'edicao', JSON.stringify(r.fim));
  const buf = (await ana.bin(`/api/conversas/${conv.id}/arquivos/${a.id}`)).dados;
  assert.match(parte(buf, 'xl/worksheets/sheet1.xml'), /<c r="B4"[^>]*><f>B2-B3<\/f><\/c>/);
  const antes = edicoes().length;
  const conv2 = await nova();
  const r2 = await enviarMensagem(ana, conv2.id, { texto: 'Transforme a proposta anexada em uma minuta de contrato. Gere um DOCX editável.', anexos: [{ nome: 'proposta.docx', base64: DOC().toString('base64') }] });
  assert.equal(r2.status, 200);
  assert.equal(edicoes().length, antes, 'pedido de documento novo não passa pela edição do original');
  assert.ok(!(r2.fim.arquivos || []).some(x => x.tipo === 'edicao'));
  // A IA não devolve operações: nada de arquivo quebrado; a pessoa é avisada.
  falharJson = true;
  try {
    const conv3 = await nova();
    const r3 = await enviarMensagem(ana, conv3.id, { texto: 'Corrija o prazo de pagamento no próprio arquivo anexado.', anexos: [{ nome: 'proposta.docx', base64: DOC().toString('base64') }] });
    assert.equal(r3.status, 200);
    assert.ok(!(r3.fim.arquivos || []).length);
    const d = JSON.stringify((await ana.get(`/api/conversas/${conv3.id}`)).dados);
    assert.match(d, /Não foi possível aplicar as alterações no arquivo original/);
  } finally { falharJson = false; }
});

test('conversa: sem anexo novo, o arquivo citado pelo nome é o editado (não o último enviado)', async () => {
  const conv = await nova();
  const deck = pptx('# Kickoff\n\nAgenda do projeto', { titulo: 'Deck' });
  await enviarMensagem(ana, conv.id, { texto: 'Analise o material.', anexos: [{ nome: 'kickoff-cliente.pptx', base64: deck.toString('base64') }, { nome: 'contrato.docx', base64: DOC().toString('base64') }] });
  const antes = edicoes().length;
  await enviarMensagem(ana, conv.id, { texto: 'Faça os ajustes no documento kickoff-cliente.pptx: troque o título para Kickoff 2027.' });
  const chamada = edicoes()[antes];
  assert.ok(chamada, 'a edição foi tentada');
  assert.match(texto(chamada.messages[0].content), /arquivo PPTX existente/, 'a apresentação citada, não o contrato (último anexo)');
});
