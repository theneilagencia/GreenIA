// Checagens estáticas dos templates .dc.html, para os dois defeitos que a
// Fase 1 encontrou fora da lista não voltarem sem ninguém perceber:
//
// 1. style-hover (e qualquer style-<pseudo>) com {{ }}: o runtime passa o
//    valor cru para a folha de pseudo-classes e gera uma regra vazia.
// 2. Valor, handler ou ref usado no template que não sai de renderVals()
//    (nem é prop declarado, nem variável de <sc-for>): renderiza vazio sem erro.
//    Foi assim que a rolagem automática ficou morta (msgRef).
//
// Também avisa quando um style-<pseudo> redefine uma propriedade que o próprio
// elemento já tem no style inline sem !important (o inline venceria).
//
// Limites: a checagem é textual. Olha só o primeiro identificador de cada
// expressão (em "m.onRetry" confere "m", não "onRetry"); não sabe se o valor é
// do tipo certo; lê as chaves de renderVals() contando chaves por linha, então
// supõe que o objeto retornado não tem "{" ou "}" dentro de strings.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['GreenIA.dc.html', 'Política GreenIA.dc.html'];
const LITERALS = new Set(['true', 'false', 'null', 'undefined']);

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// Chaves do objeto retornado por renderVals() (nível 1 do `return {`).
function renderValsKeys(js) {
  const at = js.indexOf('renderVals()');
  if (at === -1) return null;
  const ret = js.indexOf('return {', at);
  const keys = new Set();
  let depth = 0;
  for (const line of js.slice(ret).split('\n')) {
    if (depth === 1) {
      const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*(?::|,|$)/);
      if (m && !/^\s*\/\//.test(line)) keys.add(m[1]);
    }
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth <= 0 && keys.size) break;
  }
  return keys;
}

export function checkTemplate(name, src) {
  const errors = [];
  const warnings = [];
  const open = src.indexOf('<x-dc>');
  const close = src.lastIndexOf('</x-dc>');
  if (open === -1 || close === -1) return { errors: [`${name}: bloco <x-dc> não encontrado`], warnings };
  const tpl = src.slice(open, close);
  const scriptTag = src.match(/<script[^>]*data-dc-script[^>]*>/);
  const js = scriptTag ? src.slice(src.indexOf(scriptTag[0]) + scriptTag[0].length) : '';
  const propsRaw = scriptTag && scriptTag[0].match(/data-props="([^"]*)"/);
  const props = propsRaw ? Object.keys(JSON.parse(decodeEntities(propsRaw[1]))).filter(k => k[0] !== '$') : [];

  // 1) {{ }} dentro de style-<pseudo>, e conflito com o inline sem !important
  for (const m of tpl.matchAll(/<[a-z][\w-]*\b([^>]*)>/gi)) {
    const attrs = m[1];
    const inline = (attrs.match(/\sstyle="([^"]*)"/) || [])[1] || '';
    for (const p of attrs.matchAll(/\s(style-[\w:()-]+)="([^"]*)"/g)) {
      if (p[2].includes('{{')) {
        errors.push(`${name}: ${p[1]}="${p[2]}" usa {{ }}; o runtime não resolve binding ali (use CSS literal)`);
        continue;
      }
      for (const decl of p[2].split(';')) {
        const prop = decl.split(':')[0].trim();
        if (!prop || /!important/.test(decl)) continue;
        if (new RegExp(`(^|;)\\s*${prop}\\s*:`).test(inline)) {
          warnings.push(`${name}: ${p[1]} redefine "${prop}", que já está no style inline; sem !important o hover não aparece`);
        }
      }
    }
  }

  // 2) identificadores usados no template x o que existe
  const keys = renderValsKeys(js);
  if (keys === null) {
    if (/\{\{/.test(tpl.replace(/<helmet>[\s\S]*?<\/helmet>/, ''))) errors.push(`${name}: template usa {{ }} mas não há renderVals()`);
    return { errors, warnings };
  }
  const loopVars = new Set([...tpl.matchAll(/<sc-for\b[^>]*\bas="([\w$]+)"/g)].map(m => m[1]));
  loopVars.add('$index');
  const known = new Set([...keys, ...props, ...loopVars, ...LITERALS]);
  const missing = new Map();
  for (const m of tpl.matchAll(/\{\{([\s\S]+?)\}\}/g)) {
    const head = m[1].trim().replace(/^!+\s*/, '').match(/^[A-Za-z_$][\w$]*/);
    if (!head || known.has(head[0])) continue;
    // Contexto: nome do atributo, se for um (onClick="{{ x }}", ref="{{ y }}").
    const before = tpl.slice(Math.max(0, m.index - 40), m.index);
    const attr = (before.match(/\s([\w:-]+)="[^"]*$/) || [])[1] || 'texto';
    if (!missing.has(head[0])) missing.set(head[0], attr);
  }
  for (const [id, attr] of missing) {
    errors.push(`${name}: {{ ${id} }} (${attr}) não sai de renderVals(), não é prop declarado nem variável de <sc-for>`);
  }
  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const f of FILES) {
    const { errors, warnings } = checkTemplate(f, readFileSync(root + f, 'utf8'));
    for (const w of warnings) console.warn('aviso: ' + w);
    for (const e of errors) { console.error('erro: ' + e); failed = true; }
  }
  if (failed) process.exit(1);
  console.log('Templates .dc.html ok.');
}
