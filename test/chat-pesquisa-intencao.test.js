import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedePesquisa } from '../src/chat-recursos.js';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';

test('datas e material interno não pedem busca; pesquisa explícita e notícias atuais continuam pedindo', () => {
  for (const pedido of ['Escreva um email para a equipe hoje.', 'Resuma em uma linha: o tempo hoje está bom.',
    'Organize as tarefas para esta semana.', 'Resuma a pesquisa de clima anexada.',
    'Crie uma automação que toda segunda pesquise novidades.', 'Pesquise notícias sem usar a internet.'])
    assert.equal(pedePesquisa(pedido), false, pedido);
  for (const pedido of ['Pesquise notícias atuais de mineração.', 'Consulte a documentação oficial do produto.',
    'Liste notícias atuais do setor.', 'Quais as novidades da semana sobre IA?'])
    assert.equal(pedePesquisa(pedido), true, pedido);
});

test('pesquisa habilitada não envia email ou agenda para consulta externa por causa da data', async () => {
  const or = await openRouterFalso();
  const s = await subir({ ia: or.ia });
  try {
    salvarConfig(s.app.db, { dominios: ['exemplo.com.br'], pesquisaWeb: { ativa: true } });
    const cli = await s.cliente().entrar('admin@exemplo.com.br');
    for (const texto of ['Escreva um email para a equipe hoje.', 'Organize as tarefas para esta semana.']) {
      const conv = (await cli.post('/api/conversas', {})).dados.conversa;
      const inicio = or.chamadas.length;
      const r = await enviarMensagem(cli, conv.id, { texto });
      assert.equal(r.status, 200, JSON.stringify(r.erro));
      const chamadas = or.chamadas.slice(inicio);
      assert.ok(chamadas.length > 0);
      assert.ok(chamadas.every(c => !c.plugins?.some(p => p.id === 'web')));
    }
  } finally { await s.fechar(); await or.fechar(); }
});
