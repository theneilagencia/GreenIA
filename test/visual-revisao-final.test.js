import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montar } from '../src/visual/motor.js';
import { conferirVisual } from '../src/visual/qualidade.js';
import { resolverIdentidade } from '../src/visual/marca.js';
import { rasterizarSvg } from '../src/visual/raster.js';
import { svgDaPagina } from '../src/visual/svg.js';

const identidade = resolverIdentidade({ empresa: 'Empresa de teste' });
function caso({ temaPendente = false, imagem = false } = {}) {
  const conteudo = { titulo: 'Documento certo', secoes: [{ id: 's1', titulo: 'Para quem serve', itens: [
    { id: 's1.i1', tipo: 'lista', itens: [{ texto: 'Equipes de validação' }, { texto: 'Rotina de conferência' }] },
    { id: 's1.i2', tipo: 'paragrafo', texto: 'Entenda o uso', cta: true },
  ] }] };
  const plano = { v: 1, tipo: imagem ? 'image' : 'carousel', formato: '1:1', canvas: { w: 1080, h: 1080 }, impacto: true, imagemFinal: imagem,
    paginas: [{ id: 'p1', papel: 'conteudo', layout: 'destaque', titulo: 'Para quem serve', subtitulo: temaPendente ? 'Tema: não informado além do lançamento' : '', refs: [], blocos: [
      { id: 'b1', tipo: 'lista', titulo: 'Para quem serve', refs: ['s1.i1'] },
      { id: 'b2', tipo: 'cta', titulo: 'Entenda o uso', refs: ['s1.i2'] },
    ] }] };
  const assets = imagem ? { heroi: { dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#ff00ff"/></svg>').toString('base64'), w: 1080, h: 1080 } } : {};
  return { plano, conteudo, assets };
}

test('carrossel mantém conteúdo e CTA sem duplicar o título da página ou a chamada', () => {
  const c = caso(), { paginas } = montar({ ...c, identidade });
  const textos = paginas[0].prims.filter(p => p.t === 'text').map(p => p.linhas.join(' '));
  for (const esperado of ['Para quem serve', 'Entenda o uso', 'Equipes de validação', 'Rotina de conferência']) {
    assert.equal(textos.filter(t => t === esperado).length, 1, esperado);
  }
});

test('peça final não deixa pixels da imagem atravessarem a área de leitura', () => {
  const c = caso({ imagem: true }), { paginas } = montar({ ...c, identidade });
  const img = rasterizarSvg(svgDaPagina(paginas[0]));
  const cor = (x, y) => Array.from(img.pixels.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
  assert.deepEqual(cor(10, 100), [255, 0, 255]);
  assert.deepEqual(cor(10, 400), cor(10, 1000), 'o fundo sob o texto é uniforme e independe da imagem');
  assert.notDeepEqual(cor(10, 400), [255, 0, 255]);
});

test('carrossel com tema não informado exige completar o conteúdo, sem apagar a lacuna', () => {
  const c = caso({ temaPendente: true }), { paginas } = montar({ ...c, identidade });
  const q = conferirVisual({ paginas, plano: c.plano, conteudo: c.conteudo, tr: {}, identidade });
  assert.ok(q.erros.some(e => e.codigo === 'objetivo' && /tema/i.test(e.detalhe)));
});
