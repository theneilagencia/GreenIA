// Código na resposta (site, aplicação, projeto): a GreenIA monta os arquivos de verdade. Um site completo (HTML)
// ganha prévia funcionando, aberta numa página isolada (sandbox: sem cookies, sem acesso à GreenIA, sem rede), e
// todo projeto com mais de um arquivo vira um .zip com a estrutura de pastas. Nada do código é executado no servidor.
import { zipar } from './escritorio.js';

const EXT = { html: 'html', htm: 'html', css: 'css', js: 'js', javascript: 'js', mjs: 'js', jsx: 'jsx', ts: 'ts', typescript: 'ts', tsx: 'tsx', json: 'json', py: 'py', python: 'py',
  sql: 'sql', sh: 'sh', bash: 'sh', shell: 'sh', yaml: 'yml', yml: 'yml', md: 'md', markdown: 'md', txt: 'txt', env: 'env', dockerfile: 'Dockerfile', vue: 'vue', php: 'php', java: 'java', go: 'go', rb: 'rb' };
const NOME = /(?:^|[\s*`#:(])((?:[\w.-]+\/)*[\w.-]+\.(?:html?|css|m?js|jsx|tsx?|json|py|sql|sh|ya?ml|md|txt|env|vue|php|java|go|rb)|Dockerfile|\.env(?:\.example)?)(?=[\s*`:)]|$)/;
const seguro = n => String(n || '').replace(/\\/g, '/').split('/').filter(p => p && p !== '.' && p !== '..').join('/').replace(/[^\w./-]/g, '_').slice(0, 120);

// Blocos de código com o nome do arquivo: da linha logo acima ("### src/app.js", "**index.html**", "`server.js`:")
// ou do comentário na primeira linha ("// server.js", "<!-- index.html -->", "# app.py").
export function blocosDeCodigo(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n'), out = [];
  for (let i = 0; i < linhas.length; i++) {
    const ab = /^\s*```\s*([\w+#.-]*)\s*(.*)$/.exec(linhas[i]);
    if (!ab) continue;
    const lang = ab[1].toLowerCase(), corpo = [];
    let j = i + 1;
    while (j < linhas.length && !/^\s*```\s*$/.test(linhas[j])) corpo.push(linhas[j++]);
    let nome = NOME.exec(ab[2] || '')?.[1] || null;
    for (let k = i - 1, vistos = 0; !nome && k >= 0 && vistos < 2; k--) { if (!linhas[k].trim()) continue; vistos++; nome = NOME.exec(linhas[k])?.[1] || null; }
    if (!nome) { const c = /^\s*(?:\/\/|#|<!--|\/\*)\s*((?:[\w.-]+\/)*[\w.-]+\.\w{1,5})\s*(?:-->|\*\/)?\s*$/.exec(corpo[0] || ''); if (c) nome = c[1]; }
    out.push({ lang, nome: nome ? seguro(nome) : null, codigo: corpo.join('\n') });
    i = j;
  }
  return out;
}

// Página completa para a prévia: o HTML do site com o CSS e o JS dos outros blocos colocados dentro dela.
export function paginaDoSite(blocos) {
  const html = blocos.find(b => /<html[\s>]|<!doctype html/i.test(b.codigo) && (['html', 'htm', ''].includes(b.lang) || /\.html?$/.test(b.nome || '')));
  if (!html) return null;
  let doc = html.codigo;
  const por = n => blocos.find(b => b.nome && (b.nome === n || b.nome.endsWith(`/${n}`)));
  doc = doc.replace(/<link\b[^>]*href=["']([^"':]+\.css)["'][^>]*>/gi, (m, n) => { const b = por(n.replace(/^\.\//, '')); return b ? `<style>\n${b.codigo}\n</style>` : m; });
  doc = doc.replace(/<script\b([^>]*)src=["']([^"':]+\.js)["']([^>]*)>\s*<\/script>/gi, (m, a, n, c) => { const b = por(n.replace(/^\.\//, '')); return b ? `<script${a}${c}>\n${b.codigo.replace(/<\/script/gi, '<\\/script')}\n</script>` : m; });
  // CSS/JS sem nome, em blocos próprios, logo depois do HTML: entram também (é como a resposta costuma vir).
  const soltos = blocos.filter(b => b !== html && !b.nome);
  const css = soltos.filter(b => b.lang === 'css').map(b => `<style>\n${b.codigo}\n</style>`).join('\n');
  const js = soltos.filter(b => ['js', 'javascript'].includes(b.lang)).map(b => `<script>\n${b.codigo.replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');
  if (css) doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, `${css}\n</head>`) : css + doc;
  if (js) doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${js}\n</body>`) : doc + js;
  return doc;
}

// Arquivos do projeto: um por bloco com nome; sem nome, nome pela linguagem (index.html, style.css, script.js...).
export function arquivosDoProjeto(blocos) {
  const usados = new Set(), out = [];
  for (const b of blocos) {
    if (!b.codigo.trim() || ['', 'text', 'plaintext', 'console', 'output'].includes(b.lang) && !b.nome) continue;
    if (!b.nome && ['bash', 'sh', 'shell'].includes(b.lang) && b.codigo.split('\n').length <= 4) continue;   // comandos de instalação soltos
    let nome = b.nome || ({ html: 'index.html', css: 'style.css', js: 'script.js', javascript: 'script.js', json: 'dados.json', py: 'main.py', python: 'main.py', sql: 'schema.sql' }[b.lang] || `arquivo.${EXT[b.lang] || 'txt'}`);
    for (let k = 2; usados.has(nome); k++) nome = nome.replace(/(\.\w+)?$/, m => `-${k}${m}`);
    usados.add(nome);
    out.push({ nome, dados: b.codigo.endsWith('\n') ? b.codigo : `${b.codigo}\n` });
  }
  return out;
}

// O que a resposta gera: { site } (página para a prévia) e/ou { zip } (projeto com 2+ arquivos ou com o site).
export function entregaDeCodigo(texto, { readme = null } = {}) {
  const blocos = blocosDeCodigo(texto);
  if (!blocos.length) return null;
  const site = paginaDoSite(blocos);
  const arquivos = arquivosDoProjeto(blocos);
  if (!site && arquivos.length < 2) return null;
  if (readme && !arquivos.some(a => /^readme\.md$/i.test(a.nome))) arquivos.push({ nome: 'LEIA-ME.md', dados: readme });
  return { site, zip: arquivos.length ? zipar(arquivos) : null, arquivos: arquivos.map(a => a.nome) };
}
