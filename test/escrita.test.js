// Regras de escrita: os vícios típicos de texto de IA são proibidos nas instruções e detectáveis no resultado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGRAS_DE_ESCRITA, viciosDeEscrita, semFechoServil } from '../src/escrita.js';
import { mensagensAdaptacao } from '../src/modelo-pdf.js';

test('detecta os vícios e aceita texto direto', () => {
  const ruim = 'Claro! É importante ressaltar que, no cenário atual, não é apenas tecnologia, é cultura — e isso vai alavancar a jornada da empresa. Se quiser, posso detalhar.';
  assert.deepEqual(viciosDeEscrita(ruim), ['abertura servil', 'oferta de ajuda no fim', '"é importante ressaltar"', 'clichê de cenário', '"não é apenas X, é Y"', 'palavra de efeito', 'travessão dramático']);
  assert.deepEqual(viciosDeEscrita('A RAFISA fecha a DRE gerencial no dia 18. A meta do projeto é fechar até o 5º dia útil.'), []);
  assert.equal(semFechoServil('Resultado.\n\nSe quiser, posso montar a próxima versão.'), 'Resultado.');
});

test('as regras vão na conversa e na adaptação de modelo, com o briefing acima do modelo', () => {
  const m = mensagensAdaptacao({ slides: [{ numero: 1, blocos: [{ id: '1.1', texto: 'x' }] }], contexto: '', pedido: '' });
  assert.ok(m[0].content.includes(REGRAS_DE_ESCRITA));
  assert.match(m[0].content, /O briefing da pessoa .* manda/);
});

test('persona da conversa usa estilo adaptável, sem impor o editor de documentos', async () => {
  const { subir } = await import('./ajuda.js');
  const { openRouterFalso, enviarMensagem } = await import('./openrouter-falso.js');
  const { salvarConfig } = await import('../src/config.js');
  const OR = await openRouterFalso(); const S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  const c = await S.cliente().entrar('ana@exemplo.com.br');
  const conv = (await c.post('/api/conversas', {})).dados.conversa;
  await enviarMensagem(c, conv.id, { texto: 'Resuma o projeto.' });
  const sistema = JSON.stringify(OR.chamadas.at(-1).messages[0].content);
  assert.ok(sistema.includes('Adapte idioma, tom, registro'));
  assert.ok(!sistema.includes('Proibido (vícios de texto de IA)'));
  await S.fechar(); await OR.fechar();
});
