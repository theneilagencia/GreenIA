// Somente leitura das rodadas sintéticas em /tmp. Sem banco, credenciais ou rede.
import { readdirSync, readFileSync, lstatSync, realpathSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const hash = b => createHash('sha256').update(b).digest('hex');
export const SELOS = new Set([
  '9da5c1fcfdd431fe9cd5d83275e6185cea1f2fca4a9fa60957bf0b81f47ebe4c',
  'a7963cb227a0aeab08d43b4c0264a58e2e004228d3d2ed2ad4af227aff2a4430',
  'dc28cfeaa16cc63e63521299ebbe9e27ccc1de4f13e31f8cff6ea3826590f0ad',
  '1f7021ca942b5c81f499acadbe876a15b9622d4f144eb760ad62bcb48b165bf1',
  '91ef08a58dd43baff4f0036fa96d6697c314a171b6af4af83d03e22f88096ff6',
  '7fadfd6642f54ca3b8d09184bf7a5510ed8158da9a65cc30e4c28b99643ed45a',
  'a596de099a170d4d62cf01b3e3acde5c272f5a8d574daaff1092260d25f66fb4',
  '8dafb4e66e3eed9b954f234b1ead98fb1c087e231333d11bfeb3fa6834bf87e5',
]);

// Só soma recibos diretos, nunca os totais das retomadas aninhadas.
export function reconciliar(rodadas, esperados = SELOS) {
  const vistos = new Set(), ids = new Map(), semId = [], invalidos = [];
  for (const { sha256, recibos = [] } of rodadas) {
    if (vistos.has(sha256)) continue;
    vistos.add(sha256);
    recibos.forEach((c, indice) => {
      if (!c.geracao || !/^gen-[A-Za-z0-9_-]+$/.test(c.geracao)) {
        semId.push({ hashRelatorio: sha256, indice, custoDeclarado: c.custo ?? null }); return;
      }
      if (c.custo != null && !(typeof c.custo === 'number' && Number.isFinite(c.custo) && c.custo >= 0)) invalidos.push({ geracao: c.geracao, hashRelatorio: sha256 });
      const x = ids.get(c.geracao) || { geracao: c.geracao, custos: new Set(), modelos: new Set(), origens: new Set() };
      if (typeof c.custo === 'number' && Number.isFinite(c.custo) && c.custo >= 0) x.custos.add(c.custo);
      if (c.modeloResposta) x.modelos.add(c.modeloResposta);
      x.origens.add(sha256); ids.set(c.geracao, x);
    });
  }
  let subtotal = 0; const pendentes = [], conflitos = [];
  for (const x of ids.values()) {
    if (x.custos.size > 1 || x.modelos.size > 1) conflitos.push({ geracao: x.geracao, custos: [...x.custos], modelos: [...x.modelos] });
    else if (!x.custos.size || !x.modelos.size) pendentes.push({ geracao: x.geracao, modelo: [...x.modelos][0] || null, hashRelatorios: [...x.origens] });
    else subtotal += [...x.custos][0];
  }
  const ausentes = [...esperados].filter(h => !vistos.has(h));
  return { rodadasUnicas: vistos.size, geracoesUnicas: ids.size, subtotalRecibosUsd: subtotal,
    totalHistoricoUsd: ausentes.length || pendentes.length || conflitos.length || semId.length || invalidos.length ? null : subtotal,
    pendentes, conflitos, tentativasSemId: semId, recibosInvalidos: invalidos, hashesAusentes: ausentes,
    metodologia: 'Recibos diretos de relatórios com SHA conhecido, deduplicados por ID de geração; custos divergentes e ausências impedem total histórico. Não equivale à conciliação com a fatura do provedor.' };
}

function bytesSeguros(pasta, nome, limite = 32 * 1024 * 1024) {
  if (typeof nome !== 'string' || !nome || nome.includes('\\') || nome.split('/').includes('..')) throw new Error('Caminho inválido');
  const p = resolve(pasta, nome), rel = relative(pasta, p);
  if (rel.startsWith('..') || resolve(pasta) === p || realpathSync(p) !== p) throw new Error('Caminho externo ou link simbólico');
  const st = lstatSync(p);
  if (!st.isFile() || st.size > limite) throw new Error('Arquivo indisponível ou excede limite');
  return readFileSync(p);
}

export function inspecionar() {
  const rodadas = [], ignorados = [], encontrados = new Set();
  const destino = mkdtempSync('/tmp/greenia-inspecao-final-');
  let totalBytes = 0;
  for (const e of readdirSync('/tmp', { withFileTypes: true })) {
    if (!e.isDirectory() || !/^greenia-candidata-[A-Za-z0-9]+$/.test(e.name)) continue;
    const raiz = join('/tmp', e.name, 'qa-candidato-saida');
    let pastas;
    try { pastas = readdirSync(raiz, { withFileTypes: true }).filter(x => x.isDirectory() && /^[A-Za-z0-9T-]+$/.test(x.name)).map(x => join(raiz, x.name)); } catch { continue; }
    for (const pasta of pastas) {
      let b, sha256;
      try { b = bytesSeguros(pasta, 'relatorio.json'); sha256 = hash(b); } catch { continue; }
      if (!SELOS.has(sha256)) { ignorados.push({ pasta, sha256, motivo: 'hash não consta dos relatórios autorizados' }); continue; }
      if (encontrados.has(sha256)) continue;
      encontrados.add(sha256);
      const r = JSON.parse(b), arquivos = [], sub = join(destino, sha256.slice(0, 12));
      mkdirSync(sub, { mode: 0o700 }); writeFileSync(join(sub, 'relatorio.json'), b, { mode: 0o600 });
      const declarados = (r.artefatosPreservados || []).flatMap(g => (g.arquivos || []).map(a => ({ ...a, caso: g.caso })));
      for (const a of declarados) {
        try {
          if (!/^artefatos\/[A-Za-z0-9._-]+$/.test(a.arquivo || '')) throw new Error('Manifesto inválido');
          const dados = bytesSeguros(pasta, a.arquivo);
          if (hash(dados) !== a.sha256 || dados.length !== a.bytes) throw new Error('Bytes ou hash divergentes');
          if (totalBytes + dados.length > 150 * 1024 * 1024) throw new Error('Limite total do pacote');
          mkdirSync(join(sub, 'artefatos'), { recursive: true, mode: 0o700 });
          writeFileSync(join(sub, a.arquivo), dados, { mode: 0o600 }); totalBytes += dados.length;
          arquivos.push({ caso: a.caso, arquivo: a.arquivo, sha256: a.sha256, bytes: dados.length, mime: a.mime, integridade: 'confere', inspecaoVisual: 'pendente', downloadHTTP: 'pendente' });
        } catch (err) { arquivos.push({ caso: a.caso, arquivo: a.arquivo, integridade: 'falhou', motivo: err.message }); }
      }
      for (const n of readdirSync(pasta)) if (/^(?:h-|exec-|classe-)[A-Za-z0-9_-]+\.md$/.test(n)) {
        try { const dados = bytesSeguros(pasta, n, 2 * 1024 * 1024); writeFileSync(join(sub, n), dados, { mode: 0o600 }); } catch { /* Markdown não substitui binário perdido. */ }
      }
      rodadas.push({ pasta, sha256, candidato: r.escopo?.candidato || null, recibos: r.recibos || [], arquivos,
        manifesto: declarados.length ? 'presente' : 'ausente; não comprova inexistência de entregas',
        auditoriasRecibos: readdirSync(pasta).filter(n => /^consulta-recibos-\d+\.json$/.test(n)) });
    }
  }
  const resumo = { criadoEm: new Date().toISOString(), candidataEsperada: 'b719b88023f262723ecc50f9b3e7b4a94e9cc3a8',
    versaoImplantadaDeclaradaPeloRender: process.env.RENDER_GIT_COMMIT || null,
    rodadas: rodadas.map(({ recibos, ...r }) => ({ ...r, tentativas: recibos.length })),
    financeiro: reconciliar(rodadas), ignorados, pastaParaTransferir: destino,
    novasInferencias: 0, consultasExternas: 0, bancoAcessado: false, liberacaoProducao: false };
  const texto = JSON.stringify(resumo, null, 2) + '\n';
  writeFileSync(join(destino, 'inventario.json'), texto, { mode: 0o600, flag: 'wx' });
  console.log('INVENTARIO_FINAL_INICIO\n' + texto + 'INVENTARIO_FINAL_FIM');
  console.log('SHA256_INVENTARIO', hash(texto));
  return resumo;
}
