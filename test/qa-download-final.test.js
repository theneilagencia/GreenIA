import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { baixarArtefatosQa } from '../scripts/qa-real-evidencias.mjs';
import { createServer } from 'node:http';
import { navegador } from './ajuda-plataforma.js';
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex'); // fixture de transporte, não imagem visual aprovada
const sha = b => createHash('sha256').update(b).digest('hex');
const resposta = (bytes, status = 200, mime = 'image/png') => ({ status, bytes, headers: { get: () => mime } });
test('cliente HTTP do QA conserva bytes binários sem recodificação UTF-8', async () => {
  const s = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); });
  await new Promise(ok => s.listen(0, '127.0.0.1', ok));
  try { const r = await navegador({}, `http://127.0.0.1:${s.address().port}`, 'localhost').get('/arquivo'); assert.deepEqual(r.bytes, png); }
  finally { await new Promise(ok => s.close(ok)); }
});
test('download preserva bytes da API com hash/MIME iguais aos do banco sem aprovar aparência', async () => {
  const pasta = mkdtempSync('/tmp/qa-download-');
  try {
    const x = await baixarArtefatosQa([{ origem: 'arquivos_gerados', id: 7, sha256: sha(png), mime: 'image/png' }], 4, pasta, async rota => {
      assert.equal(rota, '/api/conversas/4/arquivos/7'); return resposta(png);
    });
    assert.equal(x[0].integridade, 'confere'); assert.equal(x[0].inspecaoVisual, 'pendente');
    assert.deepEqual(readFileSync(join(pasta, x[0].arquivo)), png);
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('download 401, bytes divergentes, texto com MIME de imagem e HTML 200 falham', async () => {
  const pasta = mkdtempSync('/tmp/qa-download-');
  try {
    for (const r of [resposta(png, 401), resposta(Buffer.from('outro')), resposta(Buffer.from('texto')), resposta(Buffer.from('<html>Login</html>'), 200, 'text/html')]) {
      const x = await baixarArtefatosQa([{ origem: 'arquivos_gerados', id: 7, sha256: sha(png), mime: 'image/png' }], 4, pasta, async () => r);
      assert.equal(x[0].integridade, 'falhou'); assert.equal(x[0].arquivo, undefined);
    }
    const visual = await baixarArtefatosQa([{ origem: 'artefatos_visuais', id: 9 }], 4, pasta, async () => resposta(Buffer.from('texto')));
    assert.equal(visual[0].integridade, 'falhou');
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('exportação visual usa rota real de PPTX e não transforma assets isolados em entrega', async () => {
  const pasta = mkdtempSync('/tmp/qa-download-');
  try {
    const x = await baixarArtefatosQa([{ origem: 'artefatos_visuais', id: 9 }, { origem: 'visual_assets', id: 8 }], 4, pasta, async rota => {
      assert.equal(rota, '/api/artefatos/9/baixar?formato=pptx'); return resposta(Buffer.from('PK-ficticio'), 200, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    }, { apresentacao: true });
    assert.equal(x.length, 1); assert.equal(x[0].integridade, 'confere');
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
test('carrossel com várias páginas preserva ZIP, sem tratá-lo como imagem única', async () => {
  const pasta = mkdtempSync('/tmp/qa-download-');
  try {
    const r = await baixarArtefatosQa([{ origem: 'artefatos_visuais', id: 4 }], 2, pasta, async () => resposta(Buffer.from('PK-fixture-zip'), 200, 'application/zip'));
    assert.equal(r[0].integridade, 'confere'); assert.ok(r[0].arquivo.endsWith('.zip')); assert.equal(r[0].inspecaoVisual, 'pendente');
  } finally { rmSync(pasta, { recursive: true, force: true }); }
});
