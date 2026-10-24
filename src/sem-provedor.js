// O provedor de infraestrutura de IA é interno da GreenIA: no ambiente da empresa (quem usa e o admin da
// empresa) o nome dele não aparece em nenhuma resposta. Só o painel global da plataforma (servidor próprio,
// /plataforma) e o console do operador o mostram. Este filtro é a última barreira na saída da API da
// empresa: textos, identificadores, erros repassados do provedor e exportações CSV.
const EXATOS = { 'openrouter/auto': 'classe:externo', 'openrouter/free': 'gratuito' };
export function textoSemProvedor(s) {
  if (typeof s !== 'string' || !/open\s*-?\s*router/i.test(s)) return s;
  if (EXATOS[s]) return EXATOS[s];
  // Uma URL de fonte é um identificador opaco: substituir palavras no caminho
  // corrompia links (por exemplo github.com/OpenRouterTeam/docs). Só endereços
  // do próprio provedor são ocultados; fontes externas permanecem byte a byte.
  return s.split(/(https?:\/\/[^\s"'<>()[\]]+)/gi).map((parte, i) => {
    if (i % 2) {
      try {
        const host = new URL(parte).hostname.toLowerCase().replace(/\.$/, '');
        if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai')) return 'serviço de IA';
        return parte;
      } catch { /* URL inválida: aplica a ocultação de texto, sem criar um link. */ }
    }
    return parte.replace(/OPENROUTER_API_KEY/g, 'chave de acesso ao serviço de IA')
      .replace(/openrouter\/auto/gi, 'automático do serviço de IA')
      .replace(/open\s*-?\s*router/gi, 'serviço de IA');
  }).join('');
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
