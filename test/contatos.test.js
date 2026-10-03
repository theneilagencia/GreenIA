// Contatos comerciais (página de vendas, multiempresa): last_interaction_at real, retenção de 24 meses depois da
// última interação, eliminação dos dados pessoais (com contagem agregada não reidentificável), hold, sem limite de
// 500 que apague, e email aos admins sem cópia do conteúdo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import { um, todos } from '../src/db.js';
import { salvarAjuste, lerAjuste } from '../src/plataforma/db.js';
import { rodadaContatos, registrarFormulario, listarContatos, migrarContatosAntigos, limiteRetencao, listaAntigaDosContatos } from '../src/plataforma/contatos.js';

let S, ops;
let deslocamento = 0;
const avancar = ms => { deslocamento += ms; };
const agora = () => Date.now() + deslocamento;
const DIA = 864e5;

before(async () => {
  S = await subirPlataforma({ paginaInicial: 'vendas', agora: () => new Date(agora()) });
  ops = await S.navegador().entrarConsole('ops@theneil.com.br');
});
after(() => S.fechar());

const enviar = corpo => fetch(`${S.base}/api/contato`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'plataforma.teste' }, body: JSON.stringify(corpo) });
const contato = email => um(S.P.db, 'select * from commercial_contacts where email = ?', email);
async function renovar() { if ((await ops.get('/api/plataforma/planos')).status !== 200) ops = await S.navegador().entrarConsole('ops@theneil.com.br'); }

test('formulário cria o contato com last_interaction_at; o mesmo email volta ao mesmo contato; email aos admins sem o conteúdo', async () => {
  const antes = S.P.email.enviados.length;
  const r = await enviar({ nome: 'Paula Prado', email: 'paula@cliente.com', empresa: 'Cliente Exemplo', cargo: 'Diretora', pessoas: '51 a 200', mensagem: 'Quero uma apresentação detalhada' });
  assert.equal(r.status, 200);
  const c = contato('paula@cliente.com');
  assert.ok(c && c.created_at === c.last_interaction_at);
  assert.equal(lerAjuste(S.P.db, 'leads', null), null, 'nada no formato antigo');
  await new Promise(x => setTimeout(x, 20));
  const novos = S.P.email.enviados.slice(antes);
  assert.ok(novos.length >= 1);
  for (const m of novos) {
    assert.equal(m.assunto, 'Novo contato recebido');
    assert.doesNotMatch(`${m.assunto} ${m.texto}`, /Paula|paula@cliente\.com|Cliente Exemplo|apresentação detalhada|Diretora/, 'o email não carrega cópia dos dados do contato');
    assert.match(m.texto, new RegExp(c.id));
  }
  avancar(10 * DIA);
  await enviar({ nome: 'Paula Prado', email: 'Paula@Cliente.com', empresa: 'Cliente Exemplo', mensagem: 'Voltando ao assunto' });
  const c2 = contato('paula@cliente.com');
  assert.equal(c2.id, c.id);
  assert.ok(c2.last_interaction_at > c.last_interaction_at);
  assert.equal(um(S.P.db, 'select count(*) as n from commercial_interactions where contact_id = ?', c.id).n, 2);
});

test('interação real registrada no console move last_interaction_at; data futura é recusada; automação não move', async () => {
  await renovar();
  const c = contato('paula@cliente.com');
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/interacao`, { tipo: 'reuniao', em: new Date(agora() + DIA).toISOString() })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/interacao`, { tipo: 'visita-ao-site' })).status, 400);
  avancar(DIA);
  await renovar();
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/interacao`, { tipo: 'resposta', nota: 'Respondido por email' })).status, 200);
  const depois = contato('paula@cliente.com');
  assert.ok(Math.abs(Date.parse(depois.last_interaction_at) - agora()) < 2000);
  // Interação antiga registrada depois não recua a data.
  await ops.post(`/api/plataforma/contatos/${c.id}/interacao`, { tipo: 'outro', em: new Date(agora() - 100 * DIA).toISOString() });
  assert.equal(contato('paula@cliente.com').last_interaction_at, depois.last_interaction_at);
  // Rodadas internas (consulta, listagem, dry-run) não mexem no prazo.
  listarContatos(S.P); rodadaContatos(S.P, { aplicar: false });
  assert.equal(contato('paula@cliente.com').last_interaction_at, depois.last_interaction_at);
});

test('24 meses: até o limite fica; passou, dry-run só registra e aplicar elimina os dados pessoais; agregado não reidentifica', async () => {
  await enviar({ nome: 'Rui Roque', email: 'rui@antigo.com', empresa: 'Antiga Ltda', pessoas: 'até 50', mensagem: 'Contato que vai vencer' });
  const c = contato('rui@antigo.com');
  const vence = new Date(c.last_interaction_at); vence.setUTCMonth(vence.getUTCMonth() + 24);
  avancar(Date.parse(vence) - agora() - DIA);   // um dia antes do limite
  assert.ok(!rodadaContatos(S.P, { aplicar: true }).eliminados.includes(c.id));
  assert.ok(contato('rui@antigo.com'));
  avancar(2 * DIA);
  const logs = [];
  const seco = rodadaContatos(S.P, { aplicar: false, log: m => logs.push(m) });
  assert.ok(seco.vencidos.includes(c.id) && contato('rui@antigo.com'));
  assert.doesNotMatch(logs.join(' '), /rui|Antiga/i, 'o log não traz dados do contato');
  const r = rodadaContatos(S.P, { aplicar: true });
  assert.ok(r.eliminados.includes(c.id));
  assert.equal(contato('rui@antigo.com'), undefined);
  assert.equal(um(S.P.db, 'select count(*) as n from commercial_interactions where contact_id = ?', c.id).n, 0);
  // Nenhum resto pessoal no banco da plataforma (contatos, interações, auditoria, estatística).
  const tudo = JSON.stringify([todos(S.P.db, 'select * from commercial_contacts'), todos(S.P.db, 'select * from commercial_interactions'), todos(S.P.db, 'select * from audit_log'), todos(S.P.db, 'select * from commercial_contacts_stats')]);
  assert.doesNotMatch(tudo, /rui@antigo\.com|Rui Roque|Antiga Ltda|Contato que vai vencer/);
  const st = todos(S.P.db, 'select * from commercial_contacts_stats');
  assert.deepEqual(Object.keys(st[0]).sort(), ['eliminados', 'mes', 'pessoas'], 'só mês de entrada, faixa e contagem');
  assert.ok(st.some(x => x.pessoas === 'até 50' && x.eliminados >= 1));
  assert.ok(um(S.P.db, "select 1 from audit_log where action = 'contact.deleted' and entity_id = ?", c.id));
  // A Paula, que também passou do prazo, é eliminada na mesma rodada; o limite é de calendário (24 meses).
  assert.equal(contato('paula@cliente.com'), undefined);
  assert.equal(limiteRetencao(new Date('2026-10-01T00:00:00Z')), '2024-10-01T00:00:00.000Z');
});

test('hold (obrigação legal, contrato ou litígio) impede a eliminação; liberado, segue a regra', async () => {
  await enviar({ nome: 'Lia Lima', email: 'lia@litigio.com', empresa: 'Litígio SA', mensagem: 'Contato em disputa' });
  const c = contato('lia@litigio.com');
  await renovar();
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/hold`, { tipo: 'litigio', motivo: 'curto' })).status, 400);
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/hold`, { tipo: 'litigio', motivo: 'Processo 0001234-56.2026 em andamento' })).status, 200);
  avancar(800 * DIA);
  assert.ok(!rodadaContatos(S.P, { aplicar: true }).eliminados.includes(c.id));
  assert.ok(contato('lia@litigio.com'));
  await renovar();
  assert.equal((await ops.post(`/api/plataforma/contatos/${c.id}/liberar`, {})).status, 200);
  assert.ok(rodadaContatos(S.P, { aplicar: true }).eliminados.includes(c.id));
});

test('limite de 500 não apaga: 510 contatos ficam todos; a listagem é paginada', () => {
  for (let i = 0; i < 510; i++) registrarFormulario(S.P, { nome: `Pessoa ${i}`, email: `p${i}@massa.com`, empresa: 'Massa', cargo: '', pessoas: '', mensagem: '' });
  assert.equal(um(S.P.db, "select count(*) as n from commercial_contacts where email like '%@massa.com'").n, 510);
  const l = listarContatos(S.P, { pagina: 0, porPagina: 50 });
  assert.equal(l.itens.length, 50);
  assert.ok(l.total >= 510);
  assert.equal(listarContatos(S.P, { pagina: 10, porPagina: 50 }).itens.length, l.total - 500);
});

test('migração: provada por contagem, sem perda, sem duplicar o mesmo email, idempotente, com rollback sem perda', () => {
  const base = agora();
  const t = i => new Date(base - (10 - i) * DIA).toISOString();
  const antigos = [
    { nome: 'Velho', email: 'velho@antigo.com', empresa: 'Velha', cargo: 'Sócio', pessoas: 'até 50', mensagem: 'primeiro', em: t(1) },
    { nome: 'Velho Silva', email: 'VELHO@antigo.com', empresa: 'Velha SA', cargo: 'Diretor', pessoas: '51 a 200', mensagem: 'segundo', em: t(2) },
    { nome: 'Outra', email: 'outra@antigo.com', empresa: 'Outra', cargo: '', pessoas: '', mensagem: '', em: t(3) },
  ];
  salvarAjuste(S.P.db, 'leads', antigos);
  const contatosAntes = um(S.P.db, 'select count(*) as n from commercial_contacts').n;
  const r = migrarContatosAntigos(S.P);
  assert.deepEqual([r.entradas, r.emailsDistintos, r.interacoes], [3, 2, 3]);
  assert.equal(um(S.P.db, 'select count(*) as n from commercial_contacts').n, contatosAntes + 2, 'um contato por email');
  assert.equal(lerAjuste(S.P.db, 'leads', null), null, 'a lista antiga sai do banco');
  const v = contato('velho@antigo.com');
  assert.deepEqual([v.created_at, v.last_interaction_at, v.nome, v.empresa], [t(1), t(2), 'Velho Silva', 'Velha SA'], 'mais antigo cria; mais recente atualiza');
  assert.equal(um(S.P.db, 'select count(*) as n from commercial_interactions where contact_id = ?', v.id).n, 2);
  const aud = JSON.parse(um(S.P.db, "select after from audit_log where action = 'contacts.migrated' order by id desc limit 1").after);
  assert.equal(aud.entradas, 3);
  assert.doesNotMatch(JSON.stringify(aud), /velho|outra/i, 'a auditoria só tem contagens');
  assert.equal(migrarContatosAntigos(S.P), null, 'idempotente: não há mais lista antiga');
  // Rollback: a lista antiga é reconstruída sem perda (uma entrada por formulário, com os campos daquele envio).
  const lista = listaAntigaDosContatos(S.P).filter(x => /@antigo\.com$/.test(x.email));
  const chave = x => `${x.em}|${x.email}|${x.nome}|${x.empresa}|${x.cargo}|${x.pessoas}|${x.mensagem}`;
  assert.deepEqual(lista.map(chave).sort(), antigos.map(x => ({ ...x, email: x.email.toLowerCase() })).map(chave).sort());
});
