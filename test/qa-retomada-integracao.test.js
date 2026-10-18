import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { executar } from '../scripts/qa-baixar-candidata.mjs';

test('bootstrap: reconfere planilha salva, conserva pendências e usa materiais de outra rodada antes de inferir', async () => {
  const raizes = [], criar = () => { const p = mkdtempSync('/tmp/greenia-candidata-'); raizes.push(p); return p; };
  const anterior = join(criar(), 'qa-candidato-saida/2026-10-18T14-15-42-857Z');
  const materiais = join(criar(), 'qa-candidato-saida/2026-10-18T13-00-00-000Z');
  const pacote = criar(), arquivo = join(pacote, 'candidata.tar.gz');
  const origFetch = globalThis.fetch, origLog = console.log; const logs = [];
  const gravar = (p, r) => { const b = JSON.stringify(r); writeFileSync(join(p, 'relatorio.json'), b); return createHash('sha256').update(b).digest('hex'); };
  try {
    mkdirSync(anterior, { recursive: true }); mkdirSync(materiais, { recursive: true });
    const hashMateriais = gravar(materiais, {});
    for (const id of ['U05', 'U09', 'U10']) writeFileSync(join(materiais, `h-${id}.md`), `Dados fictícios ${id}\n\n---\n\nResposta anterior`);
    copyFileSync(new URL('./fixtures/qa-real/planilha-ranking-20261018.md', import.meta.url), join(anterior, 'h-03-planilha.md'));
    const hashAnterior = gravar(anterior, {
      escopo: { candidato: 'b'.repeat(40), selecaoClasses: ['rapido/contrato', 'avancado/reuniao'] },
      evidenciaProvedor: { custoConfirmadoUsd: 0.7864195, custoTotalUsd: null }, recibos: [{ custo: null, geracao: 'gen-pendente', modelo: 'm' }],
      homologacao: { principais: [{ id: '03-planilha', fonte: 'ia', http: 200, status: 'aprovado', custo: 0.01933725, custosPendentes: 0, utilizavel: false, falhas: ['Ranking e percentuais da planilha não foram verificados independentemente'] }, { id: '09-pendencias', utilizavel: true, custo: 0.1 }], surpresa: ['U05', 'U09', 'U10'].map(id => ({ id, estado: 'nao_executado', utilizavel: null })) },
      classes: { avancado: { pesquisa: { status: 'aprovado', falhas: [], fontes: ['https://fonte.exemplo/a'] }, contrato: { status: 'corrigido', falhas: [] } } },
    });
    writeFileSync(join(anterior, 'classe-avancado-pesquisa.md'), 'Nenhuma fonte teve data de publicação confirmada, então não dá para afirmar que as tendências sejam recentes.');
    const codigo = join(pacote, 'codigo'); mkdirSync(join(codigo, 'scripts'), { recursive: true }); mkdirSync(join(codigo, 'src'));
    writeFileSync(join(codigo, 'src/quickwin-operacao.js'), `export { conferirOperacao } from '${new URL('../src/quickwin-operacao.js', import.meta.url).href}';`);
    writeFileSync(join(codigo, 'package.json'), '{"type":"module"}');
    for (const p of ['scripts/qa-planilha-oraculo.mjs', 'scripts/qa-cenarios.mjs', 'src/planilha.js']) copyFileSync(new URL('../' + p, import.meta.url), join(codigo, p));
    writeFileSync(join(codigo, 'scripts/qa-render-isolado.mjs'), `
      import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
      import { fileURLToPath } from 'node:url';
      const pasta = fileURLToPath(new URL('../qa-candidato-saida/2026-10-18T15-00-00-000Z/', import.meta.url));
      mkdirSync(pasta, { recursive: true });
      writeFileSync(pasta + '/relatorio.json', JSON.stringify({
        escopo: { selecao: process.env.QA_CASOS, selecaoClasses: process.env.QA_CLASSES, materiais: process.env.QA_MATERIAIS },
        pendenciasAnteriores: JSON.parse(readFileSync(process.env.QA_CONTEXTO_ANTERIOR, 'utf8')),
      }));
    `);
    execFileSync('tar', ['-czf', arquivo, '-C', pacote, 'codigo']);
    globalThis.fetch = async () => new Response(readFileSync(arquivo));
    console.log = (...args) => { const texto = args.join(' '); logs.push(texto); const m = texto.match(/Pasta temporária: (\/tmp\/greenia-candidata-\w+)/); if (m) raizes.push(m[1]); };
    await executar('a'.repeat(40), { retomar: anterior, hashAnterior, materiaisDe: materiais, hashMateriais });
    const r = JSON.parse(readFileSync(join(raizes.at(-1), 'qa-candidato-saida/2026-10-18T15-00-00-000Z/relatorio.json'), 'utf8'));
    assert.equal(r.escopo.selecao, 'U05,U09,U10');
    assert.equal(r.escopo.selecaoClasses, 'avancado/pesquisa,rapido/contrato,avancado/reuniao');
    assert.equal(r.pendenciasAnteriores.revisoesPesquisasSalvas[0].statusOriginal, 'aprovado');
    assert.equal(r.pendenciasAnteriores.revisoesPesquisasSalvas[0].statusRevisado, 'parcial');
    assert.equal(r.pendenciasAnteriores.revisoesPesquisasSalvas[0].semNovaInferencia, true);
    assert.equal(r.escopo.materiais, materiais);
    assert.equal(r.pendenciasAnteriores.recibosPendentes[0].custo, null);
    assert.equal(r.pendenciasAnteriores.custoTotalUsd, null);
    assert.equal(r.pendenciasAnteriores.revisaoPlanilha.conferencia.lancamentosVerificados, 8);
    assert.equal(r.pendenciasAnteriores.revisaoPlanilha.utilizavel, true);
    assert.equal(createHash('sha256').update(readFileSync(join(anterior, 'relatorio.json'))).digest('hex'), hashAnterior);
    rmSync(join(materiais, 'h-U10.md'));
    await assert.rejects(executar('a'.repeat(40), { retomar: anterior, hashAnterior, materiaisDe: materiais, hashMateriais }), /ENOENT/);
    // Sem material, o processo filho não chega a criar a saída de uma nova rodada.
    assert.throws(() => readFileSync(join(raizes.at(-1), 'qa-candidato-saida/2026-10-18T15-00-00-000Z/relatorio.json')), /ENOENT/);
  } finally { globalThis.fetch = origFetch; console.log = origLog; for (const r of raizes) rmSync(r, { recursive: true, force: true }); }
});
