// Paridade da conversa livre (auditoria em produção): o pedido vira o entregável pedido, não um texto sobre ele.
// Imagem gerada e editada na conversa, site com prévia isolada e código em .zip, Excel com fórmulas de verdade,
// arquivo sem a conversa em volta, ajuste que não desce de nível, abertura e fechamento da resposta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem, PNG_FALSO } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { soEntregavel, blocos, slides, formulaDaCelula } from '../src/escritorio.js';
import { pedidoDeImagem, proporcaoDoPedido } from '../src/imagem-chat.js';
import { entregaDeCodigo } from '../src/codigo-chat.js';
import { nomesDasTabelas } from '../public/tabelas.js';
import { analisarPedido, requisitosDe } from '../src/roteador.js';
import { pecaDaConversa } from '../src/conversas.js';

const texto = c => (typeof c === 'string' ? c : (c || []).map(p => p.text || '').join('\n'));
const SITE = 'Entendi: você quer um site institucional. Vou entregar a página completa.\n\n## Código\n\n```html\n<!DOCTYPE html>\n<html><head><title>X</title><link rel="stylesheet" href="style.css"></head><body><h1>Olá</h1><script src="app.js"></script></body></html>\n```\n\n**style.css**\n```css\nh1{color:red}\n```\n\n**app.js**\n```js\ndocument.title="ok";\n```\n\n## O que foi feito\n- Site com uma página.';
const PLANILHA = 'Entendi: fluxo de caixa com fórmulas.\n\n### Premissas\n\n| Item | Valor |\n|---|---|\n| Receita | 1000 |\n| Crescimento | 5% |\n\n### Fluxo\n\n| Mês | Receita | Custo | Resultado |\n|---|---|---|---|\n| 1 | =Premissas!B2 | 400 | =B2-C2 |\n| 2 | =B2*(1+Premissas!B3) | 400 | =B3-C3 |\n\n## O que foi feito\n- Duas abas.';
const DOC = 'Entendi: você quer a proposta em Word. Vou entregar o documento completo.\n\n# Proposta\n\n## Escopo\n\nTexto do escopo.\n\n---\n\n## Investimento\n\n1. Primeira parcela\n\n2. Segunda parcela\n\n## O que foi feito\n- Proposta criada.\n- O arquivo está para baixar abaixo.';
let S, OR, ana, admin;
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const u = texto(b.messages.filter(m => m.role === 'user').at(-1)?.content);
    if (/site institucional/.test(u)) return SITE;
    if (/fluxo de caixa/.test(u)) return PLANILHA;
    if (/proposta em Word|proposta comercial em Word|Melhore o design/.test(u)) return DOC;
    return 'Entendi: vou gerar a imagem pedida, com a composição descrita.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], empresa: 'Empresa Exemplo', producaoVisual: { imagens: { ativa: true } } });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });
const nova = async () => (await ana.post('/api/conversas', {})).dados.conversa;
// Conteúdo de um .zip (xlsx/docx): { nome: texto }.
const abrirZip = b => { const out = {}; let i = 0; while (b.readUInt32LE(i) === 0x04034b50) { const comp = b.readUInt32LE(i + 18), n = b.readUInt16LE(i + 26), ex = b.readUInt16LE(i + 28); const nome = b.toString('utf8', i + 30, i + 30 + n); const d = b.subarray(i + 30 + n + ex, i + 30 + n + ex + comp); out[nome] = (b.readUInt16LE(i + 8) === 8 ? inflateRawSync(d) : d).toString('utf8'); i += 30 + n + ex + comp; } return out; };
const imagens = () => OR.chamadas.filter(b => b.modalities?.includes('image'));

test('a resposta confirma o entendimento no início e explica o trabalho no fim; números pedidos e anexo novo valem', async () => {
  const conv = await nova();
  await enviarMensagem(ana, conv.id, { texto: 'Faça um resumo deste assunto.' });
  const sis = texto(OR.chamadas.at(-1).messages[0].content);
  assert.match(sis, /comece com uma ou duas frases dizendo o que você entendeu/);
  assert.match(sis, /## O que foi feito/);
  assert.match(sis, /Cumpra exatamente os números/);
  assert.match(sis, /esse arquivo é a base do trabalho/);
});

test('imagem: gerada na conversa com a proporção pedida; "troque a roupa" edita a última; anexada é editada', async () => {
  const conv = await nova();
  const antes = imagens().length;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Gere uma imagem fotorrealista em 16:9 de uma profissional de 40 anos num escritório, com espaço livre à direita.' });
  assert.equal(r.status, 200);
  const a = r.fim.arquivos?.[0];
  assert.equal(a?.tipo, 'imagem', 'a imagem chega como arquivo da resposta');
  const pedido = imagens().at(-1);
  assert.equal(imagens().length, antes + 1);
  assert.equal(pedido.image_config?.aspect_ratio, '16:9');
  assert.match(texto(pedido.messages[0].content), /profissional de 40 anos/);
  assert.match(texto(OR.chamadas.filter(b => !b.modalities).at(-1).messages[0].content), /vai gerar a imagem/, 'o texto não diz que não consegue');
  const ver = await ana.req('GET', `/api/conversas/${conv.id}/arquivos/${a.id}?ver=1`);
  assert.equal(ver.status, 200);
  const baixar = await ana.bin(`/api/conversas/${conv.id}/arquivos/${a.id}`);
  assert.equal(baixar.headers.get('content-type'), 'image/png');
  assert.match(baixar.headers.get('content-disposition'), /attachment; filename=".+\.png"/);
  // Continuação: edita a última imagem (vai junto ao gerador) e mantém a proporção.
  const r2 = await enviarMensagem(ana, conv.id, { texto: 'Mantenha a mesma pessoa e composição, mas troque a roupa por um blazer azul-marinho.' });
  assert.equal(r2.fim.arquivos?.[0]?.modo, 'editar');
  const p2 = imagens().at(-1);
  assert.ok(Array.isArray(p2.messages[0].content) && p2.messages[0].content.some(x => x.type === 'image_url' && x.image_url.url.startsWith('data:image/png')), 'a imagem anterior vai como base');
  assert.equal(p2.image_config?.aspect_ratio, '16:9');
  // Imagem anexada pela pessoa.
  const conv2 = await nova();
  const r3 = await enviarMensagem(ana, conv2.id, { texto: 'Utilize a imagem da personagem anexada. Substitua sua roupa por um conjunto executivo.', anexos: [{ nome: 'personagem.png', base64: PNG_FALSO.split(',')[1] }] });
  assert.equal(r3.fim?.arquivos?.[0]?.modo, 'editar', JSON.stringify(r3.erro || r3.falha || r3.eventos?.slice(-2)));
  assert.ok(imagens().at(-1).messages[0].content.some(x => x.type === 'image_url'));
});

test('imagem: sem liberação da empresa, nada é gerado e a pessoa fica sabendo o motivo', async () => {
  salvarConfig(S.app.db, { producaoVisual: { imagens: { ativa: false } } });
  try {
    const conv = await nova();
    const antes = imagens().length;
    const r = await enviarMensagem(ana, conv.id, { texto: 'Crie uma imagem de um escritório moderno.' });
    assert.equal(r.status, 200);
    assert.equal(imagens().length, antes);
    assert.equal(r.fim.arquivos, undefined);
    assert.match(um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'aviso' order by id desc limit 1", conv.id).texto, /A imagem não foi gerada: a geração de imagem não está liberada/);
  } finally { salvarConfig(S.app.db, { producaoVisual: { imagens: { ativa: true } } }); }
});

test('site: prévia funcionando numa página isolada (sandbox) e o código-fonte em .zip', async () => {
  const conv = await nova();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Crie um site institucional com formulário de contato.' });
  const site = r.fim.arquivos.find(a => a.tipo === 'site'), zip = r.fim.arquivos.find(a => a.tipo === 'codigo');
  assert.ok(site && zip);
  const ver = await ana.bin(`/api/conversas/${conv.id}/arquivos/${site.id}?ver=1`);
  const csp = ver.headers.get('content-security-policy');
  assert.match(csp, /^sandbox allow-scripts allow-forms/);
  assert.match(csp, /connect-src 'none'/);
  const html = ver.dados.toString('utf8');
  assert.match(html, /<style>\nh1\{color:red\}/, 'o CSS do outro bloco entra na prévia');
  assert.match(html, /document\.title="ok"/);
  assert.deepEqual(zip.arquivos, ['index.html', 'style.css', 'app.js']);
  const z = await ana.bin(`/api/conversas/${conv.id}/arquivos/${zip.id}`);
  assert.deepEqual(Object.keys(abrirZip(z.dados)), ['index.html', 'style.css', 'app.js']);
  assert.match(z.headers.get('content-disposition'), /\.zip"/);
  // Outra pessoa não acessa.
  await admin.post('/api/admin/pessoas', { email: 'bia@exemplo.com.br', nome: 'Bia' });
  const bia = await S.cliente().entrar('bia@exemplo.com.br');
  assert.equal((await bia.req('GET', `/api/conversas/${conv.id}/arquivos/${site.id}?ver=1`)).status, 404);
});

test('Excel com fórmulas de verdade, abas com o nome do título, e o arquivo sem a conversa em volta', async () => {
  const conv = await nova();
  const r = await enviarMensagem(ana, conv.id, { texto: 'Crie uma planilha Excel de fluxo de caixa com fórmulas.' });
  const x = abrirZip((await ana.bin(`/api/conversas/${conv.id}/mensagens/${r.fim.id}/arquivo/xlsx`)).dados);
  const zip = Object.values(x).join('\n');
  assert.match(zip, /<f>Premissas!B2<\/f>/);
  assert.match(zip, /<f>B2\*\(1\+Premissas!B3\)<\/f>/);
  assert.match(zip, /fullCalcOnLoad="1"/);
  assert.match(zip, /name="Premissas"/);
  // Word: sem abertura, sem "O que foi feito", sem "---" e com a numeração escrita.
  const conv2 = await nova();
  const d = await enviarMensagem(ana, conv2.id, { texto: 'Quero a proposta em Word.' });
  const t = soEntregavel(DOC);
  assert.ok(!/Entendi|O que foi feito/.test(t));
  assert.deepEqual(blocos(t).filter(b => b.tipo === 'lista').map(b => b.numeros), [[1], [2]]);
  const w = abrirZip((await ana.bin(`/api/conversas/${conv2.id}/mensagens/${d.fim.id}/arquivo/docx`)).dados)['word/document.xml'];
  assert.match(w, /Investimento/);
  assert.ok(!/O que foi feito|Entendi|>---</.test(w), 'o arquivo não leva a conversa nem as linhas ---');
});

test('ajuste do trabalho da conversa não desce para o nível Rápido', async () => {
  const conv = await nova();
  const r1 = await enviarMensagem(ana, conv.id, { texto: 'Crie uma proposta comercial em Word com escopo, investimento e cronograma completos.' });
  assert.equal(um(S.app.db, 'select classe from roteamento where resposta_id = ?', r1.fim.id).classe, 'equilibrado');
  const r = await enviarMensagem(ana, conv.id, { texto: 'Melhore o design sem alterar o conteúdo.' });
  const rota = um(S.app.db, 'select classe, requisitos from roteamento where resposta_id = ?', r.fim.id);
  assert.notEqual(rota.classe, 'rapido');
  assert.equal(JSON.parse(rota.requisitos).motivos.continuidade, 'continua_o_trabalho_anterior');
  // Sem trabalho anterior, a mesma frase continua no nível da tarefa.
  assert.equal(requisitosDe(analisarPedido({ texto: 'Melhore o design sem alterar o conteúdo.' })).classe, 'rapido');
  // Pedido simples explícito não herda.
  assert.equal(analisarPedido({ texto: 'só uma correção simples no título', temResposta: true, anterior: { classe: 'equilibrado', nivel: 2, trabalho: 2 } }).sinais.continuacao, false);
});

test('unidades: proporção, pedido de imagem, peças por formato, código, fórmulas e slides sem "continuação"', () => {
  assert.equal(proporcaoDoPedido('versão quadrada para o Instagram'), '1:1');
  assert.equal(proporcaoDoPedido('imagem em 16:9'), '16:9');
  assert.equal(pedidoDeImagem('Crie uma apresentação com imagens'), null);
  assert.equal(pedidoDeImagem('Analise a imagem anexada'), null);
  assert.equal(pedidoDeImagem('Deixe a iluminação mais quente', { ultima: { dataUrl: 'x' }, ultimaFoiImagem: false }), null, 'sem imagem na última resposta não é edição');
  const pecas = pecaDaConversa('Crie uma campanha para LinkedIn com peças visuais nos formatos quadrado e horizontal.').operacao.entregaveis;
  assert.deepEqual(pecas.map(e => e.visual.formato), ['1:1', '1.91:1']);
  assert.deepEqual(nomesDasTabelas('### Premissas\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n| c |\n|---|\n| 3 |'), ['Premissas', null]);
  assert.equal(formulaDaCelula('=SOMA(B2;B5)'), 'SUM(B2,B5)');
  assert.equal(formulaDaCelula('=WEBSERVICE("http://x")'), null);
  assert.equal(formulaDaCelula('=cmd|\' /c calc\'!A0'), null);
  assert.equal(entregaDeCodigo('```bash\nnpm i\n```'), null, 'um comando solto não vira projeto');
  // 12 linhas numa seção: um slide só (compacto), sem "(continuação)".
  const s = slides(`# Deck\n\n## Lista\n\n${Array.from({ length: 12 }, (_, i) => `- Item ${i + 1}`).join('\n')}`, 'Deck');
  assert.equal(s.slides.length, 1);
  assert.ok(s.slides[0].compacto);
});

test('projeto de código em .zip é lido (só código e texto; dependências, binários e .env ficam de fora)', async () => {
  const { zipar } = await import('../src/escritorio.js');
  const { extrairTexto } = await import('../src/texto.js');
  const z = zipar([{ nome: 'app/src/servidor.js', dados: 'export const x = 1;\n' }, { nome: 'app/.env', dados: 'SEGREDO=abc' }, { nome: 'app/node_modules/lib/index.js', dados: 'x' }, { nome: 'app/logo.png', dados: Buffer.from([0x89, 0x50, 0, 1]) }]);
  const { texto } = await extrairTexto({ nome: 'projeto.zip', base64: z.toString('base64') });
  assert.match(texto, /### Arquivo: app\/src\/servidor\.js/);
  assert.ok(!/SEGREDO|node_modules|logo\.png/.test(texto));
  await assert.rejects(extrairTexto({ nome: 'fotos.zip', base64: zipar([{ nome: 'a.png', dados: Buffer.from([0x89, 0x50]) }]).toString('base64') }), /não tem arquivos de código/);
});

test('nível do ajuste: a complexidade do ajuste é avaliada primeiro (pontual segue a mensagem; substancial mantém o trabalho)', () => {
  const ant = { temResposta: true, anterior: { classe: 'avancado', nivel: 3, trabalho: 2 } };
  const r = texto => { const a = analisarPedido({ texto, ...ant }); return { ajuste: a.sinais.ajuste, classe: requisitosDe(a).classe }; };
  assert.deepEqual(r('Troque o título para "Resultados 2027".'), { ajuste: 'pontual', classe: 'rapido' });
  assert.deepEqual(r('Corrija a data da reunião para 22/10.'), { ajuste: 'pontual', classe: 'rapido' });
  assert.deepEqual(r('Melhore o design sem alterar o conteúdo.'), { ajuste: 'substancial', classe: 'equilibrado' }, 'o nível do trabalho, não o da última resposta');
  assert.deepEqual(r('Acrescente uma seção de riscos e mitigação.'), { ajuste: 'substancial', classe: 'equilibrado' });
  assert.deepEqual(r('Altere o preço para R$ 18 mil e atualize todos os arquivos.'), { ajuste: 'substancial', classe: 'equilibrado' });
});

test('ajuste com dependências e ajuste complexo: o pequeno que se propaga mantém o nível; o complexo sobe um', () => {
  const ant = { temResposta: true, anterior: { classe: 'equilibrado', nivel: 2, trabalho: 2 } };
  const r = (texto, dependencias = null) => { const a = analisarPedido({ texto, ...ant, dependencias }); const q = requisitosDe(a); return { ajuste: a.sinais.ajuste, classe: q.classe, original: a.sinais.nivelOriginal }; };
  assert.deepEqual(r('Corrija a data da reunião para 22/10.'), { ajuste: 'pontual', classe: 'rapido', original: 2 });
  assert.deepEqual(r('Mude a taxa de crescimento para 8%.', 'formulas'), { ajuste: 'substancial', classe: 'equilibrado', original: 2 }, 'mexe em fórmula interligada');
  assert.deepEqual(r('Reestruture a arquitetura da aplicação mantendo as funcionalidades.'), { ajuste: 'complexo', classe: 'avancado', original: 2 });
  assert.deepEqual(r('Revise as cláusulas do contrato com as novas condições comerciais.'), { ajuste: 'complexo', classe: 'avancado', original: 2 });
  const a = analisarPedido({ texto: 'Reestruture a arquitetura da aplicação.', ...ant });
  assert.equal(requisitosDe(a).motivos.continuidade, 'ajuste_complexo_sobe_um_nivel');
});

test('fórmula com multiplicação não perde o "*" (o Markdown tomava por itálico)', () => {
  assert.equal(formulaDaCelula('=B2*(1+Premissas!$B$2)*(1-Premissas!$B$3)'), 'B2*(1+Premissas!$B$2)*(1-Premissas!$B$3)');
  assert.equal(formulaDaCelula('**=SUM(B2:B3)**'), 'SUM(B2:B3)');
});

test('peças de campanha escritas em "###" dentro de "## Peças visuais" são encontradas (antes não saía peça nenhuma)', async () => {
  const { secaoDoResultado } = await import('../src/visual/producao.js');
  const t = '## Peças Visuais\n\n### Peça quadrado 1:1\n\n### Visão geral\n- A\n\n### Chamada: Conheça\n\n### Peça horizontal 1.91:1\n\n### Números\n- B\n\n## O que foi feito\n- x';
  assert.match(secaoDoResultado(t, 'Peça quadrado 1:1'), /Visão geral[\s\S]*Chamada: Conheça/);
  assert.ok(!/Números/.test(secaoDoResultado(t, 'Peça quadrado 1:1')));
  assert.match(secaoDoResultado(t, 'Peça horizontal 1.91:1'), /Números/);
  assert.ok(!/O que foi feito/.test(secaoDoResultado(t, 'Peça horizontal 1.91:1')));
});
