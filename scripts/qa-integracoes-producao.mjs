// QA do Integration Builder em produção, só com APIs públicas de sandbox (JSONPlaceholder: escritas simuladas pelo
// próprio serviço, nada persiste; httpbin: status, atraso e eco de autenticação) e dados fictícios.
//
//   QA_BASE=https://<endereço> QA_EMPRESA=<slug> QA_CODIGO_FIFO=/fifo QA_COMANDOS=/fifo2 node scripts/qa-integracoes-producao.mjs
//
// Login único (o código chega uma vez pelo FIFO e não é guardado nem impresso; cookie e CSRF só na memória).
// Comandos: saude | ligar | cenarios | visual | limpar | desligar | sair. "ligar" liga o recurso SÓ para a conta de QA;
// "desligar" devolve a configuração de integrações ao estado anterior. Conectores criados começam com "QA - " e
// são revogados no "limpar"; Quick Wins "QA - " vão para a exclusão lógica. Credenciais usadas são fictícias e
// geradas na hora; o relatório nunca as contém (o script confere).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const BASE = String(process.env.QA_BASE || '').replace(/\/$/, ''), EMPRESA = process.env.QA_EMPRESA || '', FIFO = process.env.QA_CODIGO_FIFO || '';
const CONTA = process.env.QA_CONTA || 'vinicius@apymine.com';
if (!BASE || !FIFO) { console.log('Informe QA_BASE e QA_CODIGO_FIFO.'); process.exit(1); }
const RAIZ = join(process.cwd(), 'qa-producao-saida', `integracoes-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(RAIZ, { recursive: true });
const R = { base: BASE, cenarios: {}, criados: { conectores: [], quick_wins: [] }, erros: [] };
const CRIADOS = [], CONVERSAS = {};
const TOKEN_FICTICIO = `qa-token-ficticio-${randomBytes(9).toString('hex')}`;
const salvar = () => { const t = JSON.stringify(R, null, 2); if (t.includes(TOKEN_FICTICIO)) { R.vazamento_no_relatorio = true; } writeFileSync(join(RAIZ, 'relatorio.json'), t.split(TOKEN_FICTICIO).join('[token-fictício]')); };
const log = (...a) => console.log(...a);
// ---- sessão (sem navegador) ------------------------------------------------------------------------------------
const jar = new Map(); let csrf = '';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 GreenIA-QA';
async function pedir(metodo, caminho, corpo, redirecionar = 'follow') {
  const r = await fetch(BASE + caminho, { method: metodo, redirect: redirecionar, headers: { 'user-agent': UA, ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
    ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' && csrf ? { 'x-csrf': csrf } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
  return r;
}
const ciencia = async () => { const p = await (await pedir('GET', '/api/politica')).json(); await pedir('POST', '/api/politica/ciencia', { versao: p.versao }); };
async function api(metodo, caminho, corpo) {
  let r = await pedir(metodo, caminho, corpo); if (r.status === 428) { await ciencia(); r = await pedir(metodo, caminho, corpo); }
  const t = await r.text(); let dados; try { dados = JSON.parse(t); } catch { dados = t; }
  return { status: r.status, dados };
}
async function binario(caminho) {
  const t0 = performance.now(), r = await pedir('GET', caminho);
  return { status: r.status, tipo: r.headers.get('content-type'), disposicao: r.headers.get('content-disposition'), dados: Buffer.from(await r.arrayBuffer()), ms: Math.round(performance.now() - t0) };
}
async function enviar(convId, corpo) {
  const t0 = performance.now(), linhas = [];
  for (let i = 0; ; i++) {
    let r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); if (r.status === 428) { await ciencia(); r = await pedir('POST', `/api/conversas/${convId}/mensagens`, corpo); }
    if (r.status === 429 && i < 3) { log('   (limite de rajada: aguardando 65 s)'); await new Promise(ok => setTimeout(ok, 65e3)); continue; }
    if (!r.headers.get('content-type')?.includes('ndjson')) return { status: r.status, erro: (await r.text()).slice(0, 300), linhas, ms: performance.now() - t0 };
    const dec = new TextDecoder(); let resto = '';
    for await (const pedaco of r.body) { resto += dec.decode(pedaco, { stream: true }); const ls = resto.split('\n'); resto = ls.pop();
      for (const l of ls) if (l.trim()) { try { linhas.push({ ms: performance.now() - t0, ...JSON.parse(l) }); } catch {} } }
    return { status: r.status, linhas, ms: performance.now() - t0 };
  }
}
if (EMPRESA) await pedir('GET', `/${EMPRESA}/entrar`, undefined, 'manual');
// Login único: o código chega uma vez pelo FIFO, vai direto para o login e não é guardado nem repetido.
const c = await pedir('POST', '/api/login/codigo', { email: CONTA });
if (c.status !== 200) { log('CODIGO_NAO_SOLICITADO', c.status); process.exit(1); }
log('CODIGO_SOLICITADO');
const e = await pedir('POST', '/api/login/entrar', { email: CONTA, codigo: readFileSync(FIFO, 'utf8').trim() });
const d = await e.json().catch(() => ({}));
if (e.status !== 200) { log('LOGIN_RECUSADO', e.status, String(d.mensagem || d.erro || '').slice(0, 200)); process.exit(1); }
csrf = d.csrf; await ciencia().catch(() => {});
const eu = (await api('GET', '/api/eu')).dados;
if (String(eu.pessoa?.email).toLowerCase() !== CONTA) { log('Conta inesperada. Parando.'); process.exit(1); }
log('LOGIN_QA_CONCLUIDO=true', 'admin=' + !!eu.pessoa?.admin, 'ia=' + (eu.iaConfigurada === true));
R.versao = (await api('GET', '/api/saude')).dados?.versao || null;
const perm = eu.quickWins || {};
const destino = perm.areas?.length ? { areas: [perm.areas[0].id] } : perm.todaEmpresa ? { toda_empresa: true } : null;
if (!perm.criar || !destino) { log('A conta não pode criar Quick Wins.'); process.exit(1); }


// ---- integrações (sandbox público) --------------------------------------------------------------------------------
const JP = 'https://jsonplaceholder.typicode.com', HB = 'https://httpbin.org';
const TAREFA = { type: 'object', required: ['id', 'title', 'completed'], properties: { userId: { type: 'integer' }, id: { type: 'integer' }, title: { type: 'string' }, completed: { type: 'boolean' } } };
const SPEC_TAREFAS = { openapi: '3.0.3', info: { title: 'Sandbox Tarefas' }, servers: [{ url: JP }], paths: {
  '/todos': { get: { operationId: 'listarTarefas', summary: 'Tarefas', parameters: [{ name: 'userId', in: 'query', schema: { type: 'integer' } }], responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: TAREFA } } } } } } },
  '/posts': { post: { operationId: 'registrarNota', summary: 'Notas de acompanhamento', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['title', 'body', 'userId'], properties: { title: { type: 'string' }, body: { type: 'string' }, userId: { type: 'integer' } } } } } },
    responses: { 201: { content: { 'application/json': { schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } } } } } } } },
  '/posts/{id}': { delete: { operationId: 'apagarNota', summary: 'Apagar nota', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: {} } } },
} };
const SPEC_HB = (sistema, ops) => ({ openapi: '3.0.3', info: { title: sistema }, servers: [{ url: HB }], paths: Object.fromEntries(ops.map(([id, caminho, schema]) => [caminho, { get: { operationId: id, summary: id, responses: { 200: { content: { 'application/json': { schema: schema || { type: 'object' } } } } } } }])) });

const ok = (c, cond, detalhe) => { (R.cenarios[c] ||= { checks: [] }).checks.push({ ok: !!cond, detalhe }); if (!cond) log(`   FALHA ${c}: ${detalhe}`); return !!cond; };
async function conector({ nome, sistema, spec, auth_type = 'none', credencial = null, escolhas, config = {}, publicar = true }) {
  const d = await api('POST', '/api/admin/integracoes/descobrir', { especificacao: JSON.stringify(spec) });
  if (d.status !== 200) throw new Error(`descoberta ${d.status} ${JSON.stringify(d.dados).slice(0, 160)}`);
  const c = await api('POST', '/api/admin/integracoes', { nome: `QA - ${nome}`, sistema, base_url: d.dados.base_url, auth_type, operacoes: d.dados.operacoes, config: { timeout_ms: 8000, ...config } });
  if (c.status !== 200) throw new Error(`criação ${c.status} ${JSON.stringify(c.dados).slice(0, 160)}`);
  R.criados.conectores.push(c.dados.id); salvar();
  const caps = await api('PUT', `/api/admin/integracoes/${c.dados.id}/capabilities`, { escolhas });
  if (caps.status !== 200) throw new Error(`capabilities ${caps.status} ${JSON.stringify(caps.dados).slice(0, 160)}`);
  if (credencial) { const cr = await api('PUT', `/api/admin/integracoes/${c.dados.id}/credencial`, { valor: credencial }); if (cr.status !== 200) throw new Error(`credencial ${cr.status}`); }
  const t = (await api('POST', `/api/admin/integracoes/${c.dados.id}/testar`, {})).dados;
  let status = null;
  if (t.passou && publicar) {
    const ap = await api('POST', `/api/admin/integracoes/aprovacoes/${t.aprovacao.id}/decidir`, { aprovar: true, motivo: 'QA homologação sandbox' });
    if (ap.status !== 200) throw new Error(`aprovação ${ap.status}`);
    status = (await api('POST', `/api/admin/integracoes/${c.dados.id}/publicar`, {})).dados?.status;
  }
  return { id: c.dados.id, teste: t, status, aprovacao: t.aprovacao };
}
async function quickWin(nome, descricao) {
  const it = (await api('POST', '/api/quick-wins/assistente/interpretar', { descricao })).dados;
  const q = await api('POST', '/api/quick-wins', { nome: `QA - ${nome}`, ...destino, assistente: { descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } } });
  if (q.status !== 200) throw new Error(`criação QW ${q.status} ${JSON.stringify(q.dados).slice(0, 160)}`);
  CRIADOS.push(q.dados.id); R.criados.quick_wins.push(q.dados.id);
  await api('PUT', `/api/quick-wins/${q.dados.id}`, { nome: `QA - ${nome}` });
  const conv = (await api('POST', '/api/conversas', { quick_win_id: q.dados.id, teste: true })).dados.conversa;
  CONVERSAS[q.dados.id] = conv.id; salvar();
  return { id: q.dados.id, conv: conv.id, integracoes: it.integracoes || null, operacao: it.operacao };
}
async function executar(qw, material) {
  let r = await enviar(qw.conv, { executar_quick_win: true, texto: material });
  let texto = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
  if (texto.trim().startsWith('Antes de começar')) { r = await enviar(qw.conv, { executar_quick_win: true, texto: 'Use só o material e os dados consultados; pode decidir o restante.' }); texto = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join(''); }
  const fim = r.linhas.find(l => l.t === 'fim');
  return { status: r.status, texto, fim, qualidade: fim?.qualidade?.status || null, integracoes: fim?.qualidade?.integracoes || null, ms: Math.round(r.ms), erro: r.erro || r.linhas.find(l => l.t === 'erro')?.mensagem || null };
}
const semToken = v => !JSON.stringify(v ?? '').includes(TOKEN_FICTICIO);

async function cenarios() {
  const t0 = Date.now();
  // 0. SSRF: destinos internos nunca são alcançados (rede interna da empresa não autorizada).
  try {
    const res = [];
    for (const base of ['http://localhost:8080', 'http://127.0.0.1', 'http://169.254.169.254', 'https://10.0.0.1', 'https://192.168.0.10']) {
      const c = await api('POST', '/api/admin/integracoes', { nome: 'QA - SSRF', sistema: 'QA SSRF', base_url: base, auth_type: 'none', operacoes: [{ operation_id: 'x', metodo: 'GET', caminho: '/latest/meta-data', classe: 'SAFE_READ', categoria: 'read_data' }], config: { rede_privada: true } });
      if (c.status !== 200) { res.push({ base, criacao: c.status }); continue; }
      R.criados.conectores.push(c.dados.id);
      await api('PUT', `/api/admin/integracoes/${c.dados.id}/capabilities`, { escolhas: [{ operation_id: 'x' }] });
      const t = (await api('POST', `/api/admin/integracoes/${c.dados.id}/testar`, {})).dados;
      res.push({ base, passou: t.passou, erro: t.resultados?.[0]?.erro });
    }
    R.cenarios.ssrf = { res };
    ok('ssrf', res.every(x => x.criacao >= 400 || (x.passou === false && ['destino_bloqueado', 'protocolo', 'host_nao_autorizado'].includes(x.erro))), JSON.stringify(res));
  } catch (e) { ok('ssrf', false, e.message); }

  // 1. Conector só leitura + 2. escrita com aprovação + 3. operação negada (mesmo conector de sandbox).
  let tarefas;
  try {
    tarefas = await conector({ nome: 'Sandbox Tarefas', sistema: 'Sandbox Tarefas', spec: SPEC_TAREFAS, escolhas: [{ operation_id: 'listarTarefas' }, { operation_id: 'registrarNota' }, { operation_id: 'apagarNota' }] });
    R.cenarios.conector_tarefas = { teste: tarefas.teste.itens.map(i => `${i.id}:${i.ok ? 'ok' : 'falha'}`), resultados: tarefas.teste.resultados.map(r => [r.nome || r.capability, r.status, r.erro]), status: tarefas.status };
    ok('leitura', tarefas.teste.passou && tarefas.status === 'ACTIVE', `teste e publicação: ${tarefas.status}`);
    ok('aprovacao', tarefas.teste.resultados.filter(r => r.modo === 'write').every(r => r.status === 'SIMULATED'), 'escritas só simuladas no teste');
    const det = (await api('GET', `/api/admin/integracoes/${tarefas.id}`)).dados;
    R.cenarios.aprovacao_publicacao = (await api('GET', `/api/admin/integracoes`)).dados.pendentes.length;
    const qw1 = await quickWin('Resumo de tarefas sandbox', 'Consulte as tarefas no Sandbox Tarefas e faça um resumo das pendências por usuário.');
    ok('leitura', JSON.stringify(qw1.integracoes?.map(n => n.estado)) === '["disponivel"]', `resolução ${JSON.stringify(qw1.integracoes?.map(n => [n.categoria, n.estado]))}`);
    const e1 = await executar(qw1, 'Use as tarefas consultadas (dados públicos de teste).');
    R.cenarios.leitura = { ...(R.cenarios.leitura || {}), qualidade: e1.qualidade, integracoes: e1.integracoes, ms: e1.ms, caracteres: e1.texto.length };
    ok('leitura', e1.integracoes?.passos?.[0]?.status === 'SUCCESS', `etapa de leitura: ${JSON.stringify(e1.integracoes)}`);
    ok('leitura', e1.texto.length > 80 && !/dados_integracao/.test(e1.texto), 'resultado com os dados e sem o bloco técnico');
    writeFileSync(join(RAIZ, 'leitura.md'), e1.texto);
    R.cenarios.capability_leitura = det.capabilities.find(x => x.modo === 'read')?.id;

    const qw2 = await quickWin('Nota de acompanhamento sandbox', 'Consulte as tarefas no Sandbox Tarefas e registre uma nota de acompanhamento com o resumo no Sandbox Tarefas.');
    ok('aprovacao', JSON.stringify(qw2.integracoes?.map(n => n.estado)) === '["disponivel","requer_aprovacao"]', `resolução ${JSON.stringify(qw2.integracoes?.map(n => [n.categoria, n.estado]))}`);
    const e2 = await executar(qw2, 'Use as tarefas consultadas. A nota é do usuário 1 (dados públicos de teste).');
    R.cenarios.aprovacao = { ...(R.cenarios.aprovacao || {}), qualidade: e2.qualidade, integracoes: e2.integracoes };
    const passo = e2.integracoes?.passos?.[1];
    if (ok('aprovacao', passo?.status === 'APPROVAL_REQUIRED' && passo.aprovacao, `escrita aguardando aprovação: ${JSON.stringify(passo)}`)) {
      const ap = (await api('GET', '/api/admin/integracoes/aprovacoes')).dados.pendentes.find(a => a.id === passo.aprovacao);
      R.cenarios.aprovacao.tela = { sistema: ap?.resumo?.sistema, acao: ap?.resumo?.acao, risco: ap?.risco, campos: Object.keys(ap?.resumo?.dados || {}) };
      ok('aprovacao', (await api('POST', `/api/admin/integracoes/aprovacoes/${passo.aprovacao}/decidir`, { aprovar: true, motivo: 'QA sandbox' })).status === 200, 'aprovação registrada');
      const ex = (await api('POST', `/api/integracoes/planos/${e2.integracoes.plano}/executar`, {})).dados;
      R.cenarios.aprovacao.depois = ex?.passos?.map(p => [p.modo, p.status, p.http_status]);
      ok('aprovacao', ex?.passos?.[1]?.status === 'SUCCESS', `escrita depois da aprovação: ${JSON.stringify(ex?.passos?.[1])}`);
      const de = (await api('POST', `/api/integracoes/planos/${e2.integracoes.plano}/executar`, {})).dados;
      ok('aprovacao', de?.status === 'concluido', 'reexecutar não grava de novo');
    }

    // 3. Operação negada (apagar): a política nega; o plano bloqueia; nenhuma chamada sai.
    const res = (await api('POST', '/api/integracoes/necessidades', { descricao: 'Apague a nota 1 no Sandbox Tarefas.' })).dados;
    ok('negada', res?.necessidades?.[0]?.estado === 'nao_permitido', `resolução ${JSON.stringify(res?.necessidades?.map(n => [n.categoria, n.estado, n.motivo]))}`);
    const pl = (await api('POST', '/api/integracoes/planos', { descricao: 'Apague a nota 1 no Sandbox Tarefas.' })).dados;
    const ex3 = (await api('POST', `/api/integracoes/planos/${pl.id}/executar`, {})).dados;
    const runsApagar = (await api('GET', `/api/admin/integracoes/${tarefas.id}`)).dados.execucoes.filter(x => x.operation_id === 'apagarNota' && x.modo === 'real' && x.status === 'SUCCESS');
    R.cenarios.negada = { plano: ex3?.passos?.map(p => [p.status, p.motivo]), chamadas_reais_apagar: runsApagar.length };
    ok('negada', ex3?.passos?.[0]?.status === 'BLOCKED' && runsApagar.length === 0, 'bloqueado e sem chamada');

    // 7. Reutilização: outro Quick Win usa a MESMA capability publicada.
    const qw3 = await quickWin('Pendências por usuário sandbox', 'Busque as tarefas no Sandbox Tarefas e liste as pendências do usuário 2.');
    const mesma = qw3.integracoes?.[0]?.capability_id && qw3.integracoes[0].capability_id === qw1.integracoes?.[0]?.capability_id;
    const e3 = await executar(qw3, 'Usuário 2 (dados públicos de teste).');
    R.cenarios.reutilizacao = { capability: qw3.integracoes?.[0]?.capability_id, mesma, passo: e3.integracoes?.passos?.[0]?.status };
    ok('reutilizacao', mesma && e3.integracoes?.passos?.[0]?.status === 'SUCCESS', 'mesma capability, executada');

    // 8. Versão nova: mudar o tempo limite gera versão 2, invalida a aprovação e tira do ar até novo teste.
    const antes = (await api('GET', `/api/admin/integracoes/${tarefas.id}`)).dados;
    const pa = (await api('PATCH', `/api/admin/integracoes/${tarefas.id}`, { config: { timeout_ms: 9000 } })).dados;
    const resV = (await api('POST', '/api/integracoes/necessidades', { descricao: 'Consulte as tarefas no Sandbox Tarefas.' })).dados;
    R.cenarios.versao = { antes: [antes.versao, antes.status], depois: [pa?.versao, pa?.status], resolucao: resV?.necessidades?.[0]?.estado };
    ok('versao', pa?.versao === antes.versao + 1 && pa?.status === 'CONFIGURED' && resV?.necessidades?.[0]?.estado === 'configurar', JSON.stringify(R.cenarios.versao));
    const pub = (await api('POST', `/api/admin/integracoes/${tarefas.id}/publicar`, {})).status;
    ok('versao', pub === 409, `publicar a versão nova sem teste/aprovação: ${pub}`);
    const t2 = (await api('POST', `/api/admin/integracoes/${tarefas.id}/testar`, {})).dados;
    if (t2.passou) { await api('POST', `/api/admin/integracoes/aprovacoes/${t2.aprovacao.id}/decidir`, { aprovar: true }); }
    const v2 = (await api('POST', `/api/admin/integracoes/${tarefas.id}/publicar`, {})).dados;
    const resV2 = (await api('POST', '/api/integracoes/necessidades', { descricao: 'Consulte as tarefas no Sandbox Tarefas.' })).dados;
    R.cenarios.versao.republicada = [v2?.versao, v2?.status, resV2?.necessidades?.[0]?.estado];
    ok('versao', v2?.status === 'ACTIVE' && resV2?.necessidades?.[0]?.estado === 'disponivel', 'versão 2 testada, aprovada e publicada');
  } catch (e) { ok('leitura', false, e.message); R.erros.push(e.message); }

  // 4. Repetição: 503 em leitura repete (com backoff) e falha de forma controlada; 5. tempo esgotado; 6. esquema.
  try {
    const f = await conector({ nome: 'Sandbox Instável', sistema: 'Sandbox Instável', spec: SPEC_HB('Sandbox Instável', [['indisponivel', '/status/503']]), escolhas: [{ operation_id: 'indisponivel' }], config: { max_tentativas: 3, backoff_ms: 200 } });
    const r = f.teste.resultados[0];
    R.cenarios.repeticao = { status: r.status, http: r.http_status, tentativas: r.tentativas, erro: r.erro, teste_passou: f.teste.passou };
    ok('repeticao', r.tentativas >= 2 && r.status === 'FAILED' && f.teste.passou === false, JSON.stringify(R.cenarios.repeticao));
    const d = await conector({ nome: 'Sandbox Lento', sistema: 'Sandbox Lento', spec: SPEC_HB('Sandbox Lento', [['lento', '/delay/6']]), escolhas: [{ operation_id: 'lento' }], config: { timeout_ms: 2000, max_tentativas: 1 } });
    R.cenarios.tempo = { erro: d.teste.resultados[0]?.erro, ms: d.teste.resultados[0]?.ms, passou: d.teste.passou };
    ok('tempo', d.teste.resultados[0]?.erro === 'tempo_esgotado' && !d.teste.passou && d.teste.resultados[0].ms < 6000, JSON.stringify(R.cenarios.tempo));
    const s = await conector({ nome: 'Sandbox Esquema', sistema: 'Sandbox Esquema', spec: { ...SPEC_HB('Sandbox Esquema', []), servers: [{ url: JP }], paths: { '/todos/1': { get: { operationId: 'tarefaUm', summary: 'Tarefa', responses: { 200: { content: { 'application/json': { schema: { type: 'object', required: ['id', 'nome_cliente'], properties: { id: { type: 'integer' }, nome_cliente: { type: 'string' } } } } } } } } } } }, escolhas: [{ operation_id: 'tarefaUm' }] });
    R.cenarios.esquema = { erro: s.teste.resultados[0]?.erro, status: s.teste.resultados[0]?.status, passou: s.teste.passou };
    ok('esquema', s.teste.resultados[0]?.erro === 'resposta_fora_do_esquema' && !s.teste.passou, JSON.stringify(R.cenarios.esquema));
  } catch (e) { ok('repeticao', false, e.message); R.erros.push(e.message); }

  // Credencial fictícia (Bearer) num serviço que ECOA o token: o token nunca volta (resposta, tela, IA, auditoria).
  try {
    const a = await conector({ nome: 'Sandbox Autenticado', sistema: 'Sandbox Autenticado', spec: SPEC_HB('Sandbox Autenticado', [['eco', '/bearer', { type: 'object', required: ['authenticated'], properties: { authenticated: { type: 'boolean' }, token: { type: 'string' } } }]]), auth_type: 'bearer', credencial: TOKEN_FICTICIO, escolhas: [{ operation_id: 'eco', efeitos: { personal_data: false } }] });
    const det = await api('GET', `/api/admin/integracoes/${a.id}`);
    const pl = (await api('POST', '/api/integracoes/planos', { necessidades: [{ acao: 'Consultar autenticação no Sandbox Autenticado', categoria: 'read_data', sistema: 'Sandbox Autenticado', modo: 'read' }] })).dados;
    const ex = await api('POST', `/api/integracoes/planos/${pl.id}/executar`, {});
    const lista = await api('GET', '/api/admin/integracoes');
    const ev = await api('GET', '/api/admin/eventos?limite=200');
    R.cenarios.segredo = { teste: a.teste.passou, mascara: det.dados?.credencial?.mascara, execucao: ex.dados?.passos?.[0]?.status };
    ok('segredo', a.teste.passou && ex.dados?.passos?.[0]?.status === 'SUCCESS', 'autenticação Bearer funcionou');
    ok('segredo', [a, det, ex, lista, ev].every(semToken), 'token fictício não aparece em teste, detalhe, execução, lista nem auditoria');
  } catch (e) { ok('segredo', false, e.message); R.erros.push(e.message); }

  // 9. Isolamento: ids que não são desta empresa (ou não existem) dão 404; nada vaza na lista.
  try {
    const ids = ['con_00000000000000000000', 'apr_00000000000000000000', 'pln_00000000000000000000'];
    const st = [(await api('GET', `/api/admin/integracoes/${ids[0]}`)).status, (await api('POST', `/api/admin/integracoes/aprovacoes/${ids[1]}/decidir`, { aprovar: true })).status,
      (await api('GET', `/api/integracoes/planos/${ids[2]}`)).status, (await api('GET', `/api/integracoes/aprovacoes/${ids[1]}`)).status, (await api('POST', `/api/admin/integracoes/${ids[0]}/revogar`, {})).status];
    const lista = (await api('GET', '/api/admin/integracoes')).dados;
    const meus = new Set(R.criados.conectores);
    R.cenarios.isolamento = { status: st, conectores_na_lista: lista.conectores.length, todos_desta_empresa: lista.conectores.every(c => meus.has(c.id) || !String(c.nome).startsWith('QA - ')) };
    ok('isolamento', st.every(s => s === 404), `ids alheios: ${st.join(',')}`);
  } catch (e) { ok('isolamento', false, e.message); }

  // 10. Quick Win sem integração (texto) e produção visual continuam iguais.
  try {
    const t = await quickWin('Resumo sem integração', 'Resuma este documento em tópicos curtos.');
    const e = await executar(t, 'Política de viagens (fictícia): viagens nacionais precisam de aprovação do gestor com 7 dias de antecedência. Hospedagem até R$ 380 por noite.');
    R.cenarios.sem_integracao = { integracoes_na_criacao: t.integracoes, integracoes_na_execucao: e.integracoes, qualidade: e.qualidade, caracteres: e.texto.length };
    ok('sem_integracao', !t.integracoes && !e.integracoes && e.texto.length > 40 && ['aprovado', 'corrigido', 'parcial'].includes(e.qualidade), JSON.stringify(R.cenarios.sem_integracao));
    const v = await quickWin('One-page sem integração', 'Crie um one-page visual com os indicadores de manutenção do mês.');
    const ev = await executar(v, 'Manutenção — setembro de 2026 (fictício). Ordens abertas: 142; concluídas: 128. Disponibilidade da linha 1: 96%; linha 2: 91%.');
    const art = ev.fim?.artefatos?.[0];
    const pdf = art ? await binario(`/api/artefatos/${art.id}/baixar?formato=pdf`) : null;
    R.cenarios.visual = { artefato: art ? { tipo: art.tipo, paginas: art.paginas, status: art.status } : null, pdf: pdf?.status, integracoes: ev.integracoes };
    ok('sem_integracao', art && pdf?.status === 200 && pdf.dados.subarray(0, 5).toString() === '%PDF-' && !ev.integracoes, 'produção visual intacta');
  } catch (e) { ok('sem_integracao', false, e.message); }

  R.metricas = (await api('GET', '/api/admin/integracoes')).dados?.metricas;
  R.duracao_s = Math.round((Date.now() - t0) / 1000);
  salvar();
  const linhas = Object.entries(R.cenarios).filter(([, v]) => v.checks).map(([k, v]) => `${k}=${v.checks.every(c => c.ok) ? 'ok' : 'FALHA'}`);
  log(`CENARIOS_FIM versao=${R.versao} ${linhas.join(' ')} vazamento_relatorio=${!!R.vazamento_no_relatorio}`);
}

// ---- Design pela IA (peças visuais) ----------------------------------------------------------------------------
const VISUAIS = [
  { nome: 'Apresentação executiva', descricao: 'Transforme os números do trimestre em uma apresentação executiva de 6 slides para a diretoria.',
    material: 'Resultados do 3º trimestre de 2026 (dados fictícios, empresa Exemplo QA): Receita R$ 12,4 milhões (meta R$ 12,0 milhões). Margem EBITDA 18%. Custo de frete subiu 9%. Clientes ativos: 1.240 (eram 1.180). Projetos: novo centro de distribuição 70% concluído; ERP em homologação. Riscos: atraso de fornecedor de embalagens; câmbio. Próximos passos: renegociar frete até 30/11; concluir o CD em dezembro.' },
  { nome: 'Cartaz de evento', descricao: 'Crie um cartaz para divulgar a Semana de Segurança da empresa.',
    material: 'Semana Interna de Prevenção de Acidentes (fictícia): 13 a 17 de outubro de 2026, às 9h, no refeitório. Atividades: palestras diárias, gincana de segurança, campanha de vacinação. Tema: Cuidar de você é o nosso jeito de trabalhar.' },
  { nome: 'One-page de contrato', descricao: 'Analise este contrato e crie um one-page visual com riscos, prazos e obrigações principais.',
    material: 'CONTRATO DE LOCAÇÃO DE EQUIPAMENTOS Nº QA-12/2026 (fictício). Vigência: 24 meses a partir de 01/11/2026. Valor: R$ 36.000 por mês, reajuste anual pelo IPCA. Multa por rescisão antecipada: 30% do saldo. Manutenção preventiva pela locadora a cada 90 dias. Seguro pela locatária. Aviso prévio de 60 dias.' },
  { nome: 'Infográfico de processo', descricao: 'Transforme este processo de compras em um infográfico.',
    material: 'Processo de compras (fictício): 1) a área faz o pedido no portal; 2) o gestor aprova em até 2 dias; 3) Compras cota com 3 fornecedores; 4) pedidos acima de R$ 5.000 vão para a diretoria; 5) Compras emite o pedido; 6) o almoxarifado recebe e confere; 7) a área retira o material. Prazo total: até 10 dias úteis.' },
  { nome: 'Post para LinkedIn', descricao: 'Crie um post visual para o LinkedIn anunciando o novo centro de distribuição.',
    material: 'Novo centro de distribuição (fictício) em Contagem/MG: 12 mil m², início da operação em dezembro de 2026, 80 novas vagas, entregas na região metropolitana em até 24 horas.' },
];
async function visual() {
  R.visual = [];
  const pasta = join(RAIZ, 'visual'); mkdirSync(pasta, { recursive: true });
  for (const caso of VISUAIS) {
    const reg = { nome: caso.nome };
    try {
      const q = await quickWin(caso.nome, caso.descricao);
      const e = await executar(q, caso.material);
      reg.qualidade = e.qualidade; reg.ms = e.ms; reg.erro = e.erro;
      reg.artefatos = [];
      for (const a of e.fim?.artefatos || []) {
        const det = (await api('GET', `/api/artefatos/${a.id}`)).dados;
        const A = { id: a.id, tipo: a.tipo, formato: a.formato, paginas: a.paginas, status: a.status, avisos: a.avisos };
        for (let n = 1; n <= Math.min(a.paginas || 1, 8); n++) {
          const p = await binario(`/api/artefatos/${a.id}/paginas/${n}`);
          if (p.status === 200) writeFileSync(join(pasta, `${slug(caso.nome)}-p${n}.${/jpeg/.test(p.tipo) ? 'jpg' : 'png'}`), p.dados);
          (A.previas ||= []).push({ n, status: p.status, tipo: p.tipo, kb: Math.round(p.dados.length / 1024) });
        }
        const pdf = await binario(`/api/artefatos/${a.id}/baixar?formato=pdf`);
        A.pdf = { status: pdf.status, ok: pdf.dados.subarray(0, 5).toString() === '%PDF-', kb: Math.round(pdf.dados.length / 1024) };
        if (pdf.status === 200) writeFileSync(join(pasta, `${slug(caso.nome)}.pdf`), pdf.dados);
        const png = await binario(`/api/artefatos/${a.id}/baixar?formato=png&pagina=1`);
        A.png = { status: png.status, kb: Math.round(png.dados.length / 1024) };
        A.versoes = det?.versoes?.length;
        reg.artefatos.push(A);
      }
      reg.motor = (e.fim?.artefatos || []).length ? 'ver_evento' : null;
    } catch (err) { reg.erro = String(err.message || err).slice(0, 200); }
    R.visual.push(reg); salvar();
    log(`   visual ${caso.nome}: ${reg.qualidade} artefatos=${(reg.artefatos || []).map(a => `${a.tipo}/${a.paginas}p/${a.status}/${a.previas?.[0]?.tipo}`).join(',')} ${reg.erro || ''}`);
  }
  // Motor e motivo de cada peça (eventos visual.produced: só metadados).
  const ev = (await api('GET', '/api/admin/eventos?tipo=visual.produced')).dados;
  const prod = ev?.eventos || [];
  R.visual_eventos = prod.slice(0, 10).map(x => { const d = typeof x.detalhes === 'string' ? JSON.parse(x.detalhes) : x.detalhes; return { artefato: d?.artefato, tipo: d?.tipo, motor: d?.motor, motivo_classico: d?.motivo_classico, imagem: d?.imagem, status: d?.status }; });
  salvar();
  log(`VISUAL_FIM ${JSON.stringify(R.visual_eventos)}`);
}
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();

let configAnterior = null;
async function ligar() {
  const cfg = (await api('GET', '/api/admin/config')).dados;
  configAnterior = cfg?.integracoes ?? cfg?.config?.integracoes ?? null;
  R.config_anterior = configAnterior;
  const r = await api('PUT', '/api/admin/config', { integracoes: { ativa: true, pessoas: [CONTA], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false } });
  const eu2 = (await api('GET', '/api/eu')).dados;
  log(`LIGADO status=${r.status} integracoes_para_qa=${eu2?.integracoes === true} anterior_ativa=${configAnterior?.ativa === true}`);
  salvar();
}
async function desligar() {
  const volta = configAnterior && typeof configAnterior === 'object' ? { ...configAnterior, ativa: configAnterior.ativa === true } : { ativa: false, pessoas: [], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false };
  const r = await api('PUT', '/api/admin/config', { integracoes: volta });
  const eu2 = (await api('GET', '/api/eu')).dados;
  log(`DESLIGADO status=${r.status} recurso_visivel=${eu2?.integracoes === true}`);
}
async function limpar() {
  const out = { conectores: {}, quick_wins: {} };
  for (const id of [...new Set(R.criados.conectores)]) {
    const c = await api('GET', `/api/admin/integracoes/${id}`);
    if (c.status !== 200 || !String(c.dados.nome).startsWith('QA - ')) { out.conectores[id] = 'nao_revogado_nome_nao_confere'; continue; }
    const r = c.dados.status === 'REVOKED' ? { status: 200 } : await api('POST', `/api/admin/integracoes/${id}/revogar`, {});
    const d = (await api('GET', `/api/admin/integracoes/${id}`)).dados;
    out.conectores[id] = { revogado: r.status === 200 && d.status === 'REVOKED', sem_credencial: !d.credencial };
  }
  for (const id of CRIADOS) {
    const q = (await api('GET', `/api/quick-wins/${id}`)).dados;
    if (!q || !String(q.nome).startsWith('QA - ')) { out.quick_wins[id] = 'nao_excluido_nome_nao_confere'; continue; }
    const del = await api('DELETE', `/api/quick-wins/${id}`, {});
    out.quick_wins[id] = { excluido: del.status === 200, some: (await api('GET', `/api/quick-wins/${id}`)).status === 404, historico: CONVERSAS[id] ? (await api('GET', `/api/conversas/${CONVERSAS[id]}`)).status === 200 : null };
  }
  R.limpeza = out; salvar();
  log(`LIMPEZA_FIM conectores=${Object.values(out.conectores).filter(x => x.revogado).length}/${Object.keys(out.conectores).length} quick_wins=${Object.values(out.quick_wins).filter(x => x.excluido && x.some).length}/${CRIADOS.length}`);
}

const { readFile } = await import('node:fs/promises');
const vivo = setInterval(() => api('GET', '/api/eu').catch(() => {}), 4 * 60e3);
for (;;) {
  log('PRONTO');
  const [cmd] = (await readFile(process.env.QA_COMANDOS, 'utf8')).trim().split(/\s+/);
  try {
    if (cmd === 'saude') { const s = (await api('GET', '/api/saude')).dados; const eu2 = (await api('GET', '/api/eu')).dados; R.versao = s?.versao; log(`SAUDE versao=${s?.versao} sessao=${String(eu2?.pessoa?.email).toLowerCase() === CONTA} integracoes=${eu2?.integracoes === true} ia=${eu2?.iaConfigurada === true}`); }
    else if (cmd === 'ligar') await ligar();
    else if (cmd === 'cenarios') await cenarios();
    else if (cmd === 'visual') await visual();
    else if (cmd === 'limpar') await limpar();
    else if (cmd === 'desligar') await desligar();
    else if (cmd === 'sair') { await api('POST', '/api/sair', {}).catch(() => {}); clearInterval(vivo); log('SESSAO_ENCERRADA'); process.exit(0); }
    else log('COMANDO_DESCONHECIDO');
  } catch (err) { log('ERRO_COMANDO', String(err.message || err).slice(0, 200)); }
}
