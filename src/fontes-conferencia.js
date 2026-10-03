// Conferência de fidelidade às fontes (determinística, sem IA): complementa o conferente do Quick Win.
//  - fonte obrigatória que não pôde ser lida: o resultado não sai "aprovado" (fica parcial, com o motivo);
//  - fonte obrigatória lida mas não usada: falha corrigível ("use a fonte");
//  - dado que só existe numa REFERÊNCIA (e não no pedido, no material nem nas fontes de fato): copiado como fato;
//  - quais fontes o resultado de fato usou (para "Fontes usadas" e para a auditoria da execução).
// `fontes` vem do contexto: { detalhe: [{codigo, id, titulo, papel, status, erro}], textos: { [id]: texto } }.
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PALAVRAS_COMUNS = new Set(['tambem', 'sempre', 'quando', 'durante', 'conforme', 'informacao', 'informacoes', 'documento', 'documentos', 'resultado', 'empresa', 'seguinte', 'seguintes', 'através', 'atraves', 'necessario', 'necessaria', 'importante', 'qualquer', 'possivel', 'deverao', 'devera', 'poderao', 'podera', 'apresentar', 'relacao', 'pessoas', 'trabalho', 'processo']);
// Números que identificam um dado (valor, quantidade, percentual, código): 3+ dígitos ou com %; anos ficam de fora.
export function numerosDe(texto) {
  const out = new Set();
  for (const m of String(texto || '').matchAll(/\d[\d.,]*\d\s*%?|\d\s*%/g)) {
    const bruto = m[0].replace(/\s+/g, ''), digitos = bruto.replace(/[^\d]/g, '');
    if (/^(19|20)\d\d$/.test(digitos) && !bruto.includes('%')) continue;
    if (digitos.length >= 3 || bruto.endsWith('%')) out.add(digitos + (bruto.endsWith('%') ? '%' : ''));
  }
  return out;
}
const termosDe = texto => new Set((norm(texto).match(/[a-z]{7,}/g) || []).filter(p => !PALAVRAS_COMUNS.has(p)));
// A fonte foi usada? Citação pelo título, ou termos e números característicos dela presentes no resultado.
export function fonteUsada(fonte, textoFonte, resultado) {
  const r = norm(resultado);
  const titulo = norm(fonte.titulo).replace(/\.[a-z0-9]{2,4}$/, '').trim();
  if (titulo.length >= 4 && r.includes(titulo)) return true;
  if (fonte.codigo && new RegExp(`\\[${fonte.codigo}\\]`, 'i').test(resultado)) return true;
  const termos = termosDe(textoFonte), nums = numerosDe(textoFonte);
  const rt = termosDe(resultado), rn = numerosDe(resultado);
  const comuns = [...termos].filter(t => rt.has(t)).length + 2 * [...nums].filter(n => rn.has(n)).length;
  const minimo = termos.size + nums.size < 15 ? 2 : 4;
  return comuns >= minimo;
}
export function conferirFontes(fontes, resultado, entrada = '') {
  const vazio = { falhas: [], detalhes: [], usadas: [], obrigatoriasFalharam: [] };
  if (!fontes?.detalhe?.length) return vazio;
  const out = { falhas: [], detalhes: [], usadas: [], obrigatoriasFalharam: [] };
  const textos = fontes.textos || {};
  for (const f of fontes.detalhe) {
    if (f.papel === 'REQUIRED_SOURCE' && f.status !== 'READY') { out.obrigatoriasFalharam.push({ titulo: f.titulo, motivo: f.erro || 'não pôde ser lida' }); continue; }
    if (f.status !== 'READY') continue;
    const texto = textos[f.id];
    const usada = f.tipo === 'company_knowledge' ? !!f.usada : texto ? fonteUsada(f, texto, resultado) : false;
    if (usada && f.papel !== 'REFERENCE') out.usadas.push({ codigo: f.codigo, titulo: f.titulo, papel: f.papel, tipo: f.tipo });
    if (f.papel === 'REFERENCE' && texto) out.usadas.push({ codigo: f.codigo, titulo: f.titulo, papel: f.papel, tipo: f.tipo, como: 'estilo' });
    if (f.papel === 'REQUIRED_SOURCE' && !usada) { out.falhas.push('completo'); out.detalhes.push(`Fonte obrigatória não usada: "${f.titulo}". Use o conteúdo dela no que for relevante e indique a origem.`); }
  }
  // Referência como fato: números do resultado que só existem na referência.
  const refs = fontes.detalhe.filter(f => f.papel === 'REFERENCE' && f.status === 'READY' && textos[f.id]);
  if (refs.length) {
    let fatos = String(entrada || '');
    for (const f of refs) fatos = fatos.split(textos[f.id].slice(0, 6000)).join(' ');
    for (const f of fontes.detalhe.filter(x => x.papel !== 'REFERENCE' && textos[x.id])) fatos += `\n${textos[f.id]}`;
    const nf = numerosDe(fatos), rn = numerosDe(resultado);
    const copiados = [...new Set(refs.flatMap(f => [...numerosDe(textos[f.id])]))].filter(n => rn.has(n) && !nf.has(n));
    if (copiados.length) { out.falhas.push('invencao'); out.detalhes.push(`Dado copiado da referência como se fosse deste caso: ${copiados.slice(0, 5).join(', ')}. A referência é só modelo de estilo e estrutura; use os dados do pedido e das fontes de conhecimento.`); }
  }
  out.falhas = [...new Set(out.falhas)];
  return out;
}
