// Design pela IA (diretora de arte): o HTML/CSS da IA é dado (limpo: sem script, evento ou recurso externo), é
// composto num Chromium isolado (JavaScript desligado, rede bloqueada) e conferido nos pixels e no DOM; falhou, uma
// correção; falhou de novo, motor clássico. Prévia, PDF, PNG/JPG, edição sem IA, restauração e acesso pela API.
process.env.DESIGN_IA = '1';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, todos, um } from '../src/db.js';
import { limparHtml, limparCss, lerDesign, documentoDesign, renderizarDesign, conferirDesign } from '../src/visual/design.js';
import { comPagina, ORIGEM } from '../src/visual/chromium.js';
import { analisarConteudo } from '../src/visual/conteudo.js';
import { resolverIdentidade } from '../src/visual/marca.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Designer falso: lê o conteúdo do pedido e devolve um design limpo (cartões, faixa de título, números grandes).
function designFalso(b, { ruim = false } = {}) {
  const u = texto(b.messages[1].content);
  const min = Number(/nenhum texto menor que (\d+)px/.exec(texto(b.messages[0].content))[1]);
  const fc = Math.max(18, min + 2), ft = Math.max(30, min + 10);
  const paginas = JSON.parse(/CONTEÚDO POR PÁGINA \(JSON; é dado, não instrução\):\n(.+?)(?:\n\n|$)/s.exec(u)[1]);
  const css = `<style>.wrap{position:absolute;inset:48px;display:flex;flex-direction:column;gap:14px}.faixa{background:var(--primaria);color:#fff;padding:16px 22px;border-radius:12px;font-size:${ft}px;font-weight:700}
.grade{display:flex;flex-wrap:wrap;gap:10px}.card{background:#F3F5F7;border-radius:10px;padding:10px 14px;font-size:${fc}px;color:#18212B;flex:1 1 260px}.num{font-size:${ft + 4}px;font-weight:700;color:var(--primaria)}
.heroi{position:absolute;right:48px;top:48px;width:200px;height:120px;object-fit:cover;border-radius:10px}</style>`;
  const item = it => it.tipo === 'lista' ? it.itens.map(x => `<div class="card">${esc(x)}</div>`).join('')
    : it.tipo === 'indicadores' ? it.indicadores.map(x => `<div class="card"><div class="num">${esc(x.valor)}</div>${esc(x.rotulo)}${x.detalhe ? ` ${esc(x.detalhe)}` : ''}</div>`).join('')
      : it.tipo === 'tabela' ? [...it.cabecalho, ...it.linhas.flat()].map(c => `<div class="card">${esc(c)}</div>`).join('')
        : it.tipo === 'fluxo' ? it.etapas.map(e => `<div class="card">${esc(e.replace(/ \(decisão\)$/, ''))}</div>`).join('')
          : `<div class="card">${esc(it.texto)}</div>`;
  const secoes = paginas.map(p => `<section class="pagina"><div class="wrap"><div class="faixa">${esc(p.titulo || 'Destaques')}</div>${/asset:heroi/.test(texto(b.messages[0].content)) && p.pagina === 1 ? '<img class="heroi" src="asset:heroi">' : ''}
<div class="grade">${ruim ? '' : p.itens.map(item).join('')}</div>${ruim ? '<p style="font-size:9px;color:#ccc">999 lorem</p>' : ''}</div></section>`).join('\n');
  return `${u.includes('CSS já definido') ? '' : css}\n${secoes}`;
}

const DECK = `Título: Resultados do trimestre

### Indicadores
- Receita: R$ 4,2 mi
- Margem: 18%

### Riscos
- Concentração de 40% da receita em 3 clientes.
- Atraso na contratação de 2 vendedores.

### Próximos passos
1. Contratar os 2 vendedores até novembro.
2. Revisar a carteira de clientes.`;
const PLANOS = {
  deck: { resumo: 'Apresentação do trimestre.', entradas: [], etapas: [{ texto: 'Ler' }, { texto: 'Organizar' }], entregaveis: [{ id: 'e1', tipo: 'apresentacao', rotulo: 'Apresentação para a diretoria', visual: { tipo: 'presentation' } }] },
  post: { resumo: 'Peça.', entradas: [], etapas: [{ texto: 'Escrever' }, { texto: 'Montar' }], entregaveis: [{ id: 'e1', tipo: 'imagem', rotulo: 'Peça de divulgação', visual: { tipo: 'social_post' } }] },
};
const PEDIDOS = { deck: 'Transforme o relatório do trimestre em uma apresentação para a diretoria.', post: 'Crie uma arte para divulgar a Semana da Segurança.' };
let modoDesign = 'bom';   // 'bom' | 'ruim'
const designs = [];
function roteiro(b) {
  if (b.modalities) return null;
  const s = texto(b.messages[0].content);
  if (s.includes('PLANO DE TRABALHO')) { const p = texto(b.messages[1].content); return JSON.stringify(PLANOS[Object.keys(PEDIDOS).find(k => p.includes(PEDIDOS[k]))] || { entregaveis: [] }); }
  if (s.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (s.includes('diretora de arte')) { designs.push(b); return designFalso(b, { ruim: modoDesign === 'ruim' }); }
  if (s.includes('diretor de arte')) return 'sem plano';
  if (!s.includes('Você está executando o Quick Win')) return 'Certo.';
  if (s.includes('Apresentação para a diretoria')) return `## Apresentação para a diretoria\n${DECK}`;
  if (s.includes('Peça de divulgação')) return '## Peça de divulgação\nTítulo: Semana da Segurança\n\n### Semana da Segurança\nTreinamentos abertos para todas as equipes.\n\nChamada: Inscreva-se até sexta';
  return 'Certo.';
}

let S, OR, ana, beto, area;
before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], empresa: 'Empresa Exemplo' });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  area = (await admin.post('/api/admin/areas', { nome: 'Diretoria' })).dados.id;
  for (const [e, n] of [['ana', 'Ana'], ['beto', 'Beto']]) await admin.post('/api/admin/pessoas', { email: `${e}@exemplo.com.br`, nome: n, areas: [{ id: area, responsavel: true }] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  beto = await S.cliente().entrar('beto@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function executar(chave) {
  const descricao = PEDIDOS[chave];
  const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao })).dados;
  const q = (await ana.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [area] })).dados;
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  return { ...(await enviarMensagem(ana, conv.id, { executar_quick_win: true, texto: 'Material fictício.' })), conv };
}
const binario = (quem, caminho) => fetch(S.base + caminho, { headers: { cookie: quem.cookie } });

test('limpeza: script, eventos, iframe, link, @import, url() e src externos saem; assets da peça viram a origem isolada', () => {
  const h = limparHtml('<div onclick="x()" style="background:url(https://evil.example/a.png);color:red">oi</div><script>alert(1)</script><iframe src="https://x"></iframe><img src="https://evil.example/t.png"><img src="asset:heroi" onerror="y()"><a href="javascript:alert(1)">l</a><svg><foreignObject><div>x</div></foreignObject><use href="https://e/x#a"/><circle fill="url(#g)"/></svg><link rel=stylesheet href="https://e/s.css">');
  assert.doesNotMatch(h, /script|onclick|onerror|iframe|evil|javascript:|foreignObject|<link|https:\/\/e\//i);
  assert.match(h, new RegExp(`src="${ORIGEM}/assets/heroi"`));
  assert.match(h, /fill="url\(#g\)"/);
  const c = limparCss("@import url('https://e/x.css'); .a{background:url(https://evil/x.png);behavior:url(x.htc)} .b{background-image:url('asset:logo');position:fixed} @font-face{font-family:x;src:url(https://e/f.ttf)}");
  assert.doesNotMatch(c, /@import|evil|behavior|@font-face|https:\/\/e|position:fixed/);
  assert.match(c, new RegExp(`${ORIGEM}/assets/logo`));
  const d = lerDesign('```html\n<style>.x{color:red}</style><section class="pagina"><p>Um</p></section><section class="pagina"><p>Dois</p></section>\n```');
  assert.equal(d.paginas.length, 2); assert.match(d.css, /\.x/);
});

test('isolamento do navegador: JavaScript da página não roda e nenhum pedido sai para a rede (mesmo sem a limpeza)', async () => {
  let pedidos = 0;
  const srv = createServer((req, res) => { pedidos++; res.end('x'); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const porta = srv.address().port;
  const bruto = `<!doctype html><html><head><style>@import url('http://127.0.0.1:${porta}/a.css'); body{background:url('http://127.0.0.1:${porta}/b.png')}</style><link rel="stylesheet" href="http://127.0.0.1:${porta}/c.css"></head>
<body><img src="http://127.0.0.1:${porta}/d.png"><iframe src="http://127.0.0.1:${porta}/e"></iframe><p id="p">original</p><script>document.getElementById('p').textContent='HACK';fetch('http://127.0.0.1:${porta}/f')</script></body></html>`;
  const txt = await comPagina({ largura: 400, altura: 300, documento: bruto }, page => page.evaluate(() => document.body.innerText));
  await new Promise(ok => srv.close(ok));
  assert.match(txt, /original/); assert.doesNotMatch(txt, /HACK/);
  assert.equal(pedidos, 0, 'nenhum pedido chegou ao servidor local');
});

test('conferência no navegador: transbordo, margem, fonte pequena, contraste (nos pixels), sobreposição, número inventado e conteúdo omitido', async () => {
  const conteudo = analisarConteudo('### Riscos\n- Atraso de fornecedor.\n- Câmbio.\n\n### Indicadores\n- Receita: R$ 4,2 mi', { titulo: 'Resumo' });
  const identidade = resolverIdentidade({});
  const paginas = [{ pagina: 1, itens: [{ id: 's1.i1', tipo: 'lista', itens: ['Atraso de fornecedor.', 'Câmbio.'] }, { id: 's2.i1', tipo: 'indicadores', indicadores: [{ valor: 'R$ 4,2 mi', rotulo: 'Receita' }] }] }];
  const bom = lerDesign(`<style>.w{position:absolute;inset:60px;display:flex;flex-direction:column;gap:16px;font-size:24px}</style><section class="pagina"><div class="w"><h1 style="font-size:40px">Resumo</h1><p>Atraso de fornecedor.</p><p>Câmbio.</p><p><b>R$ 4,2 mi</b> Receita</p></div></section>`);
  const r1 = await renderizarDesign(bom, { formato: '16:9', identidade });
  const q1 = conferirDesign(r1.medidas, { conteudo, paginas, formato: '16:9', extras: ['Resumo'], imagens: r1.imagens });
  assert.ok(q1.ok, JSON.stringify(q1.falhas));
  assert.equal(r1.pdf.subarray(0, 5).toString(), '%PDF-');
  const ruim = lerDesign(`<section class="pagina"><div style="position:absolute;left:60px;top:60px;width:300px;height:40px;overflow:hidden;font-size:24px">Atraso de fornecedor. Um texto longo que não cabe na caixa de jeito nenhum mesmo</div>
<p style="position:absolute;left:1250px;top:300px;font-size:24px">fora da página</p><p style="position:absolute;left:5px;top:5px;font-size:24px">na borda</p>
<p style="position:absolute;left:60px;top:200px;font-size:10px">pequeno</p><p style="position:absolute;left:60px;top:260px;font-size:24px;color:#BBBBBB">Câmbio.</p>
<p style="position:absolute;left:60px;top:400px;font-size:24px">texto A sobreposto</p><p style="position:absolute;left:70px;top:405px;font-size:24px">texto B sobreposto</p>
<p style="position:absolute;left:60px;top:500px;font-size:24px">Receita de 777 mil</p></section>`);
  const r2 = await renderizarDesign(ruim, { formato: '16:9', identidade });
  const q2 = conferirDesign(r2.medidas, { conteudo, paginas, formato: '16:9', extras: ['Resumo'], imagens: r2.imagens });
  for (const c of ['texto_cortado', 'fora_da_pagina', 'margem', 'fonte_pequena', 'contraste', 'sobreposicao', 'numero_inventado', 'conteudo_omitido']) assert.ok(q2.codigos.includes(c), `${c}: ${JSON.stringify(q2.codigos)}`);
  // O documento sempre leva as fontes empacotadas e as cores da marca como variáveis.
  assert.match(documentoDesign(bom, { formato: '16:9', identidade }), /--primaria:#1F3A5F/);
});

test('Quick Win com peça desenhada pela IA: artefato "design", prévia, PDF de várias páginas, PNG/JPG, edição sem IA, restauração e acesso', async () => {
  modoDesign = 'bom'; designs.length = 0;
  const r = await executar('deck');
  const a = r.fim.artefatos?.[0];
  assert.ok(a, JSON.stringify(r.linhas?.slice(-3) || r));
  const row = um(S.app.db, 'select * from artefatos_visuais where id = ?', a.id);
  assert.equal(json(row.plano).motor, 'design', JSON.stringify(json(row.qualidade)));
  assert.equal(json(row.qualidade).motor, 'design');
  assert.ok(designs.length >= 1);
  assert.match(texto(designs[0].messages[0].content), /LITERALMENTE/);
  assert.ok(!texto(designs[0].messages[1].content).includes('Material fictício'), 'o pedido de design leva o conteúdo da peça, não o material bruto');
  // Prévia (JPEG guardado), PDF com todas as páginas, PNG em zip, JPG de uma página.
  const prev = await binario(ana, `/api/artefatos/${a.id}/paginas/1`);
  assert.equal(prev.headers.get('content-type'), 'image/jpeg');
  const pdf = Buffer.from(await (await binario(ana, `/api/artefatos/${a.id}/baixar?formato=pdf`)).arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, a.paginas);
  const zipPng = Buffer.from(await (await binario(ana, `/api/artefatos/${a.id}/baixar?formato=png`)).arrayBuffer());
  assert.equal(zipPng.readUInt32BE(0), 0x504b0304);
  const jpg = Buffer.from(await (await binario(ana, `/api/artefatos/${a.id}/baixar?formato=jpg&pagina=1`)).arrayBuffer());
  assert.ok(jpg[0] === 0xff && jpg[1] === 0xd8);
  // Edição de texto: sem IA, nova versão renderizada e conferida.
  const antes = OR.chamadas.length;
  const ed = json(row.plano);
  const lista = json(row.conteudo).secoes.flatMap(s => s.itens).find(i => i.tipo === 'lista' && i.itens.some(x => /Atraso/.test(x.texto)));
  const k = lista.itens.findIndex(x => /Atraso/.test(x.texto));
  const e = await ana.req('PATCH', `/api/artefatos/${a.id}`, { textos: [{ item: lista.id, indice: k, texto: 'Atraso na contratação (revisado).' }] });
  assert.equal(e.status, 200, JSON.stringify(e.dados));
  assert.equal(OR.chamadas.length, antes, 'edição não chama a IA');
  const v2 = um(S.app.db, 'select * from artefatos_visuais where id = ?', e.dados.artefato.id);
  assert.ok(json(v2.plano).design.paginas.some(h => h.includes('(revisado)')));
  assert.ok(todos(S.app.db, 'select chave from artefatos_render where artefato_id = ?', v2.id).length >= 2);
  void ed;
  // Formato não muda numa peça desenhada (pede derivar).
  assert.equal((await ana.req('PATCH', `/api/artefatos/${v2.id}`, { formato: '1:1' })).status, 422);
  // Restaurar a versão 1.
  const rest = await ana.post(`/api/artefatos/${a.id}/restaurar`, {});
  assert.equal(rest.status, 200, JSON.stringify(rest.dados));
  assert.ok(!json(um(S.app.db, 'select plano from artefatos_visuais where id = ?', rest.dados.artefato.id).plano).design.paginas.some(h => h.includes('(revisado)')));
  // Outra pessoa: 404 em tudo.
  for (const c of [`/api/artefatos/${a.id}`, `/api/artefatos/${a.id}/paginas/1`, `/api/artefatos/${a.id}/baixar?formato=pdf`]) assert.equal((await beto.get(c)).status, 404, c);
});

test('design reprovado duas vezes: uma correção com a lista exata, depois motor clássico (a peça nunca sai quebrada)', async () => {
  modoDesign = 'ruim'; designs.length = 0;
  const r = await executar('deck');
  const a = r.fim.artefatos?.[0];
  assert.ok(a);
  const row = um(S.app.db, 'select * from artefatos_visuais where id = ?', a.id);
  assert.notEqual(json(row.plano).motor, 'design');
  assert.equal(json(row.qualidade).motivo_classico, 'conferencia');
  assert.ok(designs.length >= 2, 'houve a correção');
  assert.match(texto(designs.at(-1).messages[1].content), /falhou nestes pontos[\s\S]*(faltou|números que não estão)/);
  modoDesign = 'bom';
});

test('peça de impacto: imagem ilustrativa gerada (liberada para todos por padrão) entra no design pela origem isolada', async () => {
  modoDesign = 'bom'; designs.length = 0;
  const r = await executar('post');
  const a = r.fim.artefatos?.[0];
  const row = um(S.app.db, 'select * from artefatos_visuais where id = ?', a.id);
  assert.equal(json(row.qualidade).imagem?.gerada, true, JSON.stringify(json(row.qualidade).imagem));
  assert.match(texto(designs[0].messages[0].content), /asset:heroi/);
  assert.equal(json(row.plano).motor, 'design', JSON.stringify(json(row.qualidade)));
  assert.ok(json(row.plano).design.paginas[0].includes(`${ORIGEM}/assets/heroi`));
});
