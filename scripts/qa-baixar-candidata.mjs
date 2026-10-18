// Bootstrap sem dependências npm. Só baixa um commit imutável para /tmp.
import { mkdtempSync, createWriteStream, symlinkSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export async function executar(commit, { retomar = null, hashAnterior = null } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Commit inválido.');
  let selecao = null, planilhaAnterior = null;
  if (retomar) {
    if (/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida$/.test(retomar)) {
      const rodadas = readdirSync(retomar).sort();
      if (rodadas.length !== 1) throw new Error('Informe a pasta exata da rodada a retomar.');
      retomar = join(retomar, rodadas[0]);
    }
    if (!/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida\/[A-Za-z0-9T-]+$/.test(retomar)) throw new Error('Pasta da rodada anterior inválida.');
    const original = readFileSync(join(retomar, 'relatorio.json'));
    const hash = createHash('sha256').update(original).digest('hex');
    if (hashAnterior && hash !== hashAnterior) throw new Error('O relatório anterior difere do hash informado. Não iniciar nova rodada.');
    const anterior = JSON.parse(original);
    selecao = anterior.homologacao.principais.filter(c => c.utilizavel !== true || c.custo === null || (c.id === '03-planilha' && !c.conferenciaNumerica)).map(c => c.id).join(',');
    console.log('RODADA_ANTERIOR', hash);
    console.log('Principais a retomar:', selecao, '; as aprovações anteriores não contam como novas execuções.');
    // Guarda o resultado real que a conferência reprovou, sem presumir que a própria conferência esteja certa.
    try { planilhaAnterior = readFileSync(join(retomar, 'h-03-planilha.md'), 'utf8'); } catch { console.log('Material anterior da planilha indisponível.'); }
  }
  const pasta = mkdtempSync('/tmp/greenia-candidata-');
  const arquivo = join(pasta, 'candidata.tar.gz');
  console.log('Candidata:', commit, '\nPasta temporária:', pasta);
  const r = await fetch(`https://codeload.github.com/theneilagencia/GreenIA/tar.gz/${commit}`, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Download da candidata: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(arquivo, { mode: 0o600 }));
  await rodar('tar', ['-xzf', arquivo, '--strip-components=1', '-C', pasta]);
  rmSync(arquivo);
  symlinkSync('/app/node_modules', join(pasta, 'node_modules'), 'dir');
  console.log('Execução real com dados fictícios; parada após US$ 2 de custo observado ou 180 chamadas.');
  console.log('US$ 2 não é teto rígido: a última chamada pode ultrapassar o valor. Recibo pendente impede a próxima chamada.');
  let erro = null;
  try {
    await rodar(process.execPath, ['--disable-warning=ExperimentalWarning', join(pasta, 'scripts/qa-render-isolado.mjs')], { env: { ...process.env, QA_COMMIT: commit, ...(selecao ? { QA_CASOS: selecao } : {}) } });
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
        escopo: completo.escopo, evidenciaProvedor: completo.evidenciaProvedor, erros: completo.erros, interrompido: completo.interrompido,
        autorizacoesLocais: completo.autorizacoesLocais, padroesClasse: completo.padroesClasse,
        homologacao: { principais: completo.homologacao?.principais?.map(caso), surpresa: completo.homologacao?.surpresa?.map(caso) }, classes: completo.classes,
        recibosPendentes: completo.recibos?.filter(c => c.custo === null || c.erroStream),
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
