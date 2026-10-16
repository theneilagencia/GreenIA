// Reestilo: "o design o mais próximo possível da apresentação X.pdf" sobre uma apresentação que já existe. O conteúdo
// é o da apresentação da pessoa; o modelo só empresta o layout. QA em produção: 6 slides viraram 15, com páginas do
// modelo que a pessoa não tinha e números inventados (250, 500, R$ 8.800).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptarModelo, numerosForaDoMaterial, paginasDoPlano, planejarReestilo, slidesDaFonte } from '../src/modelo-pdf.js';

const bloco = (id, texto, y, tam = 14) => ({ id, texto, x: 40, y, largura: 300, tam, linhas: 1, entrelinha: tam * 1.2, fonte: 'Inter', cor: '#000000' });
const MODELO = [
  { w: 792, h: 612, blocos: [bloco('1.1', 'Kickoff Exemplo', 300, 32), bloco('1.2', 'Subtítulo do modelo', 340)] },
  { w: 792, h: 612, blocos: [bloco('2.1', 'Agenda do dia', 80, 28), bloco('2.2', 'Item do modelo um', 140), bloco('2.3', 'Item do modelo dois', 170), bloco('2.4', 'Economia de R$ 8.800 por ano', 200), bloco('2.5', '2 / 3', 590, 9)] },
  { w: 792, h: 612, blocos: [bloco('3.1', 'Obrigado', 300, 32), bloco('3.2', 'contato@modelo.exemplo', 340)] },
];
const FONTE = '## Slide 1\n[s1.p1] AgroSense — Apresentação 2026\n[s1.p2] • 1.200 propriedades\n## Slide 2\n[s2.p1] Resultados\n[s2.p2] • -26% água\n## Slide 3\n[s3.p1] Planos\n[s3.p2] • Essencial: R$ 38/ha/ano\n## Slide 4\n[s4.p1] Próximos passos\n[s4.p2] • Visita técnica gratuita';

test('número fora do material: valores e percentuais inventados contam; capítulo e item pequenos não', () => {
  assert.deepEqual(numerosForaDoMaterial('Economia de R$ 8.800 e 250 ha, 26% água, capítulo 08', FONTE), ['8.800', '250']);
  assert.deepEqual(numerosForaDoMaterial('1.200 propriedades, R$ 38', FONTE), []);
});

test('slides da fonte sem os ids de edição', () => {
  assert.deepEqual(slidesDaFonte(FONTE)[2], 'Planos\n• Essencial: R$ 38/ha/ano');
});

test('plano sem resposta da IA: um slide por slide da pessoa (capa, meio, encerramento), não as páginas do modelo', async () => {
  const r = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'design próximo do PDF', chamar: async () => ({ texto: 'não sei' }) });
  assert.deepEqual(r.slides.map(s => s.pagina), [0, 1, 1, 2]);
  assert.match(r.slides[3].conteudo, /Visita técnica gratuita/);
});

test('plano da IA: linha com número inventado sai (no título sai só o número); página inválida é descartada', async () => {
  const resposta = { slides: [{ pagina: 1, conteudo: 'AgroSense 2026' }, { pagina: 2, conteudo: 'Resultados e Planos R$ 9.999\n• -26% água\n• Economia de 250 mil por ano\n• Essencial: R$ 38/ha/ano' }, { pagina: 9, conteudo: 'x' }, { pagina: 3, conteudo: 'Próximos passos\n• Visita técnica gratuita' }] };
  const r = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'junte Resultados e Planos', chamar: async () => ({ texto: JSON.stringify(resposta) }) });
  assert.deepEqual(r.slides.map(s => s.pagina), [0, 1, 2]);
  assert.equal(r.slides[1].conteudo, 'Resultados e Planos R$\n• -26% água\n• Essencial: R$ 38/ha/ano');
});

test('páginas do plano: a mesma página pode repetir, com ids próprios e numeração "n / total" refeita', () => {
  const p = paginasDoPlano(MODELO, [{ pagina: 0 }, { pagina: 1 }, { pagina: 1 }, { pagina: 2 }]);
  assert.equal(p.length, 4);
  assert.deepEqual(p[2].blocos.map(b => b.id), ['3.1', '3.2', '3.3', '3.4', '3.5']);
  assert.equal(p[2].blocos[4].texto, '3 / 4');
  assert.equal(MODELO[1].blocos[0].id, '2.1', 'o modelo não muda');
});

test('preenchimento: só o conteúdo de cada slide; texto do modelo e número inventado saem; repetição de página não copia texto', async () => {
  const conteudos = ['AgroSense — Apresentação 2026', 'Resultados e Planos\n• -26% água\n• Essencial: R$ 38/ha/ano', 'Próximos passos\n• Visita técnica gratuita', 'Obrigado'];
  const paginas = paginasDoPlano(MODELO, [{ pagina: 0 }, { pagina: 1 }, { pagina: 1 }, { pagina: 2 }]);
  const chamar = async msgs => {
    assert.match(msgs[0].content, /^Você coloca o conteúdo/);
    const u = msgs[1].content, j = {};
    for (const m of u.matchAll(/^Slide (\d+):\nConteúdo deste slide:\n([\s\S]*?)\nBlocos do layout:\n([\s\S]*?)(?=\n\nSlide |\s*(?![\s\S]))/gm)) {
      const linhas = m[2].split('\n'), ids = [...m[3].matchAll(/^(\d+\.\d+) \[/gm)].map(x => x[1]);
      ids.forEach((id, k) => { j[id] = k === 3 ? 'Economia de R$ 7.777' : (linhas[k] || ''); });
    }
    return { texto: JSON.stringify(j) };
  };
  const r = await adaptarModelo({ paginas, contexto: FONTE, pedido: 'design próximo', chamar, conteudos });
  const slide = k => paginas[k].blocos.map(b => r.textos[b.id] ?? b.texto);
  assert.deepEqual(slide(1), ['Resultados e Planos', '• -26% água', '• Essencial: R$ 38/ha/ano', '', '2 / 4']);
  assert.deepEqual(slide(2), ['Próximos passos', '• Visita técnica gratuita', '', '', '3 / 4']);
  assert.ok(!Object.values(r.textos).some(t => /7\.777|8\.800|Item do modelo|contato@modelo/.test(t)), JSON.stringify(r.textos));
});
