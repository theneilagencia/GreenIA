// Propriedades e monotonicidade do roteador, sobre cenários gerados (semente fixa: reproduzível).
// Cada cenário sorteia catálogo, preços, janelas, liberação, homologação, reservas, acesso, sigilo,
// plano, quick win, preferência e o próprio pedido. As propriedades valem para TODOS os cenários.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, exec } from '../src/db.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { analisarPedido, rotear, requisitosDe, AUTOMATICO, MARGEM_JANELA, NIVEL } from '../src/roteador.js';
import { perfisDe } from '../src/modelos.js';

const N = Number(process.env.CENARIOS || 400);
const GOVERNANCA = ['nao_homologado', 'plano_na_reserva', 'gratuito_treina_com_dados', 'sem_acesso_a_classe', 'contexto_insuficiente'];
const CLASSES = ['rapido', 'equilibrado', 'avancado'];
const DIMS_CAP = ['geral', 'raciocinio', 'programacao', 'precisao', 'volume'];

// Gerador pseudoaleatório com semente (mulberry32).
function sorteador(semente) {
  let s = semente >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, de: l => l[Math.floor(r() * l.length)], p: x => r() < x, entre: (a, b) => a + r() * (b - a) };
}

const TEXTOS = [
  "Traduza 'bom dia' para inglês.", 'Resuma este texto em cinco linhas.', 'Qual é o prazo para esta etapa?',
  'Analise este contrato e identifique riscos jurídicos, obrigações e possíveis pontos de exposição.',
  'Compare estas demonstrações financeiras e identifique inconsistências.',
  'Analise este problema de arquitetura e proponha uma solução considerando escalabilidade, segurança e custo.',
  'Escreva uma função Python simples para converter uma lista de valores.',
  'Analise este código, encontre o problema e proponha uma correção considerando concorrência, performance e segurança.',
  'Extraia o valor exato de cada linha desta tabela.', 'Compare estas duas propostas de fornecedores e aponte as diferenças.',
  'Planeje uma campanha interna de integração considerando público, canais e calendário.',
  'Corrija o bug desta função:\n```js\nfunction f(l) { return l[l.length] }\n```', 'Organize estas anotações em pendências.',
];
const REPETE = n => 'O fornecedor entregou o lote conforme o pedido e a nota foi conferida. '.repeat(Math.ceil(n / 72)).slice(0, n);

export function cenario(semente) {
  const g = sorteador(semente);
  const db = abrirBanco(':memory:');
  const n = 2 + Math.floor(g.r() * 6);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `x/m${i}${g.p(0.1) ? ':free' : ''}`;
    const entrada = Math.round(g.entre(0.05, 5) * 100) / 100;
    exec(db, 'insert into modelos (id, nome, fornecedor, liberado, perfil, preco_entrada, preco_saida, contexto, homologado, homologacao) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, id, 'x', Number(g.p(0.9)), g.de(CLASSES), entrada / 1e6, entrada * g.entre(2, 8) / 1e6, g.de([16000, 32000, 128000, 200000, 1000000]), Number(g.p(0.35)), '{"fornecedor":"x"}');
    ids.push(id);
  }
  for (const id of ids) if (g.p(0.3)) exec(db, 'update modelos set reserva = ? where id = ?', g.de(ids), id);
  const porClasse = c => ids.filter(id => db.prepare('select perfil from modelos where id = ?').get(id).perfil === c);
  const padroes = Object.fromEntries(CLASSES.map(c => [c, g.de(porClasse(c).concat([null]))]));
  salvarConfig(db, {
    padroes: { chat: padroes.rapido || ids[0], homologado: null, ...padroes },
    acessoPerfis: { equilibrado: { todos: g.p(0.6) }, avancado: { todos: g.p(0.5) } },
    exigirSemTreino: g.p(0.7),
    roteamento: { ativo: true, preferencia: g.de(['economia', 'equilibrio', 'qualidade']) },
  });
  const cfg = lerConfig(db);
  const pessoa = { grupos: [], areas: [] };
  const qwTipo = g.de(['nenhum', 'nenhum', 'fixo', 'flexivel']);
  const qw = qwTipo === 'nenhum' ? null : { modelo: `classe:${g.de(CLASSES)}`, pode_trocar: qwTipo === 'flexivel' };
  const texto = g.de(TEXTOS);
  const anexoChars = g.de([0, 0, 2000, 20000, 150000, 700000]);
  const pedido = {
    texto, anexos: anexoChars ? [{ nome: 'a.txt', texto: REPETE(anexoChars) }] : [], historicoChars: g.de([0, 0, 3000, 60000]), sistemaChars: 1800,
    temResposta: g.p(0.3), anterior: g.p(0.3) ? { classe: g.de(CLASSES), nivel: 0 } : null,
  };
  if (pedido.anterior) pedido.anterior.nivel = NIVEL[pedido.anterior.classe];
  if (pedido.temResposta && g.p(0.5)) pedido.texto = 'Não resolveu, a resposta anterior não funcionou.';
  return { db, cfg, pessoa, qw, sigilosa: g.p(0.25), reservaDoPlano: g.p(0.15), pedido, g };
}

// Rota automática (ou do quick win) do cenário, com a mesma preparação de manual que conversas.js faz.
function rotearCenario(c, { analise = analisarPedido(c.pedido), cfg = c.cfg, ...extra } = {}) {
  const qwFixo = c.qw && !c.qw.pode_trocar;
  let modeloManual = null;
  if (qwFixo) {
    const id = cfg.padroes[c.qw.modelo.slice(7)];
    const m = id && c.db.prepare('select * from modelos where id = ? and liberado = 1').get(id);
    if (!m) return null;   // quick win sem modelo liberado: a validação do envio recusa antes
    modeloManual = { id: m.id, perfil: m.perfil, liberado: true, contexto: m.contexto, reserva: m.reserva };
  }
  return rotear({ db: c.db, cfg, pessoa: c.pessoa, qw: c.qw, sigilosa: c.sigilosa, reservaDoPlano: c.reservaDoPlano, pedido: qwFixo ? c.qw.modelo : AUTOMATICO,
    analise, modeloManual, origem: qwFixo ? 'quick_win' : 'auto', ...extra });
}

const cenarios = () => Array.from({ length: N }, (_, i) => cenario(1000 + i));
const capDe = (rota, id) => { const c = rota.candidatos.find(x => x.id === id); return c?.capacidades || Object.fromEntries(DIMS_CAP.map(d => [d, NIVEL[c?.classe] || 0])); };

test(`governança, janela e permissão: nunca violadas (${N} cenários)`, () => {
  let escolhas = 0;
  for (const c of cenarios()) {
    const rota = rotearCenario(c);
    if (!rota?.modelo) continue;
    escolhas++;
    const esc = rota.candidatos.find(x => x.status === 'escolhido');
    const qwFixo = c.qw && !c.qw.pode_trocar;
    // Quick win fixo: o acesso à classe vem do quick win; as demais regras valem.
    const proibidos = esc.motivos.filter(m => GOVERNANCA.includes(m) && !(m === 'sem_acesso_a_classe' && c.qw));
    assert.deepEqual(proibidos, [], `governança violada: ${JSON.stringify(esc)}`);
    const m = c.db.prepare('select * from modelos where id = ?').get(rota.modelo.id);
    assert.equal(m.liberado, 1, 'só modelos liberados');
    if (c.sigilosa) assert.equal(m.homologado, 1, 'sigilosa só homologado');
    if (c.reservaDoPlano) assert.equal(m.perfil, 'rapido', 'reserva do plano só Rápido');
    if (c.cfg.exigirSemTreino) assert.ok(!m.id.endsWith(':free'), 'sem treino');
    assert.ok(!m.contexto || m.contexto * MARGEM_JANELA >= rota.requisitos.janelaMinima, 'janela suficiente');
    const perfis = perfisDe(c.cfg, c.pessoa);
    assert.ok(perfis.has(m.perfil) || (c.qw && m.perfil === c.qw.modelo.slice(7)), 'dentro do acesso da pessoa');
    if (rota.reserva) {
      const r = c.db.prepare('select * from modelos where id = ?').get(rota.reserva);
      assert.ok(!c.sigilosa && r.liberado && (!r.contexto || r.contexto * MARGEM_JANELA >= rota.requisitos.janelaMinima), 'reserva também respeita as regras');
      assert.ok(NIVEL[r.perfil] >= NIVEL[m.perfil], 'reserva não é inferior');
      if (c.reservaDoPlano) assert.equal(r.perfil, 'rapido');
    }
    if (qwFixo && !rota.fallback) assert.equal(rota.modelo.id, c.cfg.padroes[c.qw.modelo.slice(7)], 'quick win fixo nunca ignorado');
    if (qwFixo) assert.equal(rota.modelo.perfil, c.qw.modelo.slice(7), 'quick win fixo: nem trocando por janela sai da classe');
  }
  assert.ok(escolhas > N * 0.3, `cenários com escolha: ${escolhas}`);
});

test(`capacidade: sem fallback, o escolhido atende a todos os requisitos (${N} cenários)`, () => {
  for (const c of cenarios()) {
    const rota = rotearCenario(c);
    if (!rota?.modelo || rota.fallback) continue;
    const cap = capDe(rota, rota.modelo.id), req = rota.requisitos;
    for (const d of DIMS_CAP) if (req.dimensoes[d]) assert.ok(cap[d] >= req.dimensoes[d], `${d}: ${cap[d]} < ${req.dimensoes[d]}`);
    if (req.classeMinima) assert.ok(NIVEL[rota.modelo.perfil] >= req.classeMinima, 'classe mínima');
    else assert.ok(NIVEL[rota.modelo.perfil] >= req.nivel || rota.candidatos.find(x => x.id === rota.modelo.id).capacidades, 'classe');
  }
});

test(`quick win flexível: a classe dele é piso e não impede subir (${N} cenários)`, () => {
  let subiu = 0;
  for (const c of cenarios().filter(x => x.qw?.pode_trocar)) {
    const rota = rotearCenario(c);
    if (!rota?.modelo || rota.fallback) continue;
    assert.ok(NIVEL[rota.modelo.perfil] >= NIVEL[c.qw.modelo.slice(7)], 'piso do quick win');
    if (NIVEL[rota.modelo.perfil] > NIVEL[c.qw.modelo.slice(7)]) subiu++;
  }
  assert.ok(subiu > 0, 'em algum cenário o pedido subiu acima do piso');
});

test(`Economia nunca escolhe mais caro que uma alternativa equivalente (mesma capacidade e mesma janela para o histórico)`, () => {
  for (const c of cenarios()) {
    const cfg = { ...c.cfg, roteamento: { ativo: true, preferencia: 'economia' } };
    const rota = rotearCenario(c, { cfg });
    if (!rota?.modelo || rota.modo !== 'automatico') continue;
    const esc = rota.candidatos.find(x => x.status === 'escolhido');
    const equivalentes = rota.candidatos.filter(x => x.status === 'preterido' && JSON.stringify(capDe(rota, x.id)) === JSON.stringify(capDe(rota, esc.id)) && x.classe === esc.classe && x.cabeTudo === esc.cabeTudo);
    for (const e of equivalentes) assert.ok(esc.custo == null || e.custo == null || esc.custo <= e.custo + 1e-12, `Economia pagou mais: ${JSON.stringify(rota.candidatos)} ${rota.motivoEscolha} ${JSON.stringify(rota.fallback)}`);
  }
});

test('Qualidade nunca reduz a capacidade escolhida em relação a Equilíbrio e Economia', () => {
  for (const c of cenarios()) {
    const escolher = p => rotearCenario(c, { cfg: { ...c.cfg, roteamento: { ativo: true, preferencia: p } } });
    const q = escolher('qualidade'), e = escolher('equilibrio'), eco = escolher('economia');
    if (!q?.modelo || !e?.modelo || q.modo !== 'automatico') continue;
    const relevantes = DIMS_CAP.filter(d => q.requisitos.dimensoes[d]);
    for (const outra of [e, eco]) for (const d of relevantes) assert.ok(capDe(q, q.modelo.id)[d] >= capDe(outra, outra.modelo.id)[d], `Qualidade reduziu ${d}: ${JSON.stringify(q.candidatos)} ${JSON.stringify(outra.candidatos)} ${JSON.stringify(q.requisitos.dimensoes)} ${q.motivoEscolha}/${outra.motivoEscolha} ${outra.preferencia}`);
  }
});

// Monotonicidade: subir uma exigência nunca leva a um modelo de capacidade inferior na dimensão exigida.
const SUBIR = {
  raciocinio: a => ({ ...a, tipos: [...new Set([...a.tipos, 'raciocinio'])] }),
  criterios: a => ({ ...a, sinais: { ...a.sinais, criterios: 3, etapas: 3 } }),
  precisao: a => ({ ...a, precisao: [...new Set([...a.precisao, 'juridico'])], tipos: [...new Set([...a.tipos, 'analise'])] }),
  risco: a => ({ ...a, sinais: { ...a.sinais, risco: true } }),
  programacao: a => ({ ...a, tipos: [...new Set([...a.tipos, 'programacao'])], sinais: { ...a.sinais, explicitoSimples: false } }),
  insatisfacao: a => ({ ...a, insatisfacao: true, insatisfacaoForte: true }),
};
test(`monotonicidade de capacidade: aumentar uma exigência nunca escolhe capacidade inferior (${N} cenários × ${Object.keys(SUBIR).length} exigências)`, () => {
  let comparacoes = 0;
  for (const c of cenarios()) {
    const a0 = analisarPedido(c.pedido);
    const r0 = rotearCenario(c, { analise: a0 });
    if (!r0?.modelo || r0.modo !== 'automatico') continue;
    for (const [nome, subir] of Object.entries(SUBIR)) {
      const a1 = subir(a0);
      const r1 = rotearCenario(c, { analise: a1 });
      if (!r1?.modelo) continue;
      const req0 = requisitosDe(a0), req1 = requisitosDe(a1);
      comparacoes++;
      // Em cada dimensão que ficou mais exigente, a capacidade do escolhido não pode cair,
      // a menos que o novo resultado seja um fallback registrado (as regras tiraram os capazes).
      for (const d of DIMS_CAP) {
        if ((req1.dimensoes[d] || 0) <= (req0.dimensoes[d] || 0)) continue;
        if (r1.fallback) continue;
        assert.ok(capDe(r1, r1.modelo.id)[d] >= Math.min(capDe(r0, r0.modelo.id)[d], req1.dimensoes[d]), `${nome}/${d}: ${r0.modelo.id} → ${r1.modelo.id}`);
      }
      if (req1.nivel >= req0.nivel && !r1.fallback && !r0.fallback) assert.ok(NIVEL[r1.modelo.perfil] >= Math.min(NIVEL[r0.modelo.perfil], req1.nivel) || candidatoExplicito(r1), `${nome}: classe caiu ${r0.modelo.perfil} → ${r1.modelo.perfil}`);
    }
  }
  assert.ok(comparacoes > N, `comparações: ${comparacoes}`);
});
const candidatoExplicito = r => !!r.candidatos.find(x => x.id === r.modelo.id)?.capacidades;

test(`monotonicidade de contexto: mais conteúdo → o mesmo modelo ou janela maior; nunca janela insuficiente`, () => {
  for (const c of cenarios()) {
    const a0 = analisarPedido(c.pedido);
    const r0 = rotearCenario(c, { analise: a0 });
    if (!r0?.modelo || r0.modo !== 'automatico') continue;
    const a1 = { ...a0, tokens: { ...a0.tokens, minimo: a0.tokens.minimo * 4, desejado: a0.tokens.desejado * 4 } };
    const r1 = rotearCenario(c, { analise: a1 });
    if (!r1?.modelo) continue;
    const jan = r => r.modelo.contexto || Infinity;
    assert.ok(jan(r1) * MARGEM_JANELA >= a1.tokens.minimo || jan(r1) === Infinity);
    if (jan(r0) * MARGEM_JANELA < a1.tokens.minimo) assert.ok(jan(r1) > jan(r0), 'trocou para janela maior');
    // Capacidade só cai se a janela obrigar, e isso fica registrado.
    if (NIVEL[r1.modelo.perfil] < Math.min(NIVEL[r0.modelo.perfil], r1.requisitos.nivel)) assert.ok(r1.fallback?.causas?.includes("contexto_insuficiente"), JSON.stringify([r0.candidatos, r1.candidatos, r0.requisitos.nivel, r1.requisitos.nivel, r1.fallback, r1.motivoEscolha]));
  }
});

test('monotonicidade de nova tentativa: com falha anterior, a classe é igual ou maior', () => {
  for (const c of cenarios()) {
    const a0 = analisarPedido({ ...c.pedido, temResposta: false });
    const r0 = rotearCenario(c, { analise: a0 });
    if (!r0?.modelo || r0.modo !== 'automatico' || r0.fallback) continue;
    const a1 = { ...a0, insatisfacao: true, insatisfacaoForte: true, anterior: { classe: r0.modelo.perfil, nivel: NIVEL[r0.modelo.perfil] } };
    const r1 = rotearCenario(c, { analise: a1 });
    if (!r1?.modelo) continue;
    assert.ok(NIVEL[r1.modelo.perfil] >= NIVEL[r0.modelo.perfil] || r1.fallback, `nova tentativa desceu: ${r0.modelo.perfil} → ${r1.modelo.perfil}`);
  }
});

test('auditoria: toda decisão, inclusive bloqueada, é reconstruível e determinística', () => {
  let bloqueadas = 0;
  for (const c of cenarios()) {
    const a = analisarPedido(c.pedido);
    const r1 = rotearCenario(c, { analise: a }), r2 = rotearCenario(c, { analise: a });
    if (!r1) continue;
    assert.deepEqual(JSON.parse(JSON.stringify({ ...r2, modelo: r2.modelo?.id })), JSON.parse(JSON.stringify({ ...r1, modelo: r1.modelo?.id })), 'mesma entrada, mesma decisão');
    const liberados = c.db.prepare("select id from modelos where liberado = 1 and id != 'openrouter/auto'").all().map(x => x.id).sort();
    assert.deepEqual(r1.candidatos.map(x => x.id).sort(), liberados, 'todo modelo liberado aparece, com status');
    for (const x of r1.candidatos) {
      assert.ok(['escolhido', 'preterido', 'insuficiente', 'excluido'].includes(x.status));
      if (x.status === 'excluido') assert.ok(x.motivos.some(m => GOVERNANCA.includes(m)), 'excluído tem motivo');
      if (x.status === 'preterido') assert.equal(x.motivos.length, 0);
    }
    assert.ok(r1.explicacao && r1.requisitos && Array.isArray(r1.politicas));
    if (!r1.modelo) { bloqueadas++; assert.ok(r1.fallback?.tipo === 'sem_modelo' && (r1.fallback.causa || r1.fallback.causas.length)); }
  }
  assert.ok(bloqueadas > 0, 'o gerador também produz decisões bloqueadas');
});
