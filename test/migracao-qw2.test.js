// Migração 12 (Quick Wins 2.0): um banco que já existia ganha as colunas e a tabela novas sem perder nada,
// e rodar de novo não muda nada (idempotente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirBanco, migrar } from '../src/db.js';

test('banco anterior ao Quick Win 2.0 sobe com a estrutura nova e os dados intactos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qw2-')), arq = join(dir, 'empresa.db');
  try {
    let db = abrirBanco(arq);
    const versao = db.prepare('pragma user_version').get().user_version;
    // Volta o banco ao estado da versão anterior (sem as colunas e a tabela novas), com um quick win antigo.
    db.exec('drop table quick_win_versoes; alter table quick_wins drop column especificacao; alter table quick_wins drop column versao_publicada; alter table roteamento drop column qualidade;');
    db.exec('pragma user_version = 11');   // antes da migração 12 (Quick Wins 2.0); as seguintes rodam de novo
    db.prepare("insert into quick_wins (nome, instrucoes, formato) values ('Antigo', 'Resuma.', 'lista')").run();
    db.close();
    db = abrirBanco(arq);
    const cols = t => db.prepare(`pragma table_info(${t})`).all().map(c => c.name);
    assert.ok(cols('quick_wins').includes('especificacao') && cols('quick_wins').includes('versao_publicada'));
    assert.ok(cols('roteamento').includes('qualidade'));
    assert.ok(db.prepare("select 1 from sqlite_master where name = 'quick_win_versoes'").get());
    assert.equal(db.prepare('pragma user_version').get().user_version, versao);
    const q = db.prepare("select * from quick_wins where nome = 'Antigo'").get();
    assert.equal(q.instrucoes, 'Resuma.');
    assert.equal(q.especificacao, null, 'quick win antigo continua no fluxo antigo');
    db.exec('pragma user_version = 11');   // antes da migração 12 (Quick Wins 2.0); as seguintes rodam de novo
    migrar(db);   // de novo: nada quebra
    assert.equal(db.prepare('pragma user_version').get().user_version, versao);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
