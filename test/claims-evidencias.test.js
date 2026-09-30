// Evidência de comportamento para claims da página que ainda não tinham teste próprio (docs/claims-lp.md):
// só confere o que o produto já faz; nada aqui muda regra.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subir } from './ajuda.js';
import { enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';

let S, pasta, banco, ana, admin;
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'greenia-claims-'));
  banco = join(pasta, 'empresa.sqlite');
  S = await subir({ banco });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  admin = await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); S.app.db.close(); rmSync(pasta, { recursive: true, force: true }); });

// O que está no disco para este banco: o arquivo principal e o de gravação (WAL), separados.
const bytesDe = sufixo => readdirSync(pasta).filter(f => f === `empresa.sqlite${sufixo}`).map(f => readFileSync(join(pasta, f)).toString('latin1')).join('');

// Sustenta a copy exata (LP-FAQ-09, LP-INFRA-02): o conteúdo sai do banco e o espaço é zerado no arquivo principal,
// mas o arquivo de gravação ainda o tem até ser reaproveitado; por isso a página não promete "nenhuma cópia".
test('conversa apagada: o conteúdo sai do banco e é zerado no arquivo principal; antes da consolidação, o arquivo temporário ainda o tem', async () => {
  const marca = 'MARCADOR-UNICO-7F3A9C conteudo da conversa';
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  assert.equal((await enviarMensagem(ana, conv.id, { texto: `Resuma: ${marca}` })).status, 200);
  S.app.db.exec('pragma wal_checkpoint(passive)');
  assert.ok(bytesDe('').includes('MARCADOR-UNICO-7F3A9C'), 'antes de apagar, o conteúdo está no arquivo principal');
  assert.equal((await ana.del(`/api/conversas/${conv.id}`)).status, 200);
  assert.equal(S.app.db.prepare("select count(*) as n from mensagens where texto like '%MARCADOR-UNICO-7F3A9C%'").get().n, 0, 'fora do banco na hora');
  S.app.db.exec('pragma wal_checkpoint(passive)');
  assert.ok(!bytesDe('').includes('MARCADOR-UNICO-7F3A9C'), 'depois da consolidação, nenhum byte do conteúdo fica no arquivo principal');
  assert.ok(bytesDe('-wal').includes('MARCADOR-UNICO-7F3A9C'), 'o arquivo de gravação ainda tem o conteúdo até ser reaproveitado');
  S.app.db.exec('pragma wal_checkpoint(truncate)');
  assert.ok(!bytesDe('').includes('MARCADOR-UNICO-7F3A9C') && !bytesDe('-wal').includes('MARCADOR-UNICO-7F3A9C'), 'reaproveitado o arquivo de gravação, o conteúdo some do disco');
});

test('Visão geral: envio bloqueado pelas regras de dados aparece como ponto de atenção, sem o conteúdo', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: 'O acesso é senha: Primavera2026' });
  assert.equal(r.status, 422);
  const atencao = (await admin.get('/api/admin/visao-geral')).dados.atencao;
  const item = atencao.find(a => a.tipo === 'politica');
  assert.ok(item, 'o bloqueio aparece na Visão geral');
  assert.match(item.texto, /envios? bloqueados? pelas regras de dados neste mês/);
  assert.doesNotMatch(JSON.stringify(atencao), /Primavera2026/);
});
