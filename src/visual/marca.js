// Identidade visual dos artefatos. Cada campo resolvido sabe de onde veio:
//   empresa     regra fornecida pela empresa (admin): logo, cores, tipografia, cantos, regras e cores proibidas;
//   preferencia preferência salva pela empresa para os artefatos (não é regra: a regra da empresa vale mais);
//   inferida    inferência temporária desta peça (o pedido disse "em tons de azul"): vale só para este artefato e
//               nunca é gravada como preferência nem como regra;
//   padrao      o sistema visual neutro da GreenIA, quando nada foi informado.
// Ordem: empresa > inferida (pedido desta execução) > preferencia > padrao. A regra da empresa nunca é contrariada
// por um pedido; o pedido de agora vale mais do que uma preferência antiga; nada é apresentado como regra da
// empresa se não veio dela.
import { dadosDaImagem } from './assets.js';
import { renderizavel } from './webp.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const HEX = /^#[0-9a-f]{6}$/i;
const hex = c => { const h = String(c || '').trim(); return /^#[0-9a-f]{3}$/i.test(h) ? `#${[...h.slice(1)].map(x => x + x).join('')}`.toUpperCase() : HEX.test(h) ? h.toUpperCase() : null; };
export const corValida = hex;

// ---- Cor ------------------------------------------------------------------------------------------------------
export const rgb = c => { const h = hex(c) || '#000000'; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
const paraHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const misturar = (a, b, t) => paraHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
export function luminancia(c) {
  return rgb(c).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export const contraste = (a, b) => { const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Texto sobre um fundo: o mais legível entre branco e o texto escuro do tema.
export const sobre = (fundo, escuro = '#14201B') => (contraste(fundo, '#FFFFFF') >= contraste(fundo, escuro) ? '#FFFFFF' : escuro);
// Escurece (ou clareia) uma cor até atingir o contraste pedido contra o fundo. Usada pela correção de contraste.
export function ajustarContraste(cor, fundo, minimo = 4.5) {
  let c = hex(cor) || '#000000';
  const alvo = luminancia(fundo) > 0.4 ? '#000000' : '#FFFFFF';
  for (let i = 0; i < 20 && contraste(c, fundo) < minimo; i++) c = misturar(c, alvo, 0.15);
  return c;
}

// ---- Padrão (neutro e profissional) --------------------------------------------------------------------------
export const PADRAO = {
  cores: { primaria: '#1F3A5F', secundaria: '#3A7CA5', destaque: '#D9822B', fundo: '#FFFFFF', texto: '#18212B' },
  tipografia: { titulos: 'sans', corpo: 'sans' },
  estilo: { cantos: 6 },
};
const CAMPOS_COR = ['primaria', 'secundaria', 'destaque', 'fundo', 'texto'];
export const FAMILIAS_ACEITAS = ['sans', 'serif'];

// Configuração da empresa (config.identidadeVisual), validada. Tudo opcional: nenhuma empresa precisa de brandbook.
//   regras: { cores {..}, tipografia {titulos, corpo}, cantos, logoClaro, logoEscuro, coresProibidas [], regras [] }
//   preferencias: { cores {..}, tipografia {..}, cantos }
export function limparIdentidade(v = {}) {
  const cores = c => Object.fromEntries(CAMPOS_COR.map(k => [k, hex(c?.[k])]).filter(([, x]) => x));
  const tipo = t => Object.fromEntries(['titulos', 'corpo'].map(k => [k, FAMILIAS_ACEITAS.includes(t?.[k]) ? t[k] : null]).filter(([, x]) => x));
  const cantos = x => (Number.isFinite(Number(x)) && x !== '' && x !== null ? Math.max(0, Math.min(24, Math.round(Number(x)))) : null);
  const logo = x => (typeof x === 'string' && /^data:image\/(png|svg\+xml|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x) && x.length <= 400_000 && dadosDaImagem(x) ? x : null);
  const parte = (p, regras) => {
    const o = {};
    const c = cores(p?.cores); if (Object.keys(c).length) o.cores = c;
    const t = tipo(p?.tipografia); if (Object.keys(t).length) o.tipografia = t;
    const k = cantos(p?.cantos); if (k !== null) o.cantos = k;
    if (regras) {
      for (const n of ['logoClaro', 'logoEscuro']) { const l = logo(p?.[n]); if (l) o[n] = l; }
      const proib = [...new Set((Array.isArray(p?.coresProibidas) ? p.coresProibidas : []).map(hex).filter(Boolean))].slice(0, 8);
      if (proib.length) o.coresProibidas = proib;
      const rg = [...new Set((Array.isArray(p?.regras) ? p.regras : []).map(x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 160)).filter(x => x.length >= 3))].slice(0, 8);
      if (rg.length) o.regras = rg;
      const tom = String(p?.tom || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (tom) o.tom = tom;
    }
    return o;
  };
  return { regras: parte(v.regras, true), preferencias: parte(v.preferencias, false) };
}

// Inferência temporária a partir do pedido: cor citada por código (#1A2B3C) ou por nome comum, e estilo sóbrio.
const NOMES_COR = { azul: '#1F4E8C', 'azul marinho': '#1B2A4A', verde: '#2E7D4F', vermelho: '#B3261E', laranja: '#D9822B', roxo: '#5B3E96', amarelo: '#C99A06', preto: '#1A1A1A', cinza: '#4A5560', vinho: '#7A1F3D', rosa: '#C2185B', dourado: '#B8892B' };
export function inferirEstilo(texto) {
  const t = norm(texto);
  const codigos = [...String(texto || '').matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0].toUpperCase());
  const out = {};
  if (codigos.length) { out.cores = { primaria: codigos[0] }; if (codigos[1]) out.cores.secundaria = codigos[1]; }
  else {
    const m = /\b(?:tons? de|cores? |cor |paleta |em )\s*(azul marinho|azul|verde|vermelho|laranja|roxo|amarelo|preto|cinza|vinho|rosa|dourado)\b/.exec(t);
    if (m) out.cores = { primaria: NOMES_COR[m[1]] };
  }
  if (/\b(serifad|classic|elegante|editorial)/.test(t)) out.tipografia = { titulos: 'serif' };
  return out;
}

// Resolve a identidade de um artefato. `cfg`: config da empresa (logo, corMarca, empresa, identidadeVisual).
// Devolve o tema efetivo e a origem de cada campo (para o registro e para quem quiser saber "de onde veio").
export function resolverIdentidade(cfg = {}, { inferida = {} } = {}) {
  const iv = limparIdentidade(cfg.identidadeVisual || {});
  const regras = iv.regras, pref = iv.preferencias;
  const origem = {};
  const pegar = (campo, ...fontes) => {
    for (const [nome, valor] of fontes) if (valor !== undefined && valor !== null && valor !== '') { origem[campo] = nome; return valor; }
    return undefined;
  };
  const corEmpresa = hex(cfg.corMarca);
  const proibidas = new Set(regras.coresProibidas || []);
  const livre = c => (c && !proibidas.has(c) ? c : null);
  const cores = {};
  for (const k of CAMPOS_COR) {
    cores[k] = pegar(`cores.${k}`, ['empresa', regras.cores?.[k] ?? (k === 'primaria' ? corEmpresa : null)], ['inferida', livre(hex(inferida.cores?.[k]))],
      ['preferencia', livre(pref.cores?.[k])], ['padrao', PADRAO.cores[k]]);
  }
  // A inferência nunca troca uma cor que a empresa definiu, nem usa uma cor proibida pela empresa.
  if (proibidas.has(cores.primaria)) { cores.primaria = PADRAO.cores.primaria; origem['cores.primaria'] = 'padrao'; }
  const tipografia = {
    titulos: pegar('tipografia.titulos', ['empresa', regras.tipografia?.titulos], ['inferida', inferida.tipografia?.titulos], ['preferencia', pref.tipografia?.titulos], ['padrao', PADRAO.tipografia.titulos]),
    corpo: pegar('tipografia.corpo', ['empresa', regras.tipografia?.corpo], ['preferencia', pref.tipografia?.corpo], ['padrao', PADRAO.tipografia.corpo]),
  };
  const cantos = pegar('estilo.cantos', ['empresa', regras.cantos], ['preferencia', pref.cantos], ['padrao', PADRAO.estilo.cantos]);
  // Logo: só o que a empresa forneceu. Sem logo, nenhum logo (nunca um símbolo inventado).
  const logoPrincipal = typeof cfg.logo === 'string' && cfg.logo.startsWith('data:image/') ? cfg.logo : null;
  const logo = logoPrincipal || regras.logoEscuro || regras.logoClaro || null;
  origem.logo = logo ? 'empresa' : 'ausente';
  const info = l0 => { const l = l0 && renderizavel(l0), d = l && dadosDaImagem(l); return d && d.w && d.h ? { dataUrl: l, mime: d.mime, w: d.w, h: d.h } : null; };
  return {
    empresa: String(cfg.empresa || '').trim().slice(0, 80) || null,
    cores, tipografia, cantos,
    logo: info(logo), logoClaro: info(regras.logoClaro || null),
    coresProibidas: [...proibidas], regras: regras.regras || [], tom: regras.tom || null,
    origem,
  };
}

// Tema derivado (o que a composição usa): cores de superfície, linha, texto suave e texto sobre a cor principal,
// sempre com contraste mínimo. Nada aqui inventa regra: deriva das cores resolvidas.
export function tema(id) {
  const c = id.cores;
  const fundo = c.fundo, texto = contraste(c.texto, fundo) >= 7 ? c.texto : ajustarContraste(c.texto, fundo, 7);
  const primaria = c.primaria;
  return {
    fundo, texto,
    suave: ajustarContraste(misturar(texto, fundo, 0.35), fundo, 4.6),
    primaria, secundaria: c.secundaria, destaque: c.destaque,
    // Cor principal usada como texto sobre o fundo (títulos, números): com contraste de texto grande, no mínimo.
    primariaTexto: ajustarContraste(primaria, fundo, 4.5),
    sobrePrimaria: sobre(primaria, texto),
    superficie: misturar(fundo, primaria, luminancia(fundo) > 0.5 ? 0.05 : 0.12),
    superficie2: misturar(fundo, primaria, luminancia(fundo) > 0.5 ? 0.11 : 0.2),
    linha: misturar(fundo, texto, 0.16),
    serie: [primaria, c.secundaria, c.destaque, misturar(primaria, fundo, 0.45), misturar(c.secundaria, texto, 0.35), misturar(c.destaque, fundo, 0.4)],
    cantos: id.cantos,
    fonteTitulos: id.tipografia.titulos, fonteCorpo: id.tipografia.corpo,
  };
}
