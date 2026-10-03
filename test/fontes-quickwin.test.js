// Fontes do Quick Win (arquivos, links e conhecimento da empresa com papel) e Imagem final: modelo, segurança do
// link (a mesma rede segura do Integration Builder), conferência de fidelidade, versão, conversa e multiempresa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, todos, um } from '../src/db.js';
import { arquivo, docx, xlsx, pdf } from './arquivos.js';
import { buscaSegura } from '../src/integracoes/rede.js';
import { comandoDeFonte, ErroFonte, lerLink, mascararUrl, textoDoHtml } from '../src/fontes.js';
import { conferirFontes, fonteUsada, numerosDe } from '../src/fontes-conferencia.js';
import * as OP from '../src/quickwin-operacao.js';
import { tracos, TIPOS } from '../src/visual/contrato.js';

const enc = encodeURIComponent;
const HOMOLOGADO = 'mistralai/mistral-small';
let S, OR, admin, ana, carlos, A, modo = 'usa_fonte';

// ---- Páginas falsas (o site nunca é real): só para hosts .exemplo.test; o resto vai pela rede segura real. ----
const PAGINAS = {
  'https://politicas.exemplo.test/viagens': { status: 200, tipo: 'text/html', corpo: '<html><head><title>Política de Viagens QA</title><script>alert(1)</script></head><body><h1>Política de Viagens</h1><p>Hospedagem até R$ 410 por noite em capitais.</p><ul><li>Reembolso em 12 dias úteis.</li></ul></body></html>' },
  'https://privado.exemplo.test/intranet': { status: 401, tipo: 'text/html', corpo: 'login' },
  'https://binario.exemplo.test/arquivo.bin': { status: 200, tipo: 'application/octet-stream', corpo: '\u0000\u0001\u0002' },
};
const buscarFalso = async opcoes => {
  const u = new URL(opcoes.url);
  if (!u.hostname.endsWith('.exemplo.test')) return buscaSegura(opcoes);
  const p = PAGINAS[`${u.origin}${u.pathname}`];
  if (!p) return { status: 404, cabecalhos: { 'content-type': 'text/plain' }, corpo: Buffer.from('não encontrado') };
  return { status: p.status, cabecalhos: { 'content-type': p.tipo }, corpo: Buffer.from(p.corpo) };
};

// IA falsa: execução usa (ou não) a fonte; conferência aprova; correção usa a fonte.
const ehConferencia = b => JSON.stringify(b.messages[0].content).includes('conferente de qualidade');
const ehCorrecao = b => String(b.messages.at(-1).content).includes('A conferência de qualidade encontrou');
const SECOES = '\n\n## Pontos de atenção\n- Nenhum.\n\n## Informações não encontradas\n- Nenhuma.';
const USA = '## Resumo\n- Hospedagem em capitais: até R$ 410 por noite (Fonte: Política de Viagens QA — Política de Viagens).\n- Reembolso em 12 dias úteis.' + SECOES;
const IGNORA = '## Resumo\n- A viagem foi aprovada e segue o fluxo normal da empresa.' + SECOES;
const COPIA_REFERENCIA = '## Resumo\n- Hospedagem em capitais: até R$ 410 por noite.\n- Cliente atendido: Construtora Modelo Fictícia, contrato de R$ 987.654.' + SECOES;
function roteiro(b) {
  // Conferente: aprova todos os critérios que o prompt listou (a fidelidade às fontes é determinística).
  if (ehConferencia(b)) { const ids = [...JSON.stringify(b.messages[0].content).matchAll(/- ([a-z_0-9]+): /g)].map(m => m[1]); return JSON.stringify({ criterios: ids.map(id => ({ id, ok: true })), objetivo_atingido: true }); }
  if (ehCorrecao(b)) return USA;
  const sis = JSON.stringify(b.messages[0].content);
  if (modo === 'imagem') return '## Imagem final\nTítulo: Lançamento da linha Verde\n### Chamada\n- Conheça a nova linha sustentável.\nChamada: Saiba mais';
  return { usa_fonte: USA, ignora: IGNORA, copia: COPIA_REFERENCIA }[modo] || USA;
}

before(async () => {
  OR = await openRouterFalso({ responder: roteiro });
  S = await subir({ ia: OR.ia });
  S.app.buscarLink = buscarFalso;
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'], allow_sensitive_processing_with_guardrails: true });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  A = (await admin.post('/api/admin/areas', { nome: 'Área Fontes' })).dados;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana Lima', areas: [{ id: A.id, responsavel: true }] });
  await admin.post('/api/admin/pessoas', { email: 'carlos@exemplo.com.br', nome: 'Carlos Dias', areas: [] });
  await admin.put(`/api/admin/modelos/${enc(HOMOLOGADO)}`, { liberado: true, perfil: 'rapido' });
  await admin.post(`/api/admin/modelos/${enc(HOMOLOGADO)}/homologar`, { fornecedor: 'Mistral', semTreino: true, retencaoZero: true, justificativa: 'Retenção zero conferida.' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  carlos = await S.cliente().entrar('carlos@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

async function criarQw(descricao = 'Resuma pedidos de viagem conforme a política da empresa') {
  const r = await ana.post('/api/quick-wins', { assistente: { descricao }, areas: [A.id] });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados;
}
async function executar(qwId, corpo, cli = ana) {
  const conv = (await cli.post('/api/conversas', { quick_win_id: qwId, teste: true })).dados.conversa;
  const r = await enviarMensagem(cli, conv.id, { executar_quick_win: true, ...corpo });
  return { ...r, conv };
}

// ---- Unidade ------------------------------------------------------------------------------------------------
test('HTML vira texto com a estrutura útil; script, estilo e navegação nunca entram', () => {
  const { titulo, texto } = textoDoHtml('<html><head><title>Guia &amp; Normas</title><style>x{}</style></head><body><nav>menu</nav><h2>Prazo</h2><p>Até 10 dias.</p><table><tr><td>A</td><td>1</td></tr></table><script>roubar()</script></body></html>');
  assert.equal(titulo, 'Guia & Normas');
  assert.match(texto, /### Prazo/);
  assert.match(texto, /\| A \| 1 \|/);
  assert.doesNotMatch(texto, /roubar|menu|x\{\}/);
});

test('link mascarado: sem usuário, senha nem query (token, assinatura)', () => {
  assert.equal(mascararUrl('https://u:s@docs.exemplo.test/a/b?token=SEGREDO&x=1'), 'https://docs.exemplo.test/a/b?…');
  assert.equal(mascararUrl('nada'), '(link inválido)');
});

test('link inseguro nunca é buscado: http, localhost, loopback, rede interna, metadados, IPv6 local, credencial e DNS rebinding', async () => {
  const casos = [['http://site.exemplo.com/x', 'so_https'], ['https://localhost/x', 'destino_bloqueado'], ['https://127.0.0.1/x', 'destino_bloqueado'],
    ['https://10.0.0.5/x', 'destino_bloqueado'], ['https://192.168.1.10/x', 'destino_bloqueado'], ['https://169.254.169.254/latest/meta-data', 'destino_bloqueado'],
    ['https://[::1]/x', 'destino_bloqueado'], ['https://u:s@site.exemplo.com/x', 'credencial_no_link'], ['não é link', 'link_invalido']];
  for (const [url, codigo] of casos) {
    await assert.rejects(lerLink(url, { lookup: async () => [{ address: '93.184.216.34', family: 4 }] }), e => e instanceof ErroFonte && (e.codigo === codigo || (codigo === 'destino_bloqueado' && /bloqueado|protocolo/.test(e.codigo))), url);
  }
  // DNS rebinding: o nome público resolve para a rede interna.
  await assert.rejects(lerLink('https://publico.exemplo.com/x', { lookup: async () => [{ address: '10.1.2.3', family: 4 }] }), e => e.codigo === 'destino_bloqueado');
  await assert.rejects(lerLink('https://publico.exemplo.com/x', { lookup: async () => [{ address: '127.0.0.1', family: 4 }] }), e => e.codigo === 'destino_bloqueado');
});

test('link que exige login e formato binário: falha com o motivo, sem adivinhar o conteúdo', async () => {
  await assert.rejects(lerLink('https://privado.exemplo.test/intranet', { buscar: buscarFalso }), e => e.codigo === 'exige_autenticacao' && /integração/.test(e.message));
  await assert.rejects(lerLink('https://binario.exemplo.test/arquivo.bin', { buscar: buscarFalso }), e => e.codigo === 'formato_nao_suportado');
  const ok = await lerLink('https://politicas.exemplo.test/viagens', { buscar: buscarFalso });
  assert.equal(ok.titulo, 'Política de Viagens QA');
  assert.match(ok.texto, /R\$ 410/);
});

test('conferência de fidelidade: obrigatória usada, obrigatória ilegível, referência copiada como fato, base não confundida', () => {
  const det = (papel, extra = {}) => ({ codigo: 'F1', id: 'doc:1', titulo: 'Política de Viagens QA', papel, tipo: 'file', status: 'READY', ...extra });
  const textos = { 'doc:1': 'Hospedagem até R$ 410 por noite em capitais. Reembolso em 12 dias úteis após a viagem.' };
  assert.deepEqual(conferirFontes({ detalhe: [det('REQUIRED_SOURCE')], textos }, USA).falhas, []);
  const sem = conferirFontes({ detalhe: [det('REQUIRED_SOURCE')], textos }, IGNORA);
  assert.deepEqual(sem.falhas, ['completo']);
  assert.match(sem.detalhes[0], /Fonte obrigatória não usada: "Política de Viagens QA"/);
  const ilegivel = conferirFontes({ detalhe: [det('REQUIRED_SOURCE', { status: 'FAILED', erro: 'Este link exige login.' })], textos: {} }, USA);
  assert.equal(ilegivel.obrigatoriasFalharam.length, 1);
  // Referência: o valor 987.654 só existe na referência → copiado como fato. 410 está na base de fato → não.
  const ref = { codigo: 'F2', id: 'doc:2', titulo: 'Relatório modelo', papel: 'REFERENCE', tipo: 'file', status: 'READY' };
  const f = conferirFontes({ detalhe: [det('KNOWLEDGE_BASE'), ref], textos: { ...textos, 'doc:2': 'Cliente: Construtora Modelo Fictícia. Contrato de R$ 987.654. Hospedagem R$ 410.' } }, COPIA_REFERENCIA, 'pedido de hoje');
  assert.deepEqual(f.falhas, ['invencao']);
  assert.match(f.detalhes[0], /987654/);
  assert.doesNotMatch(f.detalhes[0], /410/);
  // Optional ausente não aparece; sem fontes, nada muda.
  assert.deepEqual(conferirFontes(null, USA), { falhas: [], detalhes: [], usadas: [], obrigatoriasFalharam: [] });
  assert.ok(fonteUsada({ titulo: 'Manual X' }, 'texto qualquer', 'Conforme o Manual X, o prazo é curto.'));
  assert.ok(numerosDe('R$ 1.500 e 37% em 2026').has('1500'));
  assert.ok(!numerosDe('em 2026').size);
});

test('comandos de fonte na conversa: ignorar, só esta, só referência, fonte principal, usar', () => {
  assert.ok(comandoDeFonte('ignore esse documento').ignorar);
  assert.ok(comandoDeFonte('use só esta planilha').exclusiva);
  assert.equal(comandoDeFonte('considere este link apenas como referência').papel, 'REFERENCE');
  assert.equal(comandoDeFonte('esse PDF é a fonte principal').papel, 'REQUIRED_SOURCE');
  assert.equal(comandoDeFonte('use este arquivo').papel, 'KNOWLEDGE_BASE');
  assert.equal(comandoDeFonte('resuma mais'), null);
});

test('Imagem final: tipo próprio (peça pronta, PNG e JPG), distinto de Imagem (briefing); pedido explícito vira imagem final', () => {
  assert.equal(OP.ENTREGAVEIS.imagem.rotulo, 'Imagem (briefing)');
  assert.equal(OP.ENTREGAVEIS.imagem.descricao, 'Gera direção visual e instruções, sem produzir a imagem.');
  assert.equal(OP.ENTREGAVEIS.imagem_final.rotulo, 'Imagem final');
  assert.equal(OP.ENTREGAVEIS.imagem_final.descricao, 'Gera a peça visual pronta.');
  const tr = tracos({ tipo: 'image' });
  assert.ok(tr.imagemFinal && tr.impacto);
  assert.equal(TIPOS.image.rotulo, 'Imagem final');
  for (const [pedido, formato] of [['Gere a imagem pronta do post de lançamento em 4:5', '4:5'], ['Crie uma imagem para stories da campanha', '9:16'], ['Quero uma imagem final 16:9 para o site', '16:9']]) {
    const v = OP.visualDoPedido(pedido);
    assert.equal(v.tipo, 'image', pedido);
    assert.equal(v.formato, formato, pedido);
  }
  assert.equal(OP.visualDoPedido('Escreva o briefing da arte para o designer')?.tipo, 'social_post');
  const op = OP.limparOperacao({ entregaveis: [{ tipo: 'imagem_final', rotulo: 'Post' }] });
  assert.deepEqual([op.entregaveis[0].visual.tipo, op.entregaveis[0].visual.imagem], ['image', 'conceitual']);
  assert.ok(!OP.ehVisual(op.entregaveis[0]), 'imagem final nunca sai como briefing');
});

// ---- API --------------------------------------------------------------------------------------------------------
test('A/B. arquivo como fonte obrigatória e link como base de conhecimento: papel, situação, sem link real na tela', async () => {
  const q = await criarQw();
  const r1 = await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('politica.docx', docx(['Política de viagens: hospedagem até R$ 410 por noite em capitais.', 'Reembolso em 12 dias úteis.'])), papel: 'REQUIRED_SOURCE' });
  assert.equal(r1.status, 200, JSON.stringify(r1.dados));
  const r2 = await ana.post(`/api/quick-wins/${q.id}/fontes/link`, { url: 'https://politicas.exemplo.test/viagens?token=abc123', papel: 'KNOWLEDGE_BASE' });
  assert.equal(r2.status, 200, JSON.stringify(r2.dados));
  assert.equal(r2.dados.fonte.status, 'READY');
  assert.equal(r2.dados.fonte.url, 'https://politicas.exemplo.test/viagens?…');
  const lista = (await ana.get(`/api/quick-wins/${q.id}/fontes`)).dados;
  assert.deepEqual(lista.fontes.filter(f => f.tipo !== 'company_knowledge').map(f => [f.tipo, f.papel, f.status]), [['file', 'REQUIRED_SOURCE', 'READY'], ['url', 'KNOWLEDGE_BASE', 'READY']]);
  assert.ok(!JSON.stringify(lista).includes('abc123'), 'o token do link nunca volta');
  assert.deepEqual(lista.papeis.map(p => p.rotulo), ['Base de conhecimento', 'Referência', 'Fonte obrigatória', 'Material complementar']);
  const doc = um(S.app.db, "select url_cifrada, url_exibida from documentos where tipo_fonte = 'url' and quick_win_id = ?", q.id);
  assert.ok(!doc.url_cifrada.includes('abc123'), 'o link real fica cifrado');
  const ev = todos(S.app.db, "select detalhes as dados from eventos where tipo in ('source.added', 'source.failed')").map(e => e.dados).join(' ');
  assert.ok(!ev.includes('abc123') && !ev.includes('410'), 'eventos sem conteúdo nem token');
});

test('E. execução usa as fontes com código e papel; fonte obrigatória usada → aprovado; "Fontes usadas" no resultado', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('politica.txt', Buffer.from('Política de Viagens QA. Hospedagem até R$ 410 por noite em capitais. Reembolso em 12 dias úteis.')), titulo: 'Política de Viagens QA', papel: 'REQUIRED_SOURCE' });
  modo = 'usa_fonte';
  const antes = OR.chamadas.length;
  const r = await executar(q.id, { texto: 'Pedido fictício: viagem a São Paulo, 2 noites.' });
  const sis = JSON.stringify(OR.chamadas.slice(antes)[0].messages[0].content);
  assert.match(sis, /\[F1\] Política de Viagens QA — Fonte obrigatória/);
  assert.match(sis, /Referência: use só como modelo de estilo/);
  assert.ok(['aprovado', 'corrigido'].includes(r.fim.qualidade.status), JSON.stringify(r.fim.qualidade));
  assert.deepEqual(r.fim.qualidade.fontes.usadas.map(u => u.titulo), ['Política de Viagens QA']);
});

test('F/G. obrigatória ignorada é corrigida; obrigatória que não pôde ser lida → parcial com o motivo (nunca aprovado); opcional ausente não bloqueia', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('politica.txt', Buffer.from('Política de Viagens QA. Hospedagem até R$ 410 por noite em capitais. Reembolso em 12 dias úteis.')), titulo: 'Política de Viagens QA', papel: 'REQUIRED_SOURCE' });
  modo = 'ignora';
  const r = await executar(q.id, { texto: 'Pedido fictício: viagem a Recife.' });
  assert.equal(r.fim.qualidade.status, 'corrigido', JSON.stringify(r.fim.qualidade));
  assert.match(r.texto, /410/);
  // Link obrigatório que exige login: registrado como FAILED; o resultado fica parcial.
  const q2 = await criarQw();
  const l = await ana.post(`/api/quick-wins/${q2.id}/fontes/link`, { url: 'https://privado.exemplo.test/intranet', papel: 'REQUIRED_SOURCE' });
  assert.equal(l.dados.fonte.status, 'FAILED');
  assert.match(l.dados.fonte.erro, /exige login/);
  modo = 'usa_fonte';
  const r2 = await executar(q2.id, { texto: 'Pedido fictício: viagem a Manaus.' });
  assert.equal(r2.fim.qualidade.status, 'parcial');
  assert.ok(r2.fim.qualidade.avisos.some(a => /fonte obrigatória .* não pôde ser usada/.test(a)), JSON.stringify(r2.fim.qualidade.avisos));
  // Complementar ilegível não bloqueia.
  const q3 = await criarQw();
  await ana.post(`/api/quick-wins/${q3.id}/fontes/link`, { url: 'https://privado.exemplo.test/intranet', papel: 'SUPPLEMENTARY' });
  const r3 = await executar(q3.id, { texto: 'Pedido fictício: viagem a Belém.' });
  assert.ok(['aprovado', 'corrigido'].includes(r3.fim.qualidade.status));
});

test('C. referência só influencia estilo: dado copiado dela é corrigido; nunca entra como fato', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('modelo.txt', Buffer.from('Relatório modelo. Cliente: Construtora Modelo Fictícia. Contrato de R$ 987.654.')), titulo: 'Relatório modelo', papel: 'REFERENCE' });
  modo = 'copia';
  const antes = OR.chamadas.length;
  const r = await executar(q.id, { texto: 'Pedido fictício: hospedagem até R$ 410 por noite.' });
  const sis = JSON.stringify(OR.chamadas.slice(antes)[0].messages[0].content);
  assert.match(sis, /REFERÊNCIAS \(só modelo de estilo, estrutura e linguagem; NÃO são fatos deste caso\)/);
  assert.equal(r.fim.qualidade.status, 'corrigido', JSON.stringify(r.fim.qualidade));
  assert.doesNotMatch(r.texto, /987/);
});

test('D. planilha como fonte (XLSX) com papel; troca de papel e substituição criam nova versão da fonte', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('tabela.xlsx', xlsx([['Cidade', 'Diária'], ['São Paulo', 410], ['Recife', 300]])), papel: 'KNOWLEDGE_BASE' });
  const f = (await ana.get(`/api/quick-wins/${q.id}/fontes`)).dados.fontes.find(x => x.tipo === 'file');
  assert.equal(f.versao, 1);
  const p = await ana.put(`/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { papel: 'SUPPLEMENTARY' });
  assert.equal(p.dados.fontes.find(x => x.documento_id === f.documento_id).papel, 'SUPPLEMENTARY');
  const s = await ana.put(`/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { arquivo: arquivo('tabela.xlsx', xlsx([['Cidade', 'Diária'], ['São Paulo', 450]])) });
  const g = s.dados.fontes.find(x => x.documento_id === f.documento_id);
  assert.equal(g.versao, 2);
  assert.notEqual(g.hash, f.hash);
  assert.equal((await ana.put(`/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { papel: 'INVENTADO' })).status, 400);
});

test('J. versão publicada guarda o retrato das fontes; fonte alterada depois é avisada na execução', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('politica.txt', Buffer.from('Política de Viagens QA. Hospedagem até R$ 410 por noite em capitais.')), titulo: 'Política de Viagens QA' });
  const pub = await ana.post(`/api/quick-wins/${q.id}/publicar`, {});
  assert.equal(pub.status, 200, JSON.stringify(pub.dados));
  const v = um(S.app.db, 'select fontes from quick_win_versoes where quick_win_id = ? order by numero desc', q.id);
  assert.equal(json(v.fontes, []).filter(f => f.tipo === 'file').length, 1);
  const f = (await ana.get(`/api/quick-wins/${q.id}/fontes`)).dados.fontes.find(x => x.tipo === 'file');
  await ana.put(`/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { arquivo: arquivo('politica.txt', Buffer.from('Política de Viagens QA. Hospedagem até R$ 450 por noite em capitais.')) });
  modo = 'usa_fonte';
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id })).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { executar_quick_win: true, texto: 'Pedido fictício: viagem a Curitiba.' });
  assert.ok(r.fim.qualidade.avisos.some(a => /fontes mudaram desde a versão v1/.test(a)), JSON.stringify(r.fim.qualidade.avisos));
});

test('conhecimento da empresa como fonte (papel próprio); escolher documento invisível para a pessoa não é aceito', async () => {
  const q = await criarQw();
  const b = await ana.put(`/api/quick-wins/${q.id}/fontes/base`, { papel: 'REFERENCE' });
  assert.equal(b.dados.fontes.find(f => f.tipo === 'company_knowledge').papel, 'REFERENCE');
  // Documento da base de outra área (que a Ana não vê): fica fora da escolha.
  const B = (await admin.post('/api/admin/areas', { nome: 'Área Secreta QA' })).dados;
  const doc = (await admin.post('/api/bases/documentos', { titulo: 'Doc secreto', area_id: B.id, arquivo: arquivo('secreto.txt', Buffer.from('conteúdo restrito da outra área')) }));
  const docId = doc.dados?.id || um(S.app.db, "select id from documentos where titulo = 'Doc secreto'")?.id;
  if (docId) {
    await ana.put(`/api/quick-wins/${q.id}`, { bases: { modo: 'escolhidas', ids: [docId] } });
    assert.deepEqual(json(um(S.app.db, 'select bases from quick_wins where id = ?', q.id).bases, {}).ids, []);
  }
});

test('H/I. multiempresa e acesso: quem não gere o Quick Win não lista, não lê nem muda as fontes (sem revelar)', async () => {
  const q = await criarQw();
  await ana.post(`/api/quick-wins/${q.id}/arquivos`, { arquivo: arquivo('x.txt', Buffer.from('Conteúdo fictício da Ana.')) });
  const f = (await ana.get(`/api/quick-wins/${q.id}/fontes`)).dados.fontes.find(x => x.tipo === 'file');
  for (const [m, url, corpo] of [['GET', `/api/quick-wins/${q.id}/fontes`], ['POST', `/api/quick-wins/${q.id}/fontes/link`, { url: 'https://politicas.exemplo.test/viagens' }],
    ['PUT', `/api/quick-wins/${q.id}/fontes/${f.documento_id}`, { papel: 'REFERENCE' }], ['DELETE', `/api/quick-wins/${q.id}/fontes/${f.documento_id}`]]) {
    const r = await carlos.req(m, url, corpo);
    assert.ok([403, 404].includes(r.status), `${m} ${url}: ${r.status}`);
  }
  // Fonte de outro Quick Win (IDOR pelo id do documento): 404.
  const q2 = await criarQw();
  assert.equal((await ana.put(`/api/quick-wins/${q2.id}/fontes/${f.documento_id}`, { papel: 'REFERENCE' })).status, 404);
  assert.equal((await ana.req('DELETE', `/api/quick-wins/${q2.id}/fontes/${f.documento_id}`)).status, 404);
});

test('conversa: link enviado é lido pela rede segura; link inseguro vira aviso explícito; comando muda o papel do material', async () => {
  const q = await criarQw();
  modo = 'usa_fonte';
  const conv = (await ana.post('/api/conversas', { quick_win_id: q.id, teste: true })).dados.conversa;
  const antes = OR.chamadas.length;
  const r = await enviarMensagem(ana, conv.id, { executar_quick_win: true, texto: 'Resuma conforme a política.', links: [{ url: 'https://politicas.exemplo.test/viagens', papel: 'REQUIRED_SOURCE' }, 'https://127.0.0.1/admin'] });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const enviado = JSON.stringify(OR.chamadas.slice(antes)[0].messages);
  assert.match(enviado, /FONTE PRINCIPAL/);
  assert.match(enviado, /R\$ 410/);
  assert.match(enviado, /não pôde ser lido/);
  assert.ok(r.fim.qualidade.avisos.some(a => /127\.0\.0\.1.*não pôde ser lido/.test(a)), JSON.stringify(r.fim.qualidade.avisos));
  const anexos = todos(S.app.db, 'select papel, tipo_fonte, url_exibida from anexos where conversa_id = ? order by id', conv.id);
  assert.deepEqual(anexos.map(a => [a.papel, a.tipo_fonte]), [['REQUIRED_SOURCE', 'url'], ['SUPPLEMENTARY', 'url']]);
  await enviarMensagem(ana, conv.id, { texto: 'considere este link apenas como referência' });
  assert.equal(um(S.app.db, "select papel from anexos where conversa_id = ? and url_exibida like 'https://politicas%'", conv.id).papel, 'REFERENCE');
  await enviarMensagem(ana, conv.id, { texto: 'ignore esse link' });
  assert.ok(todos(S.app.db, 'select ignorada from anexos where conversa_id = ?', conv.id).some(a => a.ignorada));
  // Link assinado (token na query): a IA e o histórico só veem a forma mascarada.
  const antes2 = OR.chamadas.length;
  await enviarMensagem(ana, conv.id, { texto: 'veja este', links: ['https://politicas.exemplo.test/viagens?assinatura=XYZ987SEGREDO'] });
  assert.ok(!JSON.stringify(OR.chamadas.slice(antes2)).includes('XYZ987SEGREDO'));
  assert.ok(!JSON.stringify(todos(S.app.db, 'select nome, url_exibida from anexos where conversa_id = ?', conv.id)).includes('XYZ987SEGREDO'));
});

test('Imagem final: com gerador, a imagem é gerada e a peça sai pronta (PNG/JPG); nova imagem e variação viram versões', async () => {
  const q = (await ana.post('/api/quick-wins', { assistente: { descricao: 'Gere a imagem pronta do post de lançamento do produto em 1:1', operacao: { entregaveis: [{ id: 'e1', tipo: 'imagem_final', rotulo: 'Imagem final' }], canais: [], ferramentas: [], origem: 'pessoa' } }, areas: [A.id] })).dados;
  modo = 'imagem';
  const r = await executar(q.id, { texto: 'Produto fictício: linha Verde, sustentável.' });
  assert.ok(['aprovado', 'corrigido'].includes(r.fim.qualidade.status), JSON.stringify(r.fim.qualidade));
  const art = r.fim.artefatos[0];
  assert.deepEqual([art.tipo, art.imagem_final.gerada, art.exportacoes.join(',')], ['image', true, 'png,jpg']);
  const png = await ana.req('GET', `/api/artefatos/${art.id}/baixar?formato=png`);
  assert.equal(png.status, 200);
  const g = await ana.post(`/api/artefatos/${art.id}/gerar-imagem`, { variacao: true });
  assert.equal(g.status, 200, JSON.stringify(g.dados));
  assert.equal(g.dados.artefato.versao, 2);
  assert.equal(g.dados.artefato.imagem_final.gerada, true);
  // Outra pessoa não gera imagem na peça de quem executou (IDOR).
  assert.equal((await carlos.post(`/api/artefatos/${art.id}/gerar-imagem`, {})).status, 404);
});

test('Imagem final sem gerador: parcial, com briefing da imagem; nunca aprovada como imagem', async () => {
  const q = (await ana.post('/api/quick-wins', { assistente: { descricao: 'Gere a imagem pronta do post de lançamento do produto em 1:1', operacao: { entregaveis: [{ id: 'e1', tipo: 'imagem_final', rotulo: 'Imagem final' }], canais: [], ferramentas: [], origem: 'pessoa' } }, areas: [A.id] })).dados;
  const espec = json(um(S.app.db, 'select especificacao from quick_wins where id = ?', q.id).especificacao);
  assert.equal(espec.operacao.entregaveis[0].visual.tipo, 'image');
  modo = 'imagem';
  S.app.ia.geraImagem = false;
  try {
    const r = await executar(q.id, { texto: 'Produto fictício: linha Verde, sustentável.' });
    assert.equal(r.status, 200);
    assert.equal(r.fim.qualidade.status, 'parcial', JSON.stringify(r.fim.qualidade));
    assert.ok(r.fim.qualidade.avisos.some(a => /imagem final não foi gerada/.test(a)));
    const art = r.fim.artefatos?.[0];
    assert.ok(art, 'a peça sai (só tipografia)');
    assert.equal(art.status, 'parcial');
    assert.equal(art.imagem_final.gerada, false);
    assert.match(art.imagem_final.briefing, /Sem nenhum texto, letra, número/);
    assert.deepEqual(art.exportacoes, ['png', 'jpg']);
    const g = await ana.post(`/api/artefatos/${art.id}/gerar-imagem`, {});
    assert.equal(g.status, 409);
    assert.match(g.dados.mensagem, /não pode ser gerada/);
  } finally { delete S.app.ia.geraImagem; }
});

// Generalização: 24 pedidos que nenhum teste acima usa (nenhuma regra é por cenário).
test('generalização (24 pedidos novos): imagem final × briefing × outra peça × sem visual; comandos de fonte', () => {
  const imagem = ['Gere a imagem pronta para o anúncio da feira de outubro', 'Preciso de uma imagem para o banner do site em 16:9', 'Crie imagens para o post de Dia do Cliente',
    'Produza a imagem final da campanha de inverno em 4:5', 'Quero uma imagem para stories anunciando o novo horário', 'Faça uma imagem para divulgar o treinamento interno de segurança',
    'Arte pronta para o comunicado de férias coletivas', 'Gerar imagem para a capa do e-mail marketing'];
  for (const p of imagem) assert.equal(OP.visualDoPedido(p)?.tipo, 'image', p);
  const outros = [['Monte uma apresentação de 6 slides sobre o resultado do trimestre', 'presentation'], ['Transforme a política em um infográfico', 'infographic'],
    ['Faça um fluxograma do processo de compras', 'diagram'], ['Crie um cartaz para a SIPAT', 'poster'], ['Monte um carrossel para o Instagram sobre reciclagem', 'carousel'],
    ['Quero um dashboard com os indicadores de vendas', 'dashboard']];
  for (const [p, t] of outros) assert.equal(OP.visualDoPedido(p)?.tipo, t, p);
  for (const p of ['Resuma o contrato e liste os riscos', 'Compare as duas propostas e recomende uma', 'Responda ao cliente sobre o atraso', 'Use a imagem de referência para descrever o estilo da marca'])
    assert.notEqual(OP.visualDoPedido(p)?.tipo, 'image', p);
  const cmds = [['desconsidere o pdf', 'ignorar'], ['não use a planilha', 'ignorar'], ['use somente este arquivo', 'exclusiva'], ['considere o site como referência', 'REFERENCE'],
    ['esta planilha é a base principal', 'REQUIRED_SOURCE'], ['use esta imagem', 'KNOWLEDGE_BASE']];
  for (const [t, esperado] of cmds) {
    const c = comandoDeFonte(t);
    assert.ok(c, t);
    assert.equal(c.ignorar ? 'ignorar' : c.exclusiva ? 'exclusiva' : c.papel, esperado, t);
  }
});
