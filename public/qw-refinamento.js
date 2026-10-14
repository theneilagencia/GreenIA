// Sugestões locais: o material do teste não sai do fluxo autorizado de execução.
// Nenhuma sugestão concede ferramentas, permissões ou publica uma versão.
// Contrato explícito em linguagem comum. Não infere nomes de colunas: exige uma
// lista nomeada pela pessoa e conserva sua redação. Compartilhado com o servidor.
export function contratoTabelaRefinamento(texto = '') {
  const t = String(texto).trim();
  const exclusivo = /\b(?:somente|apenas|exclusivamente|só|so)\s+(?:(?:a|uma|o|um)\s+)?tabela\b/i.test(t)
    || /\btabela\s+(?:somente|apenas|exclusiva)\b/i.test(t);
  const m = /\bcolunas?\s*(?:exatamente\s+)?[:：]\s*([^.;\n]+)/i.exec(t)
    || /\btabela\s+com\s+(?:(?:exatamente|somente|apenas)\s+)?(?:(?:as|estas)\s+)?(?:colunas?\s*[:：]?\s*)?([^.;\n]+)/i.exec(t);
  if (!m) return exclusivo ? { exclusivo, colunas: [] } : null;
  const lista = m[1].split(/,\s*(?:com|sem|para|contendo)\b/i)[0];
  const colunas = lista.split(/\s*\|\s*|\s*,\s*|\s+e\s+/).map(c => c.replace(/^["“]|["”]$/g, '').trim());
  if (colunas.length < 2 || colunas.length > 8 || colunas.some(c => !c || c.length > 40 || /\b(?:remova|retire|não|nao|somente)\b/i.test(c))) return exclusivo ? { exclusivo, colunas: [] } : null;
  return { exclusivo, colunas };
}
export function orientacaoContratoTabela(contrato) {
  return contrato.colunas.length ? `${contrato.exclusivo ? 'Somente uma tabela' : 'Tabela'}, com as colunas: ${contrato.colunas.join(' | ')}.` : 'Somente uma tabela.';
}
export function sugerirRefinamento({ descricao = '', processo = '', proprias = [], formatoDescricao = '', resultado, feedback }) {
  const texto = String(feedback || '').trim().replace(/\s+/g, ' ');
  if (texto.length < 3 || texto.length > 1000) throw new Error('Descreva o que precisa mudar em 3 a 1000 caracteres.');
  const problemas = (resultado?.qualidade?.problemas || []).filter(p => typeof p === 'string');
  const motivo = problemas.length ? `A conferência apontou: ${problemas.join('; ')}. Sua orientação: ${texto}` : `Sua orientação sobre o resultado: ${texto}`;
  return [
    { campo: 'objetivo', rotulo: 'Objetivo', antes: descricao, depois: `${descricao}\nResultado esperado: ${texto}`, max: 1000, motivo },
    { campo: 'processo', rotulo: 'Processo', antes: processo, depois: [processo, `Antes de entregar, verificar: ${texto}`].filter(Boolean).join('\n'), max: 3000, motivo },
    { campo: 'regras', rotulo: 'Regras', antes: proprias.join('\n'), depois: texto, max: 160, motivo, adicao: true },
    { campo: 'entregaveis', rotulo: 'Entregáveis', antes: formatoDescricao, depois: [formatoDescricao, texto].filter(Boolean).join('\n'), max: 200, motivo },
  ];
}

export function validarAlteracoes(sugestoes, selecao, proprias = []) {
  const aprovadas = sugestoes.filter(s => Object.hasOwn(selecao, s.campo)).map(s => ({ ...s, depois: String(selecao[s.campo]).trim() }));
  if (!aprovadas.length) throw new Error('Selecione pelo menos uma alteração para aprovar.');
  for (const s of aprovadas) {
    if (!s.depois || s.depois.length > s.max) throw new Error(`${s.rotulo}: preencha até ${s.max} caracteres.`);
    if (s.campo === 'regras' && proprias.length >= 5 && !proprias.some(p => p.toLowerCase() === s.depois.toLowerCase())) throw new Error('As cinco regras próprias já estão preenchidas. Revise uma delas na etapa Regras.');
  }
  return aprovadas;
}
