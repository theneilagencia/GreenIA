// Os modelos padrão (landing, SEO e marca) precisam caber nos limites que a gravação aplica: um texto maior que o
// limite é cortado sem aviso por validarConteudoLanding/salvarLanding/salvarMarca na primeira vez que alguém salva a
// página pelo editor (ou numa migração). Os campos com o nome da empresa usam o texto personalizado quando ele cabe
// inteiro e a forma genérica inteira quando não cabe. Cada modelo é gravado pelo caminho real e nada pode voltar
// diferente, para qualquer nome que o cadastro aceita (até 80 caracteres).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { subirPlataforma } from './ajuda-plataforma.js';
import * as E from '../src/plataforma/empresas.js';

const folhas = (o, p = '', out = {}) => {
  if (typeof o === 'string') out[p] = o;
  else if (Array.isArray(o)) o.forEach((x, i) => folhas(x, `${p}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!['imagem', 'secoes'].includes(k)) folhas(v, p ? `${p}.${k}` : k, out);
  return out;
};
const cortados = (esperado, gravado) => { const g = folhas(gravado); return Object.entries(folhas(esperado)).filter(([k, v]) => g[k] !== v).map(([k, v]) => `${k} (${v.length} -> ${String(g[k] ?? '').length})`); };
const nome = tam => ('Empresa ' + 'Nome Longo '.repeat(10)).slice(0, tam).replace(/ $/, 'x');

let S;
before(async () => { S = await subirPlataforma(); });
after(async () => { await S.fechar(); });

const SIGILO = 'Com a opção de sigilo ligada pela empresa, a conversa só usa recursos autorizados; se não houver, nada é enviado';
const TAMANHOS = [20, 40, 50, 51, 60, 72, 80];

for (const tam of TAMANHOS) {
  test(`nome de ${tam} caracteres: landing, SEO e marca gravam sem corte, com o nome quando o texto inteiro cabe`, () => {
    const n = nome(tam);
    assert.equal(n.length, tam);
    const c = E.criarEmpresa(S.P, { name: n, slug: `limites-${tam}` }, null, {});
    const modelo = E.landingPadrao(n), seo = E.seoPadrao(n), marca = E.marcaPadrao(n);
    const salvo = E.salvarLanding(S.P, c.id, { content: modelo, seo }, null, {});
    assert.deepEqual(cortados(modelo, salvo.content), [], 'landing cortada na gravação');
    assert.deepEqual(cortados(seo, salvo.seo), [], 'SEO cortado na gravação');
    const m = E.salvarMarca(S.P, c.id, { ...marca, display_name: n }, null, {});
    assert.deepEqual(E.CAMPOS_MARCA.filter(k => typeof marca[k] === 'string' && m[k] !== marca[k]), [], 'marca cortada na gravação');
    // Personalizado inteiro quando cabe; genérico inteiro quando não cabe. Nunca parcial.
    const L = E.LIMITES_LANDING;
    const esperado = (comNome, limite, generico) => (comNome.length <= limite ? comNome : generico);
    assert.equal(modelo.rotulo, esperado(`A IA da ${n}`, L.rotulo, 'A IA da empresa'));
    assert.equal(modelo.institucional.titulo, esperado(`A IA na ${n}`, L.institucional_titulo, 'A IA na empresa'));
    assert.equal(seo.title, esperado(`${n} · IA para o trabalho`, L.seo_title, 'IA para o trabalho'));
    assert.equal(seo.description, esperado(`Ambiente de IA da ${n}: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa.`, L.seo_description,
      'Ambiente de IA da empresa: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa.'));
    for (const t of [modelo.rotulo, modelo.institucional.titulo, seo.title, seo.description]) assert.ok(t.includes(n) || !t.includes(n.slice(0, 8)), `texto parcial: ${t}`);
    assert.equal(modelo.regras.sigilo[2], SIGILO);
    assert.ok(SIGILO.length <= 120, `${SIGILO.length} caracteres`);
  });
}

test('personalização: nome comum aparece nos quatro campos; nome de 80 caracteres usa as formas genéricas inteiras', () => {
  const curto = 'Construtora Horizonte', longo = nome(80);
  assert.equal(E.landingPadrao(curto).rotulo, 'A IA da Construtora Horizonte');
  assert.equal(E.landingPadrao(curto).institucional.titulo, 'A IA na Construtora Horizonte');
  assert.equal(E.seoPadrao(curto).title, 'Construtora Horizonte · IA para o trabalho');
  assert.match(E.seoPadrao(curto).description, /^Ambiente de IA da Construtora Horizonte: /);
  assert.equal(E.landingPadrao(longo).rotulo, 'A IA da empresa');
  assert.equal(E.landingPadrao(longo).institucional.titulo, 'A IA na empresa');
  assert.equal(E.seoPadrao(longo).title, 'IA para o trabalho');
  assert.match(E.seoPadrao(longo).description, /^Ambiente de IA da empresa: /);
});
