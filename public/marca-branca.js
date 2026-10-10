// White label: no ambiente de cada empresa (multiempresa), a marca é a da empresa. O nome da plataforma não
// aparece para quem usa nem para o admin da empresa. Serve à tela (filtro dos textos renderizados) e ao
// servidor (emails e instruções da IA do ambiente da empresa). O site de vendas, o console da plataforma e o
// do operador continuam com a marca da plataforma.
const TROCAS = [
  [/Usar GreenIA/g, 'Usar a IA'],
  [/\bGreenIA:\s+/g, ''],                                   // prefixo de assunto de email
  [/à GreenIA/g, 'à IA'],
  [/\b(d|n|pel)a GreenIA\b/g, (_, p) => `${p}a plataforma`],   // da, na, pela: a regra ou recomendação é da plataforma
  [/\bA GreenIA\b/g, 'A IA'],
  [/\ba GreenIA\b/g, 'a IA'],
  [/\bGreenIA\b/g, 'IA'],
];
export const semMarcaDaPlataforma = t => TROCAS.reduce((s, [re, r]) => s.replace(re, r), String(t ?? ''));

// Conteúdo das conversas (o que a pessoa escreveu e o que a IA respondeu) e campos de edição nunca são alterados.
const PRESERVAR = '.bolha-eu, .bolha-ia:not(.aviso-bolha), textarea, input, select, script, style, [data-sem-marca]';
const ATRIBUTOS = ['title', 'aria-label', 'placeholder', 'alt'];

function limpar(no) {
  if (no.nodeType === 3) {
    if (!no.data.includes('GreenIA') || no.parentElement?.closest(PRESERVAR)) return;
    no.data = semMarcaDaPlataforma(no.data);
    return;
  }
  if (no.nodeType !== 1 || no.closest(PRESERVAR)) return;
  for (const a of ATRIBUTOS) { const v = no.getAttribute(a); if (v?.includes('GreenIA')) no.setAttribute(a, semMarcaDaPlataforma(v)); }
  const w = document.createTreeWalker(no, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 1) { if (n.matches(PRESERVAR)) continue; for (const a of ATRIBUTOS) { const v = n.getAttribute(a); if (v?.includes('GreenIA')) n.setAttribute(a, semMarcaDaPlataforma(v)); } }
    else limpar(n);
  }
}

let ligado = false;
export function ligarMarcaBranca() {
  if (ligado) return;
  ligado = true;
  document.title = semMarcaDaPlataforma(document.title);
  limpar(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') limpar(m.target);
      else if (m.type === 'attributes') limpar(m.target);
      else m.addedNodes.forEach(limpar);
    }
    if (document.title.includes('GreenIA')) document.title = semMarcaDaPlataforma(document.title);
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
