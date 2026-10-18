// Bootstrap sem dependências npm. Só baixa um commit imutável para /tmp.
import { mkdtempSync, createWriteStream, symlinkSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function selecionarRetomada(anterior) {
  const pendente = c => c.estado !== 'fora_desta_rodada' && (c.utilizavel !== true || c.custo === null || (c.id === '03-planilha' && !c.conferenciaNumerica) || (c.id === 'U05' && !c.conferenciaDados));
  const casos = [...(anterior.homologacao?.principais || []), ...(anterior.homologacao?.surpresa || [])].filter(pendente).map(c => c.id);
  const classes = [];
  if (anterior.classes && typeof anterior.classes === 'object') for (const [classe, entradas] of Object.entries(anterior.classes))
    for (const [id, c] of Object.entries(entradas)) if (c.falhas?.length || !['aprovado', 'corrigido'].includes(c.status)) classes.push(`${classe}/${id}`);
  for (const entrada of anterior.escopo?.selecaoClasses || []) {
    const [classe, id] = entrada.split('/'), c = typeof anterior.classes === 'object' ? anterior.classes?.[classe]?.[id] : null;
    if (!c || c.falhas?.length || !['aprovado', 'corrigido'].includes(c.status)) classes.push(entrada);
  }
  return { casos: [...new Set(casos)], classes: [...new Set(classes)] };
}
export function extrairMaterialRetomada(texto) {
  const separador = '\n\n---\n\n', i = texto.lastIndexOf(separador);
  if (i < 0 || !texto.slice(0, i).trim()) throw new Error('Material anterior não pôde ser separado com segurança; não gerar outra amostra silenciosamente.');
  return texto.slice(0, i);
}
export function conferirPlanilhaSalva(caso, conferencia) {
  const mensagem = 'Ranking e percentuais da planilha não foram verificados independentemente';
  if (caso?.id !== '03-planilha' || conferencia.falhas.length || !caso.falhas?.includes(mensagem)) return caso;
  const falhas = caso.falhas.filter(f => f !== mensagem);
  return { ...caso, conferenciaNumerica: conferencia, falhas,
    utilizavel: !falhas.length && caso.fonte === 'ia' && caso.http === 200 && ['aprovado', 'corrigido'].includes(caso.status) && Number.isFinite(caso.custo) && caso.custosPendentes === 0 };
}
function lerRodada(pasta, esperado) {
  if (/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida$/.test(pasta || '')) {
    const rodadas = readdirSync(pasta).sort();
    if (rodadas.length !== 1) throw new Error('Informe a pasta exata da rodada a retomar.');
    pasta = join(pasta, rodadas[0]);
  }
  if (!/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida\/[A-Za-z0-9T-]+$/.test(pasta || '')) throw new Error('Pasta da rodada anterior inválida.');
  const original = readFileSync(join(pasta, 'relatorio.json'));
  const hash = createHash('sha256').update(original).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(esperado || '') || hash !== esperado) throw new Error('O relatório anterior difere do hash informado. Não iniciar nova rodada.');
  return { pasta, hash, relatorio: JSON.parse(original) };
}
export async function executar(commit, { retomar = null, hashAnterior = null, materiaisDe = null, hashMateriais = null, limiteReservaUsd = 2 } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Commit inválido.');
  if (![2, 3].includes(limiteReservaUsd)) throw new Error('Reserva de QA inválida; informe explicitamente 2 ou 3.');
  let selecao = null, selecaoClasses = null, planilhaAnterior = null, anterior = null, materiais = null, contexto = null, revisaoPlanilha = null;
  if (retomar) {
    anterior = lerRodada(retomar, hashAnterior); retomar = anterior.pasta;
    materiais = materiaisDe ? lerRodada(materiaisDe, hashMateriais) : anterior;
    console.log('RODADA_ANTERIOR', anterior.hash);
    try { planilhaAnterior = readFileSync(join(retomar, 'h-03-planilha.md'), 'utf8'); } catch { console.log('Material anterior da planilha indisponível.'); }
    contexto = { hashRelatorio: anterior.hash, candidato: anterior.relatorio.escopo?.candidato || null,
      custoConfirmadoUsd: anterior.relatorio.evidenciaProvedor?.custoConfirmadoUsd ?? null,
      custoTotalUsd: anterior.relatorio.evidenciaProvedor?.custoTotalUsd ?? null,
      recibosPendentes: (anterior.relatorio.recibos || []).filter(c => c.custo == null).map(c => ({ geracao: c.geracao || null, modelo: c.modeloResposta || c.modelo, custo: null })),
      aviso: 'Pendências financeiras da rodada anterior continuam abertas; esta é uma nova rodada, sem total histórico comprovado',
      hashRelatorioMateriais: materiais.hash, anteriores: anterior.relatorio.pendenciasAnteriores || null };
  } else if (materiaisDe) throw new Error('Materiais anteriores exigem relatório de retomada.');
  const pasta = mkdtempSync('/tmp/greenia-candidata-');
  const arquivo = join(pasta, 'candidata.tar.gz');
  console.log('Candidata:', commit, '\nPasta temporária:', pasta);
  const r = await fetch(`https://codeload.github.com/theneilagencia/GreenIA/tar.gz/${commit}`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Download da candidata: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(arquivo, { mode: 0o600 }));
  await rodar('tar', ['-xzf', arquivo, '--strip-components=1', '-C', pasta]);
  rmSync(arquivo);
  symlinkSync('/app/node_modules', join(pasta, 'node_modules'), 'dir');
  if (anterior) {
    // Rever o falso positivo já salvo sem nova inferência e sem alterar o arquivo original.
    const pesquisas = Object.entries(typeof anterior.relatorio.classes === 'object' && anterior.relatorio.classes || {}).filter(([, itens]) => ['aprovado', 'corrigido'].includes(itens?.pesquisa?.status));
    if (pesquisas.length) {
      const { conferirOperacao } = await import(pathToFileURL(join(pasta, 'src/quickwin-operacao.js')).href);
      const revisoes = [];
      for (const [classe, itens] of pesquisas) {
        const caminho = join(retomar, `classe-${classe}-pesquisa.md`);
        if (!existsSync(caminho)) continue;
        const texto = readFileSync(caminho, 'utf8');
        const revisao = conferirOperacao({ ferramentas: ['pesquisa_web'] }, texto, {
          objetivo: 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.',
          pesquisa: { disponivel: true, fontes: itens.pesquisa.fontes || [] }
        });
        if (revisao.objetivo?.atingido === false) {
          revisoes.push({ caso: `${classe}/pesquisa`, statusOriginal: itens.pesquisa.status, statusRevisado: 'parcial',
            motivo: revisao.objetivo.motivo, sha256Resposta: createHash('sha256').update(texto).digest('hex'), semNovaInferencia: true });
          itens.pesquisa = { ...itens.pesquisa, status: 'parcial', falhas: [...new Set([...(itens.pesquisa.falhas || []), revisao.objetivo.motivo])] };
        }
      }
      contexto.revisoesPesquisasSalvas = revisoes;
      if (revisoes.length) console.log('PESQUISA_RECONFERIDA_SEM_INFERENCIA', JSON.stringify(revisoes));
    }
    if (planilhaAnterior) {
      const { verificarPlanilhaQa } = await import(pathToFileURL(join(pasta, 'scripts/qa-planilha-oraculo.mjs')).href);
      const { planilha } = await import(pathToFileURL(join(pasta, 'scripts/qa-cenarios.mjs')).href);
      const c = anterior.relatorio.homologacao?.principais?.find(c => c.id === '03-planilha');
      if (c) {
        const revisto = conferirPlanilhaSalva(c, verificarPlanilhaQa(planilhaAnterior, planilha()));
        anterior.relatorio.homologacao.principais = anterior.relatorio.homologacao.principais.map(c => c.id === '03-planilha' ? revisto : c);
        revisaoPlanilha = { semNovaInferencia: true, sha256Resposta: createHash('sha256').update(planilhaAnterior).digest('hex'), conferencia: revisto.conferenciaNumerica, utilizavel: revisto.utilizavel };
        console.log('PLANILHA_RECONFERIDA_SEM_INFERENCIA', JSON.stringify(revisaoPlanilha));
      }
    }
    const pendencias = selecionarRetomada(anterior.relatorio);
    if (!pendencias.casos.length && !pendencias.classes.length) throw new Error('Nenhuma pendência selecionada; não iniciar chamadas repetidas.');
    // Valida TODOS os materiais antes de iniciar qualquer inferência.
    for (const id of pendencias.casos.filter(id => /^U\d{2}$/.test(id))) {
      const material = join(materiais.pasta, `material-${id}.txt`);
      if (existsSync(material)) { if (!readFileSync(material, 'utf8').trim()) throw new Error(`Material vazio: ${id}`); }
      else extrairMaterialRetomada(readFileSync(join(materiais.pasta, `h-${id}.md`), 'utf8'));
    }
    selecao = pendencias.casos.join(',') || 'nenhum'; selecaoClasses = pendencias.classes.join(',') || 'nenhuma';
    writeFileSync(join(pasta, 'qa-contexto-anterior.json'), JSON.stringify({ ...contexto, revisaoPlanilha }), { mode: 0o600 });
    console.log('Casos a retomar:', selecao, '; classes:', selecaoClasses, '; resultados anteriores não são novas execuções.');
    console.log('Pendências financeiras anteriores preservadas:', contexto.recibosPendentes.length);
  }

  console.log('Reserva administrativa somente do QA: US$', limiteReservaUsd);
  console.log('Execução real com dados fictícios; parada após US$ 2 de custo observado ou 180 chamadas.');
  console.log('US$ 2 não é teto rígido: a última chamada pode ultrapassar o valor. Recibo pendente impede a próxima chamada.');
  let erro = null;
  try {
    await rodar(process.execPath, ['--disable-warning=ExperimentalWarning', join(pasta, 'scripts/qa-render-isolado.mjs')], { env: { ...process.env, QA_COMMIT: commit, QA_RESERVA_USD: String(limiteReservaUsd), ...(selecao ? { QA_CASOS: selecao } : {}), ...(selecaoClasses ? { QA_CLASSES: selecaoClasses } : {}), ...(retomar ? { QA_MATERIAIS: materiais.pasta, QA_CONTEXTO_ANTERIOR: join(pasta, 'qa-contexto-anterior.json') } : {}) } });
  } catch (e) { erro = e; }
  const saida = join(pasta, 'qa-candidato-saida');
  let rodadas = [];
  try { rodadas = readdirSync(saida).sort(); } catch {}
  for (const rodada of rodadas) {
    try {
      const relatorio = readFileSync(join(saida, rodada, 'relatorio.json'));
      const completo = JSON.parse(relatorio);
      const caso = ({ plano, ...c }) => c;
      const resumo = { aviso: 'Resumo para copiar; o SHA abaixo pertence ao arquivo relatorio.json completo',
        escopo: completo.escopo, pendenciasAnteriores: completo.pendenciasAnteriores, evidenciaProvedor: completo.evidenciaProvedor, erros: completo.erros, interrompido: completo.interrompido,
        autorizacoesLocais: completo.autorizacoesLocais, padroesClasse: completo.padroesClasse,
        homologacao: { principais: completo.homologacao?.principais?.map(caso), surpresa: completo.homologacao?.surpresa?.map(caso) }, classes: completo.classes,
        recibosPendentes: completo.recibos?.filter(c => c.custo === null || c.erroStream),
        artefatosPreservados: completo.artefatosPreservados, diagnosticos: completo.diagnosticos,
        planilhaAnterior,
      };
      try { resumo.planilhaAtual = readFileSync(join(saida, rodada, 'h-03-planilha.md'), 'utf8'); } catch {}
      console.log('RELATORIO_QA_INICIO'); console.log(JSON.stringify(resumo, null, 2)); console.log('RELATORIO_QA_FIM');
      console.log('SHA256_RELATORIO', createHash('sha256').update(relatorio).digest('hex'));
    } catch { console.log('Relatório ausente ou incompleto. Não considerar aprovado.'); }
  }
  console.log('Materiais e relatório ficam em', saida, 'até a remoção do container. Baixe-os antes de encerrar.');
  if (erro) { console.error(erro.message); process.exitCode = 2; }
}
async function rodar(comando, args, op = {}) {
  const p = spawn(comando, args, { stdio: 'inherit', ...op });
  await new Promise((ok, falha) => {
    p.once('error', falha);
    p.once('exit', (codigo, sinal) => codigo === 0 && !sinal ? ok() : falha(new Error(`Etapa encerrada: código ${codigo ?? sinal}; não considerar aprovado.`)));
  });
}
