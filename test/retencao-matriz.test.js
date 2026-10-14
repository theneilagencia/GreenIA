// Matriz sintética de eliminação (docs/politica-retencao.md): numa pasta de dados temporária, cria arquivos vencidos
// e dentro do prazo de TODAS as categorias de cópia geridas pela GreenIA e confere, item a item, o que é apagado, o
// que fica e o que a auditoria registra. Nada aqui toca dados reais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { planejar, executar, marcarHold, rodadaRetencao, PRAZOS_PADRAO } from '../src/retencao.js';
import { consolidarWal, todos } from '../src/db.js';
import { subirPlataforma } from './ajuda-plataforma.js';
import { criarExportacao, encerrarNecessidade, marcarHoldExportacao, rodadaExportacoes, PRAZO_COPIA_DIAS } from '../src/plataforma/exportacoes.js';

const DIA = 864e5;
const mostra = p => { const r = relative(process.cwd(), p); return r && !r.startsWith('..') ? r : p; };   // como o plano mostra o caminho
const AGORA = new Date('2026-10-20T12:00:00Z');
const atras = n => new Date(AGORA.getTime() - n * DIA);
const nomeAuto = d => `greenia-${d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}.sqlite.gz`;
const CONTEUDO = 'CONTEUDO-SINTETICO-NAO-PODE-IR-PARA-LOG';
const arquivo = (p, c = CONTEUDO) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, c); return p; };
const json = (p, o) => writeFileSync(p, JSON.stringify(o));
const pastaManual = (p, criado) => { arquivo(join(p, 'plataforma.sqlite.gz')); if (criado) json(join(p, 'backup.json'), { tipo: 'pre-deploy', criado_em: criado.toISOString() }); return p; };
const banco = p => { mkdirSync(join(p, '..'), { recursive: true }); const db = new DatabaseSync(p); db.exec("pragma journal_mode = wal; create table t (v); insert into t values ('vivo');"); return db; };

function montar() {
  const d = join(mkdtempSync(join(tmpdir(), 'greenia-matriz-')), 'dados');
  // Bancos em uso (com -wal e -shm abertos) e a chave-mestra: nunca entram na limpeza.
  const dbPlat = banco(join(d, 'plataforma.sqlite')), dbEmp = banco(join(d, 'empresas/emp_a.sqlite'));
  const emUso = [join(d, 'plataforma.sqlite'), join(d, 'empresas/emp_a.sqlite')];
  const f = {
    // Automáticos por banco: plataforma e empresas, vencidos (> 7 dias) e dentro do prazo.
    autoPlatVencido: arquivo(join(d, 'backups/plataforma', nomeAuto(atras(7.5)))),
    autoPlatNovo: arquivo(join(d, 'backups/plataforma', nomeAuto(atras(0.5)))),
    autoEmpAVencido: arquivo(join(d, 'backups/emp_a', nomeAuto(atras(10)))),
    autoEmpANovo: arquivo(join(d, 'backups/emp_a', nomeAuto(atras(6.9)))),
    autoEmpBHold: arquivo(join(d, 'backups/emp_b', nomeAuto(atras(40)))),          // vencido, mas com hold de arquivo
    autoEmpBNovo: arquivo(join(d, 'backups/emp_b', nomeAuto(atras(0.2)))),
    autoEmpCHoldDepois: arquivo(join(d, 'backups/emp_c', nomeAuto(atras(9)))),     // hold criado depois do plano
    autoEmpCNovo: arquivo(join(d, 'backups/emp_c', nomeAuto(atras(0.3)))),
    // Manuais: com backup.json (30 dias), sem backup.json (alerta), com HOLD.json na pasta.
    manualVencido: pastaManual(join(d, 'backups/pre-deploy-20260901T100000'), atras(31)),
    manualNovo: pastaManual(join(d, 'backups/manual-20261001T100000'), atras(19)),
    manualSemManifesto: pastaManual(join(d, 'backups/pre-release-x-20260801T000000'), null),
    manualHold: pastaManual(join(d, 'backups/migracao-20260701T000000'), atras(110)),
    // Cópias de empresa excluída, com manifesto.
    excluidaVencida: arquivo(join(d, 'excluidas/emp_x-greenia-x-2026-09-10.sqlite.gz')),
    excluidaNova: arquivo(join(d, 'excluidas/emp_y-greenia-y-2026-10-01.sqlite.gz')),
    // Cópias anteriores a uma restauração, com manifesto.
    restauracaoVencida: arquivo(join(d, 'empresas/emp_a.sqlite.antes-da-restauracao')),
    restauracaoNova: arquivo(join(d, 'plataforma.sqlite.antes-da-restauracao')),
    chave: arquivo(join(d, '.chave-mestra'), 'segredo-da-chave'),
    alvoDoLink: arquivo(join(d, '..', 'fora-dos-dados.sqlite.gz')),
  };
  f.link = join(d, 'backups/emp_a', nomeAuto(atras(60)));
  symlinkSync(f.alvoDoLink, f.link);
  json(`${f.autoEmpBHold}.hold.json`, { motivo: 'Preservação pedida pelo jurídico (caso 12)', por: 'juridico@exemplo.com', desde: atras(2).toISOString() });
  json(join(f.manualHold, 'HOLD.json'), { motivo: 'Evidência de migração em análise', por: 'ops@exemplo.com', desde: atras(20).toISOString(), revisar_em: '2026-12-01' });
  json(`${f.excluidaVencida}.json`, { excluida_em: atras(30.1).toISOString(), expira_em: atras(0.1).toISOString() });
  json(`${f.excluidaNova}.json`, { excluida_em: atras(19).toISOString() });
  json(`${f.restauracaoVencida}.json`, { tipo: 'antes-da-restauracao', criado_em: atras(31).toISOString() });
  json(`${f.restauracaoNova}.json`, { tipo: 'antes-da-restauracao', criado_em: atras(2).toISOString() });
  return { d, f, emUso, dbs: [dbPlat, dbEmp] };
}

test('matriz sintética: cada categoria apagada ou mantida exatamente no prazo, com auditoria só de metadados', () => {
  const { d, f, emUso, dbs } = montar();
  const protegidos = [...emUso.flatMap(b => [b, `${b}-wal`, `${b}-shm`]), f.chave];
  for (const p of protegidos) assert.ok(existsSync(p), `cenário sem ${p}`);
  const plano = planejar({ dados: d, agora: AGORA, bancosAtivos: emUso });
  const acao = p => plano.itens.find(i => i.absoluto === p)?.acao;
  const esperado = {
    apagar: ['autoPlatVencido', 'autoEmpAVencido', 'autoEmpCHoldDepois', 'manualVencido', 'excluidaVencida', 'restauracaoVencida'],
    manter: ['autoPlatNovo', 'autoEmpANovo', 'autoEmpBHold', 'autoEmpBNovo', 'autoEmpCNovo', 'manualNovo', 'manualHold', 'excluidaNova', 'restauracaoNova'],
    alerta: ['manualSemManifesto', 'link'],
  };
  for (const [a, chaves] of Object.entries(esperado)) for (const k of chaves) assert.equal(acao(f[k]), a, `${k} deveria ser ${a}`);
  // Bancos em uso, -wal, -shm e chave-mestra nem aparecem no plano.
  for (const p of protegidos) assert.equal(acao(p), undefined, p);
  assert.match(plano.itens.find(i => i.absoluto === f.autoEmpBHold).motivo, /^hold: Preservação pedida/);
  assert.match(plano.itens.find(i => i.absoluto === f.manualHold).motivo, /^hold: Evidência de migração/);
  assert.equal(plano.itens.find(i => i.absoluto === f.link).motivo, 'link simbólico ignorado');
  assert.equal(plano.resumo.apagar, 6);

  // Hold criado DEPOIS do plano: a execução confere de novo e respeita.
  marcarHold(d, f.autoEmpCHoldDepois, { motivo: 'Incidente aberto depois do plano', por: 'seguranca@exemplo.com', agora: AGORA });

  const aud = [], logs = [];
  for (const db of dbs) assert.ok(consolidarWal(db).ok, 'a rodada consolida o WAL dos bancos em uso sem apagar arquivos');
  const r = executar(plano, { aplicar: true, log: l => logs.push(l), auditar: (acao, meta) => aud.push({ acao, meta }) });
  const apagados = ['autoPlatVencido', 'autoEmpAVencido', 'manualVencido', 'excluidaVencida', 'restauracaoVencida'];
  for (const k of apagados) assert.ok(!existsSync(f[k]), `${k} ficou`);
  assert.ok(!existsSync(`${f.excluidaVencida}.json`) && !existsSync(`${f.restauracaoVencida}.json`), 'manifestos saem com a cópia');
  for (const k of [...esperado.manter, ...esperado.alerta, 'autoEmpCHoldDepois', 'alvoDoLink']) assert.ok(existsSync(f[k]), `${k} foi apagado`);
  for (const p of protegidos) assert.ok(existsSync(p), `protegido apagado: ${p}`);
  assert.equal(r.feitos.find(x => x.caminho === mostra(f.autoEmpCHoldDepois)).resultado, 'ignorado (mudou desde o plano)');
  // Bancos em uso seguem íntegros e com os dados.
  for (const db of dbs) assert.equal(db.prepare('select v from t').get().v, 'vivo');

  // Auditoria: um retention.deleted por item apagado, com só metadados, e um retention.run com o resumo.
  const deletados = aud.filter(a => a.acao === 'retention.deleted');
  assert.deepEqual(deletados.map(a => a.meta.caminho).sort(), apagados.map(k => mostra(f[k])).sort());
  for (const a of deletados) assert.deepEqual(Object.keys(a.meta).sort(), ['camada', 'caminho', 'criado_em', 'idade_dias', 'motivo', 'tamanho']);
  assert.deepEqual(deletados.map(a => a.meta.camada).sort(), ['automatico', 'automatico', 'excluidas', 'manual', 'restauracao']);
  const run = aud.filter(a => a.acao === 'retention.run');
  assert.equal(run.length, 1);
  assert.deepEqual(run[0].meta, { apagados: 5, mantidos: 9, alertas: plano.resumo.alertas, prazos: PRAZOS_PADRAO });
  assert.doesNotMatch(JSON.stringify([aud, logs]), /CONTEUDO-SINTETICO|segredo-da-chave/);
  assert.ok(logs.some(l => /alerta: .*pre-release-x-20260801T000000: backup manual sem classificação/.test(l)));

  // Rodada completa de hora em hora (WAL + plano + aplicação): o hold novo agora entra no plano e nada mais é apagado.
  const de_novo = rodadaRetencao({ dados: d, bancos: { dbs, arquivos: emUso }, prazos: PRAZOS_PADRAO, aplicar: true, agora: AGORA, consolidar: consolidarWal, log: () => {}, auditar: () => {} });
  assert.equal(de_novo.plano.resumo.apagar, 0);
  assert.match(de_novo.plano.itens.find(i => i.absoluto === f.autoEmpCHoldDepois).motivo, /^hold: Incidente aberto/);
  for (const p of protegidos) assert.ok(existsSync(p), `protegido apagado na rodada: ${p}`);
  for (const db of dbs) db.close();
});

test('matriz sintética: cópia operacional de exportação antes e depois do fim da necessidade, com hold e sem necessidade encerrada', async () => {
  let agora = AGORA.getTime();
  const pasta = mkdtempSync(join(tmpdir(), 'greenia-matriz-exp-'));
  const S = await subirPlataforma({ banco: join(pasta, 'plataforma.sqlite'), agora: () => new Date(agora) });
  try {
    const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
    const c = (await ops.post('/api/plataforma/empresas', { name: 'Matriz', slug: 'matriz' })).dados;
    const P = S.P;
    const userId = todos(P.db, "select id from users where email = 'ops@theneil.com.br'")[0].id;
    const gerar = () => ({ dados: Buffer.from(CONTEUDO), nome: 'copia.sqlite.gz' });
    const nova = () => criarExportacao(P, { userId, email: 'ops@theneil.com.br', companyId: c.id, tipo: 'solicitacao_cliente', justificativa: 'Pedido sintético do cliente', gerar });
    const caminho = x => join(P.pastaExportacoes, x.arquivo);
    // Necessidade encerrada há 8 dias (vencida), há 6 dias (no prazo), vencida mas em hold, e nunca encerrada.
    const vencida = nova(), noPrazo = nova(), emHold = nova(), aberta = nova();
    agora -= 8 * DIA; encerrarNecessidade(P, vencida.id, { por: 'ops@theneil.com.br' }); encerrarNecessidade(P, emHold.id, { por: 'ops@theneil.com.br' });
    agora += 2 * DIA; encerrarNecessidade(P, noPrazo.id, { por: 'ops@theneil.com.br' });
    agora += 6 * DIA;
    marcarHoldExportacao(P, emHold.id, { tipo: 'legal', motivo: 'Ordem de preservação sintética', por: 'juridico@exemplo.com' });
    const seco = rodadaExportacoes(P, { aplicar: false });
    assert.deepEqual(seco.vencidas, [vencida.id], 'dry-run aponta só a vencida sem hold');
    assert.ok(existsSync(caminho(vencida)), 'dry-run não apaga');
    const r = rodadaExportacoes(P, { aplicar: true });
    assert.deepEqual(r.eliminadas, [vencida.id]);
    assert.ok(!existsSync(caminho(vencida)));
    for (const x of [noPrazo, emHold, aberta]) assert.ok(existsSync(caminho(x)), `${x.id} foi apagada`);
    const deletadas = todos(P.db, "select entity_id, after from audit_log where action = 'export.deleted'");
    assert.deepEqual(deletadas.map(x => x.entity_id), [vencida.id]);
    assert.doesNotMatch(JSON.stringify(deletadas), /CONTEUDO-SINTETICO/);
    // A que está no prazo sai quando completa 7 dias; a nunca encerrada não tem prazo: vira alerta depois de 30 dias.
    agora += 1 * DIA + 60e3;
    assert.deepEqual(rodadaExportacoes(P, { aplicar: true }).eliminadas, [noPrazo.id]);
    agora += 30 * DIA;
    const depois = rodadaExportacoes(P, { aplicar: true });
    assert.deepEqual(depois.eliminadas, []);
    assert.ok(depois.alertas.includes(aberta.id), 'sem necessidade encerrada: alerta, sem eliminação');
    assert.ok(existsSync(caminho(aberta)) && existsSync(caminho(emHold)));
    assert.equal(PRAZO_COPIA_DIAS, 7);
  } finally { await S.fechar(); }
});
