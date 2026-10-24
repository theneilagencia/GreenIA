// Contraste da cor de marca (mesma conta do servidor) e o aviso ao lado do campo: diz se a cor
// serve, mostra um botão de exemplo e, se estiver clara demais, oferece o mesmo tom mais escuro.
export const FUNDO_CLARO = '#F1F1EE', CONTRASTE_MINIMO = 4.5;
const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const corValida = h => /^#[0-9a-f]{6}$/i.test(h || '');
export function corLegivel(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (let f = 1; f > 0; f -= 0.01) {
    const c = '#' + rgb.map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (contraste(c, FUNDO_CLARO) >= CONTRASTE_MINIMO) return c;
  }
  return '#000000';
}
export const corLegivelOk = hex => !corValida(hex) || contraste(hex, FUNDO_CLARO) >= CONTRASTE_MINIMO;

/** Preenche `el` com o aviso da cor `hex`; o botão "Usar" chama `usar(sugestao)`. */
export function avisoCor(el, hex, usar) {
  if (!el) return;
  if (!corValida(hex)) { el.className = 'aviso-cor'; el.innerHTML = ''; return; }
  const ok = contraste(hex, FUNDO_CLARO) >= CONTRASTE_MINIMO, sug = ok ? '' : corLegivel(hex);
  el.className = `aviso-cor ${ok ? 'ok' : 'ruim'}`;
  el.innerHTML = `<span class="amostra-botao" style="background:${hex}">Botão</span><span class="amostra-link" style="color:${hex}">link</span>
    <span class="aviso-cor-texto">${ok ? '<b>Boa leitura.</b> Texto branco no botão e links sobre o fundo claro ficam legíveis.'
      : '<b>Clara demais.</b> Veja o exemplo: o texto branco some no botão e o link quase não aparece no fundo claro.'}</span>
    ${ok ? '' : `<button type="button" class="btn btn-linha btn-pequeno" data-usar-cor="${sug}"><span class="cor" style="background:${sug}"></span>Usar ${sug}, o mesmo tom mais escuro</button>`}`;
  el.querySelector('[data-usar-cor]')?.addEventListener('click', () => usar(sug));
}
