// Reconciliação da medição por assistente (Fase 3) com os quick wins, no tenant
// de demonstração. O banco sobe só até a migração 019, recebe execuções,
// valores e decisões no modelo antigo, e então recebe as migrações seguintes:
// a 020 traz tudo para quick wins e a 022 remove as tabelas antigas. Os totais
// (execuções, valores de ponto de partida, valores depois e decisões) têm de
// bater, assistente por assistente. A 022 tem volta, que recria as tabelas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './helpers.ts';
import { migrate, migrateDown } from '../src/db/migrate.ts';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_DIR, seedDemo } from '../src/demo/seed.ts';
import { MemoryObjectStore } from '../src/storage/object-store.ts';

let db: TestDb;
let tenantId = '';
const A: Record<string, string> = {};
type Totals = Record<string, { execucoes: number; antes: number; antesSoma: number; depois: number; decisoes: number; ultimaDecisao: string | null }>;
let before022: Totals = {};

const q = async (sql: string, params: unknown[] = []) => (await db.owner.query(sql, params)).rows;

before(async () => {
  db = await createTestDb({ upTo: '019' });
  // A demonstração de hoje traz mapeamentos de importação (023); aqui o banco está na 019.
  const demo = mkdtempSync(join(tmpdir(), 'demo-019-'));
  cpSync(DEMO_DIR, demo, { recursive: true });
  const tj = JSON.parse(readFileSync(join(demo, 'tenant-demo.json'), 'utf8'));
  delete tj.mapeamentosImportacao;
  writeFileSync(join(demo, 'tenant-demo.json'), JSON.stringify(tj));
  tenantId = (await seedDemo(db.owner, new MemoryObjectStore(), demo)).tenantId;
  for (const r of await q(`select id, slug, area_id from assistants where tenant_id = $1`, [tenantId])) A[r.slug] = r.id;
  const user = (await q(`select id from users where tenant_id = $1 and email = 'key.fiscal@demonstracao.com.br'`, [tenantId]))[0].id;
  const area = (await q(`select area_id from assistants where id = $1`, [A['conferencia-nfe']]))[0].area_id;
  const run = (slug: string, n: number) => Promise.all(Array.from({ length: n }, (_, i) => q(
    `insert into runs (tenant_id, assistant_id, assistant_version, area_id, user_id, status, input_sha256, processing_ms, expires_at, created_at)
     values ($1, $2, 1, $3, $4, 'aprovado', $5, 20000, now() + interval '90 days', now() - make_interval(days => $6))`, [tenantId, A[slug], area, user, `x${slug}${i}`, i])));
  await run('conferencia-nfe', 5); await run('checklist-admissao', 3); await run('evidencias-lgpd', 2);   // lgpd sem medição: fica fora
  const val = (slug: string, ind: string, phase: string, v: number, origin: 'medido' | 'informado') => q(
    `insert into metric_values (tenant_id, assistant_id, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, recorded_by)
     values ($1, $2, $3, $4, $5, 'min', $6, $7, $8, $9, $10, $11)`,
    [tenantId, A[slug], ind, phase, v, origin, origin === 'medido' ? '2026-05-01' : null, origin === 'medido' ? '2026-05-31' : null, origin === 'medido' ? 'cronometragem' : null, origin === 'informado' ? 'Coordenação' : null, user]);
  await val('conferencia-nfe', 'tempo_por_nota', 'antes', 12, 'medido');
  await val('conferencia-nfe', 'notas_com_erro', 'antes', 5, 'informado');
  await val('conferencia-nfe', 'tempo_por_nota', 'depois', 4, 'medido');
  await val('checklist-admissao', 'tempo_por_pasta', 'antes', 30, 'informado');
  const dec = (slug: string, d: string, on: string) => q(
    `insert into assistant_decisions (tenant_id, assistant_id, decision, decided_on, responsible, justification, recorded_by, created_at) values ($1, $2, $3, $4, 'Diretoria', 'Decisão do comitê.', $5, $4::date)`,
    [tenantId, A[slug], d, on, user]);
  await dec('conferencia-nfe', 'manter', '2026-07-01'); await dec('conferencia-nfe', 'ampliar', '2026-08-01'); await dec('resumo-financeiro', 'descartar', '2026-08-15');
  // Totais no modelo antigo, por assistente.
  for (const [slug, id] of Object.entries(A)) {
    const [r] = await q(`select (select count(*)::int from runs where assistant_id = $1) as execucoes,
      (select count(*)::int from metric_values where assistant_id = $1 and phase = 'antes') as antes,
      (select coalesce(sum(value), 0)::float from metric_values where assistant_id = $1 and phase = 'antes') as antes_soma,
      (select count(*)::int from metric_values where assistant_id = $1 and phase = 'depois') as depois,
      (select count(*)::int from assistant_decisions where assistant_id = $1) as decisoes,
      (select decision from assistant_decisions where assistant_id = $1 order by created_at desc limit 1) as ultima`, [id]);
    before022[slug] = { execucoes: r.execucoes, antes: r.antes, antesSoma: r.antes_soma, depois: r.depois, decisoes: r.decisoes, ultimaDecisao: r.ultima };
  }
  await migrate(db.ownerUrl, { upTo: '022' });                                // 020, 021 e 022
});
after(async () => { await db?.drop(); });

test('cada assistente com medição virou um quick win; os totais batem', async () => {
  const withData = Object.entries(before022).filter(([, t]) => t.antes || t.depois || t.decisoes);
  assert.equal(withData.length, 3);
  const qws = await q(`select q.id, q.decision, a.slug from quick_wins q join assistants a on a.id = q.migrated_from_assistant where q.tenant_id = $1`, [tenantId]);
  assert.deepEqual(qws.map(x => x.slug).sort(), withData.map(([s]) => s).sort());
  for (const qw of qws) {
    const t = before022[qw.slug];
    const [r] = await q(`select (select count(*)::int from runs where quick_win_id = $1) as execucoes,
      (select count(*)::int from quick_win_values where quick_win_id = $1 and phase = 'antes') as antes,
      (select coalesce(sum(value), 0)::float from quick_win_values where quick_win_id = $1 and phase = 'antes') as antes_soma,
      (select count(*)::int from quick_win_values where quick_win_id = $1 and phase = 'depois') as depois`, [qw.id]);
    assert.deepEqual([r.execucoes, r.antes, r.antes_soma, r.depois], [t.execucoes, t.antes, t.antesSoma, t.depois], qw.slug);
    assert.equal(qw.decision, t.ultimaDecisao, qw.slug);                      // a última decisão vale no quick win
  }
  // Totais do tenant: execuções com medição, pontos de partida e decisões.
  const sum = (k: keyof Totals[string]) => withData.reduce((n, [, t]) => n + Number(t[k] ?? 0), 0);
  const [tot] = await q(`select (select count(*)::int from runs r join quick_wins q on q.id = r.quick_win_id where q.migrated_from_assistant is not null) as execucoes,
    (select count(*)::int from quick_win_values v join quick_wins q on q.id = v.quick_win_id where q.migrated_from_assistant is not null and v.phase = 'antes') as antes,
    (select count(*)::int from quick_wins where migrated_from_assistant is not null and decision is not null) as decididos`);
  assert.deepEqual([tot.execucoes, tot.antes, tot.decididos], [sum('execucoes'), sum('antes'), withData.filter(([, t]) => t.decisoes).length]);
  // Execuções de assistente sem medição não ganham quick win.
  assert.equal((await q(`select count(*)::int as n from runs where assistant_id = $1 and quick_win_id is not null`, [A['evidencias-lgpd']]))[0].n, 0);
  // Decisões anteriores à última ficam no histórico (a justificativa da última guarda responsável e data).
  const conf = qws.find(x => x.slug === 'conferencia-nfe')!;
  assert.match((await q(`select decision_note from quick_wins where id = $1`, [conf.id]))[0].decision_note, /responsável: Diretoria, 2026-08-01/);
});

test('a 022 removeu as tabelas antigas; a volta recria e a ida remove de novo', async () => {
  const exists = async () => (await q(`select to_regclass('metric_values') as m, to_regclass('assistant_decisions') as d`))[0];
  assert.deepEqual(await exists(), { m: null, d: null });
  await migrateDown(db.ownerUrl, '022_remove_medicao_por_assistente.sql');
  const back = await exists();
  assert.ok(back.m && back.d);
  assert.equal((await q(`select count(*)::int as n from metric_values`))[0].n, 0);     // estrutura volta, vazia
  await migrate(db.ownerUrl, { upTo: '022' });
  assert.deepEqual(await exists(), { m: null, d: null });
  await assert.rejects(migrateDown(db.ownerUrl, '021_compartilhamento_aprovado.sql'), /só a última migração aplicada volta/);
  // As seguintes também têm volta (023: mapeamentos de importação).
  await migrate(db.ownerUrl);
  await migrateDown(db.ownerUrl, '023_mapeamentos_importacao.sql');
  assert.equal((await q(`select to_regclass('import_mappings') as m`))[0].m, null);
  await migrate(db.ownerUrl);
  assert.ok((await q(`select to_regclass('import_mappings') as m`))[0].m);
});
