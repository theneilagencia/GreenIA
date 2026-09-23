// Contraste texto × fundo das duas páginas, segundo a WCAG 2.x (AA):
// 4,5:1 para texto normal e 3:1 para texto grande (24 px ou mais, ou 18,66 px
// em negrito). Os pares abaixo foram levantados no navegador em todas as telas
// (landing nos dois layouts, login, chat, modal, sidebar no celular e página de
// política), incluindo estados de hover. As cores vêm do :root de cada página,
// então mudar um token sem conferir o contraste quebra o `npm test`.
//
// Ao criar texto novo com outra combinação de cores, acrescente o par aqui.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
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

export const MIN_NORMAL = 4.5;
export const MIN_LARGE = 3;

// [texto, fundo, 'pequeno' | 'grande', onde aparece]
const COMMON = [
  ['--gia-ink', '--gia-paper', 'pequeno', 'texto principal'],
  ['--gia-ink', '--gia-sand', 'pequeno', 'seção areia, chip em hover'],
  ['--gia-ink', '--gia-mint', 'pequeno', 'bolha do usuário, boas tarefas'],
  ['--gia-ink', '--gia-surface', 'pequeno', 'bolha da GreenIA, campo de mensagem'],
  ['--gia-muted', '--gia-paper', 'pequeno', 'texto secundário'],
  ['--gia-muted', '--gia-sand', 'pequeno', 'texto secundário em seção areia'],
  ['--gia-muted', '--gia-surface', 'pequeno', 'placeholder do campo'],
  ['--gia-forest-text', '--gia-paper', 'pequeno', 'rótulos de seção, links'],
  ['--gia-forest-text', '--gia-sand', 'pequeno', 'rótulo "O que é a GreenIA"'],
  ['--gia-forest-text', '--gia-mint', 'pequeno', 'selo "Tarefa verde", fontes da base, numerais dos passos'],
  ['--gia-forest-text', '--gia-sand-hover', 'pequeno', 'link "Ver a política" em hover'],
  ['--gia-forest-text', '--gia-surface', 'pequeno', 'texto verde sobre superfície clara'],
  ['--gia-amber-text', '--gia-paper', 'pequeno', 'rótulo "Amarela"'],
  ['--gia-red-text', '--gia-paper', 'pequeno', 'rótulo "Vermelha"'],
  ['--gia-paper', '--gia-forest-strong', 'pequeno', 'botões verdes (Entrar no chat, Nova conversa)'],
  ['--gia-paper', '--gia-forest-strong-hover', 'pequeno', 'botões verdes em hover'],
  ['--gia-paper', '--gia-deep', 'pequeno', 'texto claro no verde profundo'],
  ['--gia-deep', '--gia-spark', 'pequeno', 'botão verde-limão'],
  ['--gia-deep', '--gia-spark-hover', 'pequeno', 'botão verde-limão em hover'],
  ['--gia-spark', '--gia-deep', 'pequeno', 'link "Ver a política" na sidebar'],
  ['--gia-sage', '--gia-deep', 'pequeno', 'texto secundário na sidebar'],
  ['--gia-leaf', '--gia-deep', 'pequeno', 'rótulo "Recentes"'],
  ['--gia-line', '--gia-deep', 'pequeno', 'texto da sidebar e do rodapé'],
  ['--gia-forest', '--gia-paper', 'grande', 'título em verde ("segurança.")'],
];

const PAGES = {
  'GreenIA.dc.html': [
    ...COMMON,
    ['--gia-ink', '--gia-surface-hover', 'pequeno', 'botão Microsoft em hover'],
  ],
  'Política GreenIA.dc.html': [
    ...COMMON,
    ['--gia-ink', '--gia-red-soft', 'pequeno', 'aviso "O que evitar aqui"'],
    ['--gia-red', '--gia-red-soft', 'pequeno', 'selo "Depende da Anthropic"'],
    ['--gia-ink-soft', '--gia-mint', 'pequeno', 'texto em seção verde clara'],
    ['--gia-sage-soft', '--gia-deep', 'pequeno', 'texto do fechamento'],
    ['--gia-sage-dim', '--gia-deep-2', 'pequeno', 'rodapé'],
    ['--gia-line', '--gia-deep-2', 'pequeno', 'rodapé'],
    ['--gia-spark', '--gia-deep', 'grande', 'numeral "01" dos níveis de acesso'],
    ['--gia-leaf', '--gia-paper', 'grande', 'numerais "02", "03" e das cinco regras'],
  ],
};

// Pares abaixo do mínimo mantidos por decisão pendente. Aparecem como aviso,
// não como erro, e estão no relatório.
const KNOWN_EXCEPTIONS = {
  'Política GreenIA.dc.html|--gia-leaf|--gia-paper': 'numerais decorativos em verde folha (2,6:1); decisão de marca pendente',
};

export function readTokens(src) {
  const block = src.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error(':root não encontrado');
  const tokens = {};
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) tokens[m[1]] = m[2].toUpperCase();
  return tokens;
}

export function checkPage(name, src, pairs = PAGES[name]) {
  const tokens = readTokens(src);
  const results = [];
  for (const [fg, bg, size, where] of pairs) {
    const a = fg.startsWith('#') ? fg : tokens[fg];
    const b = bg.startsWith('#') ? bg : tokens[bg];
    if (!a || !b) {
      results.push({ level: 'erro', msg: `${name}: token inexistente em ${fg} sobre ${bg}` });
      continue;
    }
    const ratio = contrast(a, b);
    const min = size === 'grande' ? MIN_LARGE : MIN_NORMAL;
    if (ratio + 1e-9 >= min) continue;
    const exception = KNOWN_EXCEPTIONS[`${name}|${fg}|${bg}`];
    results.push({
      level: exception ? 'aviso' : 'erro',
      msg: `${name}: ${fg} (${a}) sobre ${bg} (${b}), texto ${size}: ${ratio.toFixed(2)}:1, mínimo ${min}:1 (${where})${exception ? ' [exceção: ' + exception + ']' : ''}`,
    });
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let failed = false;
  let count = 0;
  for (const name of Object.keys(PAGES)) {
    count += PAGES[name].length;
    for (const r of checkPage(name, readFileSync(root + name, 'utf8'))) {
      if (r.level === 'erro') { console.error('erro: ' + r.msg); failed = true; }
      else console.warn('aviso: ' + r.msg);
    }
  }
  if (failed) process.exit(1);
  console.log(`Contraste ok (${count} pares).`);
}
