// Verificação de contraste e tamanho mínimo de texto no navegador (sem dependência externa): para cada texto visível,
// a cor do texto contra o primeiro fundo opaco dos ancestrais (WCAG 2.x, 4,5:1; 3:1 para texto grande) e o tamanho
// da fonte. Fundos com imagem ou gradiente são ignorados (não dá para medir sem renderizar). Usado pelos e2e de QA.
export function medirTextos() {
  // rgb()/rgba() em 0–255; color(srgb …) (resultado de color-mix) em 0–1.
  const rgb = s => { const n = (s.match(/[\d.]+/g) || []).map(Number); return s.startsWith('color(srgb') ? [...n.slice(0, 3).map(v => v * 255), ...n.slice(3)] : n; };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const mistura = (f, b) => { const a = f[3] ?? 1; return [0, 1, 2].map(i => f[i] * a + b[i] * (1 - a)); };
  const fundo = el => {
    const camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !/^url/.test(cs.backgroundImage)) return null;
      const c = rgb(cs.backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0) { camadas.push(c); if ((c[3] ?? 1) >= 1) break; }
    }
    let cor = [255, 255, 255];
    for (const c of camadas.reverse()) cor = mistura(c, cor);
    return cor;
  };
  const visivel = el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || e.hidden) return false; } return true; };
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!n.data.trim() || !el || vistos.has(el) || el.closest('svg,script,style,.l-oculto,.sr-only,[aria-hidden="true"]')) continue;
    vistos.add(el);
    if (!visivel(el)) continue;
    const cs = getComputedStyle(el);
    const tam = parseFloat(cs.fontSize), peso = Number(cs.fontWeight) || 400;
    const f = fundo(el);
    let razao = null;
    if (f) { const t = mistura(rgb(cs.color), f); const [a, b] = [lum(t), lum(f)].sort((x, y) => y - x); razao = (a + 0.05) / (b + 0.05); }
    const grande = tam >= 24 || (tam >= 18.66 && peso >= 700);
    out.push({ texto: n.data.trim().slice(0, 50), classe: el.className && String(el.className).slice(0, 40), tag: el.tagName, tam, razao: razao && Math.round(razao * 100) / 100, minimo: grande ? 3 : 4.5 });
  }
  return out;
}
