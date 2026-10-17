// O provedor de infraestrutura de IA é interno da GreenIA: no ambiente da empresa (quem usa e o admin da
// empresa) o nome dele não aparece em nenhuma resposta. Só o painel global da plataforma (servidor próprio,
// /plataforma) e o console do operador o mostram. Este filtro é a última barreira na saída da API da
// empresa: textos, identificadores, erros repassados do provedor e exportações CSV.
const EXATOS = { 'openrouter/auto': 'classe:externo', 'openrouter/free': 'gratuito' };
export function textoSemProvedor(s) {
  if (typeof s !== 'string' || !/open\s*-?\s*router/i.test(s)) return s;
  if (EXATOS[s]) return EXATOS[s];
  return s.replace(/OPENROUTER_API_KEY/g, 'chave de acesso ao serviço de IA')
    .replace(/https?:\/\/(?:[\w-]+\.)*openrouter\.ai[^\s"')]*/gi, 'serviço de IA')
    .replace(/openrouter\/auto/gi, 'automático do serviço de IA')
    .replace(/open\s*-?\s*router/gi, 'serviço de IA');
}
export function semProvedor(v) {
  if (typeof v === 'string') return textoSemProvedor(v);
  if (Array.isArray(v)) return v.map(semProvedor);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[textoSemProvedor(k)] = semProvedor(x);
    return out;
  }
  return v;
}
