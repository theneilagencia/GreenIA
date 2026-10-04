// Catálogo comercial da GreenIA (dados de partida, não regra de cálculo): os quatro planos recorrentes e o Capacity
// Pack. Todos os planos têm usuários ilimitados, as mesmas funcionalidades, a mesma infraestrutura compartilhada e os
// mesmos limites operacionais; diferem por preço e capacidade. A reserva de continuidade é 20% da franquia.
// As margens nunca ficam aqui: saem de src/plataforma/margem.js, a partir das premissas econômicas.

export const RESERVA_PADRAO = 0.2;
export const CAPACITY_PACK = Object.freeze({ nome: 'Capacity Pack', produto: 'capacity_pack', creditos: 2000, preco_usd: 229 });
// Pacote do modelo anterior (+10.000 créditos por US$ 250): não é mais vendido. Só identifica os registros antigos,
// que guardam o valor da época.
export const PACOTE_LEGADO = Object.freeze({ nome: 'Pacote adicional (legado)', produto: 'pacote_legado_10000', creditos: 10000, preco_usd: 250 });
export const NOMES_PRODUTO = { capacity_pack: 'Capacity Pack', pacote_legado_10000: 'Pacote adicional (legado)', cortesia: 'Cortesia' };

export const PLANOS_COMERCIAIS = Object.freeze([
  { name: 'GreenIA Starter', description: 'Para começar com uma equipe pequena', price_usd: 199, credits: 2000 },
  { name: 'GreenIA Team', description: 'Para uma área ou um time que usa a IA todo dia', price_usd: 399, credits: 5000 },
  { name: 'GreenIA Business', description: 'Para várias áreas da empresa', price_usd: 749, credits: 10000 },
  { name: 'GreenIA Company', description: 'Para levar a IA a toda a empresa', price_usd: 1749, credits: 25000 },
].map(p => Object.freeze({ ...p, reserve: Math.round(p.credits * RESERVA_PADRAO) })));

// Regras de consumo de todo plano comercial: reserva só na classe Rápido e o Capacity Pack como pacote.
export const regrasComerciais = () => ({ reserve_fast_only: true, pack_name: CAPACITY_PACK.nome, pack_credits: CAPACITY_PACK.creditos, pack_price_usd: CAPACITY_PACK.preco_usd });
