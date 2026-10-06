// Regressão do roteador sobre a matriz de referência (scripts/roteamento-casos.js): prova, caso a caso,
// que a escolha vem da análise do pedido, que governança e permissões só tiram candidatos, que a
// preferência muda a escolha quando há alternativas equivalentes, e que a explicação reflete a decisão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASOS, CATALOGO, montarBanco, rodarCaso } from '../scripts/roteamento-casos.js';
import { exec } from '../src/db.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { analisarPedido, analiseIndisponivel, estimarTokens, explicar, orcamentoHistorico, requisitosDe, rotear, AUTOMATICO, MARGEM_JANELA, NOME_CLASSE, TEXTO } from '../src/roteador.js';

const caso = id => CASOS.find(c => c.id === id);
const PREFS = ['economia', 'equilibrio', 'qualidade'];
const GOVERNANCA = ['nao_homologado', 'plano_na_reserva', 'gratuito_treina_com_dados', 'sem_acesso_a_classe', 'contexto_insuficiente'];
const classeDe = id => CATALOGO.find(m => m.id === id)?.perfil;
const semAcessoAvancado = () => { const db = montarBanco(); exec(db, "update config set valor = ? where chave = 'acessoPerfis'", JSON.stringify({ equilibrado: { todos: true }, avancado: { todos: false } })); return db; };

test('1. tarefa simples não usa modelo avançado, em nenhuma preferência', () => {
  for (const id of ['A', 'B', 'F', 'H', 'M']) for (const p of PREFS) {
    const { rota } = rodarCaso(caso(id), { preferencia: p });
    assert.equal(rota.requisitos.nivel, 1, `${id}: exigência Rápido`);
    assert.equal(rota.modelo.perfil, 'rapido', `${id}/${p}: ficou no Rápido`);
  }
});

test('2. tarefa complexa não usa modelo insuficiente, em nenhuma preferência', () => {
  for (const id of ['C', 'D', 'E', 'G', 'I', 'L']) for (const p of PREFS) {
    const { rota } = rodarCaso(caso(id), { preferencia: p });
    assert.equal(rota.requisitos.classe, 'avancado', `${id}: exige Avançado`);
    assert.equal(rota.modelo.perfil, 'avancado', `${id}/${p}`);
    assert.equal(rota.fallback, null);
  }
});

test('3. contexto grande: escolhe janela suficiente; volume sozinho não sobe a classe', () => {
  const { analise: a, rota: h } = rodarCaso(caso('H'));
  assert.equal(h.requisitos.nivel, 1, 'resumir é simples, mesmo com 900 mil caracteres');
  assert.ok(h.modelo.contexto * MARGEM_JANELA >= h.requisitos.janelaMinima);
  assert.deepEqual(h.candidatos.find(c => c.id === 'x/rapido-curto').motivos, ['contexto_insuficiente']);
  assert.equal(h.modelo.id, 'google/gemini-3.5-flash-lite');
  // O orçamento do histórico no envio usa a mesma conta: a mensagem atual sempre cabe.
  assert.ok(orcamentoHistorico(a, h.modelo) >= caso('H').texto.length + caso('H').anexos[0].texto.length);
  // Analisar (e não só resumir) um volume grande pede capacidade e janela.
  const { rota: n } = rodarCaso(caso('N'));
  assert.equal(n.requisitos.dimensoes.leitura_longa, 3);
  assert.ok(n.candidatos.find(c => c.id === 'x/avancado-curto').motivos.includes('contexto_insuficiente'));
  assert.equal(n.modelo.id, 'anthropic/claude-sonnet-5');
});

test('3b. estimativa de tokens: conteúdo denso usa razão mais conservadora; a seleção usa a segura', () => {
  const prosa = estimarTokens('O fornecedor entregou o lote conforme o pedido. '.repeat(100));
  const denso = estimarTokens('0042 | 12,50 | 3 | 37,50 | 2026-09-01\n'.repeat(100));
  assert.equal(prosa.tipo, 'prosa');
  assert.equal(denso.tipo, 'denso');
  assert.ok(denso.segura / denso.media > 1.2 && prosa.segura > prosa.media);
  const a = analisarPedido({ texto: 'Confira', anexos: [{ texto: '0042 | 12,50 | 3\n'.repeat(5000) }] });
  assert.equal(a.tokens.densidade, 'denso');
  assert.ok(a.tokens.minimo > a.tokens.custoEntrada, 'a janela exigida é maior que a estimativa de custo');
});

test('4. assunto de alta precisão aumenta a exigência quando aplicável', () => {
  const nivel = texto => requisitosDe(analisarPedido({ texto, anexos: [{ texto: 'x'.repeat(3000) }] })).nivel;
  assert.equal(nivel('Extraia os valores desta tabela.'), 1);
  assert.equal(nivel('Extraia o valor exato de cada linha desta tabela.'), 2, 'exatidão sobe para Equilibrado');
  assert.equal(nivel('Analise este texto e aponte os pontos principais.'), 2);
  assert.equal(nivel('Analise este contrato e identifique riscos jurídicos.'), 3, 'domínio + riscos sobe para Avançado');
  // Não aplicável: pergunta curta sobre o domínio não vira Avançado.
  assert.equal(requisitosDe(analisarPedido({ texto: 'O que é LGPD?' })).nivel, 1);
});

test('5. pessoa sem acesso à classe necessária recebe o melhor modelo permitido, com a causa registrada', () => {
  const { rota } = rodarCaso(caso('C'), { db: semAcessoAvancado() });
  assert.equal(rota.modelo.perfil, 'equilibrado');
  assert.equal(rota.fallback.tipo, 'abaixo_do_necessario');
  assert.deepEqual(rota.fallback.causas, ['sem_acesso_a_classe']);
  assert.ok(rota.candidatos.filter(c => c.classe === 'avancado').every(c => c.status === 'excluido' && c.motivos.includes('sem_acesso_a_classe')));
  // Pedido que não precisa do Avançado não é afetado pela falta de acesso.
  assert.equal(rodarCaso(caso('O'), { db: semAcessoAvancado() }).rota.fallback, null);
});

test('6. sigilo exclui os modelos não homologados; a escolha segue a capacidade entre os homologados', () => {
  const { rota } = rodarCaso(caso('C'), { sigilosa: true, homologados: ['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5'] });
  assert.equal(rota.modelo.id, 'anthropic/claude-sonnet-5', 'entre os homologados, o que tem a capacidade');
  for (const c of rota.candidatos.filter(x => !['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5'].includes(x.id))) assert.ok(c.motivos.includes('nao_homologado'), c.id);
  const simples = rodarCaso(caso('A'), { sigilosa: true, homologados: ['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5'] }).rota;
  assert.equal(simples.modelo.id, 'google/gemini-3.5-flash-lite', 'sigilo não empurra pedido simples para o homologado caro');
});

test('7. a preferência muda a decisão quando há alternativas equivalentes, e só então', () => {
  const escolha = (id, p) => rodarCaso(caso(id), { preferencia: p }).rota;
  // Economia: o mais barato que atende. Equilíbrio: o padrão curado da classe, se custa até ~2x.
  assert.equal(escolha('C', 'economia').modelo.id, 'x/avancado-curto');
  assert.equal(escolha('C', 'equilibrio').modelo.id, 'anthropic/claude-sonnet-5');
  assert.equal(escolha('C', 'equilibrio').motivoEscolha, 'padrao_da_classe');
  // Qualidade: uma classe de margem em tarefa que não é simples.
  assert.equal(escolha('O', 'equilibrio').modelo.perfil, 'equilibrado');
  assert.equal(escolha('O', 'qualidade').modelo.perfil, 'avancado');
  assert.equal(escolha('O', 'qualidade').motivoEscolha, 'margem_de_capacidade');
  // Sem justificativa técnica, as três preferências dão o mesmo resultado (não compra margem para traduzir).
  for (const id of ['A', 'B', 'H']) assert.equal(new Set(PREFS.map(p => escolha(id, p).modelo.id)).size, 1, id);
  // Margem nunca passa de uma classe.
  for (const c of CASOS) { const r = escolha(c.id, 'qualidade'); assert.ok(r.modelo.perfil === r.requisitos.classe || ({ rapido: 1, equilibrado: 2, avancado: 3 })[r.modelo.perfil] === r.requisitos.nivel + 1, c.id); }
});

test('8. falha da classificação não quebra a governança', () => {
  const db = montarBanco(), cfg = lerConfig(db), pessoa = { grupos: [], areas: [] };
  const a = analiseIndisponivel({ texto: 'qualquer coisa', anexos: [] });
  const normal = rotear({ db, cfg, pessoa, pedido: AUTOMATICO, analise: a });
  assert.equal(normal.requisitos.classe, 'equilibrado', 'na dúvida, a exigência padrão');
  assert.deepEqual(normal.requisitos.determinantes, ['analise_indisponivel']);
  exec(db, "update modelos set homologado = 1, homologacao = '{\"fornecedor\":\"x\",\"endpoint\":\"x\",\"retencaoZero\":true,\"semTreino\":true}' where id = 'google/gemini-3.5-flash-lite'");
  const sig = rotear({ db, cfg, pessoa, pedido: AUTOMATICO, analise: a, sigilosa: true });
  assert.equal(sig.modelo.id, 'google/gemini-3.5-flash-lite');
  assert.ok(sig.candidatos.filter(c => c.id !== sig.modelo.id).every(c => c.motivos.includes('nao_homologado')));
  assert.equal(rotear({ db, cfg, pessoa, pedido: AUTOMATICO, analise: a, reservaDoPlano: true }).modelo.perfil, 'rapido');
});

test('9. fallback nunca viola política: o modelo usado não tem motivo de governança; a reserva passa pelas mesmas regras', () => {
  const situacoes = [
    rodarCaso(caso('C'), { db: semAcessoAvancado() }).rota,
    rodarCaso(caso('C'), { sigilosa: true, homologados: ['google/gemini-3.5-flash-lite'] }).rota,
    rodarCaso(caso('G'), { reservaDoPlano: true }).rota,
  ];
  for (const r of situacoes) {
    assert.equal(r.fallback.tipo, 'abaixo_do_necessario');
    const usado = r.candidatos.find(c => c.status === 'escolhido');
    assert.ok(!usado.motivos.some(m => GOVERNANCA.includes(m)), JSON.stringify(usado));
  }
  // Reserva de execução: descartada se for de classe inferior, não liberada, ou em conversa sigilosa.
  const db = montarBanco();
  exec(db, "update modelos set reserva = 'x/rapido-curto' where id = 'anthropic/claude-sonnet-5'");
  assert.equal(rodarCaso(caso('C'), { db }).rota.reservaDescartada, 'reserva_de_classe_inferior');
  exec(db, "update modelos set reserva = 'x/avancado-curto' where id = 'anthropic/claude-sonnet-5'");
  assert.equal(rodarCaso(caso('C'), { db }).rota.reserva, 'x/avancado-curto');
  exec(db, "update modelos set liberado = 0 where id = 'x/avancado-curto'");
  assert.equal(rodarCaso(caso('C'), { db }).rota.reservaDescartada, 'reserva_nao_liberada');
  // Reserva que não comporta o contexto também é descartada.
  const db2 = montarBanco();
  exec(db2, "update modelos set reserva = 'x/avancado-curto' where id = 'anthropic/claude-sonnet-5'");
  assert.equal(rodarCaso(caso('N'), { db: db2 }).rota.reservaDescartada, 'contexto_insuficiente');
});

test('10. mudança de configuração da empresa altera o conjunto de candidatos e a escolha', () => {
  const db = montarBanco();
  assert.equal(rodarCaso(caso('C'), { db }).rota.modelo.id, 'anthropic/claude-sonnet-5');
  exec(db, "update modelos set liberado = 0 where id = 'anthropic/claude-sonnet-5'");
  const r = rodarCaso(caso('C'), { db }).rota;
  assert.ok(!r.candidatos.some(c => c.id === 'anthropic/claude-sonnet-5'));
  assert.equal(r.modelo.id, 'x/avancado-curto');
  // Trocar o padrão da classe muda o desempate do Equilíbrio.
  exec(db, "update modelos set liberado = 1 where id = 'anthropic/claude-sonnet-5'");
  salvarConfig(db, { padroes: { ...lerConfig(db).padroes, avancado: 'x/avancado-curto' } });
  assert.equal(rodarCaso(caso('C'), { db }).rota.modelo.id, 'x/avancado-curto');
});

test('11. o motivo exibido corresponde à decisão real', () => {
  for (const c of CASOS) for (const p of PREFS) {
    const { analise: a, rota: d } = rodarCaso(c, { preferencia: p });
    const e = d.explicacao;
    assert.ok(e.startsWith(`Classe ${NOME_CLASSE[d.modelo.perfil]},`), `${c.id}: classe usada`);
    assert.ok(e.includes(`exige a classe ${NOME_CLASSE[d.requisitos.classe]}`), `${c.id}: classe exigida`);
    for (const m of d.requisitos.determinantes) assert.ok(e.includes(TEXTO[m]), `${c.id}: motivo ${m}`);
    if (d.motivoEscolha !== 'mais_capaz_permitido') assert.ok(e.includes(TEXTO[d.motivoEscolha]), `${c.id}/${p}: ${d.motivoEscolha}`);
    assert.equal(e.includes('ficaram de fora por janela') || e.includes('ficou de fora por janela'), d.candidatos.some(x => x.motivos.includes('contexto_insuficiente')), `${c.id}: janela`);
    // Determinística e derivada: a mesma decisão dá o mesmo texto; outra decisão, outro texto.
    assert.equal(explicar(a, d), e);
    assert.notEqual(explicar(a, { ...d, motivoEscolha: d.motivoEscolha === 'menor_custo' ? 'padrao_da_classe' : 'menor_custo' }), e);
  }
  const lim = rodarCaso(caso('C'), { db: semAcessoAvancado() }).rota;
  assert.match(lim.explicacao, /A tarefa pedia a classe Avançado, mas a pessoa não tem acesso à classe/);
});

test('12. solicitações diferentes, mesma pessoa e mesma configuração, não são obrigadas ao mesmo modelo', () => {
  const db = montarBanco();
  const modelos = new Set(['A', 'C', 'H', 'J', 'N'].map(id => rodarCaso(caso(id), { db }).rota.modelo.id));
  assert.ok(modelos.size >= 4, [...modelos].join(', '));
  const classes = new Set(CASOS.map(c => rodarCaso(c, { db }).rota.modelo.perfil));
  assert.deepEqual([...classes].sort(), ['avancado', 'equilibrado', 'rapido']);
});

test('nova tentativa sobe a partir da classe usada antes; na classe mais alta, registra que não há acima', () => {
  const j = rodarCaso(caso('J')).rota;
  assert.equal(j.requisitos.dimensoes.nova_tentativa, 2);
  assert.equal(j.modelo.perfil, 'equilibrado');
  const topo = rodarCaso({ ...caso('J'), anterior: { classe: 'avancado', nivel: 3 } }).rota;
  assert.deepEqual(topo.requisitos.determinantes, ['resposta_anterior_nao_resolveu_sem_classe_acima']);
  // Sem resposta anterior, a mesma frase não é insatisfação.
  assert.equal(analisarPedido({ texto: caso('J').texto }).insatisfacao, false);
  // O feedback "não serviu" da conversa também conta.
  assert.equal(analisarPedido({ texto: 'Tente outra abordagem', temResposta: true, feedback: 'nao_serviu' }).insatisfacao, true);
});

test('capacidade x classe: cada dimensão tem efeito próprio e registrado', () => {
  const r = id => rodarCaso(caso(id)).rota.requisitos;
  assert.deepEqual(r('F').dimensoes, { geral: 1, programacao: 1 }, 'código simples fica no Rápido');
  assert.equal(r('G').dimensoes.programacao, 3, 'código com concorrência e segurança');
  assert.equal(r('I').dimensoes.raciocinio, 3, 'raciocínio multicritério com pouco contexto');
  assert.equal(r('L').dimensoes.precisao, undefined, 'complexa sem domínio de precisão');
  assert.equal(r('K').dimensoes.precisao, 2, 'simples com exatidão');
  assert.equal(r('H').dimensoes.leitura_longa, undefined, 'síntese de volume grande: só janela');
  assert.equal(r('N').dimensoes.leitura_longa, 3, 'análise de volume grande: capacidade e janela');
});

test('quick win: fixo define a classe (com a análise registrada); flexível entra como piso do Automático', () => {
  const db = montarBanco(), cfg = lerConfig(db), pessoa = { grupos: [], areas: [] };
  const rapido = { id: 'google/gemini-3.5-flash-lite', perfil: 'rapido', liberado: true };
  const contrato = analisarPedido({ texto: caso('C').texto, anexos: caso('C').anexos });
  const fixo = rotear({ db, cfg, pessoa, qw: { modelo: 'classe:rapido', pode_trocar: false }, pedido: 'classe:rapido', analise: contrato, modeloManual: rapido, origem: 'quick_win' });
  assert.equal(fixo.modo, 'quick_win');
  assert.equal(fixo.modelo.perfil, rapido.perfil, 'a classe fixa do quick win manda');
  assert.equal(fixo.modelo.id, 'x/rapido-curto', 'seleciona a alternativa mais econômica dentro da classe');
  assert.equal(fixo.requisitos.classe, 'avancado', 'mas a análise roda');
  assert.equal(fixo.fallback.tipo, 'abaixo_do_necessario_por_escolha');
  assert.ok(fixo.politicas.includes('quick_win_define_o_modelo'));
  // Flexível: a classe do quick win é o mínimo; o pedido pode subir, nunca descer.
  const traducao = analisarPedido({ texto: caso('A').texto });
  const piso = rotear({ db, cfg, pessoa, qw: { modelo: 'classe:equilibrado', pode_trocar: true }, pedido: AUTOMATICO, analise: traducao });
  assert.equal(piso.requisitos.dimensoes.quick_win, 2);
  assert.equal(piso.modelo.perfil, 'equilibrado');
  assert.ok(piso.explicacao.includes(TEXTO.piso_do_quick_win));
  const sobe = rotear({ db, cfg, pessoa, qw: { modelo: 'classe:equilibrado', pode_trocar: true }, pedido: AUTOMATICO, analise: contrato });
  assert.equal(sobe.modelo.perfil, 'avancado');
});

test('todo sinal da análise muda a escolha em pelo menos um caso de referência (nenhum sinal decorativo)', async () => {
  const { rotearAnalise } = await import('../scripts/roteamento-casos.js');
  const desligar = {
    analise: a => ({ ...a, tipos: a.tipos.filter(t => t !== 'analise').concat(a.tipos.length === 1 && a.tipos[0] === 'analise' ? ['consulta'] : []) }),
    raciocinio: a => ({ ...a, tipos: a.tipos.filter(t => t !== 'raciocinio') }),
    programacao: a => ({ ...a, tipos: a.tipos.filter(t => t !== 'programacao') }),
    precisao: a => ({ ...a, precisao: [] }),
    risco: a => ({ ...a, sinais: { ...a.sinais, risco: false } }),
    criterios: a => ({ ...a, sinais: { ...a.sinais, criterios: 0, etapas: 0 } }),
    simples: a => ({ ...a, sinais: { ...a.sinais, explicitoSimples: false } }),
    insatisfacao: a => ({ ...a, insatisfacao: false }),
    volume: a => ({ ...a, tokens: { ...a.tokens, pedido: 500, minimo: 2000, desejado: 2000, mensagem: 200 } }),
  };
  for (const [sinal, f] of Object.entries(desligar)) {
    const muda = CASOS.some(c => { const { analise, rota } = rodarCaso(c); return rotearAnalise(f(analise)).modelo.id !== rota.modelo.id; });
    assert.ok(muda, `o sinal "${sinal}" não muda nenhuma decisão`);
  }
});

test('capacidades explícitas: modelo Equilibrado forte em programação atende código difícil antes de um Avançado mais caro', () => {
  const db = montarBanco();
  exec(db, `update modelos set capacidades = '{"programacao":3,"raciocinio":3}' where id = 'anthropic/claude-haiku-4.5'`);
  const g = rodarCaso(caso('G'), { db }).rota;   // exige geral 3 também: o Equilibrado não atende "geral"
  assert.equal(g.modelo.perfil, 'avancado', 'capacidade parcial não basta: todas as dimensões exigidas');
  const p = rodarCaso(caso('P'), { db, preferencia: 'qualidade' }).rota;   // programação 2: Qualidade busca margem NA DIMENSÃO
  assert.equal(p.modelo.id, 'anthropic/claude-haiku-4.5', 'margem de capacidade relevante sem subir de classe');
  assert.ok(['margem_de_capacidade', 'menor_custo'].includes(p.motivoEscolha), p.motivoEscolha);
  exec(db, `update modelos set capacidades = '{"geral":3,"programacao":3,"raciocinio":3}' where id = 'anthropic/claude-haiku-4.5'`);
  const g2 = rodarCaso(caso('G'), { db }).rota;
  assert.equal(g2.modelo.id, 'anthropic/claude-haiku-4.5', 'atende a todas as dimensões e é mais barato');
  assert.deepEqual(g2.candidatos.find(c => c.id === g2.modelo.id).capacidades.programacao, 3, 'capacidades explícitas no registro');
  // Avançado fraco em leitura longa não serve para análise de grande volume.
  const db2 = montarBanco();
  exec(db2, `update modelos set capacidades = '{"leitura_longa":2}' where id = 'anthropic/claude-sonnet-5'`);
  const n = rodarCaso(caso('N'), { db: db2 }).rota;
  assert.ok(n.candidatos.find(c => c.id === 'anthropic/claude-sonnet-5').motivos.includes('capacidade_insuficiente'));
  // Classe continua sendo política: pessoa sem acesso ao Equilibrado não usa o Equilibrado "forte".
  const db3 = montarBanco();
  exec(db3, `update modelos set capacidades = '{"geral":3,"programacao":3,"raciocinio":3}' where id = 'anthropic/claude-haiku-4.5'`);
  exec(db3, "update config set valor = ? where chave = 'acessoPerfis'", JSON.stringify({ equilibrado: { todos: false }, avancado: { todos: true } }));
  assert.equal(rodarCaso(caso('G'), { db: db3 }).rota.modelo.perfil, 'avancado');
});

test('dominância: um desempate nunca escolhe modelo menos capaz e mais caro', () => {
  const db = montarBanco();
  // Avançado mais barato que o Equilibrado padrão: para um pedido Equilibrado, o Avançado domina.
  exec(db, "update modelos set preco_entrada = 0.0000008, preco_saida = 0.000004 where id = 'x/avancado-curto'");
  for (const p of PREFS) {
    const r = rodarCaso(caso('O'), { db, preferencia: p }).rota;
    assert.equal(r.modelo.id, 'x/avancado-curto', p);
    assert.equal(r.candidatos.find(c => c.id === 'anthropic/claude-haiku-4.5').dominadoPor, 'x/avancado-curto');
  }
});

test('"não serviu": só falha explícita sobe a exigência; continuação da conversa e assunto não sobem', () => {
  const insat = (texto, extra = {}) => analisarPedido({ texto, temResposta: true, ...extra }).insatisfacao;
  // Falha explícita sobre a resposta anterior.
  for (const t of ['Não resolveu.', 'Não funcionou, continua dando erro 500.', 'Ainda está errado.', 'Refaça, por favor.', 'Não era isso que eu pedi.',
    'Olha, a resposta anterior não resolveu nada.', 'O código que você mandou não funcionou.']) assert.equal(insat(t), true, t);
  // Assunto ou nova tarefa: não é falha da resposta.
  for (const t of ['O login não funcionou para o cliente, o que eu faço?', 'Encontre o que está errado nesta planilha.', 'Verifique se o valor está errado.',
    'O que está faltando neste relatório?', 'Agora faça o mesmo para o segundo trimestre.', 'Ótimo. Agora resuma em três linhas.',
    'O fornecedor não entendeu o pedido; escreva um email explicando de novo.']) assert.equal(insat(t), false, t);
  // Mensagem longa ou com anexo novo é tarefa nova, mesmo começando com a frase.
  assert.equal(insat(`Não resolveu. ${'Segue o contexto completo do caso. '.repeat(20)}`), false);
  assert.equal(insat('Não resolveu.', { anexos: [{ texto: 'x'.repeat(100) }] }), false);
  // Frases ambíguas ficam registradas para calibração, sem efeito.
  assert.equal(analisarPedido({ texto: 'O que está faltando neste relatório?', temResposta: true }).sinais.insatisfacaoAmbigua, true);
  // Sem resposta anterior, nada é falha.
  assert.equal(analisarPedido({ texto: 'Não resolveu.' }).insatisfacao, false);
});

test('nova tentativa é limitada: no máximo uma classe acima do que a tarefa pede, sem subir em cadeia', () => {
  const r = anterior => requisitosDe(analisarPedido({ texto: 'Não resolveu.', temResposta: true, anterior }));
  assert.equal(r({ classe: 'rapido', nivel: 1 }).nivel, 2, 'tarefa simples, antes Rápido: Equilibrado');
  assert.equal(r({ classe: 'equilibrado', nivel: 2 }).nivel, 2, 'segunda falha seguida não vai ao Avançado');
  assert.deepEqual(r({ classe: 'equilibrado', nivel: 2 }).determinantes.includes('resposta_anterior_nao_resolveu_limite'), true);
  assert.equal(r({ classe: 'avancado', nivel: 3 }).nivel, 3, 'nunca abaixo da classe que acabou de falhar');
});

test('quick win fixo com conteúdo grande: troca só dentro da classe dele; com modelo técnico fixado, não troca', () => {
  const db = montarBanco(), cfg = lerConfig(db), pessoa = { grupos: [], areas: [] };
  const grande = analisarPedido({ texto: 'Resuma este documento.', anexos: [{ texto: 'O lote foi entregue e conferido pela equipe. '.repeat(20000) }] });
  const curto = { id: 'x/rapido-curto', perfil: 'rapido', liberado: true, contexto: 32000 };
  const r = rotear({ db, cfg, pessoa, qw: { modelo: 'classe:rapido', pode_trocar: false }, pedido: 'classe:rapido', analise: grande, modeloManual: curto, origem: 'quick_win' });
  assert.equal(r.modelo.perfil, 'rapido', 'continua na classe do quick win');
  assert.equal(r.modelo.id, 'google/gemini-3.5-flash-lite');
  assert.equal(r.fallback.tipo, 'trocado_por_falta_de_contexto');
  const tecnico = rotear({ db, cfg, pessoa, qw: { modelo: 'x/rapido-curto', pode_trocar: false }, pedido: 'x/rapido-curto', analise: grande, modeloManual: curto, origem: 'quick_win' });
  assert.equal(tecnico.modelo, null, 'modelo técnico fixado: bloqueia em vez de trocar');
  assert.equal(tecnico.fallback.causa, 'contexto_insuficiente');
  // A escolha da pessoa pode ir para classe maior quando a dela não comporta (não é regra de governança).
  exec(db, "update modelos set liberado = 0 where id = 'google/gemini-3.5-flash-lite'");
  const pessoaEscolheu = rotear({ db, cfg, pessoa, pedido: 'classe:rapido', analise: grande, modeloManual: curto, origem: 'pessoa' });
  assert.ok(pessoaEscolheu.modelo.perfil !== 'rapido');
  assert.equal(rotear({ db, cfg, pessoa, qw: { modelo: 'classe:rapido', pode_trocar: false }, pedido: 'classe:rapido', analise: grande, modeloManual: curto, origem: 'quick_win' }).modelo, null, 'quick win fixo nunca sai da classe');
});
