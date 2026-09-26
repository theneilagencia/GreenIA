// Console do operador da plataforma. Cada empresa tem a própria instalação; o console
// junta todas elas. Cada instalação expõe um resumo em dólar numa rota protegida por
// token (OPERADOR_TOKEN), e a instalação do operador lê a lista INSTANCIAS
// ("Nome|https://url|token", uma por linha ou separadas por ponto e vírgula).
// Nada daqui chega ao cliente: as rotas de sessão exigem operador, e as de token não
// aceitam cookie.
import { createHash, timingSafeEqual } from 'node:crypto';
import { erro } from './http.js';
import { todos, um } from './db.js';
import { lerConfig } from './config.js';
import { lerModelos } from './modelos.js';
import { ehOperador, liberarPacote, avisarPacote, situacaoPlano } from './plano.js';

const TAXA_OPENROUTER = 1.055;

export function lerInstancias(texto = '') {
  return String(texto).split(/[\n;]+/).map(l => l.trim()).filter(Boolean).map(l => {
    const [nome, url, token] = l.split('|').map(x => (x || '').trim());
    return { nome, url: url.replace(/\/+$/, ''), token };
  }).filter(x => x.nome && /^https?:\/\//.test(x.url) && x.token);
}

// Resumo desta instalação para o operador: plano, créditos, reserva, pacotes, custo real,
// receita, margem, modelos, variações de preço, alertas e situação.
export function resumoInstancia(app) {
  const db = app.db, cfg = lerConfig(db), agora = app.agora(), mes = agora.toISOString().slice(0, 7);
  const s = situacaoPlano(app);
  const op = app.operacao || {};
  const custoIa = um(db, 'select coalesce(sum(custo), 0) as c from uso where substr(em, 1, 7) = ?', mes).c;
  const custoComTaxa = custoIa * TAXA_OPENROUTER;
  const creditosPacoteMes = um(db, 'select coalesce(sum(creditos), 0) as n from pacotes where substr(em, 1, 7) = ?', mes).n;
  const receitaPacotes = op.pacote ? creditosPacoteMes / op.pacote.creditos * op.pacote.precoUsd : null;
  const receita = app.plano?.precoUsd ? app.plano.precoUsd + (receitaPacotes || 0) : null;
  const custoTotal = custoComTaxa + (op.custoInfraUsd || 0);
  const modelos = lerModelos(db).filter(m => m.liberado);
  const classes = Object.fromEntries(['rapido', 'equilibrado', 'avancado'].map(k => {
    const m = modelos.find(x => x.id === cfg.padroes[k]);
    return [k, m ? { id: m.id, nome: m.nome, precoEntrada: m.precoEntrada, precoSaida: m.precoSaida, homologado: !!m.homologado } : null];
  }));
  const variacoes = todos(db, "select em, detalhes from eventos where tipo = 'model.price_changed' order by id desc limit 10")
    .map(e => ({ em: e.em, ...JSON.parse(e.detalhes || '{}') }));

  const alertas = [];
  if (app.ia.configurada === false) alertas.push({ nivel: 'erro', texto: 'IA desligada: falta a chave do OpenRouter no servidor' });
  if (s?.fase === 'esgotado') alertas.push({ nivel: 'erro', texto: 'Capacidade do ciclo usada: envio pausado' });
  else if (s?.fase === 'reserva') alertas.push({ nivel: 'atencao', texto: `Na reserva de continuidade (${s.percentualReserva}%)` });
  else if (s?.fase === 'aviso') alertas.push({ nivel: 'atencao', texto: `Créditos do ciclo em ${s.percentual}%` });
  if (receita !== null && receita - custoTotal < receita * 0.5) alertas.push({ nivel: 'atencao', texto: 'Margem do mês abaixo de 50%' });
  const trintaDias = new Date(agora.getTime() - 30 * 864e5).toISOString();
  if (variacoes.some(v => v.em >= trintaDias)) alertas.push({ nivel: 'atencao', texto: 'Preço de modelo mudou mais de 20% nos últimos 30 dias' });
  if (!modelos.some(m => m.homologado)) alertas.push({ nivel: 'atencao', texto: 'Nenhum modelo homologado para conversas sigilosas' });
  const problemas = um(db, 'select count(*) as n from problemas where resolvido = 0').n;
  if (problemas) alertas.push({ nivel: 'atencao', texto: `${problemas} ${problemas === 1 ? 'problema reportado' : 'problemas reportados'} em aberto` });

  return {
    empresa: cfg.empresa, mes, geradoEm: agora.toISOString(),
    plano: app.plano ? { creditos: app.plano.creditos, reserva: app.plano.reserva, precoUsd: app.plano.precoUsd } : null,
    situacao: s,
    financeiro: { custoIa, custoComTaxa, custoInfraUsd: op.custoInfraUsd || 0, receita, receitaPacotes, margem: receita !== null ? receita - custoTotal : null, margemPct: receita ? Math.round((receita - custoTotal) / receita * 100) : null },
    pacotes: todos(db, 'select p.em, p.creditos, p.validade, p.origem, p.observacao, coalesce(p.operador, pe.email) as operador from pacotes p left join pessoas pe on pe.id = p.pessoa_id order by p.id desc limit 20'),
    classes, variacoes,
    modelos: modelos.map(m => ({ id: m.id, nome: m.nome, classe: m.perfil, homologado: !!m.homologado, precoEntrada: m.precoEntrada, precoSaida: m.precoSaida })),
    alertas,
    status: {
      ia: app.ia.configurada !== false,
      pessoasAtivas: um(db, 'select count(*) as n from pessoas where ativo = 1').n,
      usaramNoMes: um(db, 'select count(distinct pessoa_id) as n from uso where substr(em, 1, 7) = ?', mes).n,
      conversasNoMes: um(db, 'select count(distinct conversa_id) as n from uso where substr(em, 1, 7) = ? and teste = 0', mes).n,
      ultimoUso: um(db, 'select max(em) as em from uso').em,
    },
  };
}

// Token do operador: comparação em tempo constante e bloqueio após tentativas erradas.
const hash = t => createHash('sha256').update(String(t)).digest();
const JANELA_MS = 15 * 60e3, MAX_FALHAS = 10;
function checarToken(app, req) {
  const esperado = app.operacao?.token;
  if (!esperado) throw erro(404, 'nao_encontrado', 'Não encontrado.');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '?';
  const falhas = (app.falhasToken ||= new Map());
  const agora = Date.now(), f = falhas.get(ip);
  if (f && f.ate > agora && f.n >= MAX_FALHAS) throw erro(429, 'bloqueado', 'Muitas tentativas. Tente mais tarde.');
  const recebido = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || '';
  if (!recebido || !timingSafeEqual(hash(recebido), hash(esperado))) {
    falhas.set(ip, f && f.ate > agora ? { n: f.n + 1, ate: f.ate } : { n: 1, ate: agora + JANELA_MS });
    app.log('token do operador recusado', ip);
    throw erro(401, 'token', 'Token inválido.');
  }
  falhas.delete(ip);
}

async function liberar(app, pessoa, corpo, origem, operador) {
  if (!app.plano) throw erro(400, 'sem_plano', 'Esta instalação não tem plano configurado (PLANO_CREDITOS).');
  liberarPacote(app, pessoa, corpo.creditos, { observacao: corpo.observacao, validade: corpo.validade || null, origem, operador });
  await avisarPacote(app, Math.floor(Number(corpo.creditos)));
  return resumoInstancia(app);
}

async function chamar(inst, caminho, corpo) {
  const r = await fetch(`${inst.url}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${inst.token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(10e3),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.mensagem || `HTTP ${r.status}`);
  return d;
}

export function rotasOperador(app, r) {
  const soOperador = pessoa => { if (!ehOperador(app, pessoa)) throw erro(403, 'so_operador', 'Só o operador da plataforma pode fazer isso.'); };

  // Chamadas entre instalações (sem cookie, com token).
  r.get('/api/operador/instancia', ({ req }) => { checarToken(app, req); return resumoInstancia(app); }, { publica: true, maquina: true });
  r.post('/api/operador/instancia/pacotes', ({ req, corpo }) => { checarToken(app, req); return liberar(app, null, corpo, 'console', corpo.operador); }, { publica: true, maquina: true });

  // Console: esta instalação (se tiver plano) e as remotas.
  r.get('/api/operador/instancias', async ({ pessoa }) => {
    soOperador(pessoa);
    const lista = [];
    if (app.plano) lista.push({ id: 'local', nome: `${lerConfig(app.db).empresa} (esta instalação)`, ok: true, resumo: resumoInstancia(app) });
    const remotas = app.operacao?.instancias || [];
    lista.push(...await Promise.all(remotas.map(async (inst, i) => {
      try { return { id: String(i), nome: inst.nome, url: inst.url, ok: true, resumo: await chamar(inst, '/api/operador/instancia') }; }
      catch (e) { return { id: String(i), nome: inst.nome, url: inst.url, ok: false, erro: String(e.message).slice(0, 200) }; }
    })));
    return { instancias: lista, pacotePadrao: app.operacao?.pacote || null };
  });

  r.post('/api/operador/instancias/:id/pacotes', async ({ pessoa, params, corpo }) => {
    soOperador(pessoa);
    const dados = { creditos: corpo.creditos, validade: corpo.validade || null, observacao: corpo.observacao || '' };
    if (params.id === 'local') return { resumo: await liberar(app, pessoa, dados, 'console', pessoa.email) };
    const inst = (app.operacao?.instancias || [])[Number(params.id)];
    if (!inst) throw erro(404, 'instancia', 'Instalação não encontrada.');
    try { return { resumo: await chamar(inst, '/api/operador/instancia/pacotes', { ...dados, operador: pessoa.email }) }; }
    catch (e) { throw erro(502, 'remota', `A instalação ${inst.nome} recusou: ${String(e.message).slice(0, 200)}`); }
  });
}
