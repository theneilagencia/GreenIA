// Produção visual no motor de Quick Wins, de ponta a ponta pela API: interpretação, execução (mesma rota e mesma
// governança), plano visual pela IA validado, artefatos guardados por execução, prévia, exportação, edição,
// derivação, versões, gerador de imagem governado, assets enviados, acesso (IDOR), retenção, custos, auditoria e
// regressão dos Quick Wins sem visual.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem, PNG_FALSO } from './openrouter-falso.js';
import { salvarConfig, lerConfig } from '../src/config.js';
import { json, todos, um } from '../src/db.js';
import { inspecionarImagem } from '../src/visual/assets.js';
import { decisaoImagem, pedidoDeImagem } from '../src/visual/producao.js';
import * as OP from '../src/quickwin-operacao.js';
import { lerInterpretacao } from '../src/quickwin-interpretacao.js';
import { planoHeuristico } from '../src/quickwin-construtor.js';

const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
const sis = b => texto(b.messages[0].content);
const tipoDe = b => (b.modalities ? 'imagem' : sis(b).includes('PLANO DE TRABALHO') ? 'interpretacao' : sis(b).includes('conferente de qualidade') ? 'conferencia' : sis(b).includes('diretor de arte') ? 'plano_visual'
  : sis(b).includes('Você está executando o Quick Win') ? 'execucao' : 'outra');
const DECK = `Título: Resultados do trimestre

### Resultados do trimestre
Receita acima da meta e custos sob controle.

### Indicadores
- Receita: R$ 4,2 mi
- Margem: 18%
- Clientes ativos: 312

### Receita por mês
| Mês | Receita |
|---|---|
| Julho | R$ 1,3 mi |
| Agosto | R$ 1,4 mi |
| Setembro | R$ 1,5 mi |

### Riscos
- Concentração de 40% da receita em 3 clientes.
- Atraso na contratação de 2 vendedores.

### Próximos passos
1. Contratar os 2 vendedores até novembro.
2. Revisar a carteira de clientes.

### Decisão
Chamada: Aprovar o orçamento de marketing`;
const POST = 'Título: Semana da Segurança\n\n### Semana da Segurança\nTreinamentos abertos para todas as equipes.\n\nChamada: Inscreva-se até sexta';
const PLANOS = {
  deck: { resumo: 'Apresentação do trimestre.', entradas: [{ tipo: 'documento', rotulo: 'Relatório', obrigatoria: false }], etapas: [{ texto: 'Ler' }, { texto: 'Organizar' }],
    entregaveis: [{ id: 'e1', tipo: 'apresentacao', rotulo: 'Apresentação para a diretoria', visual: { tipo: 'presentation', paginas: 6 } }] },
  post: { resumo: 'Peça de divulgação.', entradas: [], etapas: [{ texto: 'Escrever' }, { texto: 'Montar' }],
    entregaveis: [{ id: 'e1', tipo: 'imagem', rotulo: 'Peça de divulgação', visual: { tipo: 'social_post', imagem: 'conceitual' } }] },
  real: { resumo: 'Cartaz do produto.', entradas: [], etapas: [{ texto: 'Escrever' }, { texto: 'Montar' }],
    entregaveis: [{ id: 'e1', tipo: 'outro', rotulo: 'Cartaz do lançamento', visual: { tipo: 'poster', imagem: 'real', imagemDescricao: 'foto do produto' } }] },
  resumo: { resumo: 'Resume documentos.', entradas: [{ tipo: 'documento', rotulo: 'Documento', obrigatoria: false }], etapas: [{ texto: 'Ler' }, { texto: 'Resumir' }], entregaveis: [{ id: 'e1', tipo: 'resumo', rotulo: 'Resumo' }] },
  clausulas: { resumo: 'Compara cláusulas.', entradas: [{ tipo: 'documento', rotulo: 'Contratos', obrigatoria: false }], etapas: [{ texto: 'Ler' }, { texto: 'Comparar' }], entregaveis: [{ id: 'e1', tipo: 'tabela', rotulo: 'Comparação de cláusulas', config: { colunas: ['Cláusula', 'Contrato A', 'Contrato B'] } }] },
  pendencias: { resumo: 'Lista pendências.', entradas: [{ tipo: 'texto', rotulo: 'Anotações', obrigatoria: false }], etapas: [{ texto: 'Ler' }, { texto: 'Listar' }], entregaveis: [{ id: 'e1', tipo: 'lista', rotulo: 'Pendências' }] },
};
const PEDIDOS = {
  deck: 'Transforme o relatório do trimestre em uma apresentação de 6 slides para a diretoria.',
  post: 'Crie uma arte para divulgar a Semana da Segurança.',
  real: 'Monte um cartaz do lançamento do produto com a foto dele.',
  resumo: 'Resuma este documento.',
  clausulas: 'Compare cláusulas destes contratos.',
  pendencias: 'Liste pendências destas anotações.',
};
let planoVisual = 'ia';   // 'ia' | 'invalido'
function roteiro(b) {
  const t = tipoDe(b);
  if (t === 'interpretacao') {
    const pedido = texto(b.messages[1].content);
    const k = Object.keys(PEDIDOS).find(x => pedido.includes(PEDIDOS[x]));
    return JSON.stringify(PLANOS[k] || { entregaveis: [] });
  }
  if (t === 'conferencia') return '{"criterios":[],"objetivo_atingido":true}';
  if (t === 'plano_visual') {
    if (planoVisual === 'invalido') return 'desculpe, não consigo';
    const ids = [...texto(b.messages[1].content).matchAll(/^(s\d+)\.(i\d+) \((\w+)/gm)].map(m => ({ s: m[1], id: `${m[1]}.${m[2]}`, tipo: m[3] }));
    const secoes = [...new Set(ids.map(x => x.s))];
    return JSON.stringify({ paginas: secoes.map((s, k) => ({ papel: k === 0 ? 'capa' : 'conteudo', titulo: '', blocos: k === 0 ? [] : ids.filter(x => x.s === s).map(x => ({ tipo: x.tipo === 'tabela' ? 'grafico' : x.tipo === 'paragrafo' ? 'texto' : x.tipo, refs: [x.id] })) })) });
  }
  if (t !== 'execucao') return 'Certo.';
  const s = sis(b);
  if (s.includes('Apresentação para a diretoria')) return `## Apresentação para a diretoria\n${DECK}`;
  if (s.includes('Peça de divulgação')) return `## Peça de divulgação\n${POST}`;
  if (s.includes('Cartaz do lançamento')) return '## Cartaz do lançamento\nTítulo: Novo modelo X2\n\n### Novo modelo X2\nMais leve e mais eficiente.\n\nChamada: Conheça na loja';
  if (s.includes('Comparação de cláusulas')) return '| Cláusula | Contrato A | Contrato B |\n|---|---|---|\n| Multa | 10% | 20% |';
  if (s.includes('## Pendências') || s.includes('Pendências')) return '- Revisar orçamento\n- Enviar proposta';
  return '## Resumo\nResumo do documento.\n\n## Pontos de atenção\n- Nenhum.';
}

let S, OR, ana, beto, admin, area;
before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], empresa: 'Empresa Exemplo' });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  area = (await admin.post('/api/admin/areas', { nome: 'Diretoria' })).dados.id;
  for (const [e, n] of [['ana', 'Ana'], ['beto', 'Beto']]) await admin.post('/api/admin/pessoas', { email: `${e}@exemplo.com.br`, nome: n, areas: [{ id: area, responsavel: true }] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  beto = await S.cliente().entrar('beto@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function criar(chave, quem = ana) {
  const descricao = PEDIDOS[chave];
  const it = (await quem.post('/api/quick-wins/assistente/interpretar', { descricao })).dados;
  const r = await quem.post('/api/quick-wins', { assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } }, areas: [area] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return { qw: r.dados, it, espec: json(um(S.app.db, 'select especificacao from quick_wins where id = ?', r.dados.id).especificacao) };
}
async function executar(qwId, quem = ana, texto_ = 'Material fictício do trabalho.') {
  const conv = (await quem.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(quem, conv.id, { executar_quick_win: true, texto: texto_ });
  return { ...r, conv, chamadas: OR.chamadas.slice(antes) };
}

test('execução com artefato: plano visual pela IA (mesma rota), artefato guardado na execução, custos por etapa, auditoria sem conteúdo', async () => {
  const { espec } = await criar('deck');
  assert.deepEqual(espec.operacao.entregaveis[0].visual, { tipo: 'presentation', paginas: 6 });
  assert.ok(espec.operacao.ferramentas.includes('producao_visual'));
  assert.match(espec.formato_saida.tipo, /outro/);
  const qw = um(S.app.db, 'select id from quick_wins order by id desc limit 1');
  const r = await executar(qw.id);
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.equal(r.falha, undefined);
  const etapas = r.eventos.filter(e => e.t === 'etapa').map(e => e.v);
  assert.ok(etapas.includes('Montando o visual…'), etapas.join(' | '));
  const ex = r.chamadas.find(b => tipoDe(b) === 'execucao'), pv = r.chamadas.find(b => tipoDe(b) === 'plano_visual');
  assert.ok(pv, 'chamou o diretor de arte');
  assert.equal(pv.model, ex.model, 'mesmo recurso da execução');
  assert.deepEqual(pv.provider, ex.provider, 'mesma rota (privacidade e fornecedor)');
  assert.match(sis(ex), /Peças visuais: "Apresentação para a diretoria"/);
  assert.match(sis(ex), /exatamente esse número de subseções/);
  const a = r.fim.artefatos[0];
  assert.equal(a.tipo, 'presentation'); assert.equal(a.paginas, 6); assert.equal(a.formato, '16:9');
  assert.ok(['aprovado', 'corrigido'].includes(a.status), a.status);
  assert.equal(a.titulo, 'Resultados do trimestre');
  // Guardado na execução: conversa, resposta, Quick Win, rota.
  const row = um(S.app.db, 'select * from artefatos_visuais where id = ?', a.id);
  assert.equal(row.conversa_id, r.conv.id); assert.equal(row.mensagem_id, r.fim.id); assert.equal(row.quick_win_id, qw.id); assert.ok(row.roteamento_id);
  assert.equal(json(row.qualidade).plano, 'ia');
  // Custos separados por etapa (só números) e somados no uso da resposta.
  const rota = um(S.app.db, 'select qualidade, custo_real from roteamento where id = ?', row.roteamento_id);
  const q = json(rota.qualidade);
  assert.ok(q.custos.plano_visual > 0 && q.custos.execucao > 0 && q.custos.imagem === 0);
  assert.deepEqual(q.visual.artefatos.map(x => x.id), [a.id]);
  const uso = um(S.app.db, 'select custo from uso where conversa_id = ?', r.conv.id);
  assert.ok(Math.abs(uso.custo - (q.custos.execucao + q.custos.conferencia + q.custos.plano_visual)) < 1e-9);
  // Auditoria: metadados, nunca conteúdo.
  const ev = todos(S.app.db, "select detalhes from eventos where tipo = 'visual.produced'").map(e => json(e.detalhes)).at(-1);
  assert.equal(ev.artefato, a.id); assert.equal(ev.tipo, 'presentation'); assert.equal(ev.paginas, 6);
  assert.doesNotMatch(JSON.stringify(ev), /Receita|trimestre|Concentração|R\$/);
  // A conversa reaberta mostra o artefato na resposta.
  const d = (await ana.get(`/api/conversas/${r.conv.id}`)).dados;
  assert.deepEqual(d.mensagens.find(m => m.papel === 'assistant').artefatos.map(x => x.id), [a.id]);
  // Prévia real (PNG da página) e exportações.
  const p1 = await fetch(`${S.base}/api/artefatos/${a.id}/paginas/1`, { headers: { cookie: cookieDe(ana) } });
  assert.equal(p1.status, 200); assert.equal(p1.headers.get('content-type'), 'image/png');
  const img = inspecionarImagem(Buffer.from(await p1.arrayBuffer()));
  assert.ok(Math.abs(img.w / img.h - 16 / 9) < 0.01);
  for (const [f, mime, magia] of [['pdf', 'application/pdf', '%PDF'], ['png', 'application/zip', 'PK'], ['jpg', 'application/zip', 'PK'], ['svg', 'application/zip', 'PK']]) {
    const x = await fetch(`${S.base}/api/artefatos/${a.id}/baixar?formato=${f}`, { headers: { cookie: cookieDe(ana) } });
    assert.equal(x.status, 200, f); assert.equal(x.headers.get('content-type'), mime, f);
    assert.match(x.headers.get('content-disposition'), /^attachment; filename="Resultados-do-trimestre\.(pdf|zip)"$/);
    assert.equal(Buffer.from(await x.arrayBuffer()).subarray(0, magia.length).toString('latin1'), magia, f);
  }
  const pg = await fetch(`${S.base}/api/artefatos/${a.id}/baixar?formato=jpg&pagina=2`, { headers: { cookie: cookieDe(ana) } });
  assert.equal(inspecionarImagem(Buffer.from(await pg.arrayBuffer())).mime, 'image/jpeg');
  const pptx = await ana.get(`/api/artefatos/${a.id}/baixar?formato=pptx`);
  assert.equal(pptx.status, 400); assert.match(pptx.dados.mensagem, /PPTX ainda não está disponível/);
  assert.equal(todos(S.app.db, "select 1 from eventos where tipo = 'visual.exported'").length, 5);
});
const cookieDe = c => c.cookie;

test('plano visual ilegível: o planejador determinístico assume, sem perder o artefato', async () => {
  planoVisual = 'invalido';
  try {
    const qw = um(S.app.db, "select id from quick_wins where nome is not null order by id limit 1");
    const r = await executar(qw.id);
    const a = r.fim.artefatos[0];
    assert.equal(json(um(S.app.db, 'select qualidade from artefatos_visuais where id = ?', a.id).qualidade).plano, 'deterministico');
    assert.equal(a.paginas, 6);
    assert.ok(['aprovado', 'corrigido'].includes(a.status));
  } finally { planoVisual = 'ia'; }
});

test('edição sem refazer a execução: texto, título, ordem, formato e cores viram nova versão conferida; restaurar; regra da marca não muda', async () => {
  const a = um(S.app.db, 'select * from artefatos_visuais where atual = 1 order by id limit 1');
  const det = (await ana.get(`/api/artefatos/${a.id}`)).dados;
  assert.equal(det.editavel.paginas.length, 6);
  assert.doesNotMatch(JSON.stringify(det.artefato), /"blocos"|"refs"/, 'o resumo da tela não tem plano técnico');
  const lista = det.editavel.paginas.flatMap(p => p.blocos).flatMap(b => b.itens).find(i => i.tipo === 'lista');
  const antes = OR.chamadas.length;
  const r = await ana.patch(`/api/artefatos/${a.id}`, { titulo: 'Trimestre em resumo', textos: [{ item: lista.id, indice: 0, texto: 'Concentração de 40% da receita em 3 clientes (revisado).' }],
    ordem: [det.editavel.paginas[0].id, ...det.editavel.paginas.slice(1).map(p => p.id).reverse()], cores: { destaque: '#2E7D4F' } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(OR.chamadas.length, antes, 'edição não chama a IA');
  assert.equal(r.dados.artefato.versao, 2); assert.equal(r.dados.artefato.titulo, 'Trimestre em resumo');
  assert.equal(r.dados.editavel.origem['cores.destaque'], 'inferida', 'a cor escolhida vale só para esta peça');
  assert.equal(um(S.app.db, 'select atual from artefatos_visuais where id = ?', a.id).atual, 0);
  // O arquivo da nova versão tem o texto editado (capa com o título novo; a lista revisada numa das páginas).
  const svg = p => fetch(`${S.base}/api/artefatos/${r.dados.artefato.id}/baixar?formato=svg&pagina=${p}`, { headers: { cookie: cookieDe(ana) } }).then(x => x.text());
  assert.match(await svg(1), /Trimestre em resumo/);
  const todas = (await Promise.all([2, 3, 4, 5, 6].map(svg))).join('');
  assert.match(todas, /\(revisado\)/);
  const novo = r.dados.artefato.id;
  // Formato novo (one-page vertical 4:5): recomposto e conferido.
  const f = await ana.patch(`/api/artefatos/${novo}`, { formato: '4:5' });
  assert.equal(f.status, 200); assert.equal(f.dados.artefato.formato, '4:5');
  // Versão antiga não se edita; restaura-se.
  assert.equal((await ana.patch(`/api/artefatos/${a.id}`, { titulo: 'x' })).status, 409);
  const rs = await ana.post(`/api/artefatos/${a.id}/restaurar`);
  assert.equal(rs.status, 200); assert.equal(rs.dados.artefato.versao, 4); assert.equal(rs.dados.artefato.titulo, a.titulo);
  // Validação: item inexistente, página inexistente, formato inválido.
  assert.equal((await ana.patch(`/api/artefatos/${rs.dados.artefato.id}`, { textos: [{ item: 's99.i1', texto: 'x' }] })).status, 400);
  assert.equal((await ana.patch(`/api/artefatos/${rs.dados.artefato.id}`, { remover: det.editavel.paginas.map(p => p.id) })).status, 400);
  assert.equal((await ana.patch(`/api/artefatos/${rs.dados.artefato.id}`, { formato: 'A0' })).status, 400);
  // Regra da marca: a cor da empresa não é trocada numa peça.
  salvarConfig(S.app.db, { identidadeVisual: { regras: { cores: { destaque: '#C99A06' } }, preferencias: {} } });
  const d2 = (await ana.post(`/api/artefatos/${rs.dados.artefato.id}/derivar`, { tipo: 'one_page' })).dados;
  assert.equal(d2.artefato.tipo, 'one_page');
  assert.equal((await ana.patch(`/api/artefatos/${d2.artefato.id}`, { cores: { destaque: '#000000' } })).status, 409);
  salvarConfig(S.app.db, { identidadeVisual: { regras: {}, preferencias: {} } });
});

test('reuso de conteúdo: derivar outro artefato (one-page, infográfico, carrossel) sem nova execução e sem IA', async () => {
  const a = um(S.app.db, 'select * from artefatos_visuais where atual = 1 and tipo = ? order by id limit 1', 'presentation');
  const antes = OR.chamadas.length;
  for (const tipo of ['one_page', 'infographic', 'carousel', 'report']) {
    const r = await ana.post(`/api/artefatos/${a.id}/derivar`, { tipo });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.artefato.tipo, tipo);
    assert.ok(['aprovado', 'corrigido', 'parcial'].includes(r.dados.artefato.status), `${tipo}: ${r.dados.artefato.status} ${r.dados.artefato.avisos}`);
    const row = um(S.app.db, 'select conteudo, derivado_de, conversa_id from artefatos_visuais where id = ?', r.dados.artefato.id);
    assert.equal(row.conteudo, a.conteudo, 'mesmo conteúdo'); assert.equal(row.derivado_de, a.base_id); assert.equal(row.conversa_id, a.conversa_id);
  }
  assert.equal(OR.chamadas.length, antes);
  assert.equal((await ana.post(`/api/artefatos/${a.id}/derivar`, { tipo: 'formato_que_nao_existe' })).status, 400);
});

test('acesso: só quem executou vê, baixa, edita ou deriva o artefato (outra pessoa e o admin recebem 404)', async () => {
  const a = um(S.app.db, 'select * from artefatos_visuais where atual = 1 order by id limit 1');
  for (const c of [beto, admin]) {
    assert.equal((await c.get(`/api/artefatos/${a.id}`)).status, 404);
    assert.equal((await c.get(`/api/artefatos/${a.id}/paginas/1`)).status, 404);
    assert.equal((await c.get(`/api/artefatos/${a.id}/baixar?formato=pdf`)).status, 404);
    assert.equal((await c.patch(`/api/artefatos/${a.id}`, { titulo: 'x' })).status, 404);
    assert.equal((await c.post(`/api/artefatos/${a.id}/derivar`, { tipo: 'one_page' })).status, 404);
    assert.equal((await c.post(`/api/artefatos/${a.id}/restaurar`)).status, 404);
    assert.equal((await c.post(`/api/artefatos/${a.id}/imagem`, { imagem: PNG_FALSO })).status, 404);
    assert.equal((await c.get(`/api/artefatos?conversa=${a.conversa_id}`)).status, 404);
  }
  assert.equal((await S.cliente().get(`/api/artefatos/${a.id}`)).status, 401, 'sem sessão');
  // Apagar a conversa apaga os artefatos e as imagens dela (retenção e direito de apagar).
  const conv = a.conversa_id;
  await ana.del(`/api/conversas/${conv}`);
  assert.equal(um(S.app.db, 'select count(*) as n from artefatos_visuais where conversa_id = ?', conv).n, 0);
  assert.equal(um(S.app.db, 'select count(*) as n from visual_assets where conversa_id = ?', conv).n, 0);
});

test('gerador de imagem liberado: imagem vira asset (só o tema vai para o modelo), custo separado; falha do provedor não perde o artefato', async () => {
  salvarConfig(S.app.db, { producaoVisual: { imagens: { ativa: true, modelo: 'google/gemini-2.5-flash-image' } } });
  try {
    const { qw } = await criar('post');
    const r = await executar(qw.id, ana, 'Semana de 10 a 14 de março, telefone 11 99999-0000.');
    const ger = r.chamadas.filter(b => tipoDe(b) === 'imagem');
    assert.equal(ger.length, 1);
    assert.equal(ger[0].model, 'google/gemini-2.5-flash-image');
    assert.deepEqual(ger[0].provider, { data_collection: 'deny' });
    const pedido = ger[0].messages[0].content;
    assert.doesNotMatch(pedido, /\d/, 'nenhum número do material vai para o modelo de imagem');
    assert.match(pedido, /Sem nenhum texto/);
    const a = r.fim.artefatos[0];
    assert.equal(a.status, 'aprovado', JSON.stringify(a.avisos));
    const row = um(S.app.db, 'select * from artefatos_visuais where id = ?', a.id);
    const asset = um(S.app.db, 'select origem, mime, w, h from visual_assets where id = ?', json(row.opcoes).assets.heroi);
    assert.deepEqual({ ...asset }, { origem: 'gerado', mime: 'image/png', w: 640, h: 400 });
    const q = json(um(S.app.db, 'select qualidade from roteamento where id = ?', row.roteamento_id).qualidade);
    assert.equal(q.custos.imagem, 0.039);
    const ev = todos(S.app.db, "select detalhes from eventos where tipo = 'visual.produced'").map(e => json(e.detalhes)).at(-1);
    assert.deepEqual(ev.imagem, { gerada: true, motivo: null });
    // Provedor falha: a peça sai tipográfica, com o aviso; nada se perde.
    OR.imagem = () => null;
    const f = await executar(qw.id);
    const b = f.fim.artefatos[0];
    assert.equal(b.status, 'aprovado');
    assert.ok(b.avisos.some(x => /sem imagem gerada \(o gerador de imagem falhou\)/.test(x)), JSON.stringify(b.avisos));
    assert.equal(json(um(S.app.db, 'select opcoes from artefatos_visuais where id = ?', b.id).opcoes).assets.heroi, undefined);
  } finally { OR.imagem = null; salvarConfig(S.app.db, { producaoVisual: { imagens: { ativa: false, modelo: 'google/gemini-2.5-flash-image' } } }); }
  // Desligado (padrão): nenhuma chamada de imagem, aviso honesto.
  const { qw } = await criar('post');
  const r = await executar(qw.id);
  assert.equal(r.chamadas.filter(b => tipoDe(b) === 'imagem').length, 0);
  assert.ok(r.fim.artefatos[0].avisos.some(x => /não está liberada pela empresa/.test(x)));
});

test('governança do gerador de imagem: sigilo, área reforçada, dado protegido e reserva do plano bloqueiam; sem provedor, sem chamada', () => {
  const cfg = { producaoVisual: { imagens: { ativa: true } } };
  const app = { ia: { gerarImagem() {} } };
  assert.equal(decisaoImagem(app, cfg, {}).pode, true);
  for (const [g, motivo] of [[{ sigilosa: true }, 'sigilosa'], [{ areaReforcada: true }, 'area_reforcada'], [{ protegidos: true }, 'dados_protegidos'], [{ reserva: true }, 'reserva_do_plano']])
    assert.equal(decisaoImagem(app, cfg, g).motivo, motivo);
  assert.equal(decisaoImagem({ ia: {} }, cfg, {}).motivo, 'sem_provedor');
  assert.equal(decisaoImagem({ ia: { gerarImagem() {}, geraImagem: false } }, cfg, {}).motivo, 'sem_provedor');
  assert.equal(decisaoImagem(app, {}, {}).motivo, 'nao_liberado');
  assert.doesNotMatch(pedidoDeImagem({ titulo: 'Meta de 30%', objetivo: 'Vender R$ 1.000', tipo: 'Post' }), /\d/);
});

test('imagem que precisa ser real: espaço reservado explícito e resultado parcial; a foto enviada entra numa nova versão (validada pelos bytes)', async () => {
  const { qw } = await criar('real');
  const r = await executar(qw.id);
  const a = r.fim.artefatos[0];
  assert.equal(a.status, 'parcial');
  assert.ok(a.avisos.some(x => /espaço reservado/.test(x)));
  const svgScript = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>').toString('base64')}`;
  assert.equal((await ana.post(`/api/artefatos/${a.id}/imagem`, { imagem: svgScript })).status, 400, 'SVG não entra como foto');
  const jpegComoPng = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString('base64')}`;
  assert.equal((await ana.post(`/api/artefatos/${a.id}/imagem`, { imagem: jpegComoPng })).status, 400, 'tipo declarado diferente dos bytes');
  assert.equal((await ana.post(`/api/artefatos/${a.id}/imagem`, { imagem: 'data:text/html;base64,PGh0bWw+' })).status, 400);
  const grande = `data:image/png;base64,${Buffer.concat([Buffer.from(PNG_FALSO.split(',')[1], 'base64'), Buffer.alloc(5.2 * 1024 * 1024)]).toString('base64')}`;
  assert.equal((await ana.post(`/api/artefatos/${a.id}/imagem`, { imagem: grande })).status, 400, 'acima de 5 MB');
  const ok = await ana.post(`/api/artefatos/${a.id}/imagem`, { imagem: PNG_FALSO });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.equal(ok.dados.artefato.versao, 2);
  assert.notEqual(ok.dados.artefato.status, 'inconsistente');
  assert.ok(!ok.dados.artefato.avisos.some(x => /espaço reservado/.test(x)), 'com a foto, nada reservado');
  assert.equal(um(S.app.db, "select origem from visual_assets order by id desc limit 1").origem, 'enviado');
});

test('regressão: Quick Wins sem visual (resumir, comparar cláusulas, listar pendências) não ganham produção visual', async () => {
  for (const k of ['resumo', 'clausulas', 'pendencias']) {
    const { espec, qw } = await criar(k);
    assert.ok(!espec.operacao.entregaveis.some(e => e.visual), k);
    assert.ok(!espec.operacao.ferramentas.includes('producao_visual'), k);
    const r = await executar(qw.id);
    assert.equal(r.status, 200);
    assert.equal(r.fim.artefatos, undefined, k);
    assert.ok(!r.eventos.some(e => e.t === 'etapa' && /visual/.test(e.v)), k);
    assert.equal(r.chamadas.filter(b => tipoDe(b) === 'plano_visual').length, 0, k);
    assert.doesNotMatch(sis(r.chamadas.find(b => tipoDe(b) === 'execucao')), /Peças visuais/, k);
  }
});

test('interpretação: o plano da IA decide (tipo desconhecido vira custom); sem IA, a leitura do pedido reconhece o visual; pedido de texto não vira visual', () => {
  const op = lerInterpretacao(JSON.stringify({ entregaveis: [{ id: 'e1', tipo: 'matriz', rotulo: 'Matriz de riscos', visual: { tipo: 'heatmap_de_riscos', formato: 'paisagem' } }], etapas: [{ texto: 'a' }, { texto: 'b' }] }), 'Monte uma matriz de riscos para a reunião.');
  assert.deepEqual(op.entregaveis[0].visual, { tipo: 'custom', rotulo: 'heatmap de riscos', formato: 'a4_paisagem' });
  for (const [pedido, tipo] of [['Transforme estes dados em um infográfico.', 'infographic'], ['Crie um fluxograma deste processo.', 'diagram'], ['Quero uma página visual resumindo os principais riscos.', 'one_page'],
    ['Transforme essa planilha em um dashboard visual.', 'dashboard'], ['Monte uma apresentação de 8 slides para a diretoria.', 'presentation'], ['Crie uma arte para divulgar isso.', 'social_post'],
    ['Quero um material de treinamento com essas informações.', 'training_material']]) {
    const v = planoHeuristico(pedido).entregaveis.find(e => e.visual)?.visual;
    assert.equal(v?.tipo, tipo, pedido);
  }
  assert.equal(planoHeuristico('Monte uma apresentação de 8 slides para a diretoria.').entregaveis.find(e => e.visual).visual.paginas, 8);
  for (const pedido of ['Resuma este documento.', 'Compare cláusulas destes contratos.', 'Liste pendências desta reunião.', 'Escreva um e-mail para o cliente.'])
    assert.ok(!planoHeuristico(pedido).entregaveis.some(e => e.visual), pedido);
  // Vídeo continua pacote de produção (a peça final é vídeo, não composição).
  assert.equal(OP.limparOperacao({ entregaveis: [{ tipo: 'video', visual: { tipo: 'poster' } }] }).entregaveis[0].visual, undefined);
});

test('identidade visual no admin: regras validadas (logo SVG com script recusado), preferência não vira regra, imagens desligadas quando a empresa desliga', async () => {
  assert.equal(lerConfig(S.app.db).producaoVisual.imagens.ativa, false);
  const ok = await admin.put('/api/admin/config', { identidadeVisual: { regras: { cores: { primaria: '#123456', verde: '#00FF00' }, tipografia: { titulos: 'serif', corpo: 'comic' }, coresProibidas: ['#FF0000', 'x'], regras: ['Sem fotos de pessoas'] }, preferencias: { cores: { destaque: '#AA5500' } } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  const iv = (await admin.get('/api/admin/config')).dados.identidadeVisual;
  assert.deepEqual(iv, { regras: { cores: { primaria: '#123456' }, tipografia: { titulos: 'serif' }, coresProibidas: ['#FF0000'], regras: ['Sem fotos de pessoas'] }, preferencias: { cores: { destaque: '#AA5500' } } });
  const ruim = await admin.put('/api/admin/config', { identidadeVisual: { regras: { logoClaro: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>').toString('base64')}` } } });
  assert.equal(ruim.status, 400);
  assert.equal((await ana.put('/api/admin/config', { identidadeVisual: {} })).status, 403, 'só o admin');
  salvarConfig(S.app.db, { identidadeVisual: { regras: {}, preferencias: {} } });
});

test('retenção: conteúdo que a empresa não guarda não gera artefato guardado, e a pessoa é avisada', async () => {
  salvarConfig(S.app.db, { naoArmazenar: ['cpf'] });
  try {
    const qw = um(S.app.db, "select q.id from quick_wins q where especificacao like '%presentation%' order by id desc limit 1");
    const r = await executar(qw.id, ana, 'Relatório do responsável, CPF 529.982.247-25.');
    assert.equal(r.fim.artefatos, undefined);
    assert.equal(um(S.app.db, 'select count(*) as n from artefatos_visuais where conversa_id = ?', r.conv.id).n, 0);
    assert.ok(todos(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'aviso'", r.conv.id).some(m => /artefato visual não foi gerado/.test(m.texto)));
  } finally { salvarConfig(S.app.db, { naoArmazenar: [] }); }
});
