// Regressões da bateria final em produção (QA profundo): pesquisa citada como material, duração entre datas como
// cálculo derivado, contagem de slides de peça visual conferida pela produção visual (não pelo texto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as OP from '../src/quickwin-operacao.js';
import { construir, lerVeredito, promptQualidade } from '../src/quickwin-construtor.js';

test('"se houver pesquisa de clima, use-a": pesquisa é material, não busca na internet', () => {
  for (const t of ['Sugira 5 ideias de ações de engajamento; se houver pesquisa de clima, use-a.', 'Resuma a pesquisa de satisfação do trimestre', 'Analise a pesquisa de opinião interna'])
    assert.equal(OP.pedePesquisaWeb(t), false, t);
  for (const t of ['Pesquise tendências de engajamento de equipes', 'Pesquise concorrentes do setor']) assert.equal(OP.pedePesquisaWeb(t), true, t);
});

test('conferente: duração entre datas do material e campo derivado não são invenção', () => {
  const espec = construir({ descricao: 'Monte o cronograma do projeto a partir das datas enviadas' });
  assert.match(promptQualidade(espec), /duração em dias ou semanas entre duas datas do material/);
  assert.match(promptQualidade(espec), /datas sem ano: o ano corrente/);
});

test('conferente: contagem de slides/páginas de peça visual vira observação; o mesmo critério sem peça visual reprova', () => {
  const veredito = '{"criterios":[{"id":"op_slides","ok":false,"motivo":"não está dividido em exatamente 5 slides"}]}';
  const comCriterio = e => ({ ...e, criterios_qualidade: [...e.criterios_qualidade, { id: 'op_slides', grupo: 'completo', texto: 'A apresentação contém exatamente 5 slides.' }] });
  const comVisual = comCriterio(construir({ descricao: 'Transforme o relatório em uma apresentação de 5 slides', operacao: { canais: [], ferramentas: [], entregaveis: [{ id: 'e1', tipo: 'apresentacao', visual: { tipo: 'presentation', paginas: 5 } }], origem: 'pessoa' } }));
  const r1 = lerVeredito(comVisual, veredito);
  assert.deepEqual(r1.falhas, []);
  assert.equal(r1.leves.length, 1);
  const semVisual = comCriterio(construir({ descricao: 'Escreva o roteiro de uma apresentação de 5 slides', operacao: { canais: [], ferramentas: [], entregaveis: [{ id: 'e1', tipo: 'texto', rotulo: 'Roteiro' }], origem: 'pessoa' } }));
  assert.deepEqual(lerVeredito(semVisual, veredito).falhas, ['completo']);
});

test('conferente: motivo que confirma o resultado ("está correto", "cálculo legítimo") ou só pede ênfase não reprova', () => {
  const e = construir({ descricao: 'Some as vendas do trimestre por região' });
  const id = e.criterios_qualidade[0].id;
  const v = m => lerVeredito(e, JSON.stringify({ criterios: [{ id, ok: false, motivo: m }] }));
  for (const m of ['Total 2.110; soma: 710+715+685 = 2.110. Verificação: está correto.', 'A data 31/10/2027 foi calculada, o que é correto, mas o ano não estava explícito.', 'Embora seja cálculo legítimo, falta o ano.', 'Os marcos deveriam estar mais enfatizados.'])
    assert.deepEqual(v(m).falhas, [], m);
  assert.equal(v('O valor de R$ 9.999 não está na entrada.').falhas.length, 1);
});

test('conferente: datas sem ano nos dois sentidos, reformulação e aproximação não reprovam; contexto da empresa é observação', () => {
  const e = construir({ descricao: 'Crie uma timeline do projeto com as etapas e datas' });
  const p = promptQualidade(e);
  assert.match(p, /tanto deixar a data sem ano quanto usar o ano que decorre do material está certo/);
  assert.match(p, /A GreenIA é a plataforma, não a empresa do trabalho/);
  const v = lerVeredito({ ...e, criterios_qualidade: [...e.criterios_qualidade, { id: 'contexto_empresa', grupo: 'completo', texto: 'Usa o contexto da empresa.' }] }, '{"criterios":[{"id":"contexto_empresa","ok":false,"motivo":"genérico"}]}');
  assert.deepEqual(v.falhas, []);
  assert.equal(v.leves.length, 1);
});

// QF-04: revisão dos achados do conferente (segunda leitura com o trecho exato).
import { aplicarRevisao, conferirComCorrecao, mensagensRevisao, PROMPT_REVISAO } from '../src/quickwin-construtor.js';
const IA = { falhas: ['invencao', 'completo'], achados: [{ id: 'nao_inventar', grupo: 'invencao', criterio: 'Não inventa.', motivo: 'ano inferido' }, { id: 'completo', grupo: 'completo', criterio: 'Completo.', motivo: 'faltou X' }],
  motivos: ['m1', 'm2'], razoes: [{ grupo: 'invencao', motivo: 'm1' }, { grupo: 'completo', motivo: 'm2' }], leves: [] };
const RES = '| Etapa | Início |\n|---|---|\n| Levantamento | 01/10/2026 |';
test('revisão: só achado confirmado com trecho real reprova; não confirmado, trecho inexistente ou invenção sem trecho viram observação', () => {
  const r1 = aplicarRevisao(IA, JSON.stringify({ achados: [{ id: 'nao_inventar', confirmado: false }, { id: 'completo', confirmado: true, trecho: '', prova: 'falta X' }] }), RES);
  assert.deepEqual(r1.falhas, ['completo']);
  assert.equal(r1.revisados, 1);
  const r2 = aplicarRevisao(IA, JSON.stringify({ achados: [{ id: 'nao_inventar', confirmado: true, trecho: 'Etapa inventada 2099' }] }), RES);
  assert.deepEqual(r2.falhas, [], 'trecho que não existe no resultado não sustenta o achado');
  const r3 = aplicarRevisao(IA, JSON.stringify({ achados: [{ id: 'nao_inventar', confirmado: true, trecho: '' }] }), RES);
  assert.deepEqual(r3.falhas, [], 'invenção precisa do trecho');
  const r4 = aplicarRevisao(IA, JSON.stringify({ achados: [{ id: 'nao_inventar', confirmado: true, trecho: 'Levantamento | 01/10/2026' }] }), RES);
  assert.deepEqual(r4.falhas, ['invencao']);
  assert.equal(aplicarRevisao(IA, 'não sei', RES), null, 'revisão ilegível: nada muda');
  assert.match(mensagensRevisao({ entrada: 'e', resultado: RES, achados: IA.achados })[1].content, /- nao_inventar \(invencao\)/);
  assert.match(PROMPT_REVISAO, /cálculo correto com a entrada, data ou ano que decorre do material/);
});
test('revisão no fluxo: falso positivo do conferente não reprova; revisão que falha mantém o achado', async () => {
  const espec = construir({ descricao: 'Crie uma timeline do projeto com as etapas e datas' });
  const ids = espec.criterios_qualidade.map(c => c.id);
  const qcFalha = JSON.stringify({ criterios: ids.map(id => ({ id, ok: id !== 'nao_inventar', motivo: 'ano inferido' })), objetivo_atingido: true });
  const qcOk = JSON.stringify({ criterios: ids.map(id => ({ id, ok: true })), objetivo_atingido: true });
  const mk = revisao => { let qc = 0; return async m => { const s = String(m[0].content); if (s.includes('revisor da conferência')) { if (revisao === 'erro') throw new Error('falhou'); return { texto: revisao }; }
    if (s.includes('conferente de qualidade')) return { texto: qc++ ? qcOk : qcFalha }; return { texto: RES2 }; }; };
  const RES2 = `${(espec.operacao?.entregaveis || []).map(e => `## ${OP.rotuloEntregavel(e)}\n${RES}`).join('\n\n') || RES}\n\n${(espec.formato_saida.secoes || []).map(x => `## ${x}\n- Nenhuma`).join('\n\n')}`;
  const base = { espec, resposta: RES2, entrada: 'levantamento 01/10 a 15/10; produção 02/02/2027', mensagens: [{ role: 'system', content: 'x' }, { role: 'user', content: 'y' }] };
  const a = await conferirComCorrecao({ ...base, chamar: mk(JSON.stringify({ achados: [{ id: 'nao_inventar', confirmado: false, prova: 'o ano decorre do material' }] })) });
  assert.equal(a.registro.status, 'aprovado', JSON.stringify(a.registro));
  assert.ok(a.registro.observacoes?.some(o => /não confirmado/.test(o)));
  const b = await conferirComCorrecao({ ...base, chamar: mk('erro') });
  assert.equal(b.registro.status, 'corrigido', 'achado mantido → correção');
});

// Aviso causado por configuração leva o link da tela onde se libera (pedido do responsável em produção).
import { acoesDoAviso, resumoQualidade } from '../src/quickwin-construtor.js';
test('avisos de configuração trazem a ação: pesquisa, imagem, fonte obrigatória; motivo que não é configuração não traz', () => {
  const p = resumoQualidade({ status: 'parcial', pesquisa: { exigida: true, feita: false, motivo: 'nao_liberada' } });
  assert.deepEqual(p.acoes.map(a => [a.href, a.permissao]), [['#/politicas?foco=pesquisa-web', 'policy.manage']]);
  assert.ok(p.avisos.some(a => /pesquisa na internet não foi feita/.test(a)));
  assert.equal(resumoQualidade({ status: 'parcial', pesquisa: { exigida: true, feita: false, motivo: 'sigilosa' } }).acoes, undefined, 'sigilo não é configuração a liberar');
  assert.deepEqual(acoesDoAviso({ objetivo: { motivo: 'imagem_nao_gerada', imagem_motivo: 'nao_liberado' } }).map(a => a.href), ['#/configuracoes?foco=iv-imagens']);
  assert.deepEqual(acoesDoAviso({ objetivo: { motivo: 'imagem_nao_gerada', imagem_motivo: 'area_reforcada' } }), []);
  const f = acoesDoAviso({ fontes: { obrigatorias_falharam: [{ titulo: 'Conhecimento da empresa', motivo: 'Nenhum trecho' }] }, quick_win: 7 });
  assert.deepEqual(f.map(a => a.href), ['#/conhecimento', '#/qw/7/editar?foco=fontes-qw']);
});
