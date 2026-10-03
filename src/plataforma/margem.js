// Margem desenhada dos planos (formação de preço): no pior caso a empresa usa toda a franquia e toda a reserva, e cada
// crédito custa US$ 0,01 de IA mais a taxa do intermediário. O teto de créditos (src/plano.js) garante que o custo de IA
// não passa disso; o registro do custo (src/custo-ia.js) garante que todo custo cobrado vira crédito. Plano com preço
// abaixo da margem mínima não é salvo; plano sem preço (cortesia, piloto, Liberado) fica marcado como custo sem receita.
import { erro } from '../http.js';
import { CREDITO_USD, TAXA_INTERMEDIARIO } from '../plano.js';

export { TAXA_INTERMEDIARIO };
export const MARGEM_MINIMA = 0.5;          // pior caso, só IA: Team 56,3%, Company 57,8%, pacote 57,8% na formação de preço

const custoIa = creditos => creditos * CREDITO_USD * TAXA_INTERMEDIARIO;
const arred = v => Math.round(v * 100) / 100;

// Economia de um plano no pior caso. `infra`: parte do servidor de cada empresa (opcional).
export function economiaDoPlano(p, { infra = 0 } = {}) {
  const credits = Number(p.credits) || 0, reserve = Number(p.reserve) || 0, preco = p.price_usd === null || p.price_usd === undefined || p.price_usd === '' ? null : Number(p.price_usd);
  const r = p.rules || {};
  const pacote = r.pack_credits > 0 && r.pack_price_usd > 0
    ? { preco: r.pack_price_usd, custoIa: arred(custoIa(r.pack_credits)), margem: (r.pack_price_usd - custoIa(r.pack_credits)) / r.pack_price_usd } : null;
  if (!credits) return { ilimitado: true, preco, custoPiorCaso: null, margem: null, semTeto: true, pacote };
  const custo = custoIa(credits + reserve);
  if (!preco) return { ilimitado: false, preco, custoPiorCaso: arred(custo + infra), margem: null, semReceita: true, pacote };
  return { ilimitado: false, preco, custoIaPiorCaso: arred(custo), custoPiorCaso: arred(custo + infra), margemSoIa: (preco - custo) / preco, margem: (preco - custo - infra) / preco,
    abaixo: (preco - custo - infra) / preco < MARGEM_MINIMA, pacote };
}

// Ao salvar: preço de plano ou de pacote que não cobre a IA no pior caso com a margem mínima é recusado.
export function exigirMargem(p) {
  const e = economiaDoPlano(p);
  const pct = v => `${Math.round(v * 1000) / 10}%`;
  if (e.margemSoIa !== undefined && e.margemSoIa < MARGEM_MINIMA) {
    const minimo = Math.ceil(custoIa((Number(p.credits) || 0) + (Number(p.reserve) || 0)) / (1 - MARGEM_MINIMA));
    throw erro(400, 'margem', `Com esse preço, a margem no pior caso (franquia e reserva inteiras) fica em ${pct(e.margemSoIa)}, abaixo de ${pct(MARGEM_MINIMA)}. Para esses créditos, o preço mínimo é US$ ${minimo}.`);
  }
  if (e.pacote && e.pacote.margem < MARGEM_MINIMA) {
    const minimo = Math.ceil(custoIa(p.rules.pack_credits) / (1 - MARGEM_MINIMA));
    throw erro(400, 'margem_pacote', `Com esse preço, a margem do pacote fica em ${pct(e.pacote.margem)}, abaixo de ${pct(MARGEM_MINIMA)}. Para ${p.rules.pack_credits} créditos, o preço mínimo é US$ ${minimo}.`);
  }
}
