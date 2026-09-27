// Funções comuns das páginas: chamada à API com CSRF, escape e ícones.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let csrf = '';
// Unidade dos valores de consumo: dólar (sem plano, ou operador) ou créditos (empresa com plano).
let unidade = 'usd';
export const definirUnidade = u => { unidade = u === 'creditos' ? 'creditos' : 'usd'; };
export const emCreditos = () => unidade === 'creditos';
export function fmtCusto(v, { conversa = false } = {}) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return conversa ? 'sem estimativa' : '—';
  const n = Number(v);
  if (unidade === 'creditos') {
    if (conversa) { const c = Math.max(1, Math.round(n)); return `cerca de ${c} ${c === 1 ? 'crédito' : 'créditos'}`; }
    const t = n < 10 && n % 1 ? n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString('pt-BR');
    return `${t} ${n === 1 ? 'crédito' : 'créditos'}`;
  }
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 })}`;
}
export const definirCsrf = t => { csrf = t; };

export async function api(caminho, { metodo = 'GET', corpo, bruto = false } = {}) {
  const r = await fetch(caminho, {
    method: metodo, credentials: 'same-origin',
    headers: { ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...(metodo !== 'GET' ? { 'x-csrf': csrf } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (bruto) return r;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !caminho.startsWith('/api/login')) { location.href = '/entrar'; throw new Error('sem sessão'); }
  if (!r.ok) { const e = new Error(dados.mensagem || 'Algo deu errado.'); Object.assign(e, dados, { status: r.status }); throw e; }
  return dados;
}

const svg = (d, w = 1.7) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONE = {
  seta: svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', 1.8),
  voltar: svg('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>', 1.8),
  enviar: svg('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>', 1.9),
  mais: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  fechar: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  menu: svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
  sair: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>', 1.6),
  escudo: svg('<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>', 1.5),
  check: svg('<path d="M20 6L9 17l-5-5"/>', 1.6),
  doc: svg('<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/>', 1.6),
  clipe: svg('<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>', 1.6),
  cadeado: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 1.6),
  lapis: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 1.6),
  lixo: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 1.6),
  engrenagem: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>', 1.6),
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 1.7),
  // Navegação: um ícone por seção, para varrer a lateral sem ler.
  visao: svg('<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>', 1.5),
  conversa: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>', 1.5),
  raio: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', 1.5),
  livro: svg('<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13"/>', 1.5),
  grafico: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', 1.5),
  pessoas: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>', 1.5),
  cubo: svg('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>', 1.5),
  atividade: svg('<path d="M22 12h-4l-3 8-6-16-3 8H2"/>', 1.5),
  chave: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>', 1.5),
  pincel: svg('<path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L11 15.8 8.2 13z"/><path d="M8 14c-2.5 0-4 1.8-4 4 0 1.5-1 2.5-2 3 3 .5 7-.5 7-4"/>', 1.5),
  pagina: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M8 13h8M8 17h5"/>', 1.5),
  link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', 1.5),
  predio: svg('<path d="M4 21V5l8-3v19M12 8l8 3v10M8 9v.01M8 13v.01M8 17v.01M16 14v.01M16 18v.01M2 21h20"/>', 1.5),
  pacote: svg('<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>', 1.5),
  servidor: svg('<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>', 1.5),
  lista: svg('<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', 1.7),
};

export async function preencherMarca() {
  const p = await fetch('/api/publico').then(r => r.json()).catch(() => ({}));
  document.querySelectorAll('[data-empresa]').forEach(e => { e.textContent = p.empresa || 'sua empresa'; });
  document.querySelectorAll('[data-privacidade]').forEach(e => { e.textContent = p.privacyNote || ''; });
  aplicarMarca(p);
  document.querySelectorAll('.marca').forEach(m => m.insertAdjacentHTML('afterend', logoEmpresa(p)));
  return p;
}

// Esquema de cor da empresa, a partir da cor de marca (conferida no servidor: 4,5:1
// com os fundos claros). Tons escuros para lateral, entrada e rodapé; tom claro
// para bolhas e destaques. Sem cor de marca, fica o verde da GreenIA.
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export const misturar = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
export function aplicarMarca(p) {
  if (!/^#[0-9a-f]{6}$/i.test(p.corMarca || '')) return;
  const c = p.corMarca, raiz = document.documentElement.style;
  const tons = {
    '--forest': c, '--forest-hover': misturar(c, '#000000', 0.12), '--forest-text': c,
    '--forest-strong': c, '--forest-strong-hover': misturar(c, '#000000', 0.18),
    '--deep': misturar(c, '#000000', 0.7), '--mint': misturar(c, '#FFFFFF', 0.94), '--leaf': misturar(c, '#FFFFFF', 0.3), '--disabled': misturar(c, '#FFFFFF', 0.55), '--sage': misturar(c, '#FFFFFF', 0.55),
  };
  for (const [k, v] of Object.entries(tons)) raiz.setProperty(k, v);
}

// Logo da empresa ao lado da marca, num fundo claro para funcionar também na barra escura.
export const logoEmpresa = p => (p.logo ? `<img class="logo-empresa" src="${esc(p.logo)}" alt="${esc(p.empresa || 'Empresa')}">` : '');

export const marcaHtml = () => '<img src="/assets/greenia-marca.svg" width="26" height="26" alt="" aria-hidden="true"><span>Green<span class="ia">IA</span></span>';

// Aviso discreto no canto. Tipo: 'ok' (padrão), 'erro' ou 'info'. Erros ficam mais tempo na tela.
export function toast(texto, ms, tipo) {
  if (typeof ms === 'string') { tipo = ms; ms = undefined; }
  tipo = tipo || (ms >= 6000 ? 'erro' : 'ok');
  for (const antigo of document.querySelectorAll('.toast')) antigo.remove();   // um aviso por vez, sem sobrepor
  const t = document.createElement('div');
  t.className = `toast ${tipo}`; t.setAttribute('role', tipo === 'erro' ? 'alert' : 'status'); t.textContent = texto;
  document.body.append(t);
  setTimeout(() => t.remove(), ms || (tipo === 'erro' ? 6500 : 3600));
}

// Carregando: esqueleto no lugar do conteúdo.
export const carregandoHtml = () => '<div class="esqueleto" aria-busy="true" aria-label="Carregando"><i></i><i></i><i></i><i></i><i></i></div>';

// Estado vazio: o que é, por que está vazio e qual o próximo passo.
export const vazioHtml = ({ icone = 'lista', titulo, texto = '', acao = '' }) => `<div class="vazio">${ICONE[icone] || ''}<b>${esc(titulo)}</b>${texto ? `<p>${esc(texto)}</p>` : ''}${acao}</div>`;

// Botão ocupado enquanto a ação roda: impede clique duplo e mostra que algo está acontecendo.
export async function ocupado(botao, fn) {
  if (!botao) return fn();
  botao.setAttribute('aria-busy', 'true'); botao.disabled = true;
  try { return await fn(); } finally { botao.removeAttribute('aria-busy'); botao.disabled = false; }
}

// Tabelas no celular viram listas: cada célula ganha o nome da coluna (data-r) a partir do cabeçalho.
function rotularTabelas(raiz = document) {
  for (const t of raiz.querySelectorAll('table.tabela')) {
    const cab = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!cab.length) continue;
    for (const tr of t.querySelectorAll('tbody tr')) {
      let i = 0;
      for (const td of tr.children) { if (!td.hasAttribute('data-r')) td.setAttribute('data-r', cab[i] || ''); i += Number(td.getAttribute('colspan') || 1); }
    }
  }
}
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  let agendado = false;
  new MutationObserver(() => { if (!agendado) { agendado = true; requestAnimationFrame(() => { agendado = false; rotularTabelas(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
}

// Transição de tela: durante a troca de rota, o conteúdo novo entra em cascata (ver "Movimento" no CSS).
// Renderizações depois disso (salvar, atualizar) não animam.
let tokenTransicao = 0;
export function transicao() {
  const t = ++tokenTransicao;
  const limpar = () => { if (t === tokenTransicao) delete document.body.dataset.transicao; };
  document.body.dataset.transicao = '';
  setTimeout(limpar, 2500);
  return () => setTimeout(limpar, 500);
}
