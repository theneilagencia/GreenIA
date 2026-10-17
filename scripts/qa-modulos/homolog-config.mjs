// Homologação (Etapa 5): o admin muda limites da empresa para o teste e depois restaura os valores originais.
// Uso: rodar homolog-config definir chave=valor [chave=valor...] | rodar homolog-config restaurar
const CHAVES = ['limiteDiarioPessoa', 'tetoPessoaMensal', 'tetoMensal'];
export default async function (c, acao, ...pares) {
  const atual = (await c.api('GET', '/api/admin/config')).dados || {};
  const cfg = atual.config || atual;
  if (!c.estado.configOriginal) c.estado.configOriginal = Object.fromEntries(CHAVES.map(k => [k, cfg[k] ?? 0]));
  const corpo = acao === 'restaurar' ? { ...c.estado.configOriginal }
    : Object.fromEntries(pares.map(p => p.split('=')).filter(([k]) => CHAVES.includes(k)).map(([k, v]) => [k, Number(v)]));
  const r = await c.api('PUT', '/api/admin/config', corpo);
  const depois = (await c.api('GET', '/api/admin/config')).dados || {};
  const d = depois.config || depois;
  c.log('config', acao, r.status, JSON.stringify({ original: c.estado.configOriginal, agora: Object.fromEntries(CHAVES.map(k => [k, d[k]])) }));
  c.salvar(`homolog-config-${acao}-${Date.now()}`, { acao, corpo, status: r.status, agora: Object.fromEntries(CHAVES.map(k => [k, d[k]])) });
}
