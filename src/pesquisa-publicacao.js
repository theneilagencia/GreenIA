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
const MESES = { janeiro: 1, enero: 1, fevereiro: 2, febrero: 2, marco: 3, marzo: 3, abril: 4, maio: 5, mayo: 5, junho: 6, junio: 6, julho: 7, julio: 7, agosto: 8, setembro: 9, septiembre: 9, outubro: 10, octubre: 10, novembro: 11, noviembre: 11, dezembro: 12, diciembre: 12 };
function dataPorExtenso(texto) {
  const s = String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const m = /^(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+de|,)?\s+(\d{4})$/.exec(s);
  return m && MESES[m[2]] ? dataValida(`${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`) : null;
}
// Data no cabeçalho sem rótulo explícito é evidência editorial, não publicação
// confirmada. Não procurar datas aleatórias no corpo, em eventos ou no rodapé.
export function dataEditorialDaPagina(texto, titulo) {
  const normal = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const linhas = String(texto).split('\n').map(x => x.trim()).filter(Boolean), alvo = normal(titulo);
  for (let i = 0; i < linhas.length - 1; i++) {
    if (!/^#{1,3}\s+/.test(linhas[i])) continue;
    const cabecalho = normal(linhas[i]);
    if (cabecalho.length < 25 || !alvo.includes(cabecalho)) continue;
    const data = dataPorExtenso(linhas[i + 1]);
    if (data) return { data, origem: 'data_exibida_apos_titulo', evidencia: `${linhas[i]} | ${linhas[i + 1]}`.slice(0, 300), tipo: 'data_editorial_sem_rotulo' };
  }
  return null;
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
  for (const m of String(texto).matchAll(/\bpublicad[oa]\s+(?:em|el)\s+(\d{1,2}\s+(?:de\s+)?[a-záéíóúç]+(?:\s+de|,)?\s+\d{4})/gi)) {
    const data = dataPorExtenso(m[1]); if (data) add(data, 'texto_publicado_em', m[0]);
  }
  const datas = [...new Set(candidatos.map(x => x.data))];
  return datas.length === 1 ? candidatos[0] : null; // divergência exige revisão, nunca escolher uma data silenciosamente
}
