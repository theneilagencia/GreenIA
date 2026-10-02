// Produção visual, motor puro (sem rede e sem banco): conteúdo -> plano -> composição -> conferência -> correção ->
// exportação. Cada teste renderiza a peça de verdade (as mesmas primitivas que viram PNG e PDF) e confere o
// resultado: não só o JSON do plano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { analisarConteudo, numerosDe, valorNumerico } from '../src/visual/conteudo.js';
import { graficoParaTabela, lerPlano, mensagensPlano, planejar } from '../src/visual/plano.js';
import { FORMATOS, limparVisual, tipoDe, tracos } from '../src/visual/contrato.js';
import { contraste, inferirEstilo, limparIdentidade, resolverIdentidade, tema } from '../src/visual/marca.js';
import { MAX_CORRECOES_VISUAIS, montar, produzir } from '../src/visual/motor.js';
import { conferirVisual } from '../src/visual/qualidade.js';
import { pdfDasPaginas, caminhoPdf } from '../src/visual/pdf.js';
import { jpgDaPagina, pngDaPagina, rasterizarSvg } from '../src/visual/raster.js';
import { svgDaPagina } from '../src/visual/svg.js';
import { carregarFonte, medir, quebrarLinhas, textoSeguro } from '../src/visual/fontes.js';
import { inspecionarImagem, paraDataUrl } from '../src/visual/assets.js';
import { zip } from '../src/visual/rotas.js';
import { PNG_FALSO } from './openrouter-falso.js';

const RELATORIO = `Resumo do contrato entre Empresa Exemplo Ltda. e Cliente Modelo S.A.

### Números-chave
- Valor mensal: R$ 18.400,00
- Prazo: 12 meses
- Multa rescisória: 30%

### Riscos
- Reajuste anual pelo IPCA sem teto definido.
- Peças de reposição não incluídas no valor.

### Obrigações
| Parte | Obrigação | Prazo |
|---|---|---|
| Fornecedor | Manutenção preventiva de 12 esteiras | Mensal |
| Cliente | Pagar a fatura | Dia 10 |

### Próximos passos
1. Negociar teto para o reajuste.
2. Pedir tabela de preços das peças.`;

const id0 = resolverIdentidade({ empresa: 'Empresa Exemplo' });
function fazer(md, visual, { identidade = id0, titulo = 'Contrato de manutenção', assets = {}, exigidos = [], opcoes = {} } = {}) {
  const conteudo = analisarConteudo(md, { titulo });
  const tr = tracos(limparVisual(visual), { secoes: conteudo.secoes.length });
  const plano = planejar(conteudo, tr, { titulo });
  return { conteudo, tr, plano, ...produzir({ plano, conteudo, identidade, tr, assets, exigidos, opcoes: { data: '02/10/2026', ...opcoes } }) };
}
const textos = paginas => paginas.flatMap(p => p.prims.filter(x => x.t === 'text').map(x => x.linhas.join(' '))).join('\n');
const SVG_LOGO = paraDataUrl('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60"><rect width="60" height="60" rx="12" fill="#7A1F3D"/><rect x="72" y="18" width="120" height="24" rx="4" fill="#7A1F3D"/></svg>'));

test('conteúdo: indicadores, listas, tabelas, fluxo, chamada e título viram itens com id; números para a fidelidade', () => {
  const c = analisarConteudo(`${RELATORIO}\n\n### Fluxo\nPedido -> Aprovado? -> (sim) Comprar\nAprovado? -> (não) Revisar\n\nChamada: Fale com a área de compras`, { titulo: 'X' });
  const tipos = c.secoes.map(s => s.itens.map(i => i.tipo).join(','));
  assert.deepEqual(tipos, ['paragrafo', 'indicadores', 'lista', 'tabela', 'lista', 'fluxo,paragrafo']);
  assert.deepEqual(c.secoes[1].itens[0].itens.map(k => [k.rotulo, k.valor]), [['Valor mensal', 'R$ 18.400,00'], ['Prazo', '12 meses'], ['Multa rescisória', '30%']]);
  const f = c.secoes[5].itens[0];
  assert.deepEqual(f.nos.map(n => [n.rotulo, n.decisao]), [['Pedido', false], ['Aprovado?', true], ['Comprar', false], ['Revisar', false]]);
  assert.deepEqual(f.ligacoes.map(l => l.rotulo || ''), ['', 'sim', 'não']);
  assert.equal(c.secoes[5].itens[1].cta, true);
  assert.equal(c.secoes[5].itens[1].texto, 'Fale com a área de compras', 'o rótulo "Chamada:" é estrutura, não aparece');
  assert.ok(numerosDe('R$ 18.400,00 e 30%').has('1840000'));
  assert.equal(valorNumerico('R$ 1.234,56'), 1234.56);
  assert.equal(valorNumerico('-10,9%'), -10.9);
  assert.equal(valorNumerico('1,2 mi'), 1.2e6);
  assert.equal(valorNumerico('texto'), null);
});

test('contrato: tipo semântico extensível (desconhecido vira custom com o rótulo), formatos e traços sem switch de canal', () => {
  assert.equal(tipoDe('apresentação'), 'presentation');
  assert.equal(tipoDe('infográfico'), 'infographic');
  const v = limparVisual({ tipo: 'mapa_de_calor_de_riscos', formato: 'paisagem', paginas: 99, imagem: true });
  assert.deepEqual(v, { tipo: 'custom', rotulo: 'mapa de calor de riscos', formato: 'a4_paisagem', paginas: 24, imagem: 'conceitual' });
  assert.equal(tracos({ tipo: 'custom' }, { secoes: 2 }).multipagina, false);
  assert.equal(tracos({ tipo: 'custom' }, { secoes: 8 }).multipagina, true);
  assert.equal(limparVisual({ tipo: 'social_post', imagem: 'real' }).imagem, 'real');
  assert.equal(limparVisual(null), null);
});

test('página única (one-page): uma página, aprovada, todo o conteúdo e os valores exatos da tabela', () => {
  const r = fazer(RELATORIO, { tipo: 'one_page' });
  assert.equal(r.paginas.length, 1);
  assert.equal(r.registro.status, 'aprovado', JSON.stringify(r.conferencia.erros));
  const t = textos(r.paginas);
  for (const x of ['R$ 18.400,00', '12 meses', '30%', 'Manutenção preventiva de 12 esteiras', 'Dia 10', 'Negociar teto para o reajuste.']) assert.ok(t.includes(x), x);
  assert.equal(r.paginas[0].w, FORMATOS.a4.w); assert.equal(r.paginas[0].h, FORMATOS.a4.h);
});

test('multipágina (apresentação de 6): capa + uma seção por slide, número de páginas pedido, rodapé numerado', () => {
  const md = `### Capa\nResultados do trimestre\n\n${RELATORIO.split('\n').slice(2).join('\n')}\n\n### Decisão\nChamada: Aprovar o plano`;
  const r = fazer(md, { tipo: 'presentation', paginas: 6 });
  assert.equal(r.paginas.length, 6, JSON.stringify(r.registro));
  assert.equal(r.registro.erros.length, 0, JSON.stringify(r.conferencia.erros));
  assert.equal(r.paginas[0].papel, 'capa');
  assert.equal(r.paginas.at(-1).papel, 'fechamento');
  assert.ok(textos([r.paginas[2]]).includes('3 / 6'));
  for (const p of r.paginas) { assert.equal(p.w, 1280); assert.equal(p.h, 720); }
});

test('gráfico: escolha pela semântica dos dados (tempo -> linhas, partes de 100% -> pizza, categorias -> barras, conclusão -> progresso); rótulos com o valor do conteúdo', () => {
  const tab = (cab, linhas) => ({ tipo: 'tabela', cabecalho: cab, linhas });
  assert.equal(graficoParaTabela(tab(['Mês', 'Receita'], [['Julho', '1,3 mi'], ['Agosto', '1,4 mi'], ['Setembro', '1,5 mi']])).tipo, 'linhas');
  assert.equal(graficoParaTabela(tab(['Canal', 'Participação'], [['Loja', '50%'], ['Site', '30%'], ['Parceiros', '20%']])).tipo, 'pizza');
  assert.equal(graficoParaTabela(tab(['Canal', 'Participação'], [['Loja', '50%'], ['Site', '30%']])).tipo, 'barras', 'não soma 100%: nada de pizza');
  assert.equal(graficoParaTabela(tab(['Projeto', 'Conclusão'], [['A', '80%'], ['B', '35%']])).tipo, 'progresso');
  assert.equal(graficoParaTabela(tab(['Fornecedor', 'Preço'], [['Alfa', 'R$ 10.000'], ['Beta', 'R$ 9.500']])).tipo, 'barras');
  assert.equal(graficoParaTabela(tab(['Item', 'Situação'], [['A', 'ok'], ['B', 'pendente']])), null, 'sem número, sem gráfico');
  const md = '### Receita por canal\n| Canal | Receita |\n|---|---|\n| Loja física | R$ 120 mil |\n| E-commerce | R$ 85 mil |\n| Parceiros | R$ 40 mil |';
  const r = fazer(md, { tipo: 'dashboard' });
  assert.ok(r.paginas[0].prims.some(p => p.papel === 'barra'), 'barras desenhadas');
  const t = textos(r.paginas);
  for (const v of ['R$ 120 mil', 'R$ 85 mil', 'R$ 40 mil']) assert.ok(t.includes(v), v);
  assert.equal(r.registro.erros.length, 0, JSON.stringify(r.conferencia.erros));
});

test('diagrama: fluxo com decisão em losango e ramos rotulados; processo numerado; linha do tempo', () => {
  const r = fazer('### Aprovação de compra\nPedido -> Análise -> Aprovado? -> (sim) Comprar\nAprovado? -> (não) Revisar pedido', { tipo: 'process_map' });
  const p = r.paginas[0];
  assert.ok(p.prims.some(x => x.t === 'path' && x.papel === 'no' && /^M[\d.]+ [\d.]+ L/.test(x.d)), 'losango da decisão');
  assert.ok(p.prims.filter(x => x.papel === 'seta').length >= 4);
  assert.ok(textos([p]).includes('sim') && textos([p]).includes('não'));
  const proc = fazer('### Integração do novo colaborador\n1. Assinar contrato\n2. Receber equipamentos\n3. Treinamento de segurança\n4. Acompanhamento com o gestor', { tipo: 'training_material', paginas: 1 });
  assert.ok(proc.paginas[0].prims.some(x => x.papel === 'marcador'));
  const tl = fazer('### Cronograma\n- Jan/2027: Kickoff\n- Mar/2027: Piloto\n- Jun/2027: Implantação\n- Set/2027: Avaliação', { tipo: 'timeline' });
  assert.ok(tl.paginas[0].prims.filter(x => x.t === 'circle' && x.papel === 'marcador').length >= 4);
  assert.equal(tl.registro.erros.length, 0, JSON.stringify(tl.conferencia.erros));
});

test('peça de impacto (post 1:1) com imagem gerada: imagem é asset (nunca texto), título forte e chamada', () => {
  const heroi = { id: 'heroi', tipo: 'imagem_gerada', origem: 'gerado', dataUrl: PNG_FALSO, w: 640, h: 400 };
  const r = fazer('### Semana da Segurança\nTreinamentos abertos para todas as equipes.\n\nChamada: Inscreva-se até sexta', { tipo: 'social_post', imagem: true }, { assets: { heroi } });
  const p = r.paginas[0];
  assert.equal(p.w, 1080); assert.equal(p.h, 1080);
  assert.ok(p.prims.some(x => x.t === 'image' && x.papel === 'imagem'));
  assert.ok(p.prims.some(x => x.papel === 'cta'));
  assert.ok(textos([p]).includes('Inscreva-se até sexta'));
  assert.equal(r.registro.erros.length, 0, JSON.stringify(r.conferencia.erros));
  const pdf = pdfDasPaginas(r.paginas, { escala: 0.5 }).toString('latin1');
  assert.match(pdf, /\/Subtype \/Image/);
});

test('sem gerador de imagem: peça tipográfica (sem espaço reservado); imagem que precisa ser real vira espaço reservado explícito e a peça fica parcial', () => {
  const r = fazer('### Semana da Segurança\nTreinamentos abertos.\n\nChamada: Inscreva-se', { tipo: 'social_post', imagem: true });
  assert.ok(!r.paginas[0].prims.some(x => x.t === 'image'));
  assert.ok(!r.paginas[0].prims.some(x => x.papel === 'placeholder'));
  assert.equal(r.registro.status, 'aprovado');
  const conteudo = analisarConteudo('### Lançamento\nNovo modelo da linha industrial.', { titulo: 'Lançamento' });
  const tr = tracos(limparVisual({ tipo: 'poster', imagem: 'real' }), { secoes: 1 });
  const plano = planejar(conteudo, tr, { titulo: 'Lançamento' });
  plano.paginas[0].blocos.unshift({ id: 'b_img', tipo: 'imagem', asset: 'heroi', refs: [], proposito: 'foto do produto' });
  const x = produzir({ plano, conteudo, identidade: id0, tr, opcoes: { imagemPedida: true } });
  assert.ok(x.paginas[0].prims.some(p => p.papel === 'placeholder' && p.dash), 'espaço reservado tracejado');
  assert.match(textos(x.paginas), /Espaço para imagem: foto do produto \(não fornecida\)/);
  assert.equal(x.registro.status, 'parcial');
  assert.ok(x.explicacoes.some(e => /espaço reservado/.test(e)));
});

test('marca completa: logo da empresa em todas as páginas, cores da regra da empresa, origem de cada campo; a inferência do pedido não troca regra nem usa cor proibida', () => {
  const cfg = { empresa: 'Vinho & Cia', logo: SVG_LOGO, corMarca: '#7A1F3D', identidadeVisual: { regras: { cores: { destaque: '#C99A06' }, tipografia: { titulos: 'serif' }, cantos: 0, coresProibidas: ['#1F4E8C'], regras: ['Nunca usar fotos de pessoas'] } } };
  const id = resolverIdentidade(cfg, { inferida: inferirEstilo('faça em tons de azul') });
  assert.equal(id.cores.primaria, '#7A1F3D'); assert.equal(id.origem['cores.primaria'], 'empresa');
  assert.equal(id.cores.destaque, '#C99A06'); assert.equal(id.origem['cores.destaque'], 'empresa');
  assert.equal(id.cores.secundaria, '#3A7CA5'); assert.equal(id.origem['cores.secundaria'], 'padrao', 'azul proibido não entra como inferência');
  assert.equal(id.tipografia.titulos, 'serif'); assert.equal(id.origem.logo, 'empresa');
  const r = fazer(RELATORIO, { tipo: 'report' }, { identidade: id });
  assert.ok(r.paginas.every(p => p.prims.some(x => x.t === 'image' && x.papel === 'logo')), 'logo em todas as páginas');
  const cores = new Set(r.paginas.flatMap(p => p.prims.flatMap(x => [x.fill, x.stroke, x.cor])).filter(Boolean).map(c => c.toUpperCase()));
  assert.ok(cores.has('#7A1F3D'));
  assert.ok(!cores.has('#1F4E8C'), 'cor proibida nunca aparece');
  assert.equal(r.registro.erros.length, 0, JSON.stringify(r.conferencia.erros));
  // Logo nunca deformado: a caixa leva a proporção natural.
  for (const p of r.paginas) for (const x of p.prims.filter(y => y.papel === 'logo')) assert.ok(Math.abs(x.w / x.h - 200 / 60) < 0.01);
  // Sem regra de empresa, a inferência vale só para a peça.
  const so = resolverIdentidade({}, { inferida: inferirEstilo('use tons de verde') });
  assert.equal(so.origem['cores.primaria'], 'inferida');
  assert.deepEqual(limparIdentidade({ regras: { cores: { primaria: 'vermelho' }, logoClaro: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>').toString('base64') } }).regras, {}, 'cor inválida e SVG com script não entram');
});

test('marca ausente: sistema visual neutro (origem padrão), sem logo inventado, contraste garantido', () => {
  const id = resolverIdentidade({});
  assert.ok(Object.keys(id.origem).filter(k => k.startsWith('cores.')).every(k => id.origem[k] === 'padrao'));
  assert.equal(id.logo, null); assert.equal(id.origem.logo, 'ausente');
  const r = fazer(RELATORIO, { tipo: 'one_page' }, { identidade: id });
  assert.ok(!r.paginas[0].prims.some(x => x.t === 'image'));
  const T = tema(id);
  assert.ok(contraste(T.texto, T.fundo) >= 7 && contraste(T.suave, T.fundo) >= 4.5 && contraste(T.sobrePrimaria, T.primaria) >= 4.5);
  // Cor de marca clara: o texto sobre ela vira escuro.
  const claro = tema(resolverIdentidade({ corMarca: '#F2D16B' }));
  assert.ok(contraste(claro.sobrePrimaria, claro.primaria) >= 4.5);
});

test('conteúdo longo: a correção automática reorganiza (escala, colunas, página de continuação) sem perder conteúdo; registro de cada rodada', () => {
  const longo = Array.from({ length: 9 }, (_, i) => `### Tema ${i + 1}\n${Array.from({ length: 5 }, (_, k) => `- Ponto ${k + 1} do tema ${i + 1}, com uma explicação de tamanho médio para encher a página.`).join('\n')}`).join('\n\n');
  const r = fazer(longo, { tipo: 'one_page' });
  assert.ok(r.registro.tentativas.length >= 2, JSON.stringify(r.registro.tentativas));
  assert.equal(r.registro.tentativas[0].acao, 'primeira_composicao');
  assert.ok(r.registro.correcoes <= MAX_CORRECOES_VISUAIS);
  assert.ok(!r.conferencia.erros.some(e => e.codigo === 'conteudo_faltando'), 'nada sumiu');
  assert.ok(['corrigido', 'parcial'].includes(r.registro.status), r.registro.status);
  if (r.registro.status === 'parcial') assert.ok(r.paginas.length > 1 && r.explicacoes.some(e => /continuação/.test(e)));
  for (let i = 1; i <= 9; i++) assert.ok(textos(r.paginas).includes(`Ponto 5 do tema ${i}`));
});

test('conteúdo curto: texto maior para não deixar a página vazia, sem passar da área útil', () => {
  const r = fazer('### Mensagem\nObrigado a todas as equipes pelo trimestre.', { tipo: 'presentation', paginas: 2 });
  assert.equal(r.registro.erros.length, 0, JSON.stringify(r.conferencia.erros));
  const corpo = r.paginas[1].prims.find(x => x.t === 'text' && x.papel === 'corpo');
  assert.ok(corpo.tam > FORMATOS['16:9'].corpo, `corpo ${corpo.tam}`);
});

test('inglês e português: escala do eixo e datas no idioma do conteúdo', () => {
  const md = '### Revenue\n| Month | Revenue |\n|---|---|\n| January | 12,000 |\n| February | 15,500 |\n| March | 18,250 |';
  const en = fazer(md, { tipo: 'dashboard' }, { opcoes: { idioma: 'en' } });
  assert.ok(en.paginas[0].prims.some(x => x.papel === 'eixo' && /k$/.test(x.linhas[0])), 'eixo em inglês (k)');
  assert.ok(textos(en.paginas).includes('15,500'));
  const pt = fazer(md.replace(/,/g, '.'), { tipo: 'dashboard' });
  assert.ok(pt.paginas[0].prims.some(x => x.papel === 'eixo' && / mil$/.test(x.linhas[0])), 'eixo em português (mil)');
});

test('conferência visual acusa: contraste, transbordo, número inventado, conteúdo faltando, logo deformado, dimensão errada', () => {
  const r = fazer(RELATORIO, { tipo: 'one_page' });
  const base = () => structuredClone(r.paginas);
  const conf = paginas => conferirVisual({ paginas, plano: r.plano, conteudo: r.conteudo, tr: r.tr, identidade: id0 }).erros.map(e => e.codigo);
  let p = base(); p[0].prims.find(x => x.t === 'text' && x.papel === 'corpo').cor = '#EEEEEE';
  assert.ok(conf(p).includes('contraste'));
  p = base(); const b = p[0].blocos.at(-1); b.h += 2000;
  assert.ok(conf(p).includes('transbordo'));
  p = base(); p[0].prims.find(x => x.t === 'text' && x.papel === 'corpo').linhas = ['Economia de R$ 999.999 garantida'];
  const c1 = conf(p);
  assert.ok(c1.includes('dados_incorretos') && c1.includes('conteudo_faltando'), c1.join());
  p = base(); p[0].prims.push({ t: 'image', x: 10, y: 10, w: 100, h: 100, href: SVG_LOGO, nw: 200, nh: 60, ajuste: 'contain', papel: 'logo' });
  assert.ok(conf(p).includes('logo_deformado'));
  p = base(); p[0].w = 800;
  assert.ok(conf(p).includes('dimensoes'));
  // Semântico: o que o pedido exige precisa aparecer ("riscos e próximos passos").
  const sem = conferirVisual({ paginas: r.paginas, plano: r.plano, conteudo: r.conteudo, tr: r.tr, exigidos: ['riscos', 'cronograma de pagamentos'] });
  assert.deepEqual(sem.erros.filter(e => e.codigo === 'objetivo').map(e => e.termos), [['cronograma de pagamentos']]);
});

test('correção automática: contraste ruim da marca é corrigido e registrado; o limite de rodadas é respeitado', () => {
  const conteudo = analisarConteudo(RELATORIO, { titulo: 'T' });
  const tr = tracos(limparVisual({ tipo: 'one_page' }), { secoes: conteudo.secoes.length });
  const plano = planejar(conteudo, tr, { titulo: 'T' });
  // Texto da marca quase igual ao fundo: a composição deriva o tema com contraste, mas a peça força a cor ruim.
  const r = produzir({ plano, conteudo, identidade: id0, tr, opcoes: { ajustesCor: [{ de: tema(id0).texto, para: '#D0D0D0', papel: 'corpo' }] } });
  assert.ok(r.registro.tentativas.some(t => t.acao === 'ajustar_contraste'), JSON.stringify(r.registro.tentativas));
  assert.ok(!r.registro.erros.includes('contraste'));
  assert.equal(r.registro.status, 'corrigido');
  // Pedido impossível pelo layout (exige termo ausente): para sem insistir, com explicação objetiva.
  const x = produzir({ plano, conteudo, identidade: id0, tr, exigidos: ['fluxo de caixa'] });
  assert.equal(x.registro.status, 'parcial');
  assert.ok(x.registro.correcoes <= MAX_CORRECOES_VISUAIS);
  assert.ok(x.explicacoes.some(e => /fluxo de caixa/.test(e)));
});

test('exportações reais: PDF (páginas, fontes embutidas, texto), PNG e JPG nas dimensões do formato, SVG com fontes, ZIP', () => {
  const r = fazer(RELATORIO, { tipo: 'report' });
  const pdf = pdfDasPaginas(r.paginas, { escala: 0.75, titulo: 'Relatório' });
  const s = pdf.toString('latin1');
  assert.equal(s.slice(0, 8), '%PDF-1.7');
  assert.equal((s.match(/\/Type \/Page\b/g) || []).length, r.paginas.length);
  assert.match(s, /\/FontFile2/); assert.match(s, /\/Encoding \/WinAnsiEncoding/);
  assert.match(s, /\/MediaBox \[0 0 595\.5 842\.25\]/);
  // O texto está no conteúdo da página (fluxo comprimido): "Valor mensal" codificado em WinAnsi.
  const fluxos = [...s.matchAll(/stream\n/g)].map(m => m.index + 7);
  const conteudos = fluxos.map(i => { try { return inflateSync(pdf.subarray(i, pdf.indexOf('\nendstream', i))).toString('latin1'); } catch { return ''; } }).join('\n');
  assert.ok(conteudos.includes(Buffer.from('Valor mensal', 'latin1').toString('hex').toLowerCase()) || /<56616c6f72206d656e73616c>/i.test(conteudos));
  const png = pngDaPagina(r.paginas[1], 2);
  assert.deepEqual([inspecionarImagem(png.bytes).mime, png.w, png.h], ['image/png', 1588, 2246]);
  const jpg = jpgDaPagina(r.paginas[0], 1);
  assert.equal(inspecionarImagem(jpg.bytes).mime, 'image/jpeg');
  const svg = svgDaPagina(r.paginas[0], { embutirFontes: true });
  assert.match(svg, /@font-face\{font-family:'Inter/);
  assert.ok(rasterizarSvg(svg).width === r.paginas[0].w, 'o SVG exportado é válido');
  const z = zip([{ nome: 'a.png', dados: png.bytes }, { nome: 'b.png', dados: png.bytes }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.equal(z.readUInt16LE(z.length - 12), 2);
});

test('renderização real: o PNG da página tem a cor da marca nos pixels (não só no DOM)', () => {
  const r = fazer(RELATORIO, { tipo: 'one_page' }, { identidade: resolverIdentidade({ corMarca: '#7A1F3D' }) });
  const img = rasterizarSvg(svgDaPagina(r.paginas[0]));
  const px = (x, y) => [...img.pixels.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
  assert.deepEqual(px(5, 5), [0x7a, 0x1f, 0x3d], 'faixa do título na cor da marca');
  assert.deepEqual(px(img.width - 3, img.height - 3), [255, 255, 255], 'canto inferior: fundo, nada cortado ali');
});

test('fontes: medida pela tabela da fonte, quebra sem cortar palavra, número nunca partido, texto seguro para WinAnsi', () => {
  const f = carregarFonte('sans', 400);
  assert.ok(medir('MMMM', f, 20) > medir('iiii', f, 20));
  const l = quebrarLinhas('Valor de R$ 18.400,00 no contrato 2026/118-XYZ', f, 14, 90);
  assert.ok(l.includes('R$ 18.400,00'), JSON.stringify(l));
  assert.ok(!l.some(x => /\d-$/.test(x)), 'número nunca termina partido');
  assert.equal(textoSeguro('Prazo → 30 dias ✓ 🚀'), 'Prazo -> 30 dias v ');
});

test('PDF: caminhos SVG (arcos, curvas, relativos) viram operadores válidos', () => {
  const ops = caminhoPdf('M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM5 12.5l4.2 4.2L19 7');
  assert.match(ops, / c\n/); assert.match(ops, / m\n/); assert.match(ops, /\bh\b/);
  assert.ok(!/NaN/.test(ops));
});

test('plano pela IA: validado contra o conteúdo (refs, tipos, gráfico, números fora do conteúdo); item esquecido volta', () => {
  const c = analisarConteudo(RELATORIO, { titulo: 'T' });
  const tr = tracos(limparVisual({ tipo: 'presentation' }), { secoes: c.secoes.length });
  const m = mensagensPlano({ conteudo: c, tr, objetivo: 'Apresentar o contrato' });
  assert.match(m[0].content, /diretor de arte/);
  assert.match(m[1].content, /<conteudo/);
  const resp = JSON.stringify({ paginas: [{ papel: 'capa', titulo: 'Contrato 2099', blocos: [] },
    { papel: 'conteudo', titulo: 'Números', blocos: [{ tipo: 'indicadores', refs: ['s2.i1'] }, { tipo: 'inexistente', refs: ['s9.i9'] }] },
    { papel: 'conteudo', titulo: 'Obrigações', blocos: [{ tipo: 'grafico', refs: ['s4.i1'], grafico: { tipo: 'pizza' } }] }] });
  const p = lerPlano(resp, c, tr, { titulo: 'T' });
  assert.equal(p.origem, 'ia');
  assert.equal(p.paginas[0].titulo, 'T', 'número que não está no conteúdo não entra no título');
  assert.equal(p.paginas[2].blocos[0].tipo, 'tabela', 'tabela sem número não vira gráfico');
  const usados = new Set(p.paginas.flatMap(x => x.blocos.flatMap(b => b.refs)));
  for (const s of c.secoes) for (const it of s.itens) assert.ok(usados.has(it.id), `item ${it.id} recolocado`);
  assert.equal(lerPlano('não é JSON', c, tr), null);
});
