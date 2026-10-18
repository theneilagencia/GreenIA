// Reexportação dos planos/imagens preservados. Não carrega credenciais nem chama IA.
import { readFileSync, writeFileSync, mkdtempSync, symlinkSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const sha = b => createHash('sha256').update(b).digest('hex');
export function lerPreservados(rodada, esperado) {
  if (!/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida\/[A-Za-z0-9T-]+$/.test(rodada || '')) throw new Error('Pasta inválida');
  const b = readFileSync(join(rodada, 'relatorio.json'));
  if (sha(b) !== esperado) throw new Error('Relatório diferente do esperado');
  const r = JSON.parse(b), grupos = [];
  for (const g of r.artefatosPreservados || []) {
    const arquivos = [];
    for (const a of g.arquivos || []) {
      if (!/^artefatos\/[A-Za-z0-9._-]+$/.test(a.arquivo || '')) throw new Error('Manifesto inválido');
      const p = resolve(rodada, a.arquivo), st = lstatSync(p);
      if (!st.isFile() || st.size > 32 * 1024 * 1024 || realpathSync(p) !== p) throw new Error('Arquivo ou link inválido');
      const dados = readFileSync(p);
      if (sha(dados) !== a.sha256 || dados.length !== a.bytes) throw new Error('Arquivo preservado diverge do manifesto');
      arquivos.push({ ...a, dados });
    }
    grupos.push({ caso: g.caso, conversa: g.conversa, arquivos });
  }
  if (!grupos.length) throw new Error('Nenhum plano preservado');
  return { r, grupos };
}
export async function recuperar(commit, {
  rodada = '/tmp/greenia-candidata-u0ew6B/qa-candidato-saida/2026-10-18T22-38-23-498Z',
  hashAnterior = '669c0c9f9cf9dd0af3a8b6b0a74e2d6c2b7f325c6b40953924b87c868d3f396b',
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Commit inválido');
  const { r, grupos } = lerPreservados(rodada, hashAnterior);
  const codigo = mkdtempSync('/tmp/greenia-reexportar-'), saida = mkdtempSync('/tmp/greenia-visuais-recuperados-');
  let db;
  try {
    const res = await fetch(`https://codeload.github.com/theneilagencia/GreenIA/tar.gz/${commit}`, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    writeFileSync(join(codigo, 'codigo.tgz'), Buffer.from(await res.arrayBuffer()), { mode: 0o600 });
    await new Promise((ok, falha) => { const p = spawn('tar', ['-xzf', join(codigo, 'codigo.tgz'), '--strip-components=1', '-C', codigo]); p.once('error', falha); p.once('exit', c => c === 0 ? ok() : falha(new Error('Extração falhou'))); });
    symlinkSync('/app/node_modules', join(codigo, 'node_modules'), 'dir');
    const { DatabaseSync } = await import('node:sqlite'); db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE visual_assets(id INTEGER, conversa_id INTEGER, tipo TEXT, origem TEXT, mime TEXT, w INTEGER, h INTEGER, bytes BLOB); CREATE TABLE artefatos_render(artefato_id INTEGER, chave TEXT, mime TEXT, dados BLOB, criado_em TEXT);');
    const { exportar } = await import(pathToFileURL(join(codigo, 'src/visual/rotas.js')).href);
    const { inspecionarImagem } = await import(pathToFileURL(join(codigo, 'src/visual/assets.js')).href);
    const { previaDoPptx } = await import(pathToFileURL(join(codigo, 'src/previa-pptx.js')).href);
    const app = { db, tenant: { companyId: 'qa-recuperacao-isolada' }, agora: () => new Date('2026-10-18T22:38:23.498Z') };
    const arquivos = [];
    for (const g of grupos) {
      for (const a of g.arquivos.filter(a => a.origem === 'visual_assets')) {
        const info = inspecionarImagem(a.dados);
        if (!info || info.mime !== a.mime) throw new Error('Asset inválido');
        db.prepare('INSERT INTO visual_assets VALUES (?,?,?,?,?,?,?,?)').run(a.id, g.conversa, 'imagem_gerada', 'gerado', a.mime, info.w, info.h, a.dados);
      }
      for (const a of g.arquivos.filter(a => a.origem === 'artefatos_visuais')) {
        const visual = JSON.parse(a.dados.toString('utf8'));
        if (visual.id !== a.id || visual.conversa_id !== g.conversa) throw new Error('Plano e conversa divergem');
        for (const formato of visual.tipo === 'presentation' ? ['pptx', 'pdf'] : ['png', 'pdf']) {
          const x = await exportar(app, visual, formato), ext = x.mime === 'application/zip' ? 'zip' : formato;
          const arquivo = `${g.caso}-visual-${visual.id}.${ext}`;
          writeFileSync(join(saida, arquivo), x.dados, { mode: 0o600, flag: 'wx' });
          const previa = formato === 'pptx' ? previaDoPptx(x.dados) : null;
          if (previa && (previa.slides.length !== visual.paginas || previa.slides.some(s => !s.formas.length))) throw new Error('PPTX incompleto');
          arquivos.push({ caso: g.caso, arquivo, mime: x.mime, bytes: x.dados.length, sha256: sha(x.dados), sha256PlanoOrigem: a.sha256, paginas: visual.paginas, slidesConferidos: previa?.slides.length || null, inspecaoVisual: 'pendente', downloadHTTP: 'não testado nesta reexportação' });
          console.log('REEXPORTADO', arquivo, x.dados.length, 'bytes');
        }
      }
    }
    const auditoria = { candidatoExportador: commit, candidatoDaInferencia: r.escopo?.candidato, hashRelatorioOriginal: hashAnterior, arquivos, pasta: saida, novasInferencias: 0, credenciaisAcessadas: false, banco: 'novo em memória, somente assets fictícios preservados', liberacaoProducao: false };
    const texto = JSON.stringify(auditoria, null, 2);
    writeFileSync(join(saida, 'reexportacao.json'), texto, { mode: 0o600, flag: 'wx' });
    console.log('REEXPORTACAO_INICIO\n' + texto + '\nREEXPORTACAO_FIM');
    console.log('SHA256_REEXPORTACAO', sha(texto));
    return auditoria;
  } finally { db?.close(); rmSync(codigo, { recursive: true, force: true }); }
}
