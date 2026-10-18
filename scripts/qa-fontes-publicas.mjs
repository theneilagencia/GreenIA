// Diagnóstico público sem chave, banco, autenticação na aplicação ou inferência.
// Importável por data: URL; o código da candidata é baixado por commit imutável.
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const sha = b => createHash('sha256').update(b).digest('hex');

export async function verificar(commit, { rodada, hashAnterior, hashResposta, somente = null } = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('Commit inválido.');
  if (!/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida\/[A-Za-z0-9T-]+$/.test(rodada || '')) throw Error('Pasta inválida.');
  const b = readFileSync(join(rodada, 'relatorio.json'));
  if (!/^[a-f0-9]{64}$/.test(hashAnterior || '') || sha(b) !== hashAnterior) throw Error('Relatório diferente do esperado.');
  const resposta = readFileSync(join(rodada, 'classe-avancado-pesquisa.md'));
  if (!/^[a-f0-9]{64}$/.test(hashResposta || '') || sha(resposta) !== hashResposta) throw Error('Resposta diferente do esperado.');
  const r = JSON.parse(b);
  const originais = r.classes?.avancado?.pesquisa?.fontes || [];
  if (somente !== null && (!Array.isArray(somente) || !somente.length || somente.some(url => !originais.includes(url)))) throw Error('Seleção deve conter somente fontes do relatório.');
  const pasta = mkdtempSync('/tmp/greenia-fontes-');
  try {
    const download = await fetch(`https://codeload.github.com/theneilagencia/GreenIA/tar.gz/${commit}`, { signal: AbortSignal.timeout(60000) });
    if (!download.ok) throw Error(`Download da candidata: HTTP ${download.status}`);
    const arquivo = join(pasta, 'candidata.tar.gz');
    writeFileSync(arquivo, Buffer.from(await download.arrayBuffer()), { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const c = spawn('tar', ['-xzf', arquivo, '--strip-components=1', '-C', pasta], { stdio: 'ignore' });
      c.once('error', reject); c.once('exit', code => code === 0 ? resolve() : reject(Error('Extração não concluída.')));
    });
    symlinkSync('/app/node_modules', join(pasta, 'node_modules'), 'dir');
    const { verificarPublicacoes } = await import(pathToFileURL(join(pasta, 'src/pesquisa-fontes.js')).href);
    const { conferirOperacao } = await import(pathToFileURL(join(pasta, 'src/quickwin-operacao.js')).href);
    const fontes = originais.filter(url => somente === null || somente.includes(url)).map(url => ({url}));
    if (!fontes.length) throw Error('Relatório sem fontes para verificar.');
    const revisao = conferirOperacao({ ferramentas: ['pesquisa_web'] }, resposta.toString('utf8'), {
      objetivo: 'Pesquise tendências recentes de gestão documental digital na mineração e resuma as três mais relevantes.',
      pesquisa: { disponivel: true, fontes }
    });
    const verificacoes = await verificarPublicacoes(fontes);
    const auditoria = { candidato: commit, hashRelatorioOriginal: hashAnterior, hashResposta,
      statusOriginal: r.classes.avancado.pesquisa.status, revisaoSemInferencia: revisao.objetivo,
      totalFontesOriginais: originais.length, fontesSelecionadas: fontes.length,
      verificacoes, novasInferencias: 0, liberacaoProducao: false,
      aviso: 'A leitura das páginas não altera a resposta nem aprova a pesquisa anterior; datas declaradas não certificam a veracidade dos fatos.' };
    const destino = join(rodada, `consulta-fontes-${Date.now()}.json`);
    writeFileSync(destino, JSON.stringify(auditoria, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('CONSULTA_FONTES_INICIO'); console.log(JSON.stringify(auditoria, null, 2)); console.log('CONSULTA_FONTES_FIM');
    console.log('Auditoria separada:', destino);
    return auditoria;
  } finally { rmSync(pasta, { recursive: true, force: true }); }
}
