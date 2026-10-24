// Catálogo de cobrança: moeda do pagamento não altera a capacidade de IA.
// BRL é calculado por cobrança (stripe-cambio.js), não cadastrado como preço mensal fixo.
import { PLANOS_COMERCIAIS, CAPACITY_PACK } from './catalogo.js';

export const ITENS_STRIPE = Object.freeze([
  ...PLANOS_COMERCIAIS.map(p => Object.freeze({
    chave: p.name.replace('GreenIA ', '').toLowerCase(), nome: p.name,
    creditos: p.credits, reserva: p.reserve, usd: Math.round(p.price_usd * 100), recorrente: true,
  })),
  Object.freeze({ chave: 'capacity_pack', nome: 'GreenIA Capacity Pack', creditos: CAPACITY_PACK.creditos,
    reserva: 0, usd: Math.round(CAPACITY_PACK.preco_usd * 100), recorrente: false }),
]);

export function catalogoStripe(env = {}) {
  if (env.STRIPE_PRECOS_BRL_CENTAVOS) throw new Error('Preços BRL fixos desativados: converta a base USD no dia de cada emissão.');
  return ITENS_STRIPE.flatMap(p => ['usd', 'brl'].map(moeda => {
    const valor = moeda === 'usd' ? p.usd : null;
    return { ...p, moeda, valor_centavos: valor, pendente: valor === null, conversao_por_emissao: moeda === 'brl',
      // Um novo valor gera um Price novo. Preços de assinantes existentes não são alterados.
      lookup_key: valor === null ? null : `greenia_v1_${p.chave}_${moeda}_${valor}` };
  }));
}

const form = dados => {
  const out = new URLSearchParams();
  function add(k, v) {
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([a, x]) => add(`${k}[${a}]`, x));
    else if (v !== undefined && v !== null) out.append(k, String(v));
  }
  Object.entries(dados).forEach(([k, v]) => add(k, v));
  return out;
};

// Transporte fechado à API Stripe. Erros não repetem headers, corpo, chave ou dados do cliente.
export function ambienteStripe(env = {}) {
  const modo = env.STRIPE_HABILITADO || 'teste';
  if (!['teste', 'producao'].includes(modo)) throw new Error('STRIPE_HABILITADO deve ser teste ou producao.');
  const conta = env.STRIPE_ACCOUNT_ID || '';
  if ((modo === 'producao' || conta) && !/^acct_[A-Za-z0-9]+$/.test(conta)) throw new Error('Configure STRIPE_ACCOUNT_ID para identificar a conta Stripe.');
  return { modo, conta, live: modo === 'producao' };
}

export function clienteStripeTeste(env, transporte = fetch) {
  return clienteStripe({ ...env, STRIPE_HABILITADO: 'teste' }, transporte);
}

export function clienteStripe(env, transporte = fetch) {
  const ambiente = ambienteStripe(env);
  const chave = env.STRIPE_SECRET_KEY || '';
  if (!new RegExp(`^(sk|rk)_${ambiente.live ? 'live' : 'test'}_[A-Za-z0-9]+$`).test(chave)) throw new Error('Use uma credencial Stripe correspondente ao ambiente selecionado.');
  const versao = env.STRIPE_API_VERSION || '';
  if (!/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/.test(versao)) throw new Error('Defina STRIPE_API_VERSION conforme a versão escolhida no Stripe Workbench.');
  const solicitar = async (metodo, caminho, dados = {}, idempotencia) => {
    if (caminho === '/v1/account' && metodo !== 'GET') throw new Error('Alteração da conta Stripe não permitida.');
    if (!['GET','POST'].includes(metodo) || (caminho !== '/v1/account' && !/^\/v1\/(products|prices|customers|invoiceitems|invoices|subscriptions|checkout\/sessions)(\/[A-Za-z0-9_]+)?(\/finalize|\/send)?$/.test(caminho))) throw new Error('Rota não permitida na integração Stripe.');
    if (metodo==='POST' && (!idempotencia || idempotencia.length>255)) throw new Error('Operação Stripe exige referência de idempotência.');
    const query = form(dados);
    let resposta;
    try {
      resposta = await transporte(`https://api.stripe.com${caminho}${metodo === 'GET' && query.size ? `?${query}` : ''}`, {
        method: metodo, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${chave}`, 'Stripe-Version': versao,
          ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencia } : {}) },
        ...(metodo === 'POST' ? { body: query } : {}),
      });
    } catch { throw new Error('Não foi possível comunicar com o Stripe. Nenhuma credencial foi registrada.'); }
    let corpo;
    try { corpo = await resposta.json(); } catch { throw new Error('Resposta inválida do Stripe.'); }
    if (!resposta.ok) {
      const e = new Error(`Stripe recusou a operação (HTTP ${resposta.status}). Consulte o Workbench.`);
      e.status = resposta.status; throw e;
    }
    if (typeof corpo.livemode === 'boolean' && corpo.livemode !== ambiente.live) throw new Error('Objeto Stripe divergente do ambiente selecionado.');
    return corpo;
  };
  let verificacao;
  return async (...args) => {
    if (ambiente.conta) {
      verificacao ??= solicitar('GET', '/v1/account').then(conta => {
        if (conta.id !== ambiente.conta) throw new Error('A credencial pertence a outra conta Stripe. Nenhuma cobrança foi iniciada.');
        if (ambiente.live && (!conta.charges_enabled || !conta.payouts_enabled)) throw new Error('A conta Stripe ainda não está habilitada para pagamentos e repasses.');
      });
      await verificacao;
    }
    return solicitar(...args);
  };
}

function conferirPreco(price, p, produto, live) {
  const recorrencia = p.recorrente
    ? price.recurring?.interval === 'month' && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed'
    : price.recurring == null;
  if (price.livemode !== live || price.active !== true || price.currency !== p.moeda || price.unit_amount !== p.valor_centavos
    || price.product !== produto || price.billing_scheme !== 'per_unit' || price.transform_quantity != null
    || price.custom_unit_amount != null || !recorrencia) throw new Error(`Preço Stripe divergente para ${p.chave}/${p.moeda}. Nenhum vínculo foi aceito.`);
}

// Só provisiona catálogo. Não cria clientes, cobranças, assinaturas ou libera créditos.
export async function prepararCatalogoStripe(env, { aplicar = false, moeda = 'todas', transporte } = {}) {
  if (!['usd', 'brl', 'todas'].includes(moeda)) throw new Error('Moeda deve ser usd, brl ou todas.');
  const lista = catalogoStripe(env).filter(p => moeda === 'todas' || p.moeda === moeda);
  if (!aplicar) return { modo: 'previa', itens: lista };
  // Valida todo o recorte antes da primeira chamada, evitando provisionamento parcial por falta de preço.
  if (lista.some(p => p.pendente)) throw new Error('BRL é convertido por emissão de fatura; use --moeda=usd para provisionar preços fixos.');
  const ambiente = ambienteStripe(env), api = clienteStripe(env, transporte);
  const produtos = new Map(), itens = [];
  for (const p of lista) {
    const produtoId = `greenia_${p.chave}`;
    if (!produtos.has(produtoId)) {
      let produto;
      try { produto = await api('GET', `/v1/products/${produtoId}`); }
      catch (e) {
        if (e.status !== 404) throw e;
        produto = await api('POST', '/v1/products', { id: produtoId, name: p.nome,
          metadata: { greenia_product: p.chave } }, `greenia_product_v1_${p.chave}`);
      }
      if (produto.deleted || produto.active !== true || produto.livemode !== ambiente.live || produto.metadata?.greenia_product !== p.chave) {
        throw new Error(`Produto Stripe incompatível: ${p.chave}.`);
      }
      produtos.set(produtoId, produto);
    }
    const encontrados = await api('GET', '/v1/prices', { lookup_keys: [p.lookup_key], limit: 2 });
    if (encontrados.has_more || encontrados.data?.length > 1) throw new Error('Lookup de preço ambíguo.');
    let price = encontrados.data?.[0];
    if (!price) price = await api('POST', '/v1/prices', { product: produtoId, currency: p.moeda,
      unit_amount: p.valor_centavos, lookup_key: p.lookup_key,
      ...(p.recorrente ? { recurring: { interval: 'month', usage_type: 'licensed' } } : {}),
      metadata: { greenia_product: p.chave } }, p.lookup_key);
    conferirPreco(price, p, produtoId, ambiente.live);
    itens.push({ produto: p.chave, moeda: p.moeda, valor_centavos: p.valor_centavos, price_id: price.id,
      product_id: produtoId, creditos: p.creditos, reserva: p.reserva, recorrente: p.recorrente });
  }
  return { modo: ambiente.modo, itens };
}
