// Limites de upload: quantidade e tamanho dos anexos, texto extraído e anexos antigos no histórico.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';
import { openRouterFalso, enviarMensagem } from './openrouter-falso.js';
import { salvarConfig } from '../src/config.js';
import { LIMITES_ARQUIVO } from '../src/texto.js';

let S, OR, ana;
const txt = (nome, texto) => ({ nome, base64: Buffer.from(texto).toString('base64') });
const frase = 'Relatório de conferência de pedidos e notas fiscais. ';
const texto = n => frase.repeat(Math.ceil(n / frase.length)).slice(0, n);
const conversa = async () => (await ana.post('/api/conversas', {})).dados.conversa;

before(async () => {
  OR = await openRouterFalso();
  S = await subir({ ia: OR.ia });
  salvarConfig(S.app.db, { dominios: ['exemplo.com.br'] });
  await S.cliente().entrar('admin@exemplo.com.br');
  ana = await S.cliente().entrar('ana@exemplo.com.br');
});
after(async () => { await S.fechar(); await OR.fechar(); });

test('mais anexos do que o permitido por mensagem é recusado', async () => {
  const c = await conversa();
  const anexos = Array.from({ length: LIMITES_ARQUIVO.anexosPorMensagem + 1 }, (_, i) => txt(`a${i}.txt`, 'conteúdo'));
  const r = await enviarMensagem(ana, c.id, { texto: 'Veja', anexos });
  assert.equal(r.status, 400);
  assert.equal(r.erro.erro, 'anexos');
});

test('anexo com texto demais é recusado com a estimativa de páginas e a sugestão da base', async () => {
  const c = await conversa(), n = OR.chamadas.length;
  const r = await enviarMensagem(ana, c.id, { texto: 'Resuma', anexos: [txt('longo.txt', texto(LIMITES_ARQUIVO.anexoCaracteres + 1000))] });
  assert.equal(r.status, 413);
  assert.equal(r.erro.erro, 'texto_grande');
  assert.match(r.erro.mensagem, /páginas/);
  assert.match(r.erro.mensagem, /base de conhecimento/);
  assert.equal(OR.chamadas.length, n, 'nada vai para o modelo');
});

test('a soma do texto dos anexos de uma mensagem tem teto', async () => {
  const c = await conversa();
  const parte = texto(Math.ceil(LIMITES_ARQUIVO.mensagemCaracteres / 2) + 1000);
  const r = await enviarMensagem(ana, c.id, { texto: 'Compare', anexos: [txt('a.txt', parte), txt('b.txt', parte)] });
  assert.equal(r.status, 413);
  assert.equal(r.erro.erro, 'texto_grande');
});

test('arquivo acima do tamanho máximo é recusado', async () => {
  const c = await conversa();
  const grande = { nome: 'grande.txt', base64: Buffer.alloc((LIMITES_ARQUIVO.arquivoMb + 1) * 1024 * 1024, 'a').toString('base64') };
  const r = await enviarMensagem(ana, c.id, { texto: 'Veja', anexos: [grande] });
  assert.ok([400, 413].includes(r.status), `status ${r.status}`);
});

test('anexos antigos saem do histórico quando passam do orçamento; o da mensagem atual vai sempre', async () => {
  // Orçamento pequeno só neste teste, para caber no contexto do modelo falso.
  S.app.limitesArquivo = { ...LIMITES_ARQUIVO, historicoAnexosCaracteres: 2500 };
  const c = await conversa(), tam = 1000;
  for (const nome of ['um.txt', 'dois.txt', 'tres.txt', 'quatro.txt']) {
    const r = await enviarMensagem(ana, c.id, { texto: `Guarde ${nome}`, anexos: [txt(nome, texto(tam))] });
    assert.equal(r.status, 200, JSON.stringify(r.erro));
  }
  const ultima = OR.chamadas.at(-1).messages.filter(m => m.role === "user").map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  const tem = s => ultima.includes(s);
  assert.deepEqual([tem('<anexo nome="quatro.txt">'), tem('<anexo nome="tres.txt">'), tem('<anexo nome="dois.txt">'), tem('<anexo nome="um.txt">'), tem('Anexo "um.txt" enviado antes nesta conversa')], [true, true, true, false, true]);
  S.app.limitesArquivo = LIMITES_ARQUIVO;
});
