// Sugestões locais: o material do teste não sai do fluxo autorizado de execução.
// Nenhuma sugestão concede ferramentas, permissões ou publica uma versão.
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
