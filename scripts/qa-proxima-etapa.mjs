// Executar no Shell existente: consultas financeiras e somente duas entregas visuais sintéticas.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
export async function carregarVerificado(commit, nome, esperado, obter = fetch) {
  if (!/^[a-f0-9]{40}$/.test(commit || '') || !/^qa-[a-z-]+\.mjs$/.test(nome)) throw new Error('Referência inválida');
  const r = await obter(`https://raw.githubusercontent.com/theneilagencia/GreenIA/${commit}/scripts/${nome}`, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Download do módulo falhou: ${r.status}`);
  const s = await r.text();
  if (sha(s) !== esperado) throw new Error('Módulo diferente do verificado');
  return import('data:text/javascript;base64,' + Buffer.from(s).toString('base64'));
}
export async function executar(commit) {
  const financeiro = await carregarVerificado(commit, 'qa-consultar-recibo.mjs', '650b873d8beeb052484c743289e521cd16b5710cd50d5b66157e45f5ddba06eb');
  const bootstrap = await carregarVerificado(commit, 'qa-baixar-candidata.mjs', 'cfb78f57eb667662770284863e78b11d0b10fb8422b7a4632b29911074808c6f');
  // Ambos os relatórios são selados antes de consultar a credencial ou a API do provedor.
  const consultas = [
    { rodada: '/tmp/greenia-candidata-V11q6V/qa-candidato-saida/2026-10-18T14-15-42-857Z', hashAnterior: 'dc28cfeaa16cc63e63521299ebbe9e27ccc1de4f13e31f8cff6ea3826590f0ad' },
    { rodada: '/tmp/greenia-candidata-QlzQ2v/qa-candidato-saida/2026-10-18T12-56-50-298Z', hashAnterior: '9da5c1fcfdd431fe9cd5d83275e6185cea1f2fca4a9fa60957bf0b81f47ebe4c' },
  ];
  for (const c of consultas) if (sha(readFileSync(c.rodada + '/relatorio.json')) !== c.hashAnterior) throw new Error('Relatório financeiro diferente do esperado');
  for (const c of consultas) {
    const r = JSON.parse(readFileSync(c.rodada + '/relatorio.json', 'utf8'));
    console.log('LANCAMENTOS_PENDENTES', JSON.stringify((r.recibos || []).map((x, indice) => ({ ...x, indice })).filter(x => x.custo == null).map(x => ({
      hashRelatorio: c.hashAnterior, indice: x.indice, geracao: x.geracao || null,
      modelo: x.modeloResposta || x.modelo || null, tipo: x.tipo || null, rotulo: x.rotulo || null,
      status: x.status ?? null, inicio: x.t0 ?? null, formatoResposta: x.formatoResposta || null,
    }))));
    await financeiro.consultar(c);
  }
  console.log('Consultas financeiras não alteram os relatórios originais. Pendências históricas continuam separadas da nova execução.');
  await bootstrap.executar(commit, {
    retomar: '/tmp/greenia-candidata-zHOUrg/qa-candidato-saida/2026-10-18T22-16-08-670Z',
    hashAnterior: '8dafb4e66e3eed9b954f234b1ead98fb1c087e231333d11bfeb3fa6834bf87e5',
    revalidarArquivos: true, limiteReservaUsd: 2,
  });
}
