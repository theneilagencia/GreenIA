// Conexões fictícias antigas: inventário só de leitura, classificação por evidência (nome sozinho não basta) e
// retirada pela mesma revogação do produto, só para o que tem as duas marcas de QA. Nada é apagado fisicamente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { criarApp } from '../src/servidor.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { classificar, bancos } from '../scripts/conexoes-qa.mjs';

test('classificação exige endereço de API pública de teste e marca de QA no nome', () => {
  assert.equal(classificar({ base_url: 'https://jsonplaceholder.typicode.com', nome: 'QA - Sandbox Tarefas', sistema: 'Sandbox Tarefas' }).classe, 'qa_comprovado');
  assert.equal(classificar({ base_url: 'https://httpbin.org', nome: 'QA - Sandbox Esquema', sistema: 'Sandbox Esquema' }).classe, 'qa_comprovado');
  assert.equal(classificar({ base_url: 'https://erp.empresa.com.br', nome: 'QA - ERP', sistema: 'ERP' }).classe, 'revisar', 'só o nome não basta');
  assert.equal(classificar({ base_url: 'https://httpbin.org', nome: 'Consulta de status', sistema: 'Status' }).classe, 'revisar', 'só o endereço não basta');
  assert.equal(classificar({ base_url: 'https://crm.empresa.com.br', nome: 'CRM', sistema: 'CRM' }).classe, 'legitimo');
});

test('inventário lista dependências sem alterar nada; revogar só age nos comprovados e preserva o histórico', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conexoes-qa-'));
  const arquivo = join(dir, 'greenia.sqlite');
  try {
    const app = criarApp({ banco: arquivo, cookieSeguro: false, log: () => {}, adminEmail: 'admin@exemplo.com.br' });
    const agora = new Date().toISOString(), t = app.tenantId;
    const conector = (id, nome, sistema, url, status = 'ACTIVE') => app.db.prepare(`insert into connectors (id, tenant_id, nome, sistema, tipo, auth_type, base_url, allowed_hosts, spec, config, status, origem, versao, criado_por, criado_em, atualizado_em)
      values (?, ?, ?, ?, 'rest', 'none', ?, '[]', '{}', '{}', ?, 'manual', 1, null, ?, ?)`).run(id, t, nome, sistema, url, status, agora, agora);
    conector('cnx_qa1', 'QA - Sandbox Tarefas', 'Sandbox Tarefas', 'https://jsonplaceholder.typicode.com');
    conector('cnx_rev', 'QA - ERP', 'ERP', 'https://erp.empresa.com.br');
    conector('cnx_leg', 'CRM', 'CRM', 'https://crm.empresa.com.br');
    app.db.prepare(`insert into capabilities (id, tenant_id, connector_id, nome, operation_id, modo, classe, categoria, efeitos, risco, requer_aprovacao, status, versao, criado_em, atualizado_em)
      values ('cap1', ?, 'cnx_qa1', 'Tarefas', 'listarTarefas', 'read', 'SAFE_READ', 'leitura', '{}', 'baixo', 0, 'ativa', 1, ?, ?)`).run(t, agora, agora);
    app.db.close?.();
    const roda = (...a) => JSON.parse(execFileSync(process.execPath, ['scripts/conexoes-qa.mjs', ...a], { encoding: 'utf8' }));

    const inv = roda('inventario', '--db', arquivo);
    assert.deepEqual(inv.resumo, { qa_comprovado: 1, revisar: 1, legitimo: 1 });
    assert.equal(inv.conexoes.find(c => c.id === 'cnx_qa1').dependencias.capabilitiesAtivas, 1);

    const sim = roda('revogar', '--db', arquivo, '--ids', 'cnx_qa1,cnx_rev,cnx_leg,cnx_x', '--por', 'qa@exemplo.com.br');
    assert.equal(sim.simulacao, true);
    assert.deepEqual(sim.plano.map(p => [p.id, p.acao]), [['cnx_qa1', 'revogar'], ['cnx_rev', 'ignorar'], ['cnx_leg', 'ignorar'], ['cnx_x', 'ignorar']]);
    let db = new DatabaseSync(arquivo, { readOnly: true });
    assert.equal(db.prepare("select status from connectors where id = 'cnx_qa1'").get().status, 'ACTIVE', 'simulação não altera');
    db.close();

    const feito = roda('revogar', '--db', arquivo, '--ids', 'cnx_qa1,cnx_rev,cnx_leg', '--por', 'qa@exemplo.com.br', '--confirmar');
    assert.deepEqual(feito.resultado.map(r => [r.id, r.acao]), [['cnx_qa1', 'revogada'], ['cnx_rev', 'ignorar'], ['cnx_leg', 'ignorar']]);
    db = new DatabaseSync(arquivo, { readOnly: true });
    const st = Object.fromEntries(db.prepare('select id, status from connectors').all().map(r => [r.id, r.status]));
    assert.deepEqual(st, { cnx_qa1: 'REVOKED', cnx_rev: 'ACTIVE', cnx_leg: 'ACTIVE' }, 'a conexão continua existindo (revogada), as outras não mudam');
    assert.equal(db.prepare("select status from capabilities where id = 'cap1'").get().status, 'revogada');
    db.close();

    const de_novo = roda('revogar', '--db', arquivo, '--ids', 'cnx_qa1', '--por', 'qa@exemplo.com.br', '--confirmar');
    assert.equal(de_novo.resultado[0].acao, 'nada', 'idempotente');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inventário acha os bancos das empresas em dados/empresas (multiempresa) e o banco legado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conexoes-qa-dados-'));
  try {
    mkdirSync(join(dir, 'empresas'));
    for (const n of ['emp_aaa.sqlite', 'emp_bbb.sqlite', 'emp_aaa.sqlite-wal', 'outro.sqlite']) writeFileSync(join(dir, 'empresas', n), '');
    writeFileSync(join(dir, 'greenia.sqlite'), ''); writeFileSync(join(dir, 'plataforma.sqlite'), '');
    assert.deepEqual(bancos(dir).map(f => f.slice(dir.length + 1)).sort(), ['empresas/emp_aaa.sqlite', 'empresas/emp_bbb.sqlite', 'greenia.sqlite']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
