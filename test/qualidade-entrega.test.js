import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exigeAltaQualidade } from '../public/qualidade-entrega.js';
import { rodarCaso, montarBanco } from '../scripts/roteamento-casos.js';
import { analisarPedido, requisitosDe } from '../src/roteador.js';
import { exec } from '../src/db.js';
import { projetarDesign } from '../src/visual/design.js';

for (const texto of ['Crie uma apresentação de altíssimo nível', 'Gere uma proposta de alta qualidade', 'Quero um relatório profissional', 'Quero o design/layout o mais próximo possível com a apresentação de referência', 'Refaça o material com padrão executivo']) {
  test(`exigência de qualidade: ${texto}`, () => {
    assert.equal(exigeAltaQualidade(texto), true);
    const req = requisitosDe(analisarPedido({ texto }));
    assert.equal(req.nivel, 3); assert.equal(req.qualidadeExigida, true);
  });
}
for (const texto of ['O que significa alta qualidade?', 'Resuma em três linhas', 'Crie um email curto', 'Troque o título na apresentação premium', 'Corrija apenas a data do relatório profissional', 'Crie um texto simples, não precisa ser profissional']) {
  test(`sem escalada desnecessária: ${texto}`, () => assert.equal(exigeAltaQualidade(texto), false));
}

test('economia escolhe dentro da capacidade suficiente, sem baratear uma entrega premium', () => {
  for (const preferencia of ['economia', 'equilibrio', 'qualidade']) {
    const { rota } = rodarCaso({ texto: 'Crie uma apresentação de altíssimo nível' }, { preferencia });
    assert.equal(rota.modelo.perfil, 'avancado');
    assert.equal(rota.requisitos.qualidadeExigida, true);
  }
});

test('alta qualidade não ultrapassa permissão de perfil, sigilo ou reserva do plano', () => {
  const pedido = { texto: 'Crie uma apresentação de altíssimo nível' };
  const db = montarBanco({ acesso: false });
  try {
    assert.equal(rodarCaso(pedido, { db }).rota.modelo, null);
    assert.equal(rodarCaso(pedido, { reservaDoPlano: true }).rota.modelo, null);
    const protegido = montarBanco();
    try {
      exec(protegido, 'update modelos set homologado = 0');
      assert.equal(rodarCaso(pedido, { db: protegido, sigilosa: true }).rota.modelo, null);
    } finally { protegido.close(); }
  } finally { db.close(); }
});

test('design de 24 páginas autorizado entra no motor de design em lotes; teto de segurança permanece', async () => {
  const plano = { paginas: Array.from({ length: 24 }, (_, k) => ({ titulo: 'Página ' + k, blocos: [] })) };
  const op = { plano, conteudo: { secoes: [] }, tr: { formato: '16:9' }, identidade: {}, chamar: async () => { throw new Error('provedor indisponível'); } };
  assert.equal((await projetarDesign(op)).motivo, 'paginas');
  const r = await projetarDesign({ ...op, maxPaginas: 60 });
  assert.notEqual(r.motivo, 'paginas', 'não cai para o visual básico por ter mais de 12 slides');
  assert.equal((await projetarDesign({ ...op, plano: { paginas: Array.from({ length: 61 }, () => ({ blocos: [] })) }, maxPaginas: 999 })).motivo, 'paginas');
});

test('a apresentação fonte não é cortada silenciosamente aos 40 mil caracteres', async () => {
  const { pptx } = await import('../src/escritorio.js');
  const { fonteDeApresentacao } = await import('../src/conversas.js');
  const dados = pptx(Array.from({ length: 60 }, (_, k) => `## Tema ${k + 1}\n${'Conteúdo confirmado na apresentação original. '.repeat(22)}\n${k === 59 ? 'MARCADOR_FINAL_PRESERVADO' : ''}`).join('\n\n'));
  const fonte = fonteDeApresentacao({ nome: 'Fonte.pptx', dados });
  assert.ok(fonte.texto.length > 40000);
  assert.match(fonte.texto, /MARCADOR_FINAL_PRESERVADO/);
});

test('alta qualidade não é declarada concluída quando o motor de design está indisponível', async () => {
  const { subir } = await import('./ajuda.js');
  const { produzirVisuais } = await import('../src/visual/producao.js');
  const S = await subir();
  try {
    const r = await produzirVisuais(S.app, {
      pessoa: { areas: [] }, conv: { id: 1 }, qw: null,
      espec: { objetivo: 'Crie uma apresentação profissional', operacao: { entregaveis: [{ id: 'peca', tipo: 'apresentacao', rotulo: 'Apresentação', visual: { tipo: 'slides' } }] } },
      resposta: 'Título: Projeto\n\n### Escopo\n- Diagnóstico\n- Validação', usarIA: false, chamar: null,
    });
    assert.equal(r.artefatos.length, 0);
    assert.equal(r.ignorados[0].motivo, 'qualidade_exigida_nao_atingida');
  } finally { await S.fechar(); }
});
