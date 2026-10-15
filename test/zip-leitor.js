// Leitor de ZIP mínimo (diretório central), para conferir pacotes do Office nos testes sem biblioteca.
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';

export function deszipar(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fim + 10), inicio = buf.readUInt32LE(fim + 16), out = new Map();
  for (let p = inicio, k = 0; k < total; k++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), coment = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), dados = buf.subarray(ini, ini + comp);
    out.set(nome, (metodo === 8 ? inflateRawSync(dados) : dados).toString('utf8'));
    p += 46 + nl + extra + coment;
  }
  return out;
}
