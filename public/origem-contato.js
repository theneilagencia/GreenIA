// Metadados comerciais opcionais; nunca concedem acesso nem alteram a política da aplicação.
export const CAMPOS_ORIGEM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'pagina_entrada', 'referrer'];
export function limparOrigem(valor = {}) {
  const origem = {};
  for (const k of CAMPOS_ORIGEM) {
    const v = typeof valor?.[k] === 'string' ? valor[k].replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300) : '';
    if (v) origem[k] = v;
  }
  return origem;
}
export function resumoOrigem(valor = {}) {
  const o = limparOrigem(valor);
  if (!Object.keys(o).length) return 'Origem: não informada';
  return 'Origem: ' + [o.utm_source, o.utm_medium, o.utm_campaign].filter(Boolean).join(' / ')
    + (o.utm_term ? ` / termo: ${o.utm_term}` : '')
    + ['gclid', 'gbraid', 'wbraid'].filter(k => o[k]).map(k => ` / ${k}: sim`).join('');
}
