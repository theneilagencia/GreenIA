// Administradores da plataforma listados num arquivo do repositório entram no console.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lerAdminsArquivo } from '../src/iniciar.js';
import { subirPlataforma } from './ajuda-plataforma.js';

test('lista de administradores em arquivo: um email por linha, comentários e linhas inválidas ignorados', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gia-adm-'));
  const arq = join(pasta, 'admins.txt');
  writeFileSync(arq, '# comentário\nDona@Plataforma.com  # a dona\n\nnao-e-email\noutra@plataforma.com\n');
  assert.deepEqual(lerAdminsArquivo(arq), ['dona@plataforma.com', 'outra@plataforma.com']);
  assert.deepEqual(lerAdminsArquivo(join(pasta, 'nao-existe.txt')), []);
  const S = await subirPlataforma({ admins: lerAdminsArquivo(arq) });
  try {
    const n = S.navegador();
    assert.equal((await n.post('/api/plataforma/login/codigo', { email: 'dona@plataforma.com' })).status, 200);
    assert.equal((await n.post('/api/plataforma/login/codigo', { email: 'alguem@fora.com' })).status, 403);
  } finally { await S.fechar(); }
});

test('o arquivo do repositório tem só emails válidos', () => {
  const lista = lerAdminsArquivo(new URL('../deploy/admins-plataforma.txt', import.meta.url).pathname);
  assert.ok(lista.length >= 1);
});
