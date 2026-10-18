// Bootstrap sem dependências npm. Só baixa um commit imutável para /tmp.
import { mkdtempSync, createWriteStream, symlinkSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export async function executar(commit) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Commit inválido.');
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
    await rodar(process.execPath, ['--disable-warning=ExperimentalWarning', join(pasta, 'scripts/qa-render-isolado.mjs')], { env: { ...process.env, QA_COMMIT: commit } });
  } catch (e) { erro = e; }
  const saida = join(pasta, 'qa-candidato-saida');
  let rodadas = [];
  try { rodadas = readdirSync(saida).sort(); } catch {}
  for (const rodada of rodadas) {
    try {
      const relatorio = readFileSync(join(saida, rodada, 'relatorio.json'));
      console.log('RELATORIO_QA_INICIO'); console.log(relatorio.toString()); console.log('RELATORIO_QA_FIM');
      console.log('SHA256_RELATORIO', createHash('sha256').update(relatorio).digest('hex'));
    } catch { console.log('Relatório ausente ou incompleto. Não considerar aprovado.'); }
  }
  console.log('Materiais e relatório ficam em', saida, 'até a remoção do container. Baixe-os antes de encerrar.');
  if (erro) throw erro;
}
async function rodar(comando, args, op = {}) {
  const p = spawn(comando, args, { stdio: 'inherit', ...op });
  await new Promise((ok, falha) => {
    p.once('error', falha);
    p.once('exit', (codigo, sinal) => codigo === 0 && !sinal ? ok() : falha(new Error(`Etapa encerrada: código ${codigo ?? sinal}; não considerar aprovado.`)));
  });
}
