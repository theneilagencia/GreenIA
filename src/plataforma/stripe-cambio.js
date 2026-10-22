// Conversão de referência: PTAX venda, último fechamento disponível na consulta.
// A referência do BCB não é a taxa de liquidação da Stripe nem uma cotação intradiária.
const diaSP = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const milisegundosDia = 86_400_000;
const dataAPI = iso => `${iso.slice(5,7)}-${iso.slice(8,10)}-${iso.slice(0,4)}`;

export async function consultarPtax({ agora = new Date(), transporte = fetch } = {}) {
  if (!Number.isFinite(agora.getTime())) throw new Error('Data de consulta inválida.');
  const hoje = diaSP(agora), inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 7);
  const url = new URL('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)');
  url.search = new URLSearchParams({ '@dataInicial': `'${dataAPI(inicio.toISOString().slice(0,10))}'`,
    '@dataFinalCotacao': `'${dataAPI(hoje)}'`, '$format': 'json', '$orderby': 'dataHoraCotacao desc', '$top': '1' });
  let resposta, dados;
  try {
    resposta = await transporte(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw new Error();
    dados = await resposta.json();
  } catch { throw new Error('Cotação BCB indisponível. A emissão em reais deve aguardar nova tentativa.'); }
  const r = dados.value?.[0];
  if (!r || typeof r.dataHoraCotacao !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(r.dataHoraCotacao)) throw new Error('BCB não retornou um fechamento válido.');
  const publicada = new Date(r.dataHoraCotacao.replace(' ', 'T') + '-03:00');
  const data = r.dataHoraCotacao.slice(0,10);
  const idade = (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${data}T00:00:00Z`)) / milisegundosDia;
  if (!Number.isFinite(publicada.getTime()) || diaSP(publicada) !== data || publicada > agora || idade < 0 || idade > 7) throw new Error('Cotação BCB futura ou desatualizada. Emissão em reais bloqueada.');
  if (typeof r.cotacaoVenda !== 'number' || !Number.isFinite(r.cotacaoVenda) || r.cotacaoVenda <= 0 || r.cotacaoVenda >= 1000) throw new Error('Taxa de venda inválida.');
  const taxa = r.cotacaoVenda.toFixed(4);
  if (Math.abs(Number(taxa) - r.cotacaoVenda) > 1e-9) throw new Error('Precisão da cotação BCB não suportada.');
  return Object.freeze({ fonte: 'BCB_PTAX_VENDA', taxa, data_referencia: data, publicada_em: publicada.toISOString(),
    consultada_em: agora.toISOString(), dia_consulta: hoje, fechamento_anterior: data !== hoje });
}

export function converterCentavosUsdParaBrl(usd, taxa) {
  if (!Number.isSafeInteger(usd) || usd <= 0) throw new Error('Valor base precisa ser positivo, em centavos USD.');
  if (typeof taxa !== 'string' || !/^\d{1,3}\.\d{4}$/.test(taxa) || Number(taxa) <= 0) throw new Error('Taxa inválida.');
  // Centavos USD × BRL/USD; arredondamento half-up uma única vez no total.
  const unidades = BigInt(taxa.replace('.', ''));
  const brl = (BigInt(usd) * unidades + 5000n) / 10000n;
  if (brl <= 0n || brl > 99_999_999n) throw new Error('Valor BRL fora dos limites de cobrança.');
  return Number(brl);
}

// Snapshot imutável por empresa/pedido. Uma nova mensalidade exige um novo pedido.
// Reenvios da mesma cobrança recuperam o valor original, mesmo em outro dia.
export async function cotarCobrancaBrl(db, { pedido, empresa, produto, usd_centavos, quantidade = 1 }, op = {}) {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(pedido || '') || !empresa || !produto) throw new Error('Identifique pedido, empresa e produto.');
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 50
    || !Number.isSafeInteger(usd_centavos) || usd_centavos <= 0 || !Number.isSafeInteger(usd_centavos * quantidade)) throw new Error('Valor ou quantidade inválida.');
  db.exec(`create table if not exists stripe_cotacoes (
    pedido text primary key, empresa text not null, produto text not null,
    usd_centavos integer not null, quantidade integer not null, snapshot text not null);`);
  const ler = () => db.prepare('select * from stripe_cotacoes where pedido=?').get(pedido);
  const conferir = r => {
    if (r.empresa !== empresa || r.produto !== produto || r.usd_centavos !== usd_centavos || r.quantidade !== quantidade) throw new Error('Pedido já utilizado com outros dados de cobrança.');
    return JSON.parse(r.snapshot);
  };
  const anterior = ler();
  if (anterior) return conferir(anterior);
  const cotacao = await consultarPtax(op);
  const snapshot = { pedido, empresa, produto, moeda: 'brl', usd_centavos, quantidade,
    total_usd_centavos: usd_centavos * quantidade, total_brl_centavos: converterCentavosUsdParaBrl(usd_centavos * quantidade, cotacao.taxa), cotacao };
  db.prepare('insert or ignore into stripe_cotacoes values (?,?,?,?,?,?)').run(pedido, empresa, produto, usd_centavos, quantidade, JSON.stringify(snapshot));
  return conferir(ler());
}
