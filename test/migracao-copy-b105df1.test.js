// Migração única do release de copy b105df1 (temporária): ensaio, aplicação por empresa, estado parcial, marcador e
// boot. Dados sintéticos: duas empresas com os ids técnicos da migração e o texto do modelo antigo nos 15 campos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { abrirPlataforma, lerAjuste } from '../src/plataforma/db.js';
import { abrirBanco } from '../src/db.js';
import * as E from '../src/plataforma/empresas.js';
import { migrarCopyB105df1, CHAVE_MIGRACAO, CAMPOS_MIGRACAO, SIGILO_B105DF1 } from '../src/plataforma/migracao-copy-b105df1.js';

const A = 'emp_dc75e06e913f476d9ab2', B = 'emp_7137c3d7bcd64bb29f75';
const VELHO = {
  subtitulo: 'Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da {{empresa}} são aplicadas antes de cada envio.',
  'destaques[2]': 'Conversas salvas só para você',
  'chamadas[2].texto': 'Procedimentos e documentos das áreas. A resposta mostra de qual documento veio a informação.',
  'chamadas[3].texto': 'Você escolhe o tipo de trabalho, não o modelo técnico: Rápido, Equilibrado ou Avançado.',
  'textos.regras_titulo': 'O que pode, o que pede cuidado e o que nunca sai',
  'textos.tarefas_sub': 'Pedidos que costumam dar bom resultado logo na primeira semana.',
  'passos[0].texto': 'Use o email da {{empresa}}. Um código de 6 dígitos chega na hora.',
  'regras.sigilo[2]': 'A conversa vai só para modelos homologados pela empresa, sem retenção',
  'regras.nunca[2]': 'A GreenIA bloqueia antes do envio',
};
const PRIVACIDADE_VELHA = 'Suas conversas ficam salvas só para você, por até 90 dias sem uso, e você pode apagá-las quando quiser.';
const partes = p => p.split(/\.|\[(\d+)\]/).filter(Boolean);
const ler = (o, p) => partes(p).reduce((a, k) => a == null ? undefined : a[k], o);
const por = (o, p, v) => { const k = partes(p); let a = o; for (let i = 0; i < k.length - 1; i++) a = a[k[i]]; a[k[k.length - 1]] = v; };
const folhas = (o, p = '', out = {}) => { if (o !== null && typeof o === 'object') { for (const k of Object.keys(o)) folhas(o[k], Array.isArray(o) ? `${p}[${k}]` : (p ? `${p}.` : '') + k, out); } else out[p] = o; return out; };
const campos = id => CAMPOS_MIGRACAO.find(([x]) => x === id)[1];
const silencio = () => {};

// Banco da plataforma em disco com as duas empresas (ou só as pedidas), cada uma com o banco próprio e uma versão de política.
function montar({ empresas = [A, B], semRowid = false, ajustar } = {}) {
  const pasta = mkdtempSync(join(tmpdir(), 'mig-b105df1-'));
  const arquivo = join(pasta, 'plataforma.sqlite');
  const db = abrirPlataforma(arquivo);
  const P = { db, agora: () => new Date(), pastaEmpresas: pasta, abrirTenant: () => {}, aplicarAoTenant: () => {} };
  const nomes = { [A]: 'Alfa Sintetica', [B]: 'Beta Sintetica Ltda' };
  for (const id of empresas) {
    const banco = join(pasta, `${id}.sqlite`);
    E.criarEmpresa(P, { id, name: nomes[id], slug: `s${id.slice(4, 12)}`, banco }, null, {});
    const t = abrirBanco(banco);
    t.prepare('insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)').run('politica sintetica', 'secao', '2026-09-01T00:00:00.000Z');
    t.close();
    const c = JSON.parse(db.prepare('select content from landing_pages where company_id = ?').get(id).content);
    for (const k of campos(id).filter(k => !k.startsWith('marca.'))) por(c, k, VELHO[k].replace('{{empresa}}', nomes[id]));
    ajustar?.(id, c);
    db.prepare('update landing_pages set content = ? where company_id = ?').run(JSON.stringify(c), id);
    db.prepare('update branding set privacy_note = ? where company_id = ?').run(PRIVACIDADE_VELHA, id);
  }
  if (semRowid) db.exec("create table sem_rowid (k text primary key, v text) without rowid; insert into sem_rowid values ('b', '2'), ('a', '1')");
  return { db, arquivo, pasta, P };
}
const hashBanco = db => createHash('sha256').update(JSON.stringify(db.prepare("select name from sqlite_master where type = 'table' order by name").all()
  .map(({ name }) => [name, db.prepare(`select * from "${name}"`).all().map(r => JSON.stringify(r)).sort()]))).digest('hex');
const migrar = (db, teste) => migrarCopyB105df1(db, { log: silencio, teste });
const auditoriaMigracao = db => db.prepare("select company_id, action, origin from audit_log where origin like '%migracao-copy-release-b105df1%' order by id").all();

test('caso feliz: ensaio, aplicacao das duas empresas, 15 campos no alvo, nada mais muda, marcador gravado', () => {
  const { db, P } = montar();
  const antes = Object.fromEntries([A, B].map(id => [id, { l: E.lerLanding(P, id), m: E.lerMarca(P, id) }]));
  assert.deepEqual(migrar(db), { estado: 'aplicada_agora' });
  let total = 0;
  for (const id of [A, B]) {
    const depois = E.lerLanding(P, id), m = E.lerMarca(P, id), nome = m.display_name, alvo = E.landingPadrao(nome);
    const fa = folhas(antes[id].l.content), fd = folhas(depois.content), lista = campos(id);
    for (const k of Object.keys({ ...fa, ...fd })) {
      if (lista.includes(k)) { assert.equal(fd[k], ler(alvo, k), k); assert.notEqual(fd[k], fa[k], k); total++; } else assert.equal(fd[k], fa[k], `fora da lista: ${k}`);
    }
    assert.deepEqual(depois.seo, antes[id].l.seo);
    assert.equal(depois.status, antes[id].l.status);
    for (const k of E.CAMPOS_MARCA) assert.equal(m[k], k === 'privacy_note' ? E.marcaPadrao(nome).privacy_note : antes[id].m[k], k);
    total++;
  }
  assert.equal(total, 15);
  const gravado = JSON.parse(db.prepare('select content from landing_pages where company_id = ?').get(B).content);
  assert.equal(ler(gravado, 'regras.sigilo[2]'), SIGILO_B105DF1);
  assert.equal(ler(gravado, 'regras.sigilo[2]').length, 112);
  // Auditoria: só as 4 gravações da aplicação (o ensaio foi desfeito), cada uma da empresa certa.
  assert.deepEqual(auditoriaMigracao(db).map(a => [a.company_id, a.action, JSON.parse(a.origin).modo]),
    [[A, 'landing_page.updated', 'aplicar'], [A, 'branding.updated', 'aplicar'], [B, 'landing_page.updated', 'aplicar'], [B, 'branding.updated', 'aplicar']]);
  const marca = lerAjuste(db, CHAVE_MIGRACAO, null);
  assert.equal(marca.campos, 15);
  assert.deepEqual(marca.empresas, [A, B]);
  assert.equal(db.prepare('pragma integrity_check').get().integrity_check, 'ok');
});

test('segundo boot depois da conclusao: nao reaplica e nao escreve nada', () => {
  const { db } = montar();
  migrar(db);
  const h = hashBanco(db);
  assert.deepEqual(migrar(db), { estado: 'ja_aplicada' });
  assert.deepEqual(migrar(db), { estado: 'ja_aplicada' });
  assert.equal(hashBanco(db), h);
});

test('campo divergente: aborta no pre-check, nada gravado, sem marcador', () => {
  const { db } = montar({ ajustar: (id, c) => { if (id === B) por(c, 'regras.nunca[2]', 'Texto proprio da empresa'); } });
  const h = hashBanco(db);
  assert.throws(() => migrar(db), /pre-check: campo divergente/);
  assert.equal(hashBanco(db), h);
  assert.equal(lerAjuste(db, CHAVE_MIGRACAO, null), null);
});

test('alvo maior que o limite: aborta antes de gravar (seria truncado)', () => {
  const { db } = montar();
  const h = hashBanco(db);
  assert.throws(() => migrar(db, { alvo: (id, campo, v) => (campo === 'destaques[2]' ? 'x'.repeat(61) : v) }), /seria truncado/);
  assert.equal(hashBanco(db), h);
});

test('valor alterado pela gravacao (truncamento ou limpeza): detectado no ensaio, nada gravado', () => {
  const { db } = montar();
  const h = hashBanco(db);
  assert.throws(() => migrar(db, { alvo: (id, campo, v) => (campo === 'subtitulo' ? ` ${v} ` : v) }), /subtitulo: alvo nao gravado inteiro/);
  assert.equal(hashBanco(db), h);
  assert.equal(lerAjuste(db, CHAVE_MIGRACAO, null), null);
});

test('campo fora do escopo mudaria na gravacao: aborta, nada gravado', () => {
  const { db } = montar({ ajustar: (id, c) => { if (id === A) c.rotulo = 'R'.repeat(100); } });
  const h = hashBanco(db);
  assert.throws(() => migrar(db), /campo fora da lista mudou: landing\.rotulo/);
  assert.equal(hashBanco(db), h);
});

test('auditoria inesperada: aborta, nada gravado', () => {
  const { db } = montar();
  const h = hashBanco(db);
  const extra = P => P.db.prepare("insert into audit_log (at, action, entity, origin) values ('2026-09-30', 'x.inesperada', 'x', '{}')").run();
  assert.throws(() => migrar(db, { aposGravar: extra }), /auditoria inesperada/);
  assert.equal(hashBanco(db), h);
});

test('falha antes da primeira escrita: empresa ausente aborta; instalacao sem as empresas segue sem marcar', () => {
  const so = montar({ empresas: [A] });
  const h = hashBanco(so.db);
  assert.throws(() => migrar(so.db), /empresa ausente/);
  assert.equal(hashBanco(so.db), h);
  const vazia = montar({ empresas: [] });
  assert.deepEqual(migrar(vazia.db), { estado: 'nao_aplicavel' });
  assert.equal(lerAjuste(vazia.db, CHAVE_MIGRACAO, null), null);
});

test('falha entre as duas empresas: primeira commitada, segunda desfeita, ESTADO_PARCIAL e sem marcador; proximo boot recusa', () => {
  const { db, P } = montar();
  const bAntes = db.prepare('select content from landing_pages where company_id = ?').get(B).content;
  assert.throws(() => migrar(db, { antesDoCommit: (_, id) => { if (id === B) throw new Error('falha simulada'); } }), /ESTADO_PARCIAL: falha em emp_7137c3d7bcd64bb29f75.*commitadas=\[emp_dc75e06e913f476d9ab2\] nao_migradas=\[emp_7137c3d7bcd64bb29f75\]/);
  assert.equal(lerAjuste(db, CHAVE_MIGRACAO, null), null);
  assert.equal(db.prepare('select content from landing_pages where company_id = ?').get(B).content, bAntes);
  assert.equal(ler(E.lerLanding(P, A).content, 'destaques[2]'), ler(E.landingPadrao(E.lerMarca(P, A).display_name), 'destaques[2]'));
  // Primeira empresa já migrada, segunda não: o boot seguinte detecta o estado parcial e não grava nada.
  const h = hashBanco(db);
  assert.throws(() => migrar(db), /ESTADO_PARCIAL: migradas=\[emp_dc75e06e913f476d9ab2\] pendentes=\[emp_7137c3d7bcd64bb29f75\]/);
  assert.equal(hashBanco(db), h);
});

test('tudo aplicado mas marcador nao gravado: o boot seguinte valida pela auditoria e marca, sem regravar', () => {
  const { db } = montar();
  assert.throws(() => migrar(db, { antesDoMarcador: () => { throw new Error('queda antes do marcador'); } }), /queda antes do marcador/);
  assert.equal(lerAjuste(db, CHAVE_MIGRACAO, null), null);
  const auditoria = auditoriaMigracao(db).length;
  assert.deepEqual(migrar(db), { estado: 'marcada_apos_retomada' });
  assert.equal(auditoriaMigracao(db).length, auditoria);
  assert.deepEqual(migrar(db), { estado: 'ja_aplicada' });
});

test('tabela WITHOUT ROWID no banco da plataforma: ensaio e aplicacao funcionam', () => {
  const { db } = montar({ semRowid: true });
  assert.deepEqual(migrar(db), { estado: 'aplicada_agora' });
  assert.deepEqual(db.prepare('select * from sem_rowid order by k').all().map(r => r.k), ['a', 'b']);
});

test('politica e config dos tenants: a migracao nao muda nada no banco das empresas', () => {
  const { db, pasta } = montar();
  const tenants = () => [A, B].map(id => { const t = new DatabaseSync(join(pasta, `${id}.sqlite`), { readOnly: true }); const h = hashBanco(t); t.close(); return h; });
  const antes = tenants();
  migrar(db);
  assert.deepEqual(tenants(), antes);
});

// Boot de verdade (npm start em modo multiempresa) contra um banco preparado.
async function boot(arquivo, pasta) {
  const porta = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, MULTIEMPRESA: '1', PORTA: String(porta), HOST: '127.0.0.1', BANCO_PLATAFORMA: arquivo, PASTA_EMPRESAS: pasta, BANCO: join(pasta, 'nao-existe.sqlite'), OPENROUTER_API_KEY: '', NODE_ENV: 'development', PLATAFORMA_ADMINS: '', OPERADOR_EMAIL: '' };
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/iniciar.js'], { env, stdio: 'pipe' });
  let saida = '', saiu = null;
  p.stdout.on('data', d => { saida += d; });
  p.stderr.on('data', d => { saida += d; });
  const fim = new Promise(r => p.on('exit', c => { saiu = c; r(c); }));
  let saude = null;
  for (let i = 0; i < 80 && !saude && saiu === null; i++) {
    await new Promise(r => setTimeout(r, 100));
    saude = await fetch(`http://127.0.0.1:${porta}/api/saude`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  if (saiu === null) p.kill('SIGTERM');
  return { saude, codigo: await fim, saida };
}

test('boot: aplica antes de aceitar trafego, expoe o estado na saude e o segundo boot nao reaplica', async () => {
  const { db, arquivo, pasta } = montar();
  db.close();
  const r1 = await boot(arquivo, pasta);
  assert.equal(r1.saude?.migracao, 'aplicada_agora', r1.saida);
  assert.match(r1.saida, /ENSAIO_APROVADO/);
  assert.doesNotMatch(r1.saida, /Alfa Sintetica|Beta Sintetica/);   // logs sem nome de empresa
  const r2 = await boot(arquivo, pasta);
  assert.equal(r2.saude?.migracao, 'ja_aplicada', r2.saida);
  const d = new DatabaseSync(arquivo, { readOnly: true });
  assert.equal(d.prepare("select count(*) n from audit_log where origin like '%migracao-copy-release-b105df1%'").get().n, 4);
  d.close();
});

test('boot: falha da migracao derruba o boot (o servidor nao sobe) e nada e marcado', async () => {
  const { db, arquivo, pasta } = montar({ ajustar: (id, c) => { if (id === A) por(c, 'destaques[2]', 'Texto proprio'); } });
  db.close();
  const r = await boot(arquivo, pasta);
  assert.equal(r.saude, null);
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /\[migracao\] FALHA, boot interrompido/);
  const d = new DatabaseSync(arquivo, { readOnly: true });
  assert.equal(d.prepare('select count(*) n from platform_settings where key = ?').get(CHAVE_MIGRACAO).n, 0);
  d.close();
});
