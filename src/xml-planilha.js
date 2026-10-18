// SpreadsheetML permite prefixos arbitrários (x:worksheet, s:c etc.). Os
// leitores existentes trabalham com os nomes locais. Na cópia processada,
// converte somente o namespace da planilha para a forma default equivalente.
// A leitura não altera o arquivo. A edição grava apenas as partes modificadas.
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function normalizarXmlPlanilha(xml) {
  if (!xml) return xml;
  const declaracoes = [...xml.matchAll(/\bxmlns:([A-Za-z_][\w.-]*)\s*=\s*(["'])(.*?)\2/g)];
  const prefixos = [...new Set(declaracoes.filter(m => m[3] === NS).map(m => m[1]))];
  if (!prefixos.length) return xml;
  const raiz = /<(?![!?])([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\b[^>]*>/.exec(xml);
  if (!raiz || !prefixos.includes(raiz[1])) return xml;
  // Não reinterpretar elementos em escopos que redefinem esses namespaces.
  if (declaracoes.some(m => prefixos.includes(m[1]) && m[3] !== NS)
    || [...xml.matchAll(/\bxmlns\s*=\s*(["'])(.*?)\1/g)].some(m => m[2] !== NS)) throw new Error('Namespace da planilha não suportado.');
  const nomes = prefixos.map(escapar).join('|');
  let out = xml.replace(new RegExp(`(<\\/?)(?:${nomes}):([A-Za-z_][\\w.-]*)(?=[\\s/>])`, 'g'), '$1$2');
  if (!/\bxmlns\s*=/.test(raiz[0])) out = out.replace(new RegExp(`<${escapar(raiz[2])}\\b`), `<${raiz[2]} xmlns="${NS}"`);
  return out;
}
