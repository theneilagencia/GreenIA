// Contraste de cores segundo a WCAG 2.x, e geração de variante de texto que
// passe do mínimo mantendo o matiz. Usado por scripts/check-contrast.mjs e pelo
// servidor, ao validar as cores de marca de um tenant.

export const MIN_NORMAL = 4.5; // texto normal
export const MIN_LARGE = 3;    // texto grande (24 px, ou 18,66 px em negrito)

export function normalizeHex(hex) {
  const h = String(hex).trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) return '#' + h.split('').map(c => c + c).join('').toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(h)) return '#' + h.toUpperCase();
  throw new Error('cor inválida: ' + hex);
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function toHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  return [h, s, l];
}

export function fromHsl([h, s, l]) {
  const f = n => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Menor contraste da cor contra uma lista de fundos.
export function minContrast(fg, backgrounds) {
  return Math.min(...backgrounds.map(b => contrast(fg, b)));
}

// Escurece (ou clareia, se o fundo for escuro) a cor no mesmo matiz até passar
// do mínimo em todos os fundos. Devolve a cor original se ela já passa.
export function textVariant(hex, backgrounds, min = MIN_NORMAL, margin = 0.1) {
  const start = normalizeHex(hex);
  if (minContrast(start, backgrounds) >= min) return start;
  const darkBg = backgrounds.every(b => luminance(b) < 0.18);
  const hsl = toHsl(start);
  let out = start;
  for (let i = 0; i < 500 && minContrast(out, backgrounds) < min + margin; i++) {
    hsl[2] = Math.max(0, Math.min(1, hsl[2] + (darkBg ? 0.002 : -0.002)));
    out = fromHsl(hsl);
    if (hsl[2] === 0 || hsl[2] === 1) break;
  }
  return out;
}
