// QA em produção: no teste de um Quick Win que depende do contexto da empresa, numa empresa sem documentos na base, o
// exemplo pronto mandava usar a empresa fictícia só "se não houver nada sobre a empresa" — e o modelo perguntava se
// devia fazer isso. A reavaliação final da autonomia exigia contexto na base, então a pergunta ficava. Agora o exemplo
// já traz a decisão, e numa conversa de teste a reavaliação final vale também sem base (o material é o exemplo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { json, um } from '../src/db.js';
import * as OP from '../src/quickwin-operacao.js';
import { MARCADOR_PERGUNTA } from '../src/quickwin-construtor.js';

const PEDIDO = 'Crie conteúdo para LinkedIn e Instagram com copy e carrossel.';
const PLANO = { resumo: 'Conteúdo por canal.', contexto_empresa: true, entradas: [], etapas: [{ texto: 'Escrever cada peça' }, { texto: 'Adaptar ao canal' }],
  entregaveis: [{ id: 'e1', tipo: 'copy', canal: 'linkedin' }, { id: 'e2', tipo: 'carrossel', canal: 'instagram' }], ferramentas: ['base_empresa'] };
const texto = c => (typeof c === 'string' ? c : c.map(p => p.text).join('\n'));
let S, OR, ana;
function responder(b) {
  const sis = texto(b.messages[0].content), ultima = texto(b.messages.at(-1).content);
  if (sis.includes('PLANO DE TRABALHO')) return JSON.stringify(PLANO);
  if (sis.includes('conferente de qualidade')) return '{"criterios":[],"objetivo_atingido":true}';
  if (sis.includes('material FICTÍCIO')) return 'Empresa Exemplo Ltda. (fictícia): consultoria de logística para pequenas indústrias. Público: gestores de operação. Tom: direto. Tema da semana: estoque parado.';
  if (!sis.includes('Você está executando o Quick Win')) return 'Certo.';
  // Modelo teimoso: pergunta na execução e na primeira reavaliação; só a reavaliação final resolve.
  if (!ultima.includes('não há nada indispensável faltando')) return `${MARCADOR_PERGUNTA} uso a Empresa Exemplo Ltda. ou a sua empresa?`;
  return `## LinkedIn · Copy\nTexto para a Empresa Exemplo Ltda. (fictícia).\n\n## Instagram · Carrossel\n${OP.MARCA_BRIEFING}\nSlide 1: abertura.\n\n## Escolhas feitas\n- Usei a Empresa Exemplo Ltda. (fictícia), porque não há documentos da empresa.`;
}
before(async () => {
  OR = await openRouterFalso({ responder });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  const admin = await S.cliente().entrar('admin@exemplo.com.br');
  const area = (await admin.post('/api/admin/areas', { nome: 'Marketing' })).dados.id;
  await admin.post('/api/admin/pessoas', { email: 'ana@exemplo.com.br', nome: 'Ana', areas: [{ id: area, responsavel: true }] });
  await admin.put(`/api/admin/modelos/${encodeURIComponent('mistralai/mistral-small')}`, { liberado: true, perfil: 'rapido' });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
  ana.area = area;
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('teste sem documentos da empresa: o exemplo decide pela empresa fictícia e a execução não para numa pergunta de preferência', async () => {
  const it = (await ana.post('/api/quick-wins/assistente/interpretar', { descricao: PEDIDO })).dados;
  const qw = (await ana.post('/api/quick-wins', { areas: [ana.area], assistente: { descricao: PEDIDO, operacao: it.operacao, interpretacao: { chave: it.chave, operacao: it.operacao } } })).dados;
  const ex = (await ana.post(`/api/quick-wins/${qw.id}/exemplo-teste`, {})).dados;
  assert.equal(ex.modo, 'texto');
  assert.match(ex.texto, /^Material de teste \(fictício\)/, 'sem base, o exemplo é material fictício');
  assert.match(ex.texto, /consultoria de logística para pequenas indústrias/, 'sem base, o material do teste é o perfil de uma empresa fictícia');
  assert.match(ex.texto, /Entregue: LinkedIn · Copy; Instagram · Carrossel\./, 'o pedido de teste vai junto do perfil');
  assert.match(ex.texto, /este teste é para a Empresa Exemplo Ltda\. \(fictícia\)/, 'a decisão vem pronta no exemplo');
  const conv = (await ana.post('/api/conversas', { quick_win_id: qw.id, teste: true })).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { executar_quick_win: true, texto: ex.texto });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  assert.ok(!r.texto.startsWith(MARCADOR_PERGUNTA), `parou na pergunta: ${r.texto.slice(0, 120)}`);
  assert.match(r.texto, /## LinkedIn · Copy/);
  assert.notEqual(r.fim.qualidade.status, 'pergunta');
  assert.equal(json(um(S.app.db, "select detalhes from eventos where tipo = 'quickwin.autonomy_checked' order by id desc limit 1").detalhes).resultado, 'executou_com_escolhas');
});

// QA em produção (qw de posts com pesquisa, empresa sem pesquisa liberada e sem base): o modelo recusou todas as peças
// ("sem pesquisa e sem documentos não é possível"). A falta da pesquisa e da base não impede o trabalho.
test('sem pesquisa liberada e sem base: o prompt manda fazer todos os entregáveis, com o tema como sugestão', () => {
  const op = { ...PLANO, v: 2, contexto_empresa: true, ferramentas: ['pesquisa_web', 'base_empresa'] };
  const p = OP.promptOperacao(op, { pesquisa: { disponivel: false, motivo: OP.MOTIVOS_PESQUISA.nao_liberada } });
  assert.match(p, /A falta da pesquisa não impede o trabalho: faça todos os entregáveis/);
  assert.match(p, /vai como sugestão, nunca como tendência atual/);
  const ex = OP.planoDoExemplo({ objetivo: PEDIDO, operacao: { ...op, canais: ['linkedin', 'instagram'] } }, { temBase: false });
  assert.equal(ex.modo, 'ia', 'sem base, o material do teste é escrito pela IA (perfil fictício)');
  assert.deepEqual(ex.entradas, [OP.PERFIL_FICTICIO]);
  assert.match(ex.pedidoTeste, /é escolha, não fato: escolha o mais provável, faça todas as peças/);
  assert.match(ex.reserva, /^Material de teste \(fictício\)[\s\S]*Entregue: /, 'sem o perfil, o pedido de teste sozinho');
  // Com base, nada muda: o pedido de teste usa o contexto dela.
  const comBase = OP.planoDoExemplo({ objetivo: PEDIDO, operacao: { ...op, canais: ['linkedin', 'instagram'] } });
  assert.equal(comBase.modo, 'texto');
  assert.match(comBase.texto, /Use o contexto da empresa que está nos documentos autorizados/);
  // Com pesquisa disponível, nada muda.
  assert.doesNotMatch(OP.promptOperacao(op, { pesquisa: { disponivel: true } }), /A falta da pesquisa/);
});

test('conferência: critério que depende de material ausente é atendido quando o resultado diz que ele não veio', async () => {
  const C = await import('../src/quickwin-construtor.js');
  const p = C.promptQualidade(C.construir({ descricao: PEDIDO, operacao: { ...PLANO, v: 2, criterios: ['As orientações visuais respeitam o guia da marca.'] } }));
  assert.match(p, /As orientações visuais respeitam o guia da marca/);
  assert.match(p, /Critério que depende de um material que não está na entrada[^\n]*é atendido quando o resultado diz que esse material não veio/);
  assert.match(p, /Marque falha se o resultado supõe o conteúdo desse material/);
});

test('peças por canal: número, resultado de cliente e oferta só entram se estiverem no material', () => {
  const p = OP.promptOperacao({ ...PLANO, v: 2, canais: ['linkedin', 'instagram'] });
  assert.match(p, /número, resultado de cliente, prazo, preço, oferta \(como "gratuito"\) ou prêmio só entram se estiverem no material/);
  assert.doesNotMatch(OP.promptOperacao({ ...PLANO, v: 2, entregaveis: [{ id: 'e1', tipo: 'resumo' }] }), /oferta \(como "gratuito"\)/, 'sem canal, nada muda');
});
