// Margem dos planos e do Capacity Pack: MARGEM TOTAL no pior caso. A receita paga impostos, pagamento/câmbio e
// suporte/operação (percentuais da receita), a IA da franquia + reserva inteiras (US$ 0,01 por crédito + taxa do
// intermediário) e a parte de cada empresa na infraestrutura compartilhada. Abaixo do piso (50%) o plano ou pacote não
// é salvo; entre o piso e a meta (52%) fica em alerta. As premissas ficam num lugar só (ajuste da plataforma
// "premissas_economicas"), com os padrões abaixo; nenhuma margem é fixada no código: tudo sai das premissas.
//
// O teto de créditos (src/plano.js) garante que o custo de IA não passa da franquia + reserva (+ pacotes); o registro
// do custo (src/custo-ia.js) garante que todo custo cobrado vira crédito.
import { erro } from '../http.js';
import { CREDITO_USD, TAXA_INTERMEDIARIO } from '../plano.js';
import { um } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';

export { TAXA_INTERMEDIARIO };

// Premissas econômicas (frações). O custo-base do crédito é a própria definição do crédito no consumo (CREDITO_USD):
// fica visível, mas não é editável aqui (mudá-lo mudaria a contagem de créditos de todas as empresas).
export const PREMISSAS_PADRAO = Object.freeze({
  ai_credit_base_cost: CREDITO_USD,
  ai_provider_fee_rate: TAXA_INTERMEDIARIO - 1,
  tax_rate: 0.12,
  payment_fx_rate: 0.03,
  support_operation_rate: 0.15,
  min_total_margin_rate: 0.5,
  target_total_margin_rate: 0.52,
});
export const NOMES_PREMISSAS = {
  ai_credit_base_cost: 'Custo-base de IA por crédito (US$)', ai_provider_fee_rate: 'Taxa do intermediário (OpenRouter)', tax_rate: 'Impostos sobre a receita',
  payment_fx_rate: 'Pagamento e câmbio', support_operation_rate: 'Suporte e operação', min_total_margin_rate: 'Margem total mínima (piso)', target_total_margin_rate: 'Meta de margem total',
};
const CHAVE = 'premissas_economicas';
const EDITAVEIS = ['ai_provider_fee_rate', 'tax_rate', 'payment_fx_rate', 'support_operation_rate', 'min_total_margin_rate', 'target_total_margin_rate'];

// Confere um conjunto de premissas: frações entre 0 e 1, piso ≤ meta, e espaço para a IA (custos proporcionais + piso < 100%).
export function validarPremissas(d) {
  const p = { ...PREMISSAS_PADRAO };
  for (const k of EDITAVEIS) {
    if (d?.[k] === undefined || d[k] === null || d[k] === '') continue;
    const v = Number(d[k]);
    if (!Number.isFinite(v) || v < 0 || v >= 1) throw erro(400, k, `${NOMES_PREMISSAS[k]}: informe uma fração entre 0 e 1 (ex.: 0,12 para 12%).`);
    p[k] = Math.round(v * 1e6) / 1e6;
  }
  if (p.min_total_margin_rate > p.target_total_margin_rate) throw erro(400, 'target_total_margin_rate', 'A meta de margem precisa ser maior ou igual ao piso.');
  if (taxaProporcional(p) + p.min_total_margin_rate >= 1) throw erro(400, 'premissas', 'Custos proporcionais + margem mínima somam 100% ou mais: não sobraria receita para a IA e a infraestrutura.');
  return p;
}
export const lerPremissas = P => { try { return validarPremissas(lerAjuste(P.db, CHAVE, {}) || {}); } catch { return { ...PREMISSAS_PADRAO }; } };
export function salvarPremissas(P, d) { const p = validarPremissas(d); salvarAjuste(P.db, CHAVE, Object.fromEntries(EDITAVEIS.map(k => [k, p[k]]))); return p; }

export const custoPorCredito = pr => pr.ai_credit_base_cost * (1 + pr.ai_provider_fee_rate);
export const taxaProporcional = pr => pr.tax_rate + pr.payment_fx_rate + pr.support_operation_rate;
const arred = v => Math.round(v * 100) / 100;

// Conta de um produto (plano ou pacote) com uma receita, os créditos que ele pode consumir e a infraestrutura alocada.
export function conta({ receita, creditos, infra = 0 }, pr) {
  const impostos = receita * pr.tax_rate, pagamento = receita * pr.payment_fx_rate, suporte = receita * pr.support_operation_rate;
  const ia = creditos * custoPorCredito(pr), custoTotal = impostos + pagamento + suporte + ia + infra, contribuicao = receita - custoTotal;
  return { receita, impostos, pagamento, suporte, proporcionais: impostos + pagamento + suporte, ia, infra, custoTotal, contribuicao, margem: receita > 0 ? contribuicao / receita : null };
}
// Preço que deixa exatamente a margem `alvo`: (IA + infra) ÷ (1 − custos proporcionais − alvo).
export function precoMinimo({ creditos, infra = 0 }, pr, alvo = pr.min_total_margin_rate) {
  const sobra = 1 - taxaProporcional(pr) - alvo;
  if (!(sobra > 0)) return null;
  // Arredonda o ruído de ponto flutuante (0,2 vira 0,19999…) antes de subir para o centavo.
  const centavos = Math.round((creditos * custoPorCredito(pr) + infra) / sobra * 100 * 1e6) / 1e6;
  return Math.ceil(centavos) / 100;
}
export const statusMargem = (m, pr) => m === null || m === undefined ? null : m < pr.min_total_margin_rate ? 'critico' : m < pr.target_total_margin_rate ? 'alerta' : 'saudavel';

// Uso simulado para o preview (a trava considera sempre o pior caso: franquia + reserva inteiras).
export const USOS_SIMULADOS = [0.25, 0.5, 0.75, 1];

// Economia de um plano. `infra`: parte de cada empresa na infraestrutura compartilhada.
export function economiaDoPlano(p, { infra = 0, premissas = PREMISSAS_PADRAO } = {}) {
  const pr = premissas, credits = Number(p.credits) || 0, reserve = Number(p.reserve) || 0;
  const preco = p.price_usd === null || p.price_usd === undefined || p.price_usd === '' ? null : Number(p.price_usd);
  const r = p.rules || {};
  const pacote = r.pack_credits > 0 && r.pack_price_usd > 0 ? economiaDoPacote({ creditos: r.pack_credits, preco: r.pack_price_usd, nome: r.pack_name }, pr) : null;
  // Plano interno sem teto (Liberado): não é comercial, não tem margem.
  if (!credits) return { ilimitado: true, semTeto: true, preco, margem: null, status: null, pacote };
  const capacidade = credits + reserve;
  if (!preco) return { ilimitado: false, semReceita: true, preco, capacidadePiorCaso: capacidade, custoIaPiorCaso: arred(capacidade * custoPorCredito(pr)), custoPiorCaso: arred(capacidade * custoPorCredito(pr) + infra), margem: null, status: null, pacote };
  const c = conta({ receita: preco, creditos: capacidade, infra }, pr);
  const minimo = precoMinimo({ creditos: capacidade, infra }, pr);
  return {
    ilimitado: false, preco, capacidadePiorCaso: capacidade,
    custoIaPiorCaso: arred(c.ia), impostos: arred(c.impostos), pagamento: arred(c.pagamento), suporte: arred(c.suporte), infra: arred(c.infra),
    custoPiorCaso: arred(c.custoTotal), contribuicao: arred(c.contribuicao), margem: c.margem, status: statusMargem(c.margem, pr),
    abaixo: c.margem < pr.min_total_margin_rate, precoMinimo: minimo, folga: c.margem - pr.min_total_margin_rate,
    // Métrica secundária, só para diagnóstico: quanto sobra só depois da IA (não é a trava).
    margemIa: (preco - c.ia) / preco,
    simulacao: [...USOS_SIMULADOS.map(u => ({ uso: u, margem: conta({ receita: preco, creditos: credits * u, infra }, pr).margem })), { uso: 'pior_caso', margem: c.margem }],
    pacote,
  };
}
// Capacity Pack: usa a infraestrutura que a empresa já tem (infraestrutura alocada zero) e não traz reserva.
export function economiaDoPacote({ creditos, preco, nome = null }, pr = PREMISSAS_PADRAO) {
  const c = conta({ receita: preco, creditos, infra: 0 }, pr);
  return { nome: nome || null, creditos, preco, custoIa: arred(c.ia), impostos: arred(c.impostos), pagamento: arred(c.pagamento), suporte: arred(c.suporte),
    custoTotal: arred(c.custoTotal), contribuicao: arred(c.contribuicao), margem: c.margem, status: statusMargem(c.margem, pr), precoMinimo: precoMinimo({ creditos }, pr) };
}

// Trava ao salvar: plano ou pacote com MARGEM TOTAL no pior caso abaixo do piso é recusado, com o preço mínimo.
export function exigirMargem(p, { infra = 0, premissas = PREMISSAS_PADRAO } = {}) {
  const e = economiaDoPlano(p, { infra, premissas });
  const pct = v => `${(Math.round(v * 1000) / 10).toLocaleString('pt-BR')}%`;
  const piso = premissas.min_total_margin_rate;
  if (e.margem !== null && e.margem !== undefined && e.margem < piso) {
    throw erro(400, 'margem', `Com esse preço, a margem total no pior caso (franquia e reserva inteiras, impostos, pagamento, suporte, IA e infraestrutura) fica em ${pct(e.margem)}, abaixo do piso de ${pct(piso)}. Para esses créditos, o preço mínimo é US$ ${e.precoMinimo.toFixed(2)}.`);
  }
  if (e.pacote && e.pacote.margem < piso) {
    throw erro(400, 'margem_pacote', `Com esse preço, a margem total do Capacity Pack fica em ${pct(e.pacote.margem)}, abaixo do piso de ${pct(piso)}. Para ${p.rules.pack_credits} créditos, o preço mínimo é US$ ${e.pacote.precoMinimo.toFixed(2)}.`);
  }
  return e;
}

// Infraestrutura compartilhada: a fatura mensal do servidor (informada no console) dividida pelas empresas que não
// estão canceladas. É o divisor que a plataforma já usava: entram empresas ativas, em implantação e suspensas, inclusive
// contas internas e as do plano interno (Liberado), porque todas ocupam o mesmo servidor.
export const custoServidor = P => Number(lerAjuste(P.db, 'custo_servidor_usd', 0)) || 0;
export function infraPorEmpresa(P) {
  const n = um(P.db, "select count(*) as n from companies where status != 'cancelada' or status is null").n;
  return n ? custoServidor(P) / n : 0;
}
