// Consumo de IA para o admin da plataforma: a conta no OpenRouter (saldo, limite da chave, uso do
// dia, da semana e do mês), o consumo somado da plataforma dia a dia e o de cada empresa, com
// projeção do mês e alertas. Valores em dólar: esta tela é só do operador da plataforma.
import { todos, um } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';
import * as E from './empresas.js';

export const TAXA_INTERMEDIARIO = 1.055;   // o OpenRouter cobra 5,5% sobre a compra de créditos
const CACHE_MS = 5 * 60e3, DIAS = 30;
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const diaIso = d => d.toISOString().slice(0, 10);

// Conta no OpenRouter, com cache curto (a tela e o alerta não martelam a API).
export async function contaOpenRouter(P, { forcar = false } = {}) {
  if (!P.ia?.conta) return { disponivel: false, motivo: 'A IA desta instalação não usa o OpenRouter.' };
  if (P.ia.simulada || P.ia.configurada === false) return { disponivel: false, motivo: P.ia.simulada ? 'IA simulada: não há conta no OpenRouter (defina OPENROUTER_API_KEY).' : 'Sem OPENROUTER_API_KEY: a IA está desligada.' };
  const agora = P.agora().getTime();
  if (!forcar && P._contaOR && agora - P._contaOR.em < CACHE_MS) return P._contaOR.dados;
  const r = await P.ia.conta().catch(() => null);
  const k = r?.chave && !r.chave.erro ? r.chave : null, c = r?.creditos && !r.creditos.erro ? r.creditos : null;
  const dados = {
    disponivel: !!(k || c), atualizadoEm: new Date(agora).toISOString(),
    // 401/403 na chave: o OpenRouter não aceita mais esta chave (vencida, revogada ou desativada).
    recusada: [401, 403].includes(r?.chave?.erro),
    motivo: k || c ? null : `O OpenRouter não respondeu (${r?.chave?.erro ?? 'sem resposta'}). Confira a chave.`,
    // Créditos da conta: comprados, gastos e o saldo que sobra.
    comprado: num(c?.total_credits), gasto: num(c?.total_usage), saldo: c ? num(c.total_credits) - num(c.total_usage) : null,
    creditosIndisponivel: c ? null : r?.creditos?.erro === 401 || r?.creditos?.erro === 403 ? 'A chave usada não tem acesso ao saldo da conta.' : 'O saldo da conta não veio na resposta.',
    // Chave usada pela plataforma: nome, limite (se houver) e uso por período (UTC).
    chave: k && { nome: k.label || '', limite: num(k.limit), restante: num(k.limit_remaining), usoTotal: num(k.usage), hoje: num(k.usage_daily), semana: num(k.usage_weekly), mes: num(k.usage_monthly), gratuita: !!k.is_free_tier,
      expiraEm: k.expires_at || k.expiresAt || null },   // vencimento, quando o OpenRouter informa
  };
  P._contaOR = { em: agora, dados };
  return dados;
}

// Custo por dia de cada empresa, nos últimos DIAS dias (o que a GreenIA registrou, resposta a resposta).
function seriePorEmpresa(P, c, desde) {
  const t = P.tenant(c.id);
  return new Map(todos(t.db, 'select substr(em, 1, 10) as d, sum(custo) as custo, count(*) as n from uso where em >= ? group by d', desde).map(x => [x.d, { custo: x.custo, respostas: x.n }]));
}

export function resumoConsumo(P) {
  const agora = P.agora(), hoje = diaIso(agora), mes = hoje.slice(0, 7);
  const dias = Array.from({ length: DIAS }, (_, i) => diaIso(new Date(agora.getTime() - (DIAS - 1 - i) * 864e5)));
  const desde = dias[0], seteDias = dias.slice(-7);
  const diaDoMes = agora.getUTCDate(), diasNoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
  const total = new Map(dias.map(d => [d, 0]));
  const empresas = todos(P.db, "select * from companies where status != 'cancelada' or status is null order by name").map(c => {
    const serie = seriePorEmpresa(P, c, desde);
    for (const [d, v] of serie) if (total.has(d)) total.set(d, total.get(d) + v.custo);
    const u = E.usoDaEmpresa(P, c.id), plano = E.lerPlanoPorId(P, c.plan_id);
    const custoMes = u.custoUsd, custoHoje = serie.get(hoje)?.custo || 0, custo7 = seteDias.reduce((s, d) => s + (serie.get(d)?.custo || 0), 0);
    const sp = u.plano;
    // Projeção: no ritmo do mês até hoje, quanto do plano estará usado no último dia.
    const projecao = sp && !sp.ilimitado && sp.creditos ? Math.round((sp.usados / Math.max(1, diaDoMes)) * diasNoMes / sp.creditos * 100) : null;
    // Estado do plano: esgotado (só Rápido até renovar ou sem IA), na reserva, perto do fim, ou no ritmo de estourar.
    const alerta = !sp || sp.ilimitado ? null : sp.fase === 'esgotado' ? 'esgotado' : sp.fase === 'reserva' ? 'reserva'
      : sp.percentual >= 90 ? 'critico' : sp.fase === 'aviso' || (projecao !== null && projecao >= 100) ? 'atencao' : null;
    return {
      id: c.id, name: c.name, status: c.status, plano: plano?.name || null, ilimitado: !!sp?.ilimitado,
      creditos: sp?.creditos ?? null, usados: sp?.usados ?? null, percentual: sp?.percentual ?? null, fase: sp?.fase || null, projecao, alerta,
      custoMes, custoHoje, custo7, respostas: u.respostas, pessoasAtivas: u.pessoasAtivas, conversas: u.conversas,
      receitaUsd: plano?.price_usd ?? null, margemUsd: plano?.price_usd != null ? plano.price_usd - custoMes * TAXA_INTERMEDIARIO : null,
      serie: dias.map(d => Math.round((serie.get(d)?.custo || 0) * 1e4) / 1e4),
    };
  });
  const serie = dias.map(d => ({ dia: d, custo: Math.round(total.get(d) * 1e4) / 1e4 }));
  const media7 = seteDias.reduce((s, d) => s + total.get(d), 0) / 7;
  const custoMes = empresas.reduce((s, e) => s + e.custoMes, 0);
  return {
    mes, hoje, dias, serie, media7,
    plataforma: {
      custoMes, custoHoje: total.get(hoje) || 0, custo7: seteDias.reduce((s, d) => s + total.get(d), 0),
      custoMesComTaxa: custoMes * TAXA_INTERMEDIARIO, receitaMes: empresas.reduce((s, e) => s + (e.receitaUsd || 0), 0),
      projecaoMes: diaDoMes ? custoMes / diaDoMes * diasNoMes : custoMes,
    },
    empresas,
  };
}

// Consumo de uma empresa: série diária, por modelo e por quick win no mês.
export function detalheConsumo(P, companyId) {
  const r = resumoConsumo(P), e = r.empresas.find(x => x.id === companyId);
  if (!e) return null;
  const t = P.tenant(companyId);
  const porModelo = todos(t.db, 'select coalesce(modelo_usado, modelo_pedido, ?) as modelo, sum(custo) as custo, count(*) as respostas from uso where substr(em, 1, 7) = ? group by modelo order by custo desc limit 8', 'sem modelo', r.mes);
  const porQw = todos(t.db, `select coalesce(q.nome, 'Conversa livre') as nome, sum(u.custo) as custo, count(*) as respostas from uso u left join quick_wins q on q.id = u.quick_win_id
    where substr(u.em, 1, 7) = ? group by u.quick_win_id order by custo desc limit 8`, r.mes);
  return { mes: r.mes, dias: r.dias, empresa: e, porModelo, porQw };
}

// Alerta de saldo: abaixo do limite, avisa os admins da plataforma por email, no máximo uma vez por dia.
export const limiarSaldo = P => Number(lerAjuste(P.db, 'alerta_saldo_usd', 20));
export async function conferirSaldo(P) {
  const c = await contaOpenRouter(P, { forcar: true });
  if (!c.disponivel) return null;
  const limiar = limiarSaldo(P), r = resumoConsumo(P);
  const saldo = c.saldo ?? c.chave?.restante;
  if (saldo === null || saldo === undefined || saldo >= limiar) return { saldo, limiar, avisou: false };
  const ultimo = lerAjuste(P.db, 'alerta_saldo_em', null);
  if (ultimo && P.agora().getTime() - Date.parse(ultimo) < 864e5) return { saldo, limiar, avisou: false };
  const dias = r.media7 > 0 ? Math.floor(saldo / r.media7) : null;
  const texto = `O saldo de IA no OpenRouter está em US$ ${saldo.toFixed(2)}, abaixo do alerta de US$ ${limiar.toFixed(2)}.\n\n`
    + (dias !== null ? `No ritmo dos últimos 7 dias (US$ ${r.media7.toFixed(2)} por dia), dura cerca de ${dias} ${dias === 1 ? 'dia' : 'dias'}.\n\n` : '')
    + 'Quando o saldo acaba, as respostas de IA de todas as empresas param. Compre créditos em https://openrouter.ai/settings/credits e confira o consumo no console da plataforma, em Uso.';
  const admins = todos(P.db, "select u.email from platform_members m join users u on u.id = m.user_id where u.status = 'ativo'").map(x => x.email);
  for (const para of admins) P.email.enviar(para, `Saldo de IA baixo: US$ ${saldo.toFixed(2)}`, texto).catch(e => P.log('alerta de saldo', e.message));
  salvarAjuste(P.db, 'alerta_saldo_em', P.agora().toISOString());
  return { saldo, limiar, avisou: admins.length > 0 };
}

export { um };
