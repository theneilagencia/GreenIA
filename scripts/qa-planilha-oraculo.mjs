// Conferência independente da resposta de IA para a planilha sintética do QA, não um parser financeiro genérico.
import { numero } from '../src/planilha.js';
export function verificarPlanilhaQa(texto, tabela) {
  const dados = tabela.slice(1).filter(l => typeof l[5] === 'number');
  const total = dados.reduce((s, l) => s + l[5], 0);
  const porId = new Map(dados.map(l => [l[0], l]));
  const top = [...dados].sort((a, b) => b[5] - a[5]).slice(0, 5).map(l => l[0]);
  const falhas = [], secoes = [...String(texto).matchAll(/^#{2,3}\s+(?:Ranking (?:dos?|das?)\s+)?[Mm]aiores (?:despesas|gastos)[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gmi)];
  let verificados = 0;
  for (const secao of secoes) {
    const ls = secao[1].split('\n').filter(l => /^\s*\|/.test(l));
    const celulas = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.replace(/\*\*/g, '').trim());
    if (ls.length) {
      const cab = celulas(ls[0]), v = cab.findIndex(c => /realizado/i.test(c)), p = cab.findIndex(c => /%|percentual/i.test(c));
      const linhas = ls.slice(2).map(celulas), ids = linhas.map(c => c.join(' ').match(/\bL\d{3}\b/)?.[0]).filter(Boolean);
      if (v < 0 || p < 0 || ids.length < 5) { falhas.push('Ranking da planilha sem cinco lançamentos, valor e percentual verificáveis'); continue; }
      if (ids.slice(0, 5).join(',') !== top.join(',')) falhas.push('Maiores gastos não seguem os cinco maiores valores em ordem decrescente');
      for (const linha of linhas) {
        const id = linha.join(' ').match(/\bL\d{3}\b/)?.[0], fonte = porId.get(id);
        if (!fonte) { falhas.push(`Lançamento sem origem verificável: ${id || 'ausente'}`); continue; }
        if (numero(linha[v]) !== fonte[5]) falhas.push(`Valor realizado divergente: ${id}`);
        const percentual = numero(linha[p]);
        if (percentual === null || Math.abs(percentual - fonte[5] / total * 100) > 0.005000001) falhas.push(`Percentual divergente: ${id}`);
        verificados++;
      }
    }
    const lista = [...secao[1].matchAll(/^\s*\d+\.\s+\*?\*?(L\d{3})\b/gm)].map(m => m[1]);
    if (lista.length && lista.slice(0, 5).join(',') !== top.join(',')) falhas.push('Lista de maiores gastos contradiz a ordenação calculada');
  }
  if (!verificados) falhas.push('Ranking e percentuais da planilha não foram verificados independentemente');
  return { totalRealizadoConhecido: total, top5: top, lancamentosVerificados: verificados, falhas: [...new Set(falhas)] };
}
