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
    '--deep': misturar(c, '#000000', 0.68), '--mint': misturar(c, '#FAF7EF', 0.94), '--leaf': misturar(c, '#FAF7EF', 0.3), '--disabled': misturar(c, '#FAF7EF', 0.55), '--sage': misturar(c, '#FAF7EF', 0.55),
  };
  for (const [k, v] of Object.entries(tons)) raiz.setProperty(k, v);
}

// Logo da empresa ao lado da marca, num fundo claro para funcionar também na barra escura.
export const logoEmpresa = p => (p.logo ? `<img class="logo-empresa" src="${esc(p.logo)}" alt="${esc(p.empresa || 'Empresa')}">` : '');

export const marcaHtml = (escuro = false) => `<img src="/assets/greenia-symbol-${escuro ? 'spark' : 'forest'}.svg" width="32" height="32" alt="" aria-hidden="true"><span>Green<span class="ia">IA</span></span>`;

export function toast(texto, ms = 4000) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = texto;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
