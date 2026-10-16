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

test('número solto do modelo (célula de tabela) não fica; valor do conteúdo que ficou de fora volta numa correção', async () => {
  const pag = [{ w: 792, h: 612, blocos: [bloco('1.1', 'Tabela do modelo', 80, 28), bloco('1.2', 'Linha do modelo', 140), { ...bloco('1.3', '250', 140), x: 400 }, bloco('1.4', 'Outra linha', 170)] }];
  const conteudos = ['Planos\n• Essencial: R$ 38/ha/ano\n• Instalação: R$ 2.900'];
  const vistas = [];
  const chamar = async msgs => {
    vistas.push(msgs[0].content.slice(0, 30));
    if (/^Você coloca/.test(msgs[0].content)) return { texto: JSON.stringify({ '1.1': 'Planos', '1.2': '• Essencial: R$ 38/ha/ano', '1.3': '250', '1.4': '' }) };
    assert.match(msgs[1].content, /inclua estes dados.*R\$ 2\.900/);
    return { texto: JSON.stringify({ '1.4': '• Instalação: R$ 2.900' }) };
  };
  const r = await adaptarModelo({ paginas: paginasDoPlano(pag, [{ pagina: 0 }]), contexto: FONTE + '\nInstalação: R$ 2.900', pedido: 'design', chamar, conteudos });
  assert.deepEqual(['1.1', '1.2', '1.3', '1.4'].map(id => r.textos[id]), ['Planos', '• Essencial: R$ 38/ha/ano', '', '• Instalação: R$ 2.900']);
  assert.ok(vistas.some(v => /^Você corrige/.test(v)), JSON.stringify(vistas));
});

test('arquivo: caixa desenhada em volta de um texto que saiu, e a seta entre caixas que saíram, saem juntas; a caixa com texto fica', async () => {
  const { pptxDeModelo } = await import('../src/escritorio.js');
  const { lerPacote } = await import('../src/edicao-arquivo.js');
  const ret = (x, y, w, h, cor = '#EEEEEE') => ({ t: 'forma', modo: 'fill', cor, d: [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']] });
  const pag = { w: 792, h: 612, fundo: Buffer.alloc(0), elementos: [ret(40, 100, 120, 40), ret(170, 115, 30, 8, '#112233'), ret(210, 100, 120, 40), ret(40, 200, 120, 40)],
    blocos: [bloco('1.1', 'Caixa um', 125), bloco('1.2', 'Caixa dois', 125), bloco('1.3', 'Caixa três', 225)].map(b => ({ ...b, x: 50, largura: 90 })) };
  pag.blocos[1].x = 220;
  const xml = t => lerPacote(pptxDeModelo([pag], { textos: t })).find(e => e.nome === 'ppt/slides/slide1.xml').dados.toString();
  const formas = x => (x.match(/name="Forma/g) || []).length;
  assert.equal(formas(xml({})), 4);
  assert.equal(formas(xml({ '1.1': '', '1.2': '' })), 1, 'as duas caixas e a seta entre elas saem');
  assert.equal(formas(xml({ '1.1': '' })), 3, 'só a caixa vazia sai; a seta fica porque liga a uma caixa com texto');
});

test('página de tabela ou diagrama não serve para slide de lista; dígitos de telefone não valem como número do material', async () => {
  const { paginaDeTexto } = await import('../src/modelo-pdf.js');
  const tabela = { w: 792, h: 612, blocos: [bloco('1.1', 'Investimento', 80, 28), ...[140, 170, 200].flatMap((y, i) => [0, 1, 2].map(c => ({ ...bloco(`1.${2 + i * 3 + c}`, `célula ${i}${c}`, y), x: 40 + c * 200, largura: 150 })))] };
  assert.equal(paginaDeTexto(tabela), false);
  assert.equal(paginaDeTexto(MODELO[1]), true);
  const r = await planejarReestilo({ paginas: [MODELO[0], tabela, MODELO[1], MODELO[2]], fonte: FONTE, pedido: 'design', chamar: async () => ({ texto: JSON.stringify({ slides: [{ pagina: 1, conteudo: 'Capa' }, { pagina: 2, conteudo: 'Planos\n• Essencial: R$ 38/ha/ano' }, { pagina: 4, conteudo: 'Fim' }] }) }) });
  assert.deepEqual(r.slides.map(s => s.pagina), [0, 2, 3], 'a tabela vira a página de texto mais próxima');
  assert.deepEqual(numerosForaDoMaterial('Projeto-piloto em até 3000 hectares (0000 ha)', 'Contato: (43) 3000-0000 · comercial@agro.exemplo'), ['3000', '0000']);
});

test('frase que não vem do material sai (slogan, "antes e depois" inventado); frase do material fica', async () => {
  const { fracaoForaDoMaterial } = await import('../src/modelo-pdf.js');
  const mat = 'O produtor perde em média 18% da produtividade por irrigação mal programada. Sensor AS-3 instalado a cada 5 hectares. Diagnóstico com até seis visitas presenciais e análise de relatórios do sistema de gestão.';
  assert.ok(fracaoForaDoMaterial('Comece pequeno. Veja os dados. Escale.', mat) >= 0.4);
  assert.ok(fracaoForaDoMaterial('Irrigação manual, custos altos, sem precisão de manejo.', mat) >= 0.4);
  assert.ok(fracaoForaDoMaterial('O produtor perde 18% da produtividade por irrigação mal programada.', mat) < 0.4);
  assert.ok(fracaoForaDoMaterial('Até seis visitas presenciais e análise dos relatórios do sistema.', mat) < 0.4);
  // Plano com mais slides que a apresentação da pessoa: pede de novo com o limite.
  let n = 0;
  const r = await planejarReestilo({ paginas: MODELO, fonte: FONTE, pedido: 'design', material: FONTE, chamar: async msgs => {
    n++;
    if (n === 1) return { texto: JSON.stringify({ slides: Array.from({ length: 7 }, () => ({ pagina: 2, conteudo: 'Resultados\n• -26% água' })) }) };
    assert.match(msgs.at(-1).content, /o máximo é 4/);
    return { texto: JSON.stringify({ slides: [{ pagina: 1, conteudo: 'AgroSense — Apresentação 2026' }, { pagina: 2, conteudo: 'Resultados e Planos\n• -26% água\n• Essencial: R$ 38/ha/ano' }, { pagina: 3, conteudo: 'Próximos passos\n• Visita técnica gratuita' }] }) };
  } });
  assert.equal(n, 2); assert.equal(r.slides.length, 3);
});

test('junção pedida: o plano que deixou Resultados e Planos separados é pedido de novo; se insistir, a plataforma junta', async () => {
  const { juncoesPedidas } = await import('../src/modelo-pdf.js');
  assert.deepEqual(juncoesPedidas('3) os slides de Resultados e Planos podem virar um só.'), [['resultados', 'planos']]);
  const separado = { slides: [{ pagina: 1, conteudo: 'AgroSense — Apresentação 2026' }, { pagina: 2, conteudo: 'Resultados\n• -26% água' }, { pagina: 2, conteudo: 'Planos\n• Essencial: R$ 38/ha/ano' }, { pagina: 3, conteudo: 'Próximos passos\n• Visita técnica gratuita' }] };
  let n = 0;
  const r = await planejarReestilo({ paginas: MODELO, fonte: FONTE, material: FONTE, pedido: 'os slides de Resultados e Planos podem virar um só', chamar: async msgs => { n++; if (n === 2) assert.match(msgs.at(-1).content, /juntar os slides "resultados" e "planos"/); return { texto: JSON.stringify(separado) }; } });
  assert.equal(n, 2);
  assert.deepEqual(r.slides.map(s => s.conteudo.split('\n')[0]), ['AgroSense — Apresentação 2026', 'Resultados e Planos', 'Próximos passos']);
  assert.match(r.slides[1].conteudo, /-26% água[\s\S]*Essencial/);
});

test('conferência de sentido: frase que afirma o que o material não diz sai; o título fica', async () => {
  const paginas = paginasDoPlano(MODELO, [{ pagina: 1 }]);
  const chamar = async msgs => {
    if (/^Você confere/.test(msgs[0].content)) return { texto: JSON.stringify({ remover: ['1.3'] }) };
    return { texto: JSON.stringify({ '1.1': 'Planos', '1.2': '• Essencial: R$ 38/ha/ano', '1.3': 'Essencial paga o investimento', '1.4': '', '1.5': '1 / 1' }) };
  };
  const r = await adaptarModelo({ paginas, contexto: FONTE, pedido: 'design', chamar, conteudos: ['Planos\n• Essencial: R$ 38/ha/ano'], material: FONTE + ' Essencial investimento paga' });
  assert.equal(r.textos['1.1'], 'Planos');
  assert.equal(r.textos['1.2'], '• Essencial: R$ 38/ha/ano');
  assert.equal(r.textos['1.3'], '');
});
