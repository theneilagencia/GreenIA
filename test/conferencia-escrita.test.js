// Conferência de escrita: todo texto entregue passa por limpeza sem custo dos vícios de texto de IA e, se ainda
// sobrar vício, por uma revisão da IA na mesma rota. A revisão só vale se mantiver números e tamanho.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { um } from '../src/db.js';
import { limparVicios, revisarEscrita, viciosDeEscrita } from '../src/escrita.js';

test('limpeza sem IA: abertura servil, fecho oferecendo ajuda, emoji e muletas saem; marcadores de lista ficam', () => {
  const t = limparVicios('Claro! É importante ressaltar que o prazo é 20/10 🚀.\n\n- Vale destacar que o custo caiu 12%\n- ☐ Mapear fornecedores ✓\n\nEm resumo, cabe no plano.\n\nSe quiser, posso montar a agenda.');
  assert.equal(t, 'O prazo é 20/10.\n\n- O custo caiu 12%\n- ☐ Mapear fornecedores ✓\n\nCabe no plano.');
  assert.deepEqual(viciosDeEscrita(t), []);
  assert.equal(limparVicios('Texto direto, sem vício.'), 'Texto direto, sem vício.');
});

test('revisão pela IA só quando sobra vício, e só vale se mantiver os números e o tamanho', async () => {
  let chamadas = 0;
  const limpo = await revisarEscrita('Claro! O prazo é 20/10.', { chamar: async () => { chamadas++; return { texto: 'x' }; } });
  assert.equal(limpo.texto, 'O prazo é 20/10.'); assert.equal(chamadas, 0, 'vício mecânico não chama a IA');
  const bom = await revisarEscrita('O plano é robusto e vai alavancar 30% de ganho em 2027.', { chamar: async () => ({ texto: 'O plano é sólido e traz 30% de ganho em 2027.', custo: 0.002 }) });
  assert.equal(bom.texto, 'O plano é sólido e traz 30% de ganho em 2027.'); assert.equal(bom.revisado, true); assert.equal(bom.custo, 0.002);
  const perdeNumero = await revisarEscrita('O plano é robusto e vai alavancar 30% de ganho em 2027.', { chamar: async () => ({ texto: 'O plano é sólido e traz bastante ganho no ano que vem.' }) });
  assert.equal(perdeNumero.texto, 'O plano é robusto e vai alavancar 30% de ganho em 2027.'); assert.equal(perdeNumero.revisado, false);
  assert.deepEqual(perdeNumero.restantes, ['palavra de efeito']);
  const semIA = await revisarEscrita('Uma jornada de dados robusta.', { chamar: async () => { throw new Error('não deveria chamar'); }, usarIA: false });
  assert.equal(semIA.texto, 'Uma jornada de dados robusta.');
});

let S, OR, ana;
const REVISA = 'Você revisa a escrita de um texto pronto';
before(async () => {
  OR = await openRouterFalso({ responder: b => {
    const sis = typeof b.messages[0].content === 'string' ? b.messages[0].content : b.messages[0].content.map(p => p.text).join('');
    if (sis.startsWith(REVISA)) return 'O fechamento leva 18 dias. Com o painel, a meta é o 5º dia útil e o ganho é concreto.';
    return 'Ótima pergunta! O fechamento leva 18 dias. Não é apenas um painel, é uma mudança de rotina: a meta é o 5º dia útil e o ganho é robusto.\n\nSe quiser, posso detalhar o cronograma.';
  } });
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('conversa: a versão final sem vícios substitui a mostrada ao vivo e é a que fica guardada', async () => {
  const conv = (await ana.post('/api/conversas', {})).dados.conversa;
  const r = await enviarMensagem(ana, conv.id, { texto: 'Quanto tempo leva o fechamento hoje e qual a meta?' });
  assert.equal(r.status, 200, JSON.stringify(r.erro));
  const sub = r.eventos.find(e => e.t === 'substituir');
  assert.ok(sub, 'evento de substituição enviado');
  assert.equal(sub.v, 'O fechamento leva 18 dias. Com o painel, a meta é o 5º dia útil e o ganho é concreto.');
  assert.deepEqual(viciosDeEscrita(sub.v), []);
  const guardada = um(S.app.db, "select texto from mensagens where conversa_id = ? and papel = 'assistant' order by id desc limit 1", conv.id);
  assert.equal(guardada.texto, sub.v);
  const rev = OR.chamadas.find(b => JSON.stringify(b.messages[0]).includes(REVISA));
  const exec = OR.chamadas.find(b => !JSON.stringify(b.messages[0]).includes(REVISA));
  assert.deepEqual(rev.provider, exec.provider, 'mesma rota de privacidade da resposta');
  assert.match(rev.messages[0].content, /vícios de texto de IA: "não é apenas X, é Y"/);
});

test('email redigido com "Fico à disposição" antes da assinatura não é vício; revisão que troca o texto não vale', async () => {
  const email = 'Assunto: Retorno\n\nOlá,\n\nSegue o cronograma.\n\nFico à disposição para ajustar o que for preciso.\n\nAtenciosamente,\n[Seu nome]';
  assert.deepEqual(viciosDeEscrita(email), []);
  const r = await revisarEscrita('O plano é robusto e cobre as três frentes de custeio, apontamento e fechamento gerencial.', { chamar: async () => ({ texto: 'Aqui está a lista de próximos passos para a equipe revisar antes do envio final.' }) });
  assert.equal(r.revisado, false);
  assert.equal(r.texto, 'O plano é robusto e cobre as três frentes de custeio, apontamento e fechamento gerencial.');
});
