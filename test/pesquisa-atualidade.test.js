import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/quickwin-construtor.js';

const objetivo = 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.';
const pesquisa = { disponivel: true, fontes: [{ url: 'https://fonte.exemplo/a' }] };
const especDe = descricao => C.construir({ descricao, operacao: { v: 2, ferramentas: ['pesquisa_web'], entregaveis: [{ tipo: 'resumo', rotulo: 'Resumo' }] } });
const responder = texto => `## Resumo\n${texto}\n\n## Pontos de atenção\nUse com cautela.\n\n## Informações não encontradas\nDatas das fontes.\n\n## Fontes da pesquisa\nhttps://fonte.exemplo/a`;

for (const limitacao of [
  // Admissão presente na resposta real de 18/10, que a IA conferente aprovou.
  'Nenhuma fonte teve data de publicação confirmada, então não dá para afirmar que as tendências sejam recentes.',
  'Nenhuma das fontes tem data de publicação comprovada.',
  'Todas as cinco fontes estão sem data de publicação.',
  'Não é possível comprovar que os temas sejam atuais.'
]) test(`atualidade não comprovada continua parcial mesmo com veredito de IA favorável: ${limitacao}`, async () => {
  const texto = responder(limitacao);
  let chamadas = 0;
  const r = await C.conferirComCorrecao({ espec: especDe(objetivo), resposta: texto, mensagens: [], pesquisa,
    chamar: async () => { chamadas++; return { texto: '{"criterios":[],"objetivo_atingido":true}', custo: 0.001 }; } });
  assert.equal(r.texto, texto);
  assert.equal(r.registro.status, 'parcial');
  assert.equal(r.registro.objetivo.motivo, 'atualidade_nao_comprovada');
  assert.equal(r.registro.pesquisa.feita, true, 'a pesquisa aconteceu; a limitação é de resultado');
  assert.deepEqual(r.registro.falhas, [], 'admitir a limitação não é invenção');
  assert.equal(r.registro.tentativas, 0);
  assert.equal(chamadas, 1, 'não tenta fabricar datas com uma correção de texto');
  assert.match(C.resumoQualidade(r.registro).avisos.join(' '), /não confirmou as datas/);
});

test('uma fonte histórica sem data não invalida automaticamente as fontes datadas do pedido atual', async () => {
  const r = await C.conferirComCorrecao({ espec: especDe(objetivo), resposta: responder('As três tendências têm publicações datadas de setembro de 2026. Uma fonte complementar de contexto está sem data.'), mensagens: [], pesquisa,
    chamar: async () => ({ texto: '{"criterios":[],"objetivo_atingido":true}' }) });
  assert.equal(r.registro.status, 'aprovado');
  assert.equal(r.registro.objetivo, undefined);
});

test('pesquisa sem exigência de atualidade não exige datas pelo novo bloqueio', async () => {
  const r = await C.conferirComCorrecao({ espec: especDe('Pesquise conceitos de gestão documental e resuma três abordagens.'), resposta: responder('Nenhuma fonte teve data de publicação confirmada.'), mensagens: [], pesquisa,
    chamar: async () => ({ texto: '{"criterios":[],"objetivo_atingido":true}' }) });
  assert.equal(r.registro.status, 'aprovado');
});

test('outros achados continuam reprovando a pesquisa sem datas; honestidade não apaga invenção', async () => {
  const r = await C.conferirComCorrecao({ espec: especDe(objetivo), resposta: responder('Nenhuma fonte teve data de publicação confirmada. Concorrente A é líder.'), mensagens: [], pesquisa,
    usarIA: false, chamar: async () => { throw Error('não chamar'); } });
  assert.equal(r.registro.status, 'inconsistente');
  assert.ok(r.registro.falhas.includes('invencao'));
  assert.equal(r.registro.objetivo.motivo, 'atualidade_nao_comprovada');
});
