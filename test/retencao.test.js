// Política de retenção: prazos por camada, dry-run, hold, classificação, proteção dos bancos em uso, idempotência,
// manifesto da empresa excluída e o WAL consolidado logo depois de uma exclusão.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync, symlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { planejar, executar, prazosDe, marcarHold, liberarHold, classificarManual, backupManual, PRAZOS_PADRAO, rodadaRetencao } from '../src/retencao.js';
import { consolidarWal } from '../src/db.js';
import { subir } from './ajuda.js';
import { subirPlataforma } from './ajuda-plataforma.js';

const AGORA = new Date('2026-10-20T12:00:00Z');
const nomeAuto = d => `greenia-${d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}.sqlite.gz`;
const diasAtras = n => new Date(AGORA.getTime() - n * 864e5);
const arquivo = (p, conteudo = 'x') => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, conteudo); return p; };

function cenario() {
  const raiz = mkdtempSync(join(tmpdir(), 'greenia-retencao-'));
  const d = join(raiz, 'dados');
  const f = {
    autoVelho: arquivo(join(d, 'backups/emp_a', nomeAuto(diasAtras(8)))),
    autoNovo: arquivo(join(d, 'backups/emp_a', nomeAuto(diasAtras(1)))),
    autoLimite: arquivo(join(d, 'backups/plataforma', nomeAuto(diasAtras(6.9)))),
    legadoRaiz: arquivo(join(d, 'backups', nomeAuto(diasAtras(23)))),
    manualVelho: join(d, 'backups/pre-deploy-20260901T100000'),
    manualNovo: join(d, 'backups/manual-20261015T100000'),
    semClassificacao: join(d, 'backups/pre-release-abc-20260930T194342'),
    emHold: join(d, 'backups/pre-release-evidencia-20260801T000000'),
    holdInvalido: join(d, 'backups/pre-deploy-20260802T000000'),
    estranho: arquivo(join(d, 'backups/notas.txt')),
    excluidaVelha: arquivo(join(d, 'excluidas/emp_x-greenia-x-2026-09-01.sqlite.gz')),
    excluidaNova: arquivo(join(d, 'excluidas/emp_y-greenia-y-2026-10-10.sqlite.gz')),
    restauracaoVelha: arquivo(join(d, 'greenia.sqlite.antes-da-restauracao')),
    restauracaoSemManifesto: arquivo(join(d, 'empresas/emp_a.sqlite.antes-da-restauracao')),
    chave: arquivo(join(d, '.chave-mestra'), 'segredo'),
    ativo: arquivo(join(d, 'plataforma.sqlite')),
  };
  for (const [p, criado] of [[f.manualVelho, diasAtras(31)], [f.manualNovo, diasAtras(5)], [f.emHold, diasAtras(80)], [f.holdInvalido, diasAtras(79)]]) {
    arquivo(join(p, 'plataforma.sqlite'));
    writeFileSync(join(p, 'backup.json'), JSON.stringify({ tipo: 'pre-deploy', criado_em: criado.toISOString() }));
  }
  arquivo(join(f.semClassificacao, 'plataforma.sqlite'));
  writeFileSync(join(f.emHold, 'HOLD.json'), JSON.stringify({ motivo: 'Evidência da migração da release de copy', por: 'responsavel@exemplo.com', desde: diasAtras(10).toISOString() }));
  writeFileSync(join(f.holdInvalido, 'HOLD.json'), JSON.stringify({ motivo: 'curto' }));
  writeFileSync(`${f.excluidaVelha}.json`, JSON.stringify({ excluida_em: diasAtras(31).toISOString() }));
  writeFileSync(`${f.excluidaNova}.json`, JSON.stringify({ excluida_em: diasAtras(10).toISOString() }));
  writeFileSync(`${f.restauracaoVelha}.json`, JSON.stringify({ tipo: 'antes-da-restauracao', criado_em: diasAtras(40).toISOString() }));
  return { raiz, d, f };
}
const acaoDe = (plano, p) => plano.itens.find(i => i.absoluto === p)?.acao;

test('prazos padrão: automático 7 dias, manual 30, empresa excluída 30; variáveis só aceitam números válidos', () => {
  assert.deepEqual(PRAZOS_PADRAO, { automaticoDias: 7, manualDias: 30, excluidasDias: 30 });
  assert.deepEqual(prazosDe({ RETENCAO_MANUAL_DIAS: '14', RETENCAO_AUTOMATICO_DIAS: 'abc', RETENCAO_EXCLUIDAS_DIAS: '-3' }), { automaticoDias: 7, manualDias: 14, excluidasDias: 30 });
});

test('plano por camada: idade, manifesto, hold, sem classificação e itens fora do padrão', () => {
  const { d, f } = cenario();
  const plano = planejar({ dados: d, agora: AGORA, bancosAtivos: [f.ativo] });
  assert.equal(acaoDe(plano, f.autoVelho), 'apagar');
  assert.equal(acaoDe(plano, f.autoNovo), 'manter');
  assert.equal(acaoDe(plano, f.autoLimite), 'manter');
  assert.equal(acaoDe(plano, f.legadoRaiz), 'apagar', 'automático legado na raiz segue a mesma regra de idade');
  assert.equal(acaoDe(plano, f.manualVelho), 'apagar');
  assert.equal(acaoDe(plano, f.manualNovo), 'manter');
  assert.equal(acaoDe(plano, f.semClassificacao), 'alerta', 'manual sem backup.json nunca é apagado');
  assert.equal(acaoDe(plano, f.emHold), 'manter');
  assert.match(plano.itens.find(i => i.absoluto === f.emHold).motivo, /hold: Evidência da migração/);
  assert.equal(acaoDe(plano, f.holdInvalido), 'alerta', 'hold inválido não libera a limpeza');
  assert.equal(acaoDe(plano, f.estranho), 'alerta');
  assert.equal(acaoDe(plano, f.excluidaVelha), 'apagar');
  assert.equal(acaoDe(plano, f.excluidaNova), 'manter');
  assert.equal(acaoDe(plano, f.restauracaoVelha), 'apagar');
  assert.equal(acaoDe(plano, f.restauracaoSemManifesto), 'alerta');
  // Bancos em uso e a chave-mestra nunca entram no plano.
  for (const p of [f.ativo, f.chave]) assert.equal(acaoDe(plano, p), undefined);
  assert.equal(plano.resumo.apagar, 5);
  // Metadados apenas: o plano não carrega conteúdo de arquivo.
  assert.doesNotMatch(JSON.stringify(plano), /segredo/);
});

test('dry-run não apaga nada; aplicar apaga só o planejado; segunda rodada não tem mais nada (idempotente)', () => {
  const { d, f } = cenario();
  const plano = planejar({ dados: d, agora: AGORA, bancosAtivos: [f.ativo] });
  const seco = executar(plano, { aplicar: false });
  assert.ok(seco.feitos.every(x => x.resultado === 'dry-run'));
  for (const p of [f.autoVelho, f.manualVelho, f.excluidaVelha, f.restauracaoVelha, f.legadoRaiz]) assert.ok(existsSync(p), `dry-run apagou ${p}`);
  const logs = [], aud = [];
  const r = executar(plano, { aplicar: true, log: l => logs.push(l), auditar: (a, m) => aud.push([a, m]) });
  assert.equal(r.feitos.filter(x => x.resultado === 'apagado').length, 5);
  for (const p of [f.autoVelho, f.manualVelho, f.excluidaVelha, `${f.excluidaVelha}.json`, f.restauracaoVelha, `${f.restauracaoVelha}.json`, f.legadoRaiz]) assert.ok(!existsSync(p), `ficou ${p}`);
  for (const p of [f.autoNovo, f.manualNovo, f.semClassificacao, f.emHold, f.holdInvalido, f.excluidaNova, f.restauracaoSemManifesto, f.chave, f.ativo, f.estranho]) assert.ok(existsSync(p), `apagou ${p}`);
  assert.equal(aud.filter(([a]) => a === 'retention.deleted').length, 5);
  assert.ok(aud.some(([a]) => a === 'retention.run'));
  assert.ok(logs.some(l => /alerta: .*sem classificação/.test(l)));
  assert.doesNotMatch(JSON.stringify([logs, aud]), /segredo/);
  const de_novo = planejar({ dados: d, agora: AGORA, bancosAtivos: [f.ativo] });
  assert.equal(de_novo.resumo.apagar, 0);
});

test('proteção: banco em uso dentro do padrão, link simbólico e hold criado depois do plano não são apagados', () => {
  const { d, f } = cenario();
  const ativoNoPadrao = arquivo(join(d, 'backups/emp_b', nomeAuto(diasAtras(30))));
  const alvoFora = arquivo(join(d, '..', 'fora.txt'));
  symlinkSync(alvoFora, join(d, 'backups', nomeAuto(diasAtras(40))));
  const plano = planejar({ dados: d, agora: AGORA, bancosAtivos: [f.ativo, ativoNoPadrao] });
  assert.equal(acaoDe(plano, ativoNoPadrao), 'alerta');
  assert.ok(plano.itens.some(i => i.motivo === 'link simbólico ignorado'));
  marcarHold(d, f.manualVelho, { motivo: 'Investigação de incidente aberta depois do plano', por: 'seguranca@exemplo.com' });
  const r = executar(plano, { aplicar: true });
  assert.ok(existsSync(f.manualVelho), 'hold novo respeitado');
  assert.match(r.feitos.find(x => x.caminho.endsWith('pre-deploy-20260901T100000')).resultado, /ignorado/);
  assert.ok(existsSync(ativoNoPadrao) && existsSync(alvoFora));
});

test('hold: precisa de motivo e responsável, só vale em backups, excluídas e restauração, e pode ser liberado', () => {
  const { d, f } = cenario();
  assert.throws(() => marcarHold(d, f.manualVelho, { motivo: 'curto', por: 'a@b.c' }), /motivo/);
  assert.throws(() => marcarHold(d, f.manualVelho, { motivo: 'Motivo suficientemente longo', por: '' }), /responsável/);
  assert.throws(() => marcarHold(d, f.ativo, { motivo: 'Motivo suficientemente longo', por: 'a@b.c' }), /só para backups/);
  assert.throws(() => marcarHold(d, f.chave, { motivo: 'Motivo suficientemente longo', por: 'a@b.c' }), /só para backups/);
  const h = marcarHold(d, f.excluidaVelha, { motivo: 'Pedido judicial de preservação nº 123', por: 'juridico@exemplo.com', revisar_em: '2027-01-31' });
  assert.equal(h.revisar_em, '2027-01-31');
  assert.equal(acaoDe(planejar({ dados: d, agora: AGORA }), f.excluidaVelha), 'manter');
  liberarHold(d, f.excluidaVelha);
  assert.equal(acaoDe(planejar({ dados: d, agora: AGORA }), f.excluidaVelha), 'apagar');
});

test('classificar um backup manual antigo: a data informada passa a valer para o prazo', () => {
  const { d, f } = cenario();
  assert.throws(() => classificarManual(d, f.semClassificacao, { criado_em: 'ontem' }), /data de criação/);
  classificarManual(d, f.semClassificacao, { criado_em: '2026-09-30T19:43:42Z', tipo: 'pre-release', motivo: 'Backup antes da release b105df1' });
  const p = planejar({ dados: d, agora: AGORA }).itens.find(i => i.absoluto === f.semClassificacao);
  assert.equal(p.acao, 'manter');
  assert.equal(p.expira_em, '2026-10-30T19:43:42.000Z');
  assert.equal(acaoDe(planejar({ dados: d, agora: new Date('2026-10-31T00:00:00Z') }), f.semClassificacao), 'apagar');
  assert.throws(() => classificarManual(d, f.semClassificacao, { criado_em: '2026-09-30T19:43:42Z' }), /já tem backup.json/);
});

test('backup automático atrasado vira alerta', () => {
  const { d, f } = cenario();
  const p = planejar({ dados: d, agora: AGORA, bancosAtivos: [f.ativo] });
  assert.ok(p.itens.some(i => i.acao === 'alerta' && /backups\/plataforma$/.test(i.caminho) && /mais novo tem/.test(i.motivo)), 'plataforma sem backup há 6,9 dias');
  assert.ok(!p.itens.some(i => i.acao === 'alerta' && /backups\/emp_a$/.test(i.caminho)), 'emp_a tem backup de 1 dia');
});

test('backup manual: cópia consistente de cada banco, com manifesto, e entra na regra de 30 dias', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'greenia-manual-'));
  const d = join(raiz, 'dados');
  mkdirSync(d, { recursive: true });
  const banco = join(d, 'plataforma.sqlite');
  const db = new DatabaseSync(banco); db.exec('pragma journal_mode = wal; create table t (x); insert into t values (1);');
  assert.throws(() => backupManual({ dados: d, bancos: { plataforma: banco }, motivo: 'curto' }), /motivo/);
  const r = backupManual({ dados: d, bancos: { plataforma: banco }, tipo: 'pre-deploy', motivo: 'Antes do deploy da retenção', agora: AGORA });
  db.close();
  const m = JSON.parse(readFileSync(join(r.pasta, 'backup.json'), 'utf8'));
  assert.equal(m.criado_em, AGORA.toISOString());
  assert.equal(gunzipSync(readFileSync(join(r.pasta, 'plataforma.sqlite.gz'))).subarray(0, 15).toString(), 'SQLite format 3');
  const p = planejar({ dados: d, agora: new Date(AGORA.getTime() + 31 * 864e5), bancosAtivos: [banco] });
  assert.equal(p.itens.find(i => i.absoluto === r.pasta).acao, 'apagar');
});

test('WAL: a conversa apagada some do banco e do WAL logo depois da exclusão', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-wal-'));
  const banco = join(pasta, 'greenia.sqlite');
  const S = await subir({ banco });
  try {
    const c = await S.cliente().entrar('admin@exemplo.com.br');
    const conv = (await c.post('/api/conversas', {})).dados.conversa;
    const MARCA = 'MARCADOR-CONTEUDO-APAGADO-7731';
    S.app.db.prepare("insert into mensagens (conversa_id, papel, texto, criado_em) values (?, 'user', ?, ?)").run(conv.id, `${MARCA} `.repeat(50), new Date().toISOString());
    const temMarca = () => [banco, `${banco}-wal`].some(a => existsSync(a) && readFileSync(a).includes(MARCA));
    assert.ok(temMarca(), 'o texto está em disco antes de apagar');
    assert.equal((await c.del(`/api/conversas/${conv.id}`)).status, 200);
    assert.ok(!temMarca(), 'o texto não pode ficar no banco nem no WAL');
    assert.equal(statSync(`${banco}-wal`).size, 0, 'WAL truncado');
    assert.equal(S.app.db.prepare('pragma integrity_check').get().integrity_check, 'ok');
    assert.equal((await c.get('/api/conversas')).status, 200, 'o servidor segue no ar');
  } finally { await S.fechar(); }
});

test('WAL: consolidação periódica de todos os bancos, sem VACUUM e sem perder dados', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-wal2-'));
  const banco = join(pasta, 'x.sqlite');
  const db = new DatabaseSync(banco);
  db.exec("pragma journal_mode = wal; pragma secure_delete = on; create table t (v); insert into t values ('um'), ('dois');");
  assert.ok(statSync(`${banco}-wal`).size > 0);
  const logs = [];
  rodadaRetencao({ dados: pasta, bancos: { dbs: [db], arquivos: [banco] }, prazos: PRAZOS_PADRAO, aplicar: false, log: l => logs.push(l), auditar: () => {}, consolidar: consolidarWal });
  assert.equal(statSync(`${banco}-wal`).size, 0);
  assert.equal(db.prepare('select count(*) as n from t').get().n, 2);
  assert.ok(logs.some(l => /dry-run/.test(l)));
  db.close();
});

test('empresa excluída: a cópia de recuperação ganha manifesto com prazo e entra na limpeza de 30 dias', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'gia-ret-plat-'));
  const S = await subirPlataforma({ banco: join(pasta, 'plataforma.sqlite') });
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const c = (await ops.post('/api/plataforma/empresas', { name: 'Temporária', slug: 'temp-ret' })).dados;
    await ops.post(`/api/plataforma/empresas/${c.id}/status`, { status: 'cancelada' });
    const r = await ops.post(`/api/plataforma/empresas/${c.id}/excluir`, { confirmacao: 'temp-ret' });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.expiraEmDias, 30);
    const m = JSON.parse(readFileSync(`${r.dados.copia}.json`, 'utf8'));
    assert.equal(m.companyId, c.id);
    assert.equal(Date.parse(m.expira_em) - Date.parse(m.excluida_em), 30 * 864e5);
    const plano = planejar({ dados: pasta, agora: new Date(Date.parse(m.excluida_em) + 31 * 864e5) });
    assert.equal(plano.itens.find(i => i.absoluto === r.dados.copia).acao, 'apagar');
    assert.equal(planejar({ dados: pasta }).itens.find(i => i.absoluto === r.dados.copia).acao, 'manter');
    assert.ok(readdirSync(join(pasta, 'excluidas')).some(n => n.endsWith('.json')));
  } finally { await S.fechar(); }
});

after(() => {});

test('S3 só com expiração declarada no bucket (S3_LIFECYCLE_DIAS de 1 a 7); sem ela, o destino é ignorado com aviso', async () => {
  const { destinoS3 } = await import('../src/iniciar.js');
  const logs = [];
  assert.equal(destinoS3({}), undefined);
  assert.equal(destinoS3({ BACKUP_DESTINO: 's3://b/p' }, l => logs.push(l)), undefined);
  assert.equal(destinoS3({ BACKUP_DESTINO: 's3://b/p', S3_LIFECYCLE_DIAS: '30' }, l => logs.push(l)), undefined);
  assert.equal(destinoS3({ BACKUP_DESTINO: 's3://b/p', S3_LIFECYCLE_DIAS: '7' }), 's3://b/p');
  assert.equal(logs.length, 2);
  assert.match(logs[0], /S3_LIFECYCLE_DIAS/);
});
