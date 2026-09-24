// Mede a busca da base de conhecimento em perguntas de procedimentos internos.
//   node eval/busca/avaliar.mjs                       palavra-chave (a busca em uso)
//   node eval/busca/avaliar.mjs --embeddings [--detalhe]
//     também mede os candidatos locais de embeddings (CPU, no mesmo processo),
//     com @huggingface/transformers. Se o pacote não estiver no projeto, aponte
//     TRANSFORMERS_DIR para uma pasta com ele instalado. O modelo é baixado do
//     huggingface.co na primeira execução (e fica em cache).
//
// Métricas:
//   acerto@1 / acerto@3: a pergunta tem resposta e um documento esperado veio
//     em 1º / entre os 3 primeiros.
//   silêncio correto: a pergunta não tem resposta e a busca voltou vazia (para
//     embeddings, depende do limiar de similaridade: a tabela mostra vários).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const core = require('../../lib/greenia-core.js');
const load = f => JSON.parse(readFileSync(new URL('./' + f, import.meta.url), 'utf8'));
const docs = load('documentos.json').documentos;
const perguntas = load('perguntas.json').perguntas;
const args = process.argv.slice(2);
const detalhe = args.includes('--detalhe');

const CANDIDATOS = [
  { id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', query: q => q, passage: d => d },
  { id: 'Xenova/multilingual-e5-small', query: q => 'query: ' + q, passage: d => 'passage: ' + d },
  { id: 'Xenova/multilingual-e5-base', query: q => 'query: ' + q, passage: d => 'passage: ' + d },
];
const LIMIARES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85];

const pct = (a, b) => b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '—';

// ranking(q) devolve ids em ordem (vazio = nada relevante).
function medir(nome, ranking) {
  const porTipo = {};
  const erros = [];
  for (const p of perguntas) {
    const r = ranking(p.q);
    const t = (porTipo[p.tipo] ||= { n: 0, a1: 0, a3: 0, vazio: 0 });
    t.n++;
    if (!r.length) t.vazio++;
    if (p.esperado.length) {
      if (p.esperado.includes(r[0])) t.a1++;
      if (r.slice(0, 3).some(id => p.esperado.includes(id))) t.a3++;
      else erros.push(`${p.tipo}: "${p.q}" → [${r.slice(0, 3).join(', ')}] (esperado ${p.esperado.join(' ou ')})`);
    } else if (r.length) erros.push(`fora: "${p.q}" → [${r.slice(0, 3).join(', ')}]`);
  }
  console.log(`\n## ${nome}`);
  for (const [tipo, t] of Object.entries(porTipo)) {
    if (tipo === 'fora') console.log(`  ${tipo.padEnd(10)} n=${t.n}  silêncio correto ${pct(t.vazio, t.n)}`);
    else console.log(`  ${tipo.padEnd(10)} n=${t.n}  acerto@1 ${pct(t.a1, t.n)}  acerto@3 ${pct(t.a3, t.n)}  sem resultado ${pct(t.vazio, t.n)}`);
  }
  const resp = Object.entries(porTipo).filter(([k]) => k !== 'fora').map(([, v]) => v);
  const n = resp.reduce((s, t) => s + t.n, 0);
  console.log(`  total com resposta: acerto@1 ${pct(resp.reduce((s, t) => s + t.a1, 0), n)}  acerto@3 ${pct(resp.reduce((s, t) => s + t.a3, 0), n)}`);
  if (detalhe) for (const e of erros) console.log('    ' + e);
}

console.log(`${docs.length} documentos, ${perguntas.length} perguntas ` +
  `(${['literal', 'parafrase', 'fora'].map(t => `${perguntas.filter(p => p.tipo === t).length} ${t}`).join(', ')})`);

// A. Palavra-chave: a mesma função da lib que o servidor usa (KeywordKnowledgeSource).
medir('A. palavra-chave (em uso)', q => core.retrieve(docs, q).map(d => d.id));

if (args.includes('--embeddings')) {
  let tf;
  try {
    tf = process.env.TRANSFORMERS_DIR
      ? await import(pathToFileURL(require.resolve('@huggingface/transformers', { paths: [process.env.TRANSFORMERS_DIR] })).href)
      : await import('@huggingface/transformers');
    if (!tf.pipeline && tf.default) tf = tf.default; // entrada CJS
  } catch (e) {
    console.error('\n@huggingface/transformers não encontrado (instale ou defina TRANSFORMERS_DIR): ' + e.message);
    process.exit(2);
  }
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }; // vetores já normalizados
  for (const c of CANDIDATOS) {
    let embed;
    const t0 = Date.now();
    try {
      const ext = await tf.pipeline('feature-extraction', c.id, { dtype: 'q8' });
      embed = async texts => (await ext(texts, { pooling: 'mean', normalize: true })).tolist();
    } catch (e) {
      console.log(`\n## ${c.id}\n  não foi possível carregar: ${e.message}`);
      continue;
    }
    const dv = await embed(docs.map(d => c.passage(d.title + '\n' + d.text)));
    const qv = await embed(perguntas.map(p => c.query(p.q)));
    const ms = Date.now() - t0;
    const sims = new Map(perguntas.map((p, i) => [p.q, docs.map((d, j) => ({ id: d.id, s: cos(qv[i], dv[j]) })).sort((a, b) => b.s - a.s)]));
    // Sem limiar: qualidade do ranking.
    medir(`${c.id} (sem limiar; ${ms} ms para carregar e indexar)`, q => sims.get(q).map(x => x.id));
    // Com limiar: troca entre responder e ficar em silêncio.
    console.log('  limiar | acerto@3 com resposta | silêncio correto (fora)');
    for (const lim of LIMIARES) {
      let a3 = 0, n = 0, sil = 0, nf = 0;
      for (const p of perguntas) {
        const r = sims.get(p.q).filter(x => x.s >= lim).map(x => x.id);
        if (p.esperado.length) { n++; if (r.slice(0, 3).some(id => p.esperado.includes(id))) a3++; }
        else { nf++; if (!r.length) sil++; }
      }
      console.log(`  ${String(lim).padEnd(6)} | ${pct(a3, n).padEnd(21)} | ${pct(sil, nf)}`);
    }
  }
}
