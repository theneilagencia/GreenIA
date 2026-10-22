import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createGunzip, gzipSync, gunzipSync } from 'node:zlib';
import { pedirS3, cifrarBackup, decifrarBackup, ErroBackup, FORMATO } from './backup-s3.js';
import { MAGICO_INCREMENTAL, BLOCO_BYTES, MAX_BLOCOS, MAX_BANCO, indiceIncremental } from './backup-incremental-formato.js';
const hash = d => createHash('sha256').update(d).digest('hex');
const opaco = (k, d) => createHmac('sha256', k).update(d).digest('hex');

async function* dividir(gz) {
  let pendente = Buffer.alloc(0), total = 0;
  for await (const parte of Readable.from([gz]).pipe(createGunzip())) {
    total += parte.length;
    if (total > MAX_BANCO) throw new ErroBackup('INCREMENTAL_LIMITE', 'Banco excede o limite de reconstrução incremental. Cópia local preservada.');
    pendente = Buffer.concat([pendente, parte]);
    while (pendente.length >= BLOCO_BYTES) { yield pendente.subarray(0, BLOCO_BYTES); pendente = pendente.subarray(BLOCO_BYTES); }
  }
  if (pendente.length) yield pendente;
}
const meta = (corpo, claro) => ({ 'x-amz-meta-formato': FORMATO, 'x-amz-meta-sha256': hash(claro), 'x-amz-meta-sha256-cifrado': hash(corpo) });
async function conferir(cfg, objeto, corpo, claro, f) {
  const h = await pedirS3(cfg, 'HEAD', { objeto }, f);
  if (+h.headers.get('content-length') !== corpo.length || h.headers.get('x-amz-meta-sha256-cifrado') !== hash(corpo) || h.headers.get('x-amz-meta-sha256') !== hash(claro))
    throw new ErroBackup('S3_CONFERENCIA', 'Índice ou bloco não confirmado no destino incremental.');
}

export async function enviarIncremental(cfg, { objeto, gz, banco, criadoEm }, f) {
  if (cfg.sse) throw new ErroBackup('INCREMENTAL_DESTINO', 'Modo incremental do Render usa cifra no cliente, sem SSE adicional.');
  // Apenas o receptor que anuncia retenção por referências pode receber blocos.
  const cap = await pedirS3(cfg, 'GET', { query: 'greenia-incremental', aceitar: [400, 404, 501] }, f);
  let capacidade; try { capacidade = JSON.parse(cap.corpo); } catch { /* não suportado */ }
  if (cap.status !== 200 || capacidade?.v !== 1 || capacidade?.retencao !== 'referencias') throw new ErroBackup('INCREMENTAL_DESTINO', 'Destino não suporta backup incremental com retenção segura.');
  const dir = objeto.slice(0, objeto.lastIndexOf('/') + 1), dominio = opaco(cfg.cifra, 'greenia-blocos-v1:' + dir);
  const blocos = [], brutoHash = createHash('sha256');
  let bytes = 0, enviados = 0, reutilizados = 0, bytesEnviados = 0;
  for await (const raw of dividir(gz)) {
    const chave = `${dir}blocos-v1/${dominio}/${opaco(cfg.cifra, raw)}.gz.enc`;
    const sha256 = hash(raw);
    brutoHash.update(raw); bytes += raw.length;
    const h = await pedirS3(cfg, 'HEAD', { objeto: chave, aceitar: [404, 500] }, f);
    if (h.status === 500 && h.headers.get('x-greenia-erro') !== 'CorruptBlock') throw new ErroBackup('S3_HTTP_500', 'Falha ao conferir bloco no destino.');
    if (h.status === 404 || h.status === 500) {
      const claro = gzipSync(raw, { level: 9 }), corpo = cifrarBackup(cfg.cifra, chave, claro);
      const r = await pedirS3(cfg, 'PUT', { objeto: chave, corpo, aceitar: [409], cabecalhos: { ...meta(corpo, claro), 'x-amz-meta-raw-sha256': sha256, 'x-amz-meta-raw-bytes': String(raw.length) } }, f);
      if (r.status === 409) {
        const existente = await pedirS3(cfg, 'HEAD', { objeto: chave }, f);
        if (existente.headers.get('x-amz-meta-raw-sha256') !== sha256 || +existente.headers.get('x-amz-meta-raw-bytes') !== raw.length) throw new ErroBackup('S3_INTEGRIDADE', 'Bloco concorrente divergente.');
        reutilizados++;
      } else { await conferir(cfg, chave, corpo, claro, f); enviados++; bytesEnviados += corpo.length; }
    } else {
      if (h.headers.get('x-amz-meta-raw-sha256') !== sha256 || +h.headers.get('x-amz-meta-raw-bytes') !== raw.length || h.headers.get('x-amz-meta-formato') !== FORMATO)
        throw new ErroBackup('S3_INTEGRIDADE', 'Bloco existente divergente; backup não confirmado.');
      reutilizados++;
    }
    blocos.push({ objeto: chave, bytes: raw.length, sha256 });
  }
  if (!blocos.length || blocos.length > MAX_BLOCOS) throw new ErroBackup('INCREMENTAL_FORMATO', 'Banco incremental vazio ou grande demais.');
  const claro = Buffer.from(JSON.stringify({ v: 1, banco, bytes, sha256: brutoHash.digest('hex'), blocos }));
  const cifrado = cifrarBackup(cfg.cifra, objeto, claro);
  const corpo = Buffer.concat([MAGICO_INCREMENTAL, Buffer.from(JSON.stringify({ v: 1, refs: [...new Set(blocos.map(b => b.objeto))], cifrado: cifrado.toString('base64') }))]);
  indiceIncremental(corpo, objeto);
  await pedirS3(cfg, 'PUT', { objeto, corpo, cabecalhos: { ...meta(corpo, claro), 'x-amz-meta-banco': banco, 'x-amz-meta-criado-em': criadoEm, 'x-amz-meta-incremental': '1' } }, f);
  await conferir(cfg, objeto, corpo, claro, f);
  return { url: `s3://${cfg.bucket}/${objeto}`, objeto, tamanhoCifrado: corpo.length, sha256: hash(gz), sse: null,
    incremental: { blocos: blocos.length, enviados, reutilizados, bytesEnviados: bytesEnviados + corpo.length, bytesBanco: bytes } };
}

export async function reconstruirIncremental(cfg, objeto, corpo, esperado, f) {
  try {
    const indice = indiceIncremental(corpo, objeto);
    const claro = decifrarBackup(cfg.cifra, Buffer.from(indice.cifrado, 'base64'), { nomeEsperado: objeto }).dados;
    if (hash(claro) !== esperado) throw new Error('hash do índice');
    const m = JSON.parse(claro);
    if (m.v !== 1 || !Number.isSafeInteger(m.bytes) || m.bytes < 1 || m.bytes > MAX_BANCO || !/^[a-f0-9]{64}$/.test(m.sha256) ||
        !Array.isArray(m.blocos) || !m.blocos.length || m.blocos.length > MAX_BLOCOS || m.blocos.some((b, i) => !indice.refs.includes(b.objeto) || !Number.isInteger(b.bytes) || b.bytes < 1 || b.bytes > BLOCO_BYTES || (i < m.blocos.length - 1 && b.bytes !== BLOCO_BYTES) || !/^[a-f0-9]{64}$/.test(b.sha256)) ||
        new Set(m.blocos.map(b => b.objeto)).size !== indice.refs.length || m.blocos.reduce((s,b) => s+b.bytes,0) !== m.bytes) throw new Error('formato do índice');
    const partes = []; const h = createHash('sha256');
    for (const b of m.blocos) {
      const r = await pedirS3(cfg, 'GET', { objeto: b.objeto }, f);
      if (r.corpo.length > BLOCO_BYTES + 4096) throw new Error('bloco excede limite');
      if (hash(r.corpo) !== r.headers.get('x-amz-meta-sha256-cifrado')) throw new Error('hash cifrado do bloco');
      const zip = decifrarBackup(cfg.cifra, r.corpo, { nomeEsperado: b.objeto }).dados;
      if (hash(zip) !== r.headers.get('x-amz-meta-sha256')) throw new Error('hash do bloco');
      const raw = gunzipSync(zip, { maxOutputLength: BLOCO_BYTES });
      if (raw.length !== b.bytes || hash(raw) !== b.sha256) throw new Error('bloco alterado');
      partes.push(raw); h.update(raw);
    }
    if (h.digest('hex') !== m.sha256) throw new Error('hash do banco');
    return { gz: gzipSync(Buffer.concat(partes), { level: 9 }), banco: m.banco };
  } catch (e) { throw new ErroBackup('INCREMENTAL_RESTAURACAO', 'Não foi possível reconstruir o backup: índice, bloco ou chave ausente/inválido.', { causa: e.code || 'integridade' }); }
}
