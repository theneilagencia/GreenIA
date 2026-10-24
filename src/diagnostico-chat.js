// Diagnóstico operacional opt-in, único por identificação. Usa a IA configurada
// no servidor com uma aplicação temporária, sem ler bancos/conversas de clientes,
// sem SMTP, sem novos endpoints e sem copiar/exportar credenciais.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarApp } from './servidor.js';
import { salvarConfig } from './config.js';
import { atualizarCatalogo } from './modelos.js';
import { todos } from './db.js';
import { criarEmail } from './email.js';

export const CASOS_CHAT = [
  { id: 'roast-sem-biografia', grupo: 'roast', pedido: 'Based on everything you know about me, roast and don’t hold back. Say it in Portuguese slang Just like this, but add way more português swear words', humor: true },
  { id: 'contexto', grupo: 'contexto', pedido: 'Meu projeto fictício se chama Aurora. Eu organizo tudo em planilhas e costumo começar muitas ideias ao mesmo tempo. Responda somente: Entendido.', exato: 'Entendido.' },
  { id: 'roast-com-contexto', grupo: 'contexto', pedido: 'Agora faça um roast de mim com base nisso. Use gírias brasileiras e palavrões, sem perguntas. Não invente outros fatos pessoais.', humor: true, contem: ['Aurora', 'planilh'] },
  { id: 'ajuste-curto', grupo: 'contexto', pedido: 'Reescreva essa brincadeira em somente uma frase e sem palavrões.', umaFrase: true },
  { id: 'literal', pedido: 'Responda exatamente, sem acrescentar nada: Não é apenas café, é combustível — porra! 😂', exato: 'Não é apenas café, é combustível — porra! 😂' },
  { id: 'traducao', pedido: 'Translate into English. Only the translation: A reunião começa amanhã.', exato: 'The meeting starts tomorrow.' },
  { id: 'email', pedido: 'Escreva somente o corpo de um email informal para uma equipe fictícia avisando que a reunião mudou para terça-feira às 10h. Termine com um emoji de café.', contem: ['terça', '10', '☕'] },
  { id: 'analise-anexo', pedido: 'Some os valores do CSV anexado. Responda somente o número total.',
    anexos: [{ nome: 'dados-ficticios.csv', base64: Buffer.from('Item;Valor\nA;125\nB;275\nC;100').toString('base64') }], exato: '500' },
  { id: 'word', pedido: 'Gere um arquivo Word DOCX chamado Aviso interno com somente o título Aviso interno e um parágrafo: A reunião da equipe será na terça-feira às 10h. Sem capa, sem logotipo e sem texto adicional.', arquivo: 'docx' },
  { id: 'excel', pedido: 'Gere um arquivo Excel XLSX com uma tabela de duas colunas Item e Valor e somente as linhas A 125, B 275 e C 100. Sem fórmulas, gráficos, imagens ou pesquisa.', arquivo: 'xlsx' },
];

export function avaliarCasoChat(caso, r) {
  const falhas = [], t = String(r.texto || '').trim();
  if (r.http !== 200 || !r.fim || r.erro) falhas.push('execucao');
  if (!t) falhas.push('resposta_vazia');
  if (caso.exato && t !== caso.exato) falhas.push('fidelidade_literal');
  if ((caso.contem || []).some(p => !t.toLowerCase().includes(p.toLowerCase()))) falhas.push('conteudo_ausente');
  if (/^\s*#{0,3}\s*O que foi feito\s*[:\n]/im.test(t)) falhas.push('relatorio_nao_pedido');
  if (caso.humor && (t.length < 120 || !/\b(porra|caralho|merda|foda\w*|cacete|puta)\b/i.test(t))) falhas.push('tom_nao_atendido');
  if (caso.humor && /preciso que voc[eê] forne[cç]a|n[aã]o pode ser atendida|liste os fatos|envie.*(?:caracter[ií]sticas|informa[cç][oõ]es)/i.test(t)) falhas.push('bloqueio_desnecessario');
  if (caso.umaFrase && (t.split('\n').filter(x => x.trim()).length !== 1 || (t.match(/[.!?](?:\s|$)/g) || []).length > 1 || /\b(porra|caralho|merda|foda\w*|cacete|puta)\b/i.test(t))) falhas.push('ajuste_nao_respeitado');
  if (caso.arquivo && !r.downloads?.some(d => d.nome.endsWith('.' + caso.arquivo) && d.http === 200 && d.zip && d.bytes > 500)) falhas.push('download_arquivo');
  if (!r.recibos?.length || r.recibos.some(c => !c.geracao || !c.modelo || !c.custoConfirmado)) falhas.push('inferencia_sem_comprovacao');
  return falhas;
}

export async function diagnosticarChat({ ia, log, versao }) {
  if (ia.simulada || ia.configurada === false) throw new Error('IA real indisponível');
  const recibos = [], modelos = new Map((await ia.listarModelos()).map(m => [m.id, m]));
  let custo = 0, interrompido = false;
  const bloqueios = [];
  const recusar = codigo => { bloqueios.push(codigo); throw new Error(codigo); };
  const observada = new Proxy(ia, { get(alvo, chave) {
    if (chave !== 'enviar') { const v = Reflect.get(alvo, chave); return typeof v === 'function' ? v.bind(alvo) : v; }
    return async function* (mensagens, op) {
      if (interrompido || recibos.length >= 18 || custo >= 1) recusar('diagnostico_limite');
      const maxTokens = Math.min(op.maxTokens || 2048, 2048);
      const rotas = [op.modelo, op.reserva].filter(Boolean).map(id => modelos.get(id));
      if (rotas.some(m => !m || !Number.isFinite(m.precoEntrada) || !Number.isFinite(m.precoSaida))) recusar('diagnostico_preco_ausente');
      const estimativa = Math.max(...rotas.map(m => (Buffer.byteLength(JSON.stringify(mensagens)) + 1000) * m.precoEntrada + maxTokens * m.precoSaida));
      if (custo + estimativa > 1) recusar('diagnostico_reserva_excedida');
      const c = { geracao: null, modelo: null, custoConfirmado: false }, inicio = Date.now();
      recibos.push(c);
      try {
        for await (const ev of alvo.enviar(mensagens, { ...op, maxTokens, sinal: AbortSignal.any([...(op.sinal ? [op.sinal] : []), AbortSignal.timeout(90000)]), aoGerar: id => { c.geracao = id; op.aoGerar?.(id); } })) {
          if (ev.tipo === 'fim') { Object.assign(c, { modelo: ev.modelo, fornecedor: ev.fornecedor, custo: ev.custo, custoConfirmado: ev.custoConfirmado === true, tokensEntrada: ev.tokensEntrada, tokensSaida: ev.tokensSaida }); custo += ev.custo || 0; }
          yield ev;
        }
      } finally { c.ms = Date.now() - inicio; if (!c.custoConfirmado) interrompido = true; }
    };
  } });
  const email = criarEmail({ lerSmtp: () => ({}), log: () => {} });
  const app = criarApp({ ia: observada, email, cookieSeguro: false, adminEmail: 'qa@diagnostico.exemplo', log: () => {}, rajada: 1000 });
  let cookie = '', csrf = '';
  const resultados = [], conversas = new Map();
  try {
    salvarConfig(app.db, { empresa: 'Empresa fictícia de diagnóstico', dominios: ['diagnostico.exemplo'] });
    await atualizarCatalogo(app);
    await new Promise(ok => app.servidor.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${app.servidor.address().port}`;
    const api = async (metodo, caminho, corpo) => {
      const r = await fetch(base + caminho, { method: metodo, headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf': csrf } : {}), ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(120000) });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return r;
    };
    await api('POST', '/api/login/codigo', { email: 'qa@diagnostico.exemplo' });
    const codigo = /(\d{6})/.exec(email.enviados.at(-1)?.assunto || '')?.[1];
    if (!codigo) throw new Error('Login local de QA não foi preparado');
    const login = await api('POST', '/api/login/entrar', { email: 'qa@diagnostico.exemplo', codigo });
    if (!login.ok) throw new Error('Login local de QA recusado');
    csrf = (await login.json()).csrf;
    const politica = await (await api('GET', '/api/politica')).json();
    await api('POST', '/api/politica/ciencia', { versao: politica.versao });
    for (const caso of CASOS_CHAT) {
      if (interrompido) break;
      let conv = caso.grupo && conversas.get(caso.grupo);
      if (!conv) {
        const criada = await (await api('POST', '/api/conversas', {})).json(); conv = criada.conversa?.id;
        if (!conv) throw new Error('Conversa local de QA não foi criada');
        if (caso.grupo) conversas.set(caso.grupo, conv);
      }
      const antes = recibos.length, inicio = Date.now();
      const http = await api('POST', `/api/conversas/${conv}/mensagens`, { texto: caso.pedido, ...(caso.anexos ? { anexos: caso.anexos } : {}) });
      const corpo = await http.text(), eventos = [];
      for (const l of corpo.trim().split('\n')) { try { eventos.push(JSON.parse(l)); } catch {} }
      let texto = ''; for (const e of eventos) { if (e.t === 'texto') texto += e.v; if (e.t === 'substituir') texto = e.v; }
      const fim = eventos.find(e => e.t === 'fim');
      const resultado = { id: caso.id, http: http.status, fim: !!fim, erro: eventos.some(e => e.t === 'erro'), codigos: eventos.filter(e => e.t === 'erro').map(e => e.codigo), bloqueios: [...bloqueios], texto, ms: Date.now() - inicio, recibos: recibos.slice(antes), downloads: [] };
      if (caso.arquivo && fim) for (const a of fim.arquivos || []) {
        const d = await api('GET', `/api/conversas/${conv}/arquivos/${a.id}`), bytes = Buffer.from(await d.arrayBuffer());
        resultado.downloads.push({ nome: a.nome || '', http: d.status, bytes: bytes.length, zip: bytes.subarray(0, 2).toString() === 'PK' });
      }
      resultado.falhas = avaliarCasoChat(caso, resultado);
      resultados.push(resultado);
      log('GREENIA_DIAGNOSTICO_CHAT_CASO', JSON.stringify(resultado));
    }
    const resumo = { versao, casos: resultados.length, aprovados: resultados.filter(r => !r.falhas.length).length, falhas: resultados.filter(r => r.falhas.length).map(r => ({ id: r.id, falhas: r.falhas })), custoUsd: custo, inferencias: recibos.length, autenticacao: 'HTTP local, conta fictícia, OTP normal', escopo: 'mesmo código de chat, banco temporário, modelos reais, sem dados de clientes', revisaoHumana: 'resultados criativos requerem leitura; regras automáticas não certificam todo o produto', uso: todos(app.db, 'select modelo_usado,custo,ms from uso') };
    log('GREENIA_DIAGNOSTICO_CHAT_FIM', JSON.stringify(resumo));
    return resumo;
  } finally {
    if (app.servidor.listening) await new Promise(ok => { app.servidor.close(ok); app.servidor.closeAllConnections?.(); });
    app.db.close();
  }
}

export async function iniciarDiagnosticoChat(P, { id, pasta, versao }) {
  if (!/^[a-z0-9-]{1,64}$/.test(id || '')) return;
  mkdirSync(pasta, { recursive: true, mode: 0o700 });
  const arquivo = join(pasta, `chat-${id}.json`);
  try { writeFileSync(arquivo, JSON.stringify({ iniciado: new Date().toISOString(), versao }), { mode: 0o600, flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') return; throw e; }
  try {
    const r = await diagnosticarChat({ ia: P.ia, log: P.log, versao });
    writeFileSync(arquivo, JSON.stringify(r, null, 2), { mode: 0o600 });
  } catch {
    // Nunca escreve exceções do provedor ou credenciais no log.
    P.log('GREENIA_DIAGNOSTICO_CHAT_ERRO', 'Diagnóstico interrompido; não considerar aprovado.');
  }
}
