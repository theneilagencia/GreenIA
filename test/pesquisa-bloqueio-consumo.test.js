import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { autorizarAdvancedFalso } from './advanced-fixture.js';
import { salvarConfig } from '../src/config.js';
import { exec, um } from '../src/db.js';
const ID = 'anthropic/claude-sonnet-5.5';
const pedido = 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.';
for (const modo of ['quickwin', 'chat']) test(`pesquisa ${modo}: reserva maior que US$ 2 bloqueia antes de qualquer inferência, sem resposta genérica`, async () => {
  const or = await openRouterFalso(); const s = await subir({ ia: or.ia });
  try {
    const cli = await s.cliente().entrar('admin@exemplo.com.br');
    exec(s.app.db, 'update modelos set liberado=1 where id=?', ID);
    const grant = await autorizarAdvancedFalso(s, cli, cli.pessoa, [ID]);
    const met = { contexto: 1000000, maxSaida: 128000, entrada: 0.000002, saida: 0.00001, parametros: ['max_tokens', 'tools', 'reasoning'] };
    const a = JSON.parse(um(s.app.db, 'select atributos from modelos where id=?', ID).atributos);
    a.catalogo = { ...met, consultadoEm: s.app.agora().toISOString(), rotas: [{ ...met, id: 'anthropic' }], precosAlternativos: [] };
    exec(s.app.db, 'update modelos set atributos=? where id=?', JSON.stringify(a), ID);
    exec(s.app.db, 'update advanced_autorizacoes set limite_usd=2,limite_chamada_usd=2 where id=?', grant);
    salvarConfig(s.app.db, { dominios: ['exemplo.com.br'], advanced: { limiteMensalUsd: 2 }, pesquisaWeb: { ativa: true } });
    let qw;
    if (modo === 'quickwin') {
      const area = (await cli.post('/api/admin/areas', { nome: 'Pesquisa QA' })).dados.id;
      const r = await cli.post('/api/quick-wins', { areas: [area], assistente: { descricao: pedido } });
      assert.equal(r.status, 200, JSON.stringify(r.dados)); qw = r.dados;
      assert.equal((await cli.put(`/api/quick-wins/${qw.id}`, { modelo: 'classe:avancado', pode_trocar: false })).status, 200);
    }
    const conv = (await cli.post('/api/conversas', qw ? { quick_win_id: qw.id, teste: true } : {})).dados.conversa;
    const antes = or.chamadas.length;
    const r = await enviarMensagem(cli, conv.id, { modelo: 'classe:avancado', texto: modo === 'chat' ? pedido : 'Execute agora.', ...(qw ? { executar_quick_win: true } : {}) });
    assert.equal(or.chamadas.length - antes, 0, JSON.stringify(r));
    assert.equal(r.falha?.codigo, 'advanced_orcamento', JSON.stringify(r));
    assert.equal(r.fim, undefined); assert.equal(r.texto || '', '');
    const rota = um(s.app.db, 'select motivo_bloqueio,resultado from roteamento where conversa_id=? order by id desc limit 1', conv.id);
    assert.equal(rota.motivo_bloqueio, 'advanced_orcamento');
    assert.equal(um(s.app.db, 'select count(*) n from advanced_consumo').n, 0);
  } finally { await s.fechar(); await or.fechar(); }
});
