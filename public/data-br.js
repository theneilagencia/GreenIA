// Campo de data em pt-BR: a pessoa digita dd/mm/aaaa (as barras entram sozinhas) ou escolhe no calendário; a tela
// manda à API o mesmo valor ISO (aaaa-mm-dd) de antes. O campo nativo do navegador seguia o idioma do sistema
// (mm/dd/aaaa em inglês) e por isso fica só por trás do botão do calendário.
import { esc } from '/comum.js';

export const isoParaBr = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.split('-').reverse().join('/') : '');
export function brParaIso(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
  if (!m) return '';
  const [, d, mes, ano] = m, dt = new Date(Date.UTC(+ano, +mes - 1, +d));
  return dt.getUTCFullYear() === +ano && dt.getUTCMonth() === +mes - 1 && dt.getUTCDate() === +d ? `${ano}-${mes}-${d}` : '';
}

const CALENDARIO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
// valor e limites em ISO; extra vai no campo de texto (ex.: aria-describedby, required).
export function campoData({ id, valor = '', min = '', max = '', rotulo = 'data', extra = '' }) {
  return `<span class="data-br"><input class="entrada" id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10" data-data-br${min ? ` data-min="${esc(min)}"` : ''}${max ? ` data-max="${esc(max)}"` : ''} value="${esc(isoParaBr(valor))}" ${extra}>`
    + `<button type="button" class="data-br-cal" aria-label="Escolher ${esc(rotulo)} no calendário" title="Escolher no calendário">${CALENDARIO}</button>`
    + `<input type="date" class="data-br-nativo" tabindex="-1" aria-hidden="true" aria-label="Calendário"${min ? ` min="${esc(min)}"` : ''}${max ? ` max="${esc(max)}"` : ''}></span>`;
}

// Valor ISO do campo: '' quando vazio; null quando o que foi digitado não é uma data válida (o campo fica marcado,
// com a mensagem, e a tela não envia).
export function lerData(el) {
  if (!el) return '';
  const txt = el.value.trim();
  if (!txt) { marcar(el, ''); return ''; }
  const iso = brParaIso(txt);
  const fora = iso && ((el.dataset.min && iso < el.dataset.min) || (el.dataset.max && iso > el.dataset.max));
  if (!iso || fora) { marcar(el, !iso ? 'Use uma data válida no formato dd/mm/aaaa.' : `Use uma data ${el.dataset.min && iso < el.dataset.min ? `a partir de ${isoParaBr(el.dataset.min)}` : `até ${isoParaBr(el.dataset.max)}`}.`); return null; }
  marcar(el, '');
  return iso;
}
function marcar(el, msg) {
  el.setCustomValidity(msg);
  if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
}

// Máscara: só números, barras automáticas depois do dia e do mês.
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el?.matches?.('[data-data-br]') || ev.inputType?.startsWith('delete')) return;
  const n = el.value.replace(/\D/g, '').slice(0, 8);
  const v = n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
  if (v !== el.value) el.value = v;
  if (el.getAttribute('aria-invalid')) lerData(el);
});
document.addEventListener('focusout', ev => { if (ev.target?.matches?.('[data-data-br]') && ev.target.value.trim()) lerData(ev.target); });
// Calendário: abre o seletor do navegador com a data do campo; a escolha volta para o campo em dd/mm/aaaa.
document.addEventListener('click', ev => {
  const b = ev.target?.closest?.('.data-br-cal');
  if (!b) return;
  const caixa = b.closest('.data-br'), nativo = caixa.querySelector('.data-br-nativo');
  nativo.value = brParaIso(caixa.querySelector('[data-data-br]').value);
  try { nativo.showPicker(); } catch { nativo.focus(); nativo.click(); }
});
document.addEventListener('change', ev => {
  const nativo = ev.target;
  if (!nativo?.classList?.contains('data-br-nativo')) return;
  const campo = nativo.closest('.data-br').querySelector('[data-data-br]');
  campo.value = isoParaBr(nativo.value);
  lerData(campo);
  campo.dispatchEvent(new Event('input', { bubbles: true }));
  campo.dispatchEvent(new Event('change', { bubbles: true }));
  campo.focus();
});
