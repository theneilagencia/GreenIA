// QA da produção visual dos Quick Wins, em produção, com IA real e material 100% fictício.
//
//   QA_BASE=https://<endereço> QA_EMPRESA=<slug> QA_CODIGO_FIFO=/caminho/fifo node scripts/qa-producao-visual.mjs
//
// Sessão só na memória deste processo (mesmo fluxo da tela: pede o código, entra). O código chega pelo FIFO local e
// vai direto para o login; o script nunca imprime nem guarda o código, o cookie, o CSRF ou a chave do OpenRouter.
// Cria Quick Wins "QA - …" em rascunho, executa em modo de teste, confere artefatos (prévia, PDF, PNG, JPG, SVG,
// edição, derivação), e no fim exclui (exclusão lógica) só os Quick Wins que ELE criou. Não muda configuração.
// Saída: qa-producao-saida/visual-<data>/relatorio.json + prévias PNG (material fictício, sem segredo).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = String(process.env.QA_BASE || '').replace(/\/$/, ''), EMPRESA = process.env.QA_EMPRESA || '', FIFO = process.env.QA_CODIGO_FIFO || '';
const CONTA = process.env.QA_CONTA || 'vinicius@apymine.com';
if (!BASE || !FIFO) { console.log('Informe QA_BASE e QA_CODIGO_FIFO.'); process.exit(1); }
const RAIZ = join(process.cwd(), 'qa-producao-saida', `visual-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(RAIZ, { recursive: true });
let SAIDA = RAIZ;
let R = { base: BASE, criados: [], casos: [], regressao: [], exclusao: {}, erros: [] };
const CRIADOS = [];
const salvar = () => writeFileSync(join(SAIDA, 'relatorio.json'), JSON.stringify(R, null, 2));
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

// ---- casos (tudo fictício) ---------------------------------------------------------------------------------------
const CASOS = [
  { nome: 'Apresentação executiva', descricao: 'Transforme os números do trimestre em uma apresentação executiva de 6 slides para a diretoria.',
    material: 'Resultados do 3º trimestre de 2026 (dados fictícios, empresa Exemplo QA): Receita R$ 12,4 milhões (meta R$ 12,0 milhões). Margem EBITDA 18%. Custo de frete subiu 9% no trimestre. Clientes ativos: 1.240 (eram 1.180 no 2º trimestre). Projetos: novo centro de distribuição 70% concluído; ERP em homologação. Riscos: atraso de fornecedor de embalagens; câmbio. Próximos passos: renegociar frete até 30/11; concluir CD em dezembro.' },
  { nome: 'Relatório visual', descricao: 'Gere um relatório visual em PDF com a situação mensal da manutenção, com indicadores e gráfico.',
    material: 'Manutenção — setembro de 2026 (fictício). Ordens abertas: 142; concluídas: 128; backlog: 14. Disponibilidade da linha 1: 96%; linha 2: 91%; linha 3: 94%. Custo de peças: julho R$ 84 mil, agosto R$ 91 mil, setembro R$ 78 mil. Principais falhas: rolamentos (11), correias (7), sensores (5). Ação: plano de lubrificação semanal na linha 2.' },
  { nome: 'Comparativo de fornecedores', descricao: 'Compare as três propostas de fornecedores e entregue uma página visual com a comparação e a recomendação.',
    material: 'Propostas fictícias para limpeza industrial. Alfa QA: R$ 48.000/mês, início em 15 dias, equipe de 12 pessoas, garantia de reposição em 24 h. Beta QA: R$ 44.500/mês, início em 30 dias, equipe de 10, reposição em 48 h. Gama QA: R$ 51.200/mês, início em 7 dias, equipe de 14, reposição em 12 h, inclui materiais.' },
  { nome: 'Contrato em uma página', descricao: 'Analise este contrato e crie um one-page visual com riscos, prazos e obrigações principais.',
    material: 'CONTRATO DE LOCAÇÃO DE EQUIPAMENTOS Nº QA-12/2026 (fictício). Locadora: Equipa Exemplo QA Ltda. Locatária: Indústria Modelo QA S.A. Vigência: 24 meses a partir de 01/11/2026. Valor: R$ 36.000 por mês, reajuste anual pelo IPCA. Multa por rescisão antecipada: 30% do saldo. Manutenção preventiva por conta da locadora, a cada 90 dias. Seguro por conta da locatária. Aviso prévio de 60 dias. Foro: comarca de Belo Horizonte.' },
  { nome: 'Reunião', descricao: 'Transforme a transcrição desta reunião em um resumo visual com decisões, responsáveis e prazos.',
    material: 'Reunião de planejamento — 25/09/2026 (fictícia). Presentes: Ana (operação), Bruno (TI), Carla (financeiro). Decidido: migrar o controle de estoque para o novo sistema em novembro; Bruno responsável, plano até 10/10. Decidido: congelar compras não essenciais até o fim do ano; Carla comunica as áreas até 03/10. Pendente: definir o treinamento das equipes; Ana traz proposta na próxima reunião (09/10).' },
  { nome: 'Checklist', descricao: 'Crie um checklist visual para imprimir e usar na inspeção diária de segurança do galpão.',
    material: 'Itens da inspeção (fictícios): extintores no lugar e lacrados; saídas de emergência desobstruídas; corredores sinalizados; empilhadeiras com check-list do operador; EPIs disponíveis (capacete, luva, óculos, protetor auricular); iluminação de emergência funcionando; vazamentos ou derramamentos; quadro elétrico fechado; primeiros socorros completo.' },
  { nome: 'Dashboard', descricao: 'Monte um dashboard de uma página com os indicadores de atendimento do mês.',
    material: 'Atendimento — setembro de 2026 (fictício). Chamados recebidos: 3.420. Resolvidos no primeiro contato: 71%. Tempo médio de resposta: 3 h 40 min. Satisfação (CSAT): 4,3 de 5. Chamados por canal: telefone 1.210, chat 1.540, e-mail 670. Evolução de chamados: junho 2.980, julho 3.150, agosto 3.300, setembro 3.420. Meta de resolução no primeiro contato: 75%.' },
  { nome: 'Infográfico', descricao: 'Crie um infográfico explicando o processo de compra de materiais de escritório.',
    material: 'Processo de compra de materiais de escritório (fictício): 1. A área faz o pedido no portal. 2. O gestor aprova em até 2 dias. 3. Compras cota com 3 fornecedores. 4. Pedidos acima de R$ 5.000 vão para a diretoria. 5. Compras emite o pedido. 6. O almoxarifado recebe e confere. 7. A área retira o material. Prazo total: até 10 dias úteis.' },
  { nome: 'Post social', descricao: 'Crie um post quadrado para as redes sociais anunciando a Semana de Segurança.',
    material: 'Semana Interna de Prevenção de Acidentes (SIPAT) da Empresa Exemplo QA, de 13 a 17 de outubro de 2026. Palestras diárias às 9h no refeitório, gincana de segurança e campanha de vacinação. Tema: "Cuidar de você é o nosso jeito de trabalhar".' },
  { nome: 'Pedido visual surpresa', descricao: 'Quero uma linha do tempo visual com as fases do projeto de mudança de escritório para mostrar à equipe.',
    material: 'Mudança de escritório (fictícia). Fase 1 — planejamento: setembro de 2026. Fase 2 — obras no novo andar: outubro e novembro. Fase 3 — mudança de TI e móveis: 5 a 7 de dezembro. Fase 4 — primeiro dia no novo escritório: 8 de dezembro. Fase 5 — ajustes e devolução do prédio antigo: até 31 de janeiro de 2027.' }
];
const REGRESSAO = [
  { nome: 'Resumo de documento', descricao: 'Resuma este documento em tópicos curtos.', material: 'Política de viagens (fictícia): viagens nacionais precisam de aprovação do gestor com 7 dias de antecedência. Hospedagem até R$ 380 por noite. Reembolso em até 10 dias com comprovante.' },
  { nome: 'Pendências', descricao: 'Liste as pendências e os responsáveis deste e-mail.', material: 'E-mail (fictício): Oi time, ficou pendente o envio do relatório de estoque (Paulo, sexta), a revisão do contrato de frete (Marta, dia 10) e a compra dos uniformes (Rui, sem data).' }
];

const MAGICA = { pdf: b => b.subarray(0, 5).toString() === '%PDF-', png: b => b.readUInt32BE(0) === 0x89504e47, jpg: b => b[0] === 0xff && b[1] === 0xd8, svg: b => /^<svg|^<\?xml/.test(b.subarray(0, 60).toString()), zip: b => b.readUInt32BE(0) === 0x504b0304 };
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();

async function rodar(caso, visual) {
  const t0 = Date.now(), reg = { nome: caso.nome };
  try {
    const it = (await api('POST', '/api/quick-wins/assistente/interpretar', { descricao: caso.descricao })).dados;
    reg.interpretacao = { visual: (it.operacao?.entregaveis || []).filter(x => x.visual).map(x => ({ tipo: x.visual.tipo, formato: x.visual.formato || null, paginas: x.visual.paginas || null })),
      entregaveis: (it.operacao?.entregaveis || []).map(x => x.tipo), lacunas: (it.operacao?.lacunas || []).length, fonte: it.fonte || null };
    const q = await api('POST', '/api/quick-wins', { nome: `QA - ${caso.nome}`, ...destino, assistente: { descricao: caso.descricao, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } } });
    if (q.status !== 200) throw new Error(`criação ${q.status}: ${JSON.stringify(q.dados).slice(0, 200)}`);
    R.criados.push(q.dados.id); CRIADOS.push(q.dados.id); salvar(); reg.qw = q.dados.id;
    await api('PUT', `/api/quick-wins/${q.dados.id}`, { nome: `QA - ${caso.nome}` });
    const conv = (await api('POST', '/api/conversas', { quick_win_id: q.dados.id, teste: true })).dados.conversa;
    reg.conversa = conv.id;
    let r = await enviar(conv.id, { executar_quick_win: true, texto: caso.material });
    let texto = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
    if (texto.trim().startsWith('Antes de começar')) { reg.perguntou = true; r = await enviar(conv.id, { executar_quick_win: true, texto: 'Use só o material enviado acima; pode decidir o restante.' }); texto = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join(''); }
    const fim = r.linhas.find(l => l.t === 'fim');
    writeFileSync(join(SAIDA, `${slug(caso.nome)}.md`), texto);
    reg.execucao = { status: r.status, erro: r.erro || r.linhas.find(l => l.t === 'erro')?.mensagem || null, ms: Math.round(r.ms), qualidade: fim?.qualidade?.status || null, custo: fim?.custo ?? null,
      etapas: r.linhas.filter(l => l.t === 'etapa').map(l => `${l.v}@${Math.round(l.ms)}`), caracteres: texto.length };
    const arts = fim?.artefatos || [];
    reg.artefatos = [];
    for (const a of arts) {
      const det = await api('GET', `/api/artefatos/${a.id}`);
      const A = { id: a.id, tipo: a.tipo, formato: a.formato, paginas: a.paginas, status: a.status, avisos: a.avisos || det.dados?.avisos || [], exportacoes: a.exportacoes, detalhe: det.status };
      const prev = [];
      for (let n = 1; n <= Math.min(a.paginas || 1, 8); n++) {
        const p = await binario(`/api/artefatos/${a.id}/paginas/${n}`);
        prev.push({ n, status: p.status, png: p.status === 200 && MAGICA.png(p.dados), kb: Math.round(p.dados.length / 1024), ms: p.ms });
        if (p.status === 200) writeFileSync(join(SAIDA, `${slug(caso.nome)}-${a.id}-p${n}.png`), p.dados);
      }
      A.previa = prev;
      A.downloads = {};
      for (const f of ['pdf', 'png', 'jpg', 'svg']) {
        const b = await binario(`/api/artefatos/${a.id}/baixar?formato=${f}`);
        const zipado = (a.paginas || 1) > 1 && f !== 'pdf';
        A.downloads[f] = { status: b.status, ok: b.status === 200 && (zipado ? MAGICA.zip(b.dados) : MAGICA[f](b.dados)), kb: Math.round(b.dados.length / 1024), anexo: /attachment/.test(b.disposicao || ''), ms: b.ms };
        if (f === 'pdf' && b.status === 200) writeFileSync(join(SAIDA, `${slug(caso.nome)}-${a.id}.pdf`), b.dados);
      }
      const pptx = await binario(`/api/artefatos/${a.id}/baixar?formato=pptx`);
      A.pptxHonesto = pptx.status === 400;
      reg.artefatos.push(A);
    }
    reg.ok = visual ? arts.length > 0 && reg.artefatos.every(a => a.detalhe === 200 && a.previa.every(p => p.png) && Object.values(a.downloads).every(x => x.ok && x.anexo) && a.status !== 'inconsistente')
      : arts.length === 0 && !reg.execucao.erro && texto.length > 0;
  } catch (err) { reg.erro = String(err.message || err).slice(0, 300); reg.ok = false; }
  reg.ms = Date.now() - t0;
  log(`${reg.ok ? 'OK ' : 'ERR'} ${caso.nome}: ${(reg.artefatos || []).map(a => `${a.tipo}/${a.formato}/${a.paginas}p/${a.status}`).join(', ') || 'sem artefato'} ${reg.erro || reg.execucao?.erro || ''} (${Math.round(reg.ms / 1000)} s)`);
  return reg;
}

async function bateria(nome) {
  SAIDA = join(RAIZ, nome); mkdirSync(SAIDA, { recursive: true });
  R = { base: BASE, bateria: nome, versao: (await api('GET', '/api/saude')).dados?.versao || null, criados: [], casos: [], regressao: [], erros: [] };
  for (const caso of CASOS) { R.casos.push(await rodar(caso, true)); salvar(); }
  for (const caso of REGRESSAO) { R.regressao.push(await rodar(caso, false)); salvar(); }
  // Edição sem regenerar, derivação e restauração, num artefato real.
  const alvo = R.casos.find(c => c.artefatos?.length)?.artefatos[0];
  if (alvo) {
    const ed = await api('PATCH', `/api/artefatos/${alvo.id}`, { titulo: 'QA - título editado' });
    const der = await api('POST', `/api/artefatos/${alvo.id}/derivar`, { tipo: 'poster', formato: '4:5' });
    const res = await api('POST', `/api/artefatos/${alvo.id}/restaurar`, {});   // a versão 1 (não atual) volta como nova versão
    const dv = der.dados?.artefato;
    R.edicao = { editar: ed.status, versao: ed.dados?.artefato?.versao ?? null, tituloEditado: ed.dados?.artefato?.titulo === 'QA - título editado', derivar: der.status,
      derivado: dv ? { tipo: dv.tipo, formato: dv.formato, status: dv.status } : null, restaurar: res.status, versaoRestaurada: res.dados?.artefato?.versao ?? null };
    if (dv) { const p = await binario(`/api/artefatos/${dv.id}/paginas/1`); if (p.status === 200) writeFileSync(join(SAIDA, `derivado-${dv.id}.png`), p.dados); }
  }
  R.idInexistente = (await api('GET', '/api/artefatos/999999999')).status;   // id que não é seu/não existe: 404
  salvar();
  log(`BATERIA_FIM ${nome} versao=${R.versao}: ${R.casos.filter(c => c.ok).length}/${R.casos.length} visuais ok; textuais ${R.regressao.filter(c => c.ok).length}/${R.regressao.length}; edicao=${JSON.stringify(R.edicao || null)}`);
}
async function limpar() {
  const ex = {};
  for (const id of CRIADOS) {
    const q = (await api('GET', `/api/quick-wins/${id}`)).dados;
    if (!q || !String(q.nome).startsWith('QA - ')) { ex[id] = 'nao_excluido_nome_nao_confere'; continue; }
    const del = await api('DELETE', `/api/quick-wins/${id}`, {});
    ex[id] = { excluido: del.status === 200, someDoCatalogo: (await api('GET', `/api/quick-wins/${id}`)).status === 404 };
  }
  writeFileSync(join(RAIZ, 'exclusao.json'), JSON.stringify(ex, null, 1));
  log(`LIMPEZA_FIM ${Object.values(ex).filter(x => x.excluido && x.someDoCatalogo).length}/${CRIADOS.length}`);
}

// ---- comandos (a sessão fica só na memória deste processo, viva entre os deploys) ---------------------------------
// QA_COMANDOS: FIFO local com um comando por escrita: saude | antigas 39,40 | bateria <nome> | limpar | sair
const { readFile } = await import('node:fs/promises');
const vivo = setInterval(() => api('GET', '/api/eu').catch(() => {}), 4 * 60e3);
for (;;) {
  log('PRONTO');
  const [cmd, arg] = (await readFile(process.env.QA_COMANDOS, 'utf8')).trim().split(/\s+/);
  try {
    if (cmd === 'saude') { const s = (await api('GET', '/api/saude')).dados; const eu2 = (await api('GET', '/api/eu')).dados; log(`SAUDE versao=${s?.versao} ia=${s?.ia} sessao=${String(eu2?.pessoa?.email).toLowerCase() === CONTA} openrouter=${eu2?.iaConfigurada === true}`); }
    else if (cmd === 'antigas') {
      mkdirSync(join(RAIZ, 'antigas'), { recursive: true });
      for (const id of String(arg || '').split(',').map(Number).filter(Boolean)) {
        const cv = await api('GET', `/api/conversas/${id}`);
        if (cv.status !== 200) { log(`conversa ${id}: ${cv.status}`); continue; }
        const arts = []; for (const a of cv.dados.artefatos || []) arts.push((await api('GET', `/api/artefatos/${a.id}`)).dados);
        writeFileSync(join(RAIZ, 'antigas', `${id}.json`), JSON.stringify({ mensagens: cv.dados.mensagens.map(m => ({ papel: m.papel, texto: m.texto })), artefatos: arts }, null, 1));
      }
      log('ANTIGAS_SALVAS');
    }
    else if (cmd === 'bateria') await bateria(arg || 'b');
    else if (cmd === 'limpar') await limpar();
    else if (cmd === 'sair') { await api('POST', '/api/sair', {}).catch(() => {}); clearInterval(vivo); log('SESSAO_ENCERRADA'); process.exit(0); }
    else log('COMANDO_DESCONHECIDO');
  } catch (err) { log('ERRO_COMANDO', String(err.message || err).slice(0, 200)); }
}
