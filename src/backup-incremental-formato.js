// Índice externo contém somente referências opacas; conteúdo e ordem ficam cifrados.
export const MAGICO_INCREMENTAL = Buffer.from('GRNIINC1\n');
export const BLOCO_BYTES = 256 * 1024;
export const MAX_BLOCOS = 2048;
export const MAX_BANCO = BLOCO_BYTES * MAX_BLOCOS;
export const blocoIncremental = chave => /(?:^|\/)blocos-v1\/[a-f0-9]{64}\/[a-f0-9]{64}\.gz\.enc$/.test(chave);
export const ehIncremental = b => b.subarray(0, MAGICO_INCREMENTAL.length).equals(MAGICO_INCREMENTAL);
export function indiceIncremental(corpo, objeto) {
  if (!ehIncremental(corpo) || corpo.length > 4 * 1024 * 1024) throw new Error('Índice incremental inválido');
  const x = JSON.parse(corpo.subarray(MAGICO_INCREMENTAL.length).toString());
  const dir = objeto.slice(0, objeto.lastIndexOf('/') + 1);
  if (!/\/greenia-[a-z0-9_-]+-\d{8}-\d{6}\.sqlite\.gz\.enc$/i.test('/' + objeto) ||
      x.v !== 1 || !Array.isArray(x.refs) || !x.refs.length || x.refs.length > MAX_BLOCOS ||
      new Set(x.refs).size !== x.refs.length || x.refs.some(k => typeof k !== 'string' || k.length > 1024 || !k.startsWith(dir + 'blocos-v1/') || !blocoIncremental(k)) ||
      typeof x.cifrado !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(x.cifrado)) throw new Error('Referências incrementais inválidas');
  return x;
}
