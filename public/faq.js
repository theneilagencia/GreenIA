import '/surgir.js';

const faq = document.querySelector('.l-faq');
const categorias = faq.querySelector('.l-faq-categorias');
const abas = [...faq.querySelectorAll('[role="tab"]')];
const grupos = [...faq.querySelectorAll('.l-faq-grupo')];
const campo = document.getElementById('faq-busca');
const limpar = document.getElementById('faq-limpar');
const contagem = document.getElementById('faq-contagem');
const vazio = faq.querySelector('.l-faq-vazio');
const normalizar = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
let atual = 0;
function mostrar(indice = atual) {
 atual = indice;
 const termo = normalizar(campo.value);
 let total = 0;
 abas.forEach((aba, i) => { aba.setAttribute('aria-selected', String(!termo && i === atual)); aba.tabIndex = i === atual ? 0 : -1; });
 grupos.forEach((grupo, i) => {
  let encontrados = 0;
  for (const pergunta of grupo.querySelectorAll('details')) {
   const corresponde = !termo || normalizar(pergunta.textContent).includes(termo);
   pergunta.hidden = !corresponde;
   if (corresponde) encontrados++;
  }
  grupo.hidden = termo ? encontrados === 0 : i !== atual;
  grupo.setAttribute('role', termo ? 'region' : 'tabpanel');
  if (!grupo.hidden) total += encontrados;
 });
 faq.classList.toggle('faq-buscando', !!termo);
 limpar.hidden = !campo.value;
 vazio.hidden = total > 0;
 contagem.textContent = termo ? `${total} ${total === 1 ? 'pergunta encontrada' : 'perguntas encontradas'}` : `${total} perguntas neste assunto`;
}
categorias.hidden = false;
faq.querySelector('.l-faq-busca').hidden = false;
faq.classList.add('faq-pronto');
mostrar();
abas.forEach((aba, i) => {
 aba.addEventListener('click', () => { campo.value = ''; mostrar(i); });
 aba.addEventListener('keydown', e => {
  const alvo = e.key === 'ArrowRight' ? (i + 1) % abas.length : e.key === 'ArrowLeft' ? (i - 1 + abas.length) % abas.length : e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : null;
  if (alvo === null) return;
  e.preventDefault(); campo.value = ''; mostrar(alvo); abas[alvo].focus();
 });
});
campo.addEventListener('input', () => mostrar());
limpar.addEventListener('click', () => { campo.value = ''; mostrar(); campo.focus(); });
faq.addEventListener('toggle', e => {
 if (e.target.matches('details[open]')) for (const outro of faq.querySelectorAll('details[open]')) if (outro !== e.target) outro.open = false;
}, true);
const menu = document.querySelector('.l-menu');
if (menu) {
 menu.addEventListener('click', e => { if (e.target.closest('.l-menu-painel a')) menu.open = false; });
 addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
 addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
