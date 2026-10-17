// Exportação do banco: só por pedido do Cliente, incidente de segurança ou obrigação legal ("suporte" não exporta);
// cópia no servidor com prazo de 7 dias depois de encerrada a necessidade; hold suspende; download e eliminação
// registrados; cópia baixada não tem eliminação "provada", só declarada.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { subirPlataforma } from './ajuda-plataforma.js';
import { um, todos } from '../src/db.js';
import { rodadaExportacoes, PRAZO_COPIA_DIAS } from '../src/plataforma/exportacoes.js';

const DIA = 864e5;
let S, ops, A, ana;
let deslocamento = 0;
const avancar = ms => { deslocamento += ms; };
const agora = () => Date.now() + deslocamento;

before(async () => {
  S = await subirPlataforma({ agora: () => new Date(agora()) });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
  const planos = (await ops.get('/api/plataforma/planos')).dados.planos;
  A = (await ops.post('/api/plataforma/empresas', { name: 'Acme', slug: 'acme', plan_id: planos[0].id, admin_email: 'ana@acme.com', status: 'ativa' })).dados;
  ana = S.navegador(); await ana.get('/acme'); await ana.entrarEmpresa('ana@acme.com');
});
after(() => S.fechar());

const exportar = corpo => ops.post(`/api/plataforma/empresas/${A.id}/exportar`, corpo);
const linha = id => um(S.P.db, 'select * from operator_exports where id = ?', id);
const acoes = id => todos(S.P.db, 'select action from audit_log where entity_id = ? order by id', id).map(x => x.action);
const arquivo = x => join(S.P.pastaExportacoes, x.arquivo);
// O console vence em 12 horas: quando o relógio avança mais, entra de novo.
async function renovar() { if ((await ops.get('/api/plataforma/planos')).status !== 200) ops = await S.navegador().entrarConsole('ops@theneil.com.br'); }

test('"suporte" (e "outro") isolado não exporta o banco; sem justificativa também não', async () => {
  for (const tipo of ['suporte', 'outro', 'curiosidade', '']) {
    const r = await exportar({ tipo, justificativa: 'Conferir um problema relatado pelo usuário' });
    assert.equal(r.status, 400, tipo);
  }
  assert.equal((await exportar({ tipo: 'incidente', justificativa: 'curta' })).status, 400);
  assert.equal(um(S.P.db, 'select count(*) as n from operator_exports').n, 0, 'nada é gerado nem registrado');
});

test('pedido do Cliente, incidente e obrigação legal exportam: cópia no servidor, hash, registro e aviso', async () => {
  for (const tipo of ['solicitacao_cliente', 'incidente', 'obrigacao_legal']) {
    const r = await exportar({ tipo, justificativa: `Exportação de teste para ${tipo}` });
    assert.equal(r.status, 200, tipo);
    const x = linha(r.dados.id);
    assert.deepEqual([x.tipo, x.sucesso, x.operador_email, x.company_id], [tipo, 1, 'ops@theneil.com.br', A.id]);
    assert.ok(x.em && x.bytes > 0 && /^[0-9a-f]{64}$/.test(x.sha256));
    assert.ok(existsSync(arquivo(x)), 'a cópia fica no servidor');
    assert.equal(x.necessidade_encerrada_em, null);
    assert.equal(x.expira_em, null, 'sem necessidade encerrada, ainda não há prazo');
    assert.ok(acoes(x.id).includes('company.exported'));
  }
  const vistas = (await ana.get('/api/empresa/acessos-greenia')).dados.exportacoes;
  assert.deepEqual(new Set(vistas.map(v => v.tipoNome)), new Set(['Pedido do cliente', 'Incidente de segurança', 'Obrigação legal']));
});

test('download registrado (quem e quando); necessidade encerrada calcula expires_at = +7 dias; elimina no prazo', async () => {
  const id = (await exportar({ tipo: 'solicitacao_cliente', justificativa: 'Cópia pedida pela Ana por email' })).dados.id;
  const baixa = await ops.get(`/api/plataforma/exportacoes/${id}/arquivo`);
  assert.equal(baixa.status, 200);
  assert.equal(linha(id).downloads, 1);
  assert.equal(linha(id).baixado_por, 'ops@theneil.com.br');
  assert.ok(acoes(id).includes('export.downloaded'));
  const t = agora();
  const r = await ops.post(`/api/plataforma/exportacoes/${id}/encerrar-necessidade`, {});
  assert.equal(r.status, 200);
  const x = linha(id);
  assert.ok(Math.abs(Date.parse(x.necessidade_encerrada_em) - t) < 2000);
  assert.equal(Date.parse(x.expira_em) - Date.parse(x.necessidade_encerrada_em), PRAZO_COPIA_DIAS * DIA);
  // Antes do prazo, nada; depois, dry-run só registra; aplicar elimina (revalidando).
  avancar(PRAZO_COPIA_DIAS * DIA - 60e3);
  assert.deepEqual(rodadaExportacoes(S.P, { aplicar: true }).eliminadas.filter(e => e === id), []);
  avancar(2 * 60e3);
  const seco = rodadaExportacoes(S.P, { aplicar: false });
  assert.ok(seco.vencidas.includes(id) && existsSync(arquivo(x)));
  assert.ok(rodadaExportacoes(S.P, { aplicar: true }).eliminadas.includes(id));
  assert.ok(!existsSync(arquivo(x)));
  assert.equal(linha(id).eliminacao, 'prazo');
  assert.ok(acoes(id).includes('export.deleted'));
  // Idempotente; depois de eliminada, o download falha.
  assert.ok(!rodadaExportacoes(S.P, { aplicar: true }).eliminadas.includes(id));
  await renovar();
  assert.equal((await ops.get(`/api/plataforma/exportacoes/${id}/arquivo`)).status, 410);
});

test('hold (obrigação legal ou incidente) suspende o prazo; ao liberar, o tempo restante volta a correr', async () => {
  await renovar();
  const id = (await exportar({ tipo: 'incidente', justificativa: 'Análise do incidente INC-9 com o cliente' })).dados.id;
  await ops.post(`/api/plataforma/exportacoes/${id}/encerrar-necessidade`, {});
  avancar(2 * DIA);
  await renovar();
  assert.equal((await ops.post(`/api/plataforma/exportacoes/${id}/hold`, { tipo: 'legal', motivo: 'curto' })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/exportacoes/${id}/hold`, { tipo: 'legal', motivo: 'Ordem judicial pede preservação da cópia' })).status, 200);
  avancar(30 * DIA);
  assert.ok(!rodadaExportacoes(S.P, { aplicar: true }).eliminadas.includes(id), 'em hold, não elimina');
  assert.ok(existsSync(arquivo(linha(id))));
  await renovar();
  assert.equal((await ops.post(`/api/plataforma/exportacoes/${id}/liberar`, {})).status, 200);
  const x = linha(id);
  // Faltavam 5 dias quando o hold começou: voltam a contar a partir da liberação.
  assert.ok(Math.abs(Date.parse(x.expira_em) - (agora() + 5 * DIA)) < 5000, x.expira_em);
  avancar(5 * DIA + 60e3);
  assert.ok(rodadaExportacoes(S.P, { aplicar: true }).eliminadas.includes(id));
  const a = acoes(id);
  for (const k of ['company.exported', 'export.need_ended', 'export.hold', 'export.hold_released', 'export.deleted']) assert.ok(a.includes(k), k);
});

test('cópia baixada: a eliminação externa só é declarada (não é provada) e exige download', async () => {
  await renovar();
  const id = (await exportar({ tipo: 'obrigacao_legal', justificativa: 'Atender ofício da autoridade nº 45/2026' })).dados.id;
  assert.equal((await ops.post(`/api/plataforma/exportacoes/${id}/declarar-eliminacao`, { texto: 'Arquivo apagado do notebook' })).status, 409, 'sem download, não há cópia externa');
  await ops.get(`/api/plataforma/exportacoes/${id}/arquivo`);
  assert.equal((await ops.post(`/api/plataforma/exportacoes/${id}/declarar-eliminacao`, { texto: 'Arquivo apagado do notebook e da lixeira em 05/10' })).status, 200);
  const x = linha(id);
  assert.ok(x.declaracao && x.declarada_por === 'ops@theneil.com.br');
  assert.equal(x.eliminado_em, null, 'a declaração não elimina nem prova nada no servidor');
  assert.ok(acoes(id).includes('export.elimination_declared'));
  ana = S.navegador(); await ana.get('/acme'); await ana.entrarEmpresa('ana@acme.com');   // a sessão dela venceu com o relógio
  const vista = (await ana.get('/api/empresa/acessos-greenia')).dados.exportacoes.find(e => e.id === id);
  assert.equal(vista.baixadoPor, 'ops@theneil.com.br');
  assert.ok(vista.declaracao);
});
