// Parser e CSV compartilhados pelo navegador e pelo download autenticado.
export const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
export const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');

export function extrairTabelas(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n'), tabelas = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!ehTabela(linhas[i], linhas[i + 1])) continue;
    const tabela = [celulas(linhas[i])];
    i += 2;
    while (i < linhas.length && /^\s*\|/.test(linhas[i])) tabela.push(celulas(linhas[i++]));
    i--;
    tabelas.push(tabela);
  }
  return tabelas;
}

export function gerarCsv(linhas) {
  const numero = s => /^[-+]?\s?(R\$\s?)?\d[\d.,\s]*%?$/.test(s);
  const cel = v => {
    let s = String(v ?? '');
    if (/^\s*[=+\-@]/.test(s) && !numero(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
}
