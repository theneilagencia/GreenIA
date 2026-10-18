// Extrai somente declarações explícitas de publicação, nunca ano do DOI,
// data de consulta, copyright, cabeçalho HTTP ou criação do PDF.
function dataValida(valor) {
  const s = String(valor || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T[\d:.+Z-]+)?$/.exec(s);
  if (!m) { const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (br) m = [s, br[3], br[2], br[1]]; }
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number), t = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function publicacaoDaPagina(html, texto = '') {
  const candidatos = [];
  const add = (valor, origem, evidencia) => { const data = dataValida(valor); if (data) candidatos.push({ data, origem, evidencia: String(evidencia).slice(0, 240) }); };
  const h = String(html || '');
  for (const [tag] of h.matchAll(/<meta\b[^>]*>/gi)) {
    const atributos = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
    const nome = (atributos.property || atributos.name || atributos.itemprop || '').toLowerCase();
    if (['article:published_time', 'datepublished', 'citation_publication_date', 'dc.date.issued'].includes(nome)) add(atributos.content, nome, tag);
  }
  for (const m of h.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let dados; try { dados = JSON.parse(m[1]); } catch { continue; }
    const visitar = x => {
      if (Array.isArray(x)) { x.forEach(visitar); return; }
      if (!x || typeof x !== 'object') return;
      const tipos = [].concat(x['@type'] || []);
      if (tipos.some(t => /^(?:https?:\/\/schema\.org\/)?(?:\w*Article|BlogPosting|Report|WebPage)$/.test(t)) && typeof x.datePublished === 'string')
        add(x.datePublished, 'schema.org/datePublished', `datePublished: ${x.datePublished}`);
      if (x['@graph']) visitar(x['@graph']);
    };
    visitar(dados);
  }
  for (const m of String(texto).matchAll(/\bpublicad[oa]\s+(?:em|el)\s+(\d{2}\/\d{2}\/\d{4})/gi)) add(m[1], 'texto_publicado_em', m[0]);
  const datas = [...new Set(candidatos.map(x => x.data))];
  return datas.length === 1 ? candidatos[0] : null; // divergência exige revisão, nunca escolher uma data silenciosamente
}
