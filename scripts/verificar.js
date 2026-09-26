// Verificação do primeiro dia, contra o OpenRouter de verdade:
//   node scripts/verificar.js
// Confere a chave, o catálogo, uma resposta curta de cada perfil (com a
// exigência de "sem treino") e, para cada modelo homologado, se quem respondeu
// foi mesmo o fornecedor fixado. Usa o mesmo código das conversas. Custa centavos.
import { abrirBanco, todos } from '../src/db.js';
import { lerConfig } from '../src/config.js';
import { criarOpenRouter } from '../src/ia.js';

const chave = process.env.OPENROUTER_API_KEY;
if (!chave) { console.error('Defina OPENROUTER_API_KEY.'); process.exit(1); }
const db = abrirBanco(process.env.BANCO || 'dados/greenia.sqlite');
const cfg = lerConfig(db);
const ia = criarOpenRouter({ chave });
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'ok   ' : 'FALHA'} ${msg}`); if (!c) falhas++; };

// 1. Chave: válida e com limite de gasto.
const k = await fetch('https://openrouter.ai/api/v1/key', { headers: { authorization: `Bearer ${chave}` } }).then(r => r.ok ? r.json() : null).catch(() => null);
ok(!!k, 'chave aceita pelo OpenRouter');
if (k?.data) ok(k.data.limit !== null && k.data.limit !== undefined, `limite de gasto na chave: ${k.data.limit ?? 'sem limite (defina um no OpenRouter)'}; gasto até agora: US$ ${Number(k.data.usage || 0).toFixed(4)}`);

// 2. Catálogo: os modelos liberados existem e têm preço.
const catalogo = await ia.listarModelos().catch(e => { ok(false, `catálogo: ${e.message}`); return []; });
ok(catalogo.length > 0, `catálogo com ${catalogo.length} modelos`);
const liberados = todos(db, 'select id, perfil, homologado, homologacao from modelos where liberado = 1');
for (const m of liberados) ok(catalogo.some(c => c.id === m.id), `${m.id} está no catálogo`);

// 3. Uma resposta curta por perfil padrão, como numa conversa normal.
const pedir = async (modelo, op) => {
  let texto = '', fim = null;
  for await (const ev of ia.enviar([{ role: 'user', content: 'Responda apenas: OK' }], { modelo, maxTokens: 10, semTreino: cfg.exigirSemTreino, ...op })) {
    if (ev.tipo === 'texto') texto += ev.texto; else fim = ev;
  }
  return { texto, fim };
};
const vistos = new Set();
for (const [perfil, modelo] of Object.entries(cfg.padroes || {})) {
  if (!modelo || vistos.has(modelo)) continue;
  vistos.add(modelo);
  try {
    const r = await pedir(modelo, {});
    ok(r.texto.length > 0 && r.fim?.custo > 0, `${perfil}: ${modelo} respondeu "${r.texto.trim()}" pelo fornecedor ${r.fim?.fornecedor}, custo US$ ${Number(r.fim?.custo).toFixed(6)}`);
  } catch (e) { ok(false, `${perfil}: ${modelo}: ${e.message}`); }
}

// 4. Conversa sigilosa: só o fornecedor fixado, retenção zero.
const homologados = liberados.filter(m => m.homologado);
if (!homologados.length) ok(false, 'nenhum modelo homologado: conversas sigilosas não funcionam (painel → Modelos de IA)');
for (const m of homologados) {
  const fornecedor = JSON.parse(m.homologacao || '{}').fornecedor;
  try {
    const r = await pedir(m.id, { sigilosa: true, fornecedor });
    // Com only + allow_fallbacks: false, só há resposta se veio do fornecedor fixado.
    ok(r.texto.length > 0, `sigilosa: ${m.id} fixado em "${fornecedor}" respondeu pelo fornecedor "${r.fim?.fornecedor}" (confira se é o mesmo)`);
  } catch (e) { ok(false, `sigilosa: ${m.id} fixado em "${fornecedor}": ${e.message}`); }
}

db.close();
console.log(falhas ? `\n${falhas} problema(s). Veja as linhas FALHA acima.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
