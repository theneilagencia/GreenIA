// Plano contratado, definido pelo operador da plataforma em variáveis do servidor
// (o admin da empresa não altera): créditos do mês, reserva só no modelo rápido e
// pacotes extras liberados pelo operador. 1 crédito = US$ 0,01 de custo de IA.
// Com plano, quem não é operador nunca recebe valores em dólar: o servidor converte
// custos em créditos e tira os preços dos modelos de toda resposta.
import { erro } from './http.js';
import { exec, todos, um } from './db.js';
import { registrar } from './eventos.js';
import { lerConfig, salvarConfig } from './config.js';
import { acharModelo, homologadoPadrao, lerModelos, AUTO } from './modelos.js';

export const CREDITO_USD = 0.01;
export const creditosDe = usd => Math.round((Number(usd) || 0) / CREDITO_USD * 10) / 10;

export function lerPlano(env = {}) {
  const creditos = Math.floor(Number(env.PLANO_CREDITOS) || 0);
  if (creditos <= 0) return null;
  const reserva = env.PLANO_RESERVA !== undefined && env.PLANO_RESERVA !== '' ? Math.max(0, Math.floor(Number(env.PLANO_RESERVA) || 0)) : Math.round(creditos * 0.2);
  return { creditos, reserva, precoUsd: Number(env.PLANO_PRECO_USD) || null };
}

export const lerOperadores = (env = {}) => String(env.OPERADOR_EMAIL || '').split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
export const ehOperador = (app, pessoa) => !!pessoa && (app.operadores || []).includes(String(pessoa.email).toLowerCase());
// Sem plano, a empresa usa a própria chave e vê o custo real. Com plano, só o operador vê dólar.
export const veDolar = (app, pessoa) => !app.plano || ehOperador(app, pessoa);

const mesDe = d => d.toISOString().slice(0, 7);
const proximoMes = d => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

// Situação do mês. Ordem de consumo: créditos do plano, depois pacotes (todos os
// modelos; o que sobra passa para o mês seguinte), por último a reserva (só rápido).
export function situacaoPlano(app) {
  const p = app.plano;
  if (!p) return null;
  const agora = app.agora(), mesAtual = mesDe(agora), hoje = agora.toISOString().slice(0, 10);
  const usos = new Map(todos(app.db, 'select substr(em, 1, 7) as mes, coalesce(sum(custo), 0) as c from uso group by 1').map(x => [x.mes, creditosDe(x.c)]));
  const lista = todos(app.db, 'select id, substr(em, 1, 7) as mes, creditos, validade from pacotes order by id');
  const meses = [...new Set([...usos.keys(), ...lista.map(x => x.mes), mesAtual])].filter(m => m <= mesAtual).sort();
  // Pacotes: consumidos do mais antigo para o mais novo; o que passa da validade deixa de valer.
  const fila = [];
  let atual = null;
  for (const m of meses) {
    for (const x of lista.filter(x => x.mes === m)) fila.push({ restante: x.creditos, validade: x.validade });
    const valem = () => fila.filter(x => x.restante > 0 && (!x.validade || x.validade >= `${m}-01`));
    const usados = usos.get(m) || 0;
    let falta = Math.max(0, usados - p.creditos);
    for (const x of valem()) { const d = Math.min(falta, x.restante); x.restante -= d; falta -= d; if (!falta) break; }
    if (m === mesAtual) atual = { usados, naReserva: Math.round(falta * 10) / 10 };
  }
  const { usados, naReserva } = atual;
  const pacoteDisponivel = Math.round(fila.filter(x => x.restante > 0 && (!x.validade || x.validade >= hoje)).reduce((t, x) => t + x.restante, 0) * 10) / 10;
  let fase;
  if (usados < p.creditos) fase = usados >= p.creditos * 0.8 ? 'aviso' : 'normal';
  else if (pacoteDisponivel > 0) fase = 'pacote';
  else if (naReserva >= p.reserva) fase = 'esgotado';
  else fase = 'reserva';
  return {
    creditos: p.creditos, reserva: p.reserva, usados, pacoteDisponivel, naReserva, fase, renova: proximoMes(agora),
    percentual: Math.min(100, Math.round(Math.min(usados, p.creditos) / p.creditos * 100)),
    percentualReserva: p.reserva ? Math.min(100, Math.round(naReserva / p.reserva * 100)) : 100,
  };
}

const dataBr = iso => iso.split('-').reverse().join('/');
export const MSG = {
  reserva: s => `Os créditos deste ciclo foram usados. Até ${dataBr(s.renova)}, a GreenIA segue disponível com a classe Rápido.`,
  esgotado: s => `A capacidade deste ciclo foi usada. Novas mensagens voltam em ${dataBr(s.renova)}, ou antes com um pacote adicional de créditos. O histórico continua disponível.`,
};

// Antes de cada envio: bloqueia no fim da reserva.
export function checarPlano(app) {
  const s = situacaoPlano(app);
  if (s?.fase === 'esgotado') throw erro(429, 'plano_esgotado', MSG.esgotado(s));
  return s;
}

// Na reserva, só modelo do perfil rápido (o automático também fica de fora: ele pode escolher um modelo caro).
export function modeloNaReserva(app, cfg, m, sigilosa) {
  if (m.perfil === 'rapido' && m.id !== AUTO) return m;
  const rapidos = lerModelos(app.db).filter(x => x.liberado && x.perfil === 'rapido');
  if (sigilosa) {
    const h = homologadoPadrao(app.db, cfg);
    const escolhido = h?.perfil === 'rapido' ? h : rapidos.find(x => x.homologado);
    if (!escolhido) throw erro(429, 'plano_reserva', 'Os créditos deste mês acabaram e não há modelo rápido homologado para conversas sigilosas. Fale com o admin.');
    return escolhido;
  }
  const padrao = acharModelo(app.db, cfg, cfg.padroes.rapido);
  const escolhido = padrao?.liberado && padrao.perfil === 'rapido' ? padrao : rapidos[0];
  if (!escolhido) throw erro(429, 'plano_reserva', 'Os créditos deste mês acabaram e não há modelo rápido liberado. Fale com o admin.');
  return escolhido;
}

// Converte custos em créditos e tira preços de qualquer resposta JSON.
const CHAVES_CUSTO = new Set(['custo', 'custoMedio', 'custoConversa', 'custoPorExecucao', 'previsao', 'tetoMensal', 'economia', 'economiaCache', 'custoIa', 'custoComTaxa']);
const CHAVES_PRECO = new Set(['precoEntrada', 'precoSaida', 'preco_entrada', 'preco_saida']);
export function emCreditos(v, chave) {
  if (Array.isArray(v)) return v.map(x => emCreditos(x));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (CHAVES_PRECO.has(k)) continue;
      if (CHAVES_CUSTO.has(k)) out[k] = x === null || x === undefined ? x : creditosDe(x);
      else if (k === 'aviso' && typeof x === 'string' && x.startsWith('Preço mudou')) out[k] = null;   // variação de preço: só o operador decide se avisa
      else if (k === 'detalhes' && typeof x === 'string' && x.includes('"custo"')) out[k] = detalhesEmCreditos(x);
      else out[k] = emCreditos(x, k);
    }
    return out;
  }
  return v;
}
export function detalhesEmCreditos(texto) {
  try { const d = JSON.parse(texto); if ('custo' in d) { d.creditos = creditosDe(d.custo); delete d.custo; } return JSON.stringify(d); } catch { return texto; }
}

// Pacote extra liberado pelo operador.
export function liberarPacote(app, pessoa, creditos, { observacao = '', validade = null, origem = 'painel', operador = pessoa?.email } = {}) {
  const n = Math.floor(Number(creditos) || 0);
  if (n <= 0 || n > 1_000_000) throw erro(400, 'creditos', 'Informe a quantidade de créditos do pacote.');
  if (validade && (!/^\d{4}-\d{2}-\d{2}$/.test(validade) || validade < app.agora().toISOString().slice(0, 10))) throw erro(400, 'validade', 'A validade precisa ser uma data futura.');
  const obs = String(observacao || '').slice(0, 300);
  const quem = String(operador || '').slice(0, 200) || null;
  exec(app.db, 'insert into pacotes (em, creditos, pessoa_id, observacao, validade, origem, operador) values (?, ?, ?, ?, ?, ?, ?)', app.agora().toISOString(), n, pessoa?.id ?? null, obs, validade || null, origem, quem);
  registrar(app, 'creditpack.added', pessoa?.id ?? null, { creditos: n, validade: validade || null, origem, operador: quem });
  return situacaoPlano(app);
}

// Avisos por email ao admin da empresa e ao operador, uma vez por etapa no mês.
const ETAPAS = [
  { id: 'aviso80', quando: s => s.usados >= s.creditos * 0.8, assunto: 'sua organização usou 80% dos créditos deste ciclo',
    texto: s => `Sua organização usou ${s.percentual}% dos créditos deste ciclo.\n\nAo chegar a 100%, a GreenIA continua disponível temporariamente com a classe Rápido. Os créditos renovam em ${dataBr(s.renova)}.` },
  { id: 'plano100', quando: s => s.usados >= s.creditos && s.pacoteDisponivel <= 0, assunto: 'créditos do ciclo usados: a GreenIA segue com a classe Rápido',
    texto: s => `Os créditos deste ciclo foram usados. Até ${dataBr(s.renova)}, a GreenIA segue disponível com a classe Rápido, dentro de uma reserva de continuidade.\n\nPara voltar a usar as classes Equilibrado e Avançado antes da renovação, fale com a equipe que opera a GreenIA sobre um pacote adicional de créditos.` },
  { id: 'reserva90', quando: s => s.fase !== 'pacote' && s.naReserva >= s.reserva * 0.9, assunto: 'a reserva de continuidade está perto do fim',
    texto: s => `A reserva de continuidade deste ciclo está em ${s.percentualReserva}%.\n\nQuando ela terminar, novas mensagens ficam pausadas até ${dataBr(s.renova)}. O histórico continua disponível. Um pacote adicional de créditos evita a pausa.` },
  { id: 'esgotado', quando: s => s.fase === 'esgotado', assunto: 'capacidade do ciclo usada: novas mensagens pausadas até a renovação',
    texto: s => `A capacidade deste ciclo foi usada. Novas mensagens voltam em ${dataBr(s.renova)}, ou antes com um pacote adicional de créditos.\n\nConversas, quick wins e conhecimento continuam disponíveis para consulta.` },
];

const EVENTOS_ETAPA = { aviso80: ['credits.threshold_80'], plano100: ['credits.exhausted', 'reserve.started'], reserva90: ['reserve.threshold_90'], esgotado: ['reserve.exhausted'], renovado: ['credits.renewed'] };

async function enviarParaTodos(app, assunto, texto, { soOperador = false } = {}) {
  const admins = soOperador ? [] : todos(app.db, "select email from pessoas where papel = 'admin' and ativo = 1").map(a => a.email).filter(e => !(app.operadores || []).includes(e));
  const empresa = lerConfig(app.db).empresa;
  for (const para of [...new Set([...admins, ...(app.operadores || [])])]) {
    const prefixo = (app.operadores || []).includes(para) ? `[${empresa}] ` : '';
    await app.email.enviar(para, `GreenIA: ${prefixo}${assunto}`, texto).catch(e => app.log('email do plano', e.message));
  }
}

export async function verificarAvisos(app) {
  const s = situacaoPlano(app);
  if (!s) return [];
  const mes = app.agora().toISOString().slice(0, 7);
  const reg = lerConfig(app.db).avisosPlano || {};
  const enviados = reg.mes === mes ? [...(reg.enviados || [])] : [];
  const novos = [];
  // Virada do mês depois de um mês que chegou a 100%: avisa que tudo voltou ao normal.
  if (reg.mes && reg.mes !== mes && (reg.enviados || []).includes('plano100')) novos.push({ id: 'renovado', assunto: 'os créditos foram renovados', texto: `Um novo ciclo começou e os créditos foram renovados. As classes Rápido, Equilibrado e Avançado estão disponíveis de novo.` });
  for (const e of ETAPAS) if (!enviados.includes(e.id) && e.quando(s)) novos.push({ id: e.id, assunto: e.assunto, texto: e.texto(s) });
  if (!novos.length && reg.mes === mes) return [];
  salvarConfig(app.db, { avisosPlano: { mes, enviados: [...enviados, ...novos.filter(n => n.id !== 'renovado').map(n => n.id)] } });
  for (const n of novos) {
    for (const tipo of EVENTOS_ETAPA[n.id]) registrar(app, tipo, null, { percentual: s.percentual, reserva: s.percentualReserva });
    await enviarParaTodos(app, n.assunto, n.texto);
  }
  return novos.map(n => n.id);
}

// Pacote liberado: as etapas de fim de cota voltam a valer, e o admin é avisado.
export async function avisarPacote(app, creditos) {
  const reg = lerConfig(app.db).avisosPlano || {};
  salvarConfig(app.db, { avisosPlano: { ...reg, enviados: (reg.enviados || []).filter(e => e === 'aviso80') } });
  await enviarParaTodos(app, 'pacote adicional de créditos liberado', `Foram liberados ${creditos.toLocaleString('pt-BR')} créditos adicionais. As classes Rápido, Equilibrado e Avançado estão disponíveis de novo. Créditos de pacote permanecem até serem usados.`);
}

// Resumo para o operador: custo real do mês e, se o preço estiver configurado, o lucro.
export function resumoOperador(app) {
  const s = situacaoPlano(app);
  if (!s) return null;
  const mes = app.agora().toISOString().slice(0, 7);
  const custoIa = um(app.db, 'select coalesce(sum(custo), 0) as c from uso where substr(em, 1, 7) = ?', mes).c;
  const custoComTaxa = custoIa * 1.055;
  const pacotes = todos(app.db, 'select p.em, p.creditos, p.validade, p.origem, p.observacao, coalesce(p.operador, pe.email) as por from pacotes p left join pessoas pe on pe.id = p.pessoa_id order by p.id desc limit 20');
  return { ...s, custoIa, custoComTaxa, precoUsd: app.plano.precoUsd, lucroSemServidor: app.plano.precoUsd ? app.plano.precoUsd - custoComTaxa : null, pacotes };
}

export const enviarAvisoOperador = (app, assunto, texto) => enviarParaTodos(app, assunto, texto, { soOperador: true });

// Rotas do operador: resumo com custo real e liberação de pacotes.
export function rotasPlano(app, r) {
  const soOperador = pessoa => { if (!ehOperador(app, pessoa)) throw erro(403, 'so_operador', 'Só o operador da plataforma pode fazer isso.'); };
  r.get('/api/operador/plano', ({ pessoa }) => { soOperador(pessoa); return { resumo: resumoOperador(app) }; });
  r.post('/api/operador/pacotes', async ({ pessoa, corpo }) => {
    soOperador(pessoa);
    if (!app.plano) throw erro(400, 'sem_plano', 'Esta instalação não tem plano configurado (PLANO_CREDITOS).');
    liberarPacote(app, pessoa, corpo.creditos, { observacao: corpo.observacao, validade: corpo.validade, origem: 'painel' });
    await avisarPacote(app, Math.floor(Number(corpo.creditos)));
    return { resumo: resumoOperador(app) };
  });
}
