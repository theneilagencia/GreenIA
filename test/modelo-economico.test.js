// Modelo econômico (out/2026): quatro planos + Capacity Pack, margem TOTAL no pior caso (impostos, pagamento/câmbio,
// suporte/operação, IA com a taxa do intermediário e infraestrutura compartilhada), piso de 50% e meta de 52%, preço
// mínimo, premissas configuráveis, migração sem perda e regras de consumo (franquia → packs FIFO → reserva → pausa).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { subirPlataforma } from './ajuda-plataforma.js';
import { subir } from './ajuda.js';
import { abrirBanco, exec, todos, um } from '../src/db.js';
import { PLANOS_COMERCIAIS, CAPACITY_PACK, PACOTE_LEGADO, regrasComerciais } from '../src/plataforma/catalogo.js';
import { economiaDoPlano, economiaDoPacote, exigirMargem, precoMinimo, statusMargem, validarPremissas, conta, PREMISSAS_PADRAO, custoPorCredito, taxaProporcional } from '../src/plataforma/margem.js';
import { migrarCatalogo, ajustarPrecos } from '../src/plataforma/empresas.js';
import { situacaoPlano, checarPlano, liberarPacote, RESERVA_POR_EXECUCAO } from '../src/plano.js';
import { comUso } from '../src/custo-ia.js';
import { decisaoImagem, motorDoDesign } from '../src/visual/producao.js';
import { lerConfig } from '../src/config.js';

const pr = PREMISSAS_PADRAO;
const quase = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
const abertos = [];
after(async () => { for (const f of abertos) await f(); });

test('catálogo: Starter 199/2.000/400, Team 399/5.000/1.000, Business 749/10.000/2.000, Company 1.799/25.000/5.000; Capacity Pack 229/2.000', () => {
  assert.deepEqual(PLANOS_COMERCIAIS.map(p => [p.name, p.price_usd, p.credits, p.reserve]), [
    ['GreenIA Starter', 199, 2000, 400], ['GreenIA Team', 399, 5000, 1000], ['GreenIA Business', 749, 10000, 2000], ['GreenIA Company', 1799, 25000, 5000]]);
  for (const p of PLANOS_COMERCIAIS) assert.equal(p.reserve, p.credits * 0.2, 'reserva = 20% da franquia');
  assert.deepEqual([CAPACITY_PACK.nome, CAPACITY_PACK.preco_usd, CAPACITY_PACK.creditos], ['Capacity Pack', 229, 2000]);
  assert.deepEqual(regrasComerciais(), { reserve_fast_only: true, pack_name: 'Capacity Pack', pack_credits: 2000, pack_price_usd: 229 });
});

test('premissas: crédito US$ 0,01 + 5,5% = US$ 0,01055; custos proporcionais 12% + 3% + 15% = 30%; piso 50% e meta 52%', () => {
  quase(custoPorCredito(pr), 0.01055);
  quase(taxaProporcional(pr), 0.3);
  assert.deepEqual([pr.min_total_margin_rate, pr.target_total_margin_rate], [0.5, 0.52]);
  const c = conta({ receita: 100, creditos: 1000, infra: 5 }, pr);
  assert.deepEqual([c.impostos, c.pagamento, c.suporte].map(v => Math.round(v * 100) / 100), [12, 3, 15]);
  quase(c.ia, 10.55); quase(c.custoTotal, 30 + 10.55 + 5); quase(c.margem, (100 - 45.55) / 100);
});

test('margem total no pior caso, calculada das premissas (infraestrutura de referência US$ 7,25): faixas, preço mínimo e folga', () => {
  const infra = 7.25;
  const m = Object.fromEntries(PLANOS_COMERCIAIS.map(p => [p.name, economiaDoPlano({ ...p, rules: regrasComerciais() }, { infra, premissas: pr })]));
  // Sanidade (aproximado): Starter ~53,6%, Team ~52,3%, Business ~52,1%, Company ~52,0% (US$ 1.799, na meta).
  quase(m['GreenIA Starter'].margem, 0.536, 0.001); quase(m['GreenIA Team'].margem, 0.523, 0.001);
  quase(m['GreenIA Business'].margem, 0.521, 0.001); quase(m['GreenIA Company'].margem, 0.520, 0.001);
  // Conta explícita do Company: 1.799 × 30% + 30.000 × 0,01055 + 7,25.
  const c = m['GreenIA Company'];
  quase(c.custoPiorCaso, Math.round((1799 * 0.3 + 30000 * 0.01055 + 7.25) * 100) / 100, 0.006);
  for (const e of Object.values(m)) assert.equal(e.status, 'saudavel', 'os quatro planos na meta de 52% com a infraestrutura de referência');
  // Com o preço anterior (US$ 1.749) o Company ficava na faixa de alerta (entre o piso e a meta).
  assert.equal(economiaDoPlano({ credits: 25000, reserve: 5000, price_usd: 1749, rules: regrasComerciais() }, { infra, premissas: pr }).status, 'alerta');
  for (const e of Object.values(m)) {
    assert.ok(e.margem >= 0.5, 'todos acima do piso');
    quase(e.folga, e.margem - 0.5);
    // O preço mínimo dá exatamente 50% de margem total.
    quase(conta({ receita: e.precoMinimo, creditos: e.capacidadePiorCaso, infra }, pr).margem, 0.5, 1e-4);
    assert.ok(e.margemIa > e.margem, 'margem de IA é métrica secundária, não a trava');
  }
  // Capacity Pack: sem infraestrutura nova, ~60,8%.
  const k = economiaDoPacote({ creditos: 2000, preco: 229 }, pr);
  quase(k.margem, 0.608, 0.001); assert.equal(k.status, 'saudavel');
  // Preço mínimo: IA + infraestrutura podem consumir no máximo 20% da receita.
  const pm = precoMinimo({ creditos: 12000, infra: 10 }, pr);   // (126,60 + 10) ÷ 20% = 683,00
  assert.equal(pm, 683);
  assert.ok(conta({ receita: pm, creditos: 12000, infra: 10 }, pr).margem >= 0.5 - 1e-12 && conta({ receita: pm - 0.01, creditos: 12000, infra: 10 }, pr).margem < 0.5);
  // Faixas.
  assert.deepEqual([statusMargem(0.4999, pr), statusMargem(0.5, pr), statusMargem(0.5199, pr), statusMargem(0.52, pr)], ['critico', 'alerta', 'alerta', 'saudavel']);
});

test('trava: abaixo de 50% é erro; exatamente no preço mínimo passa; a média de uso não contorna a trava', () => {
  const base = { credits: 10000, reserve: 2000, rules: regrasComerciais() };
  const minimo = precoMinimo({ creditos: 12000, infra: 7.25 }, pr);
  assert.throws(() => exigirMargem({ ...base, price_usd: minimo - 1 }, { infra: 7.25, premissas: pr }), e => e.codigo === 'margem' && /preço mínimo/.test(e.message));
  assert.doesNotThrow(() => exigirMargem({ ...base, price_usd: minimo }, { infra: 7.25, premissas: pr }));
  // Com 25% de uso a margem seria alta, mas a trava olha o pior caso (franquia + reserva inteiras).
  const e = economiaDoPlano({ ...base, price_usd: minimo - 1 }, { infra: 7.25, premissas: pr });
  assert.ok(e.simulacao[0].margem > 0.6 && e.margem < 0.5);
  assert.deepEqual(e.simulacao.map(x => x.uso), [0.25, 0.5, 0.75, 1, 'pior_caso']);
  assert.throws(() => exigirMargem({ ...base, price_usd: 749, rules: { ...regrasComerciais(), pack_price_usd: 40 } }, { premissas: pr }), e => e.codigo === 'margem_pacote');
  // Sem preço e sem teto não são planos comerciais: não têm margem nem trava.
  assert.ok(economiaDoPlano({ credits: 1000, reserve: 100, price_usd: 0 }, { premissas: pr }).semReceita);
  assert.ok(economiaDoPlano({ credits: 0, reserve: 0, price_usd: null }, { premissas: pr }).semTeto);
});

test('premissas validadas no servidor: frações entre 0 e 1, meta ≥ piso, custos + piso < 100%; o custo-base do crédito não é editável', () => {
  assert.throws(() => validarPremissas({ tax_rate: 12 }), e => e.codigo === 'tax_rate');
  assert.throws(() => validarPremissas({ min_total_margin_rate: 0.6, target_total_margin_rate: 0.55 }), e => e.codigo === 'target_total_margin_rate');
  assert.throws(() => validarPremissas({ support_operation_rate: 0.4, min_total_margin_rate: 0.5 }), e => e.codigo === 'premissas');
  assert.equal(validarPremissas({ ai_credit_base_cost: 0.5 }).ai_credit_base_cost, 0.01);
  assert.equal(validarPremissas({ tax_rate: 0.15 }).tax_rate, 0.15);
});

test('plataforma nova: os quatro planos, o Liberado e o Capacity Pack; mesmos limites e recursos; premissas pelo console (auditadas) mudam as margens', async () => {
  const S = await subirPlataforma(); abertos.push(S.fechar);
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const r = (await ops.get('/api/plataforma/planos')).dados;
  const comerciais = r.planos.filter(p => p.credits > 0);
  assert.deepEqual(comerciais.map(p => [p.name, p.price_usd, p.credits, p.reserve]), PLANOS_COMERCIAIS.map(p => [p.name, p.price_usd, p.credits, p.reserve]));
  for (const p of comerciais) {
    assert.deepEqual(p.limits, comerciais[0].limits, 'mesmos limites operacionais');
    assert.equal(p.limits.max_users, 0, 'usuários ilimitados');
    assert.deepEqual(Object.values(p.features).every(Boolean), true, 'todas as funcionalidades');
    assert.deepEqual([p.rules.pack_name, p.rules.pack_credits, p.rules.pack_price_usd], ['Capacity Pack', 2000, 229]);
  }
  assert.ok(r.planos.find(p => p.name === 'GreenIA Liberado').economia.semTeto);
  const antes = r.planos.find(p => p.name === 'GreenIA Team').economia.margem;
  assert.equal((await ops.put('/api/plataforma/premissas', { tax_rate: 2 })).status, 400);
  assert.equal((await ops.put('/api/plataforma/premissas', { tax_rate: 0.13 })).status, 200);
  const depois = (await ops.get('/api/plataforma/planos')).dados.planos.find(p => p.name === 'GreenIA Team').economia.margem;
  quase(antes - depois, 0.01, 1e-9);
  assert.ok(JSON.stringify((await ops.get('/api/plataforma/auditoria')).dados).includes('platform.economics_changed'));
  // Com a premissa nova, um preço que passava pode deixar de passar (a trava usa as premissas salvas).
  const min = (await ops.post('/api/plataforma/planos/previa', { credits: 5000, reserve: 1000, price_usd: 1 })).dados.economia.precoMinimo;
  assert.equal((await ops.post('/api/plataforma/planos', { name: 'Teste piso', credits: 5000, reserve: 1000, price_usd: min - 0.5, limits: {}, features: {}, rules: regrasComerciais() })).status, 400);
  assert.equal((await ops.post('/api/plataforma/planos', { name: 'Teste piso', credits: 5000, reserve: 1000, price_usd: min, limits: {}, features: {}, rules: regrasComerciais() })).status, 200);
  assert.equal((await ops.put('/api/plataforma/premissas', { tax_rate: 0.12 })).status, 200);
});

test('migração do catálogo: Team e Company atualizados no MESMO registro (empresas continuam vinculadas), Starter e Business criados, planos do operador intocados, idempotente', async () => {
  const S = await subirPlataforma(); abertos.push(S.fechar);
  const { P } = S;
  const ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  // Estado antigo: só Team (290/10.000/2.000) e Company (750/25.000/5.000) com o pacote de 10.000 por US$ 250, e um piloto.
  const id = n => um(P.db, 'select id from plans where name = ?', n).id;
  const team = id('GreenIA Team'), company = id('GreenIA Company');
  exec(P.db, "delete from plans where name in ('GreenIA Starter', 'GreenIA Business')");
  const velho = JSON.stringify({ reserve_fast_only: true, pack_credits: 10000, pack_price_usd: 250 });
  exec(P.db, 'update plans set price_usd = 290, credits = 10000, reserve = 2000, rules = ? where id = ?', velho, team);
  exec(P.db, 'update plans set price_usd = 750, credits = 25000, reserve = 5000, rules = ? where id = ?', velho, company);
  exec(P.db, "insert into plans (id, name, price_usd, credits, reserve, created_at, updated_at) values ('plan_piloto', 'Piloto especial', 0, 1000, 100, 'x', 'x')");
  exec(P.db, "delete from platform_settings where key = 'catalogo_2026_10'");
  const A = (await ops.post('/api/plataforma/empresas', { name: 'Alfa', slug: 'alfa-mig', status: 'ativa', plan_id: team, admin_email: 'x@alfa-mig.com' })).dados;
  liberarPacote(P.tenant(A.id), null, 10000, { produto: PACOTE_LEGADO.produto, precoUsd: 250 });   // compra antiga preservada
  migrarCatalogo(P);
  const planos = todos(P.db, 'select id, name, price_usd, credits, reserve, rules, status from plans').map(p => ({ ...p, rules: JSON.parse(p.rules || '{}') }));
  const por = n => planos.find(p => p.name === n);
  assert.equal(por('GreenIA Team').id, team, 'mesmo id');
  assert.deepEqual([por('GreenIA Team').price_usd, por('GreenIA Team').credits, por('GreenIA Team').reserve], [399, 5000, 1000]);
  assert.equal(por('GreenIA Company').id, company);
  assert.deepEqual([por('GreenIA Company').price_usd, por('GreenIA Company').credits, por('GreenIA Company').reserve], [1799, 25000, 5000]);
  assert.ok(por('GreenIA Starter') && por('GreenIA Business'));
  for (const n of ['GreenIA Starter', 'GreenIA Team', 'GreenIA Business', 'GreenIA Company']) assert.deepEqual([por(n).rules.pack_credits, por(n).rules.pack_price_usd], [2000, 229]);
  assert.deepEqual([por('Piloto especial').price_usd, por('Piloto especial').credits], [0, 1000], 'plano do operador intocado');
  // A empresa continua no mesmo plano, agora com a franquia nova; o pacote antigo continua lá, com o valor da época.
  assert.equal(um(P.db, 'select plan_id from companies where id = ?', A.id).plan_id, team);
  assert.deepEqual([P.tenant(A.id).plano.creditos, P.tenant(A.id).plano.reserva], [5000, 1000]);
  assert.deepEqual({ ...um(P.tenant(A.id).db, 'select creditos, produto, preco_usd from pacotes') }, { creditos: 10000, produto: PACOTE_LEGADO.produto, preco_usd: 250 });
  assert.equal(todos(P.db, "select 1 from audit_log where action in ('plan.migrated', 'plan.created')").length, 4);
  // Idempotente: rodar de novo não muda nada.
  migrarCatalogo(P);
  assert.equal(todos(P.db, "select 1 from audit_log where action in ('plan.migrated', 'plan.created')").length, 4);
  assert.equal(todos(P.db, "select 1 from plans where name like 'GreenIA %'").length, 5);
});

test('ajuste de preço do Company (US$ 1.749 → 1.799): uma vez, auditado, e só se o preço ainda é o de catálogo', async () => {
  const S = await subirPlataforma(); abertos.push(S.fechar);
  const { P } = S;
  const company = um(P.db, "select id from plans where name = 'GreenIA Company'").id;
  // Plataforma que já tinha migrado para US$ 1.749 e ainda não recebeu o ajuste.
  exec(P.db, 'update plans set price_usd = 1749 where id = ?', company);
  exec(P.db, "delete from platform_settings where key = 'catalogo_2026_10b_company'");
  ajustarPrecos(P);
  assert.equal(um(P.db, 'select price_usd from plans where id = ?', company).price_usd, 1799);
  assert.equal(todos(P.db, "select 1 from audit_log where action = 'plan.migrated' and entity_id = ?", company).length, 1);
  ajustarPrecos(P);   // idempotente
  assert.equal(todos(P.db, "select 1 from audit_log where action = 'plan.migrated' and entity_id = ?", company).length, 1);
  // Preço ajustado pelo operador não é sobrescrito.
  exec(P.db, 'update plans set price_usd = 1900 where id = ?', company);
  exec(P.db, "delete from platform_settings where key = 'catalogo_2026_10b_company'");
  ajustarPrecos(P);
  assert.equal(um(P.db, 'select price_usd from plans where id = ?', company).price_usd, 1900);
});

test('migração do banco da empresa: pacotes antigos ganham produto legado e o valor da época, sem mudar créditos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pacotes-'));
  try {
    const arq = join(dir, 'e.sqlite');
    let db = abrirBanco(arq);
    exec(db, "insert into pacotes (em, creditos, origem) values ('2026-09-10T00:00:00Z', 10000, 'console'), ('2026-09-20T00:00:00Z', 5000, 'painel')");
    // Volta o banco ao formato anterior (sem as colunas) e uma versão atrás.
    const v = db.prepare('pragma user_version').get().user_version;
    db.close();
    const cru = new DatabaseSync(arq);
    cru.exec('alter table pacotes drop column produto; alter table pacotes drop column preco_usd;');
    cru.exec(`pragma user_version = ${v - 1}`);
    cru.close();
    db = abrirBanco(arq);
    assert.deepEqual(todos(db, 'select creditos, produto, preco_usd from pacotes order by id').map(x => ({ ...x })),
      [{ creditos: 10000, produto: 'pacote_legado_10000', preco_usd: 250 }, { creditos: 5000, produto: 'pacote_legado_10000', preco_usd: 125 }]);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('consumo: franquia primeiro, depois Capacity Packs (do mais antigo), por último a reserva; pausa no fim; renovação zera a franquia e o pack acumula', async () => {
  let agora = new Date('2026-10-10T12:00:00Z');
  const T = await subir({ agora: () => agora, plano: { creditos: 100, reserva: 20 } }); abertos.push(T.fechar);
  const gastar = creditos => exec(T.app.db, 'insert into uso (em, pessoa_id, custo) values (?, 1, ?)', agora.toISOString(), creditos * 0.01);
  gastar(90);
  assert.deepEqual([situacaoPlano(T.app).fase, situacaoPlano(T.app).usados], ['aviso', 90]);
  liberarPacote(T.app, null, 30, { produto: 'capacity_pack', precoUsd: 229 });   // mais antigo
  agora = new Date('2026-10-11T12:00:00Z');
  liberarPacote(T.app, null, 50, { produto: 'capacity_pack', precoUsd: 229 });
  gastar(40);   // 130: 100 da franquia, 30 do pack mais antigo
  let s = situacaoPlano(T.app);
  assert.deepEqual([s.fase, s.pacoteDisponivel, s.naReserva], ['pacote', 50, 0]);
  gastar(50);   // segundo pack inteiro
  s = situacaoPlano(T.app);
  assert.deepEqual([s.fase, s.pacoteDisponivel, s.naReserva], ['reserva', 0, 0]);
  gastar(20);   // reserva inteira
  s = situacaoPlano(T.app);
  assert.equal(s.fase, 'esgotado');
  assert.throws(() => checarPlano(T.app), e => e.codigo === 'plano_esgotado');
  // Renovação: franquia volta inteira; a sobra de franquia nunca acumula; pack comprado e não usado acumula.
  agora = new Date('2026-11-02T12:00:00Z');
  liberarPacote(T.app, null, 25, { produto: 'capacity_pack', precoUsd: 229 });
  s = situacaoPlano(T.app);
  assert.deepEqual([s.fase, s.usados, s.creditos, s.pacoteDisponivel], ['normal', 0, 100, 25]);
  agora = new Date('2026-12-02T12:00:00Z');
  s = situacaoPlano(T.app);
  assert.deepEqual([s.usados, s.creditos, s.pacoteDisponivel], [0, 100, 25], 'franquia de novembro não usada não passou para dezembro; o pack sim');
});

test('reserva: só classe Rápido, sem imagem, sem design pela IA, sem conferência por IA, sem estrutura de Quick Win; execuções simultâneas não passam do teto', async () => {
  const ia = { configurada: true, geraImagem: true, async gerarImagem() { return null; }, async *enviar() {}, async listarModelos() { return []; } };
  const T = await subir({ ia, plano: { creditos: 10, reserva: 4 } }); abertos.push(T.fechar);
  exec(T.app.db, 'insert into uso (em, pessoa_id, custo) values (?, 1, 0.1)', new Date().toISOString());   // 10 de 10: reserva
  assert.equal(situacaoPlano(T.app).fase, 'reserva');
  const cfg = { ...lerConfig(T.app.db), producaoVisual: { imagens: { ativa: true } } };
  assert.deepEqual(decisaoImagem(T.app, cfg, { reserva: true }), { pode: false, motivo: 'reserva_do_plano' });
  assert.deepEqual(motorDoDesign({ usarIA: false, temChamada: true, nav: { ok: true }, tr: {} }).motivo, 'reserva_do_plano');
  const { chamarGovernado } = await import('../src/quickwin-estrutura.js');
  const pessoa = { ...um(T.app.db, "select * from pessoas where email = 'admin@exemplo.com.br'"), ciencia_versao: 1e9 };   // ciência em dia
  const r = await chamarGovernado(T.app, pessoa, { conteudo: 'x', mensagens: [{ role: 'user', content: 'x' }], origem: 'quick_win_estrutura' });
  assert.deepEqual([r.recusado, r.motivo], [true, 'plano_na_reserva']);
  // Reserva de 4 créditos, vaga de RESERVA_POR_EXECUCAO por execução: só cabem 4 / 2 = 2 execuções ao mesmo tempo.
  assert.equal(RESERVA_POR_EXECUCAO, 2);
  let soltar; const espera = new Promise(ok => { soltar = ok; });
  const execucao = () => comUso(T.app, { pessoa_id: pessoa.id }, async () => { checarPlano(T.app); await espera; });
  const a = execucao(), b = execucao();
  await assert.rejects(execucao(), e => e.codigo === 'plano_esgotado', 'a terceira simultânea passaria do teto');
  soltar(); await Promise.all([a, b]);
  assert.equal(T.app.execucoesNaReserva, 0, 'vagas liberadas no fim de cada execução');
  await execucao();   // terminada a anterior, cabe de novo
});
