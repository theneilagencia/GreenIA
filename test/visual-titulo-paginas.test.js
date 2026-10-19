import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarConteudo } from '../src/visual/conteudo.js';
import { planejar, lerPlano } from '../src/visual/plano.js';
import { tracos } from '../src/visual/contrato.js';
import { conferirDesign } from '../src/visual/design.js';

const titulo = 'Conferência Aurora';
const conteudo = () => analisarConteudo('### Etapa 1\n- Receber o pedido e a nota\n\n### Etapa 2\n- Comparar quantidades e preços\n\n### Etapa 3\n- Registrar as diferenças para revisão', { titulo });
const tr = tracos({ tipo: 'carousel', formato: '1:1', paginas: 3 });

test('carrossel mantém o título visível e cada etapa na sua página', () => {
  const c = conteudo(), p = planejar(c, tr, { titulo });
  assert.equal(p.paginas.length, 3);
  assert.equal(p.paginas[0].titulo, titulo);
  for (let i = 0; i < 3; i++) {
    const refs = p.paginas[i].blocos.flatMap(b => b.refs);
    assert.deepEqual(refs, c.secoes[i].itens.map(it => it.id));
  }
});

test('plano da IA que desloca a primeira etapa para a segunda página é recusado', () => {
  const c = conteudo(), ids = c.secoes.map(s => s.itens.map(i => i.id));
  const pagina = (t, refs) => ({ papel: 'conteudo', titulo: t, blocos: [{ tipo: 'lista', refs }] });
  const ruim = { paginas: [{ papel: 'capa', titulo: 'Recebimento', blocos: [] }, pagina('Comparar', [...ids[0], ...ids[1]]), pagina('Registrar', ids[2])] };
  assert.equal(lerPlano(JSON.stringify(ruim), c, tr, { titulo }), null);
});

test('design que contém o corpo mas omite o título não passa na conferência', () => {
  const c = analisarConteudo('Receber o pedido e a nota', { titulo });
  const paginas = [{ pagina: 1, titulo, itens: [{ tipo: 'paragrafo', texto: 'Receber o pedido e a nota' }] }];
  const medir = texto => [{ n: 1, texto, textos: [], imagens: [] }];
  const op = { conteudo: c, paginas, formato: '1:1', extras: [titulo] };
  const ruim = conferirDesign(medir('Receber o pedido e a nota'), op);
  assert.ok(ruim.codigos.includes('titulo_omitido'));
  const bom = conferirDesign(medir(titulo + ' Receber o pedido e a nota'), op);
  assert.ok(!bom.codigos.includes('titulo_omitido'));
});
