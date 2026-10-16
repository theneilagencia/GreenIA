// Parser e CSV compartilhados pelo navegador e pelo download autenticado.
export const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
export const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');

export function extrairTabelas(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n'), tabelas = [];
  for (let i = 0; i < linhas.length; i++) {
    // Tabela dentro de bloco de código não é tabela (o md.js também a mostra como código): pular mantém o índice
    // do download igual ao da tela.
    if (/^\s*```/.test(linhas[i])) { i++; while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) i++; continue; }
    if (!ehTabela(linhas[i], linhas[i + 1])) continue;
    const tabela = [celulas(linhas[i])];
    i += 2;
    while (i < linhas.length && /^\s*\|/.test(linhas[i])) tabela.push(celulas(linhas[i++]));
    i--;
    tabelas.push(tabela);
  }
  return tabelas;
}

// Nome de cada tabela (mesma ordem de extrairTabelas): o título logo acima dela ("### Premissas", "**Premissas**"),
// usado como nome da aba na planilha e nas referências entre abas das fórmulas.
export function nomesDasTabelas(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n'), nomes = [];
  for (let i = 0; i < linhas.length; i++) {
    if (/^\s*```/.test(linhas[i])) { i++; while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) i++; continue; }
    if (!ehTabela(linhas[i], linhas[i + 1])) continue;
    let nome = null;
    for (let k = i - 1, vistos = 0; k >= 0 && vistos < 3; k--) {
      const l = linhas[k].trim();
      if (!l) continue;
      vistos++;
      const m = /^#{1,6}\s+(.+?)\s*#*$/.exec(l) || /^\*\*([^*]+)\*\*:?$/.exec(l);
      if (m) { nome = m[1].replace(/[*_`]/g, '').replace(/^(aba|planilha|tabela)\s*[:\-–]\s*/i, '').trim(); break; }
      if (/^\s*\|/.test(l)) break;
    }
    nomes.push(nome);
    i += 2;
    while (i < linhas.length && /^\s*\|/.test(linhas[i])) i++;
    i--;
  }
  return nomes;
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
