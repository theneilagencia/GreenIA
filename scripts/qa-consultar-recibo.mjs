// Consulta metadados já existentes. Não envia prompts nem chama /chat/completions.
// Importável por data: URL; somente dependências nativas no topo.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export async function consultarGeracao(chamada, chave, obter = fetch) {
  if (!/^gen-[A-Za-z0-9_-]+$/.test(chamada.geracao || '')) return { comprovado: false, motivo: 'ID de geração ausente ou inválido' };
  let r;
  try {
    r = await obter(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(chamada.geracao)}`, {
      method: 'GET', headers: { Authorization: `Bearer ${chave}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch { return { comprovado: false, motivo: 'Falha na consulta de metadados; custo continua pendente' }; }
  if (!r.ok) return { comprovado: false, http: r.status, motivo: 'Provedor não disponibilizou metadados válidos' };
  let d;
  try { d = (await r.json()).data; } catch { return { comprovado: false, motivo: 'Resposta de metadados inválida' }; }
  if (d?.id !== chamada.geracao || !chamada.modeloResposta || d.model !== chamada.modeloResposta || typeof d.total_cost !== 'number' || !Number.isFinite(d.total_cost) || d.total_cost < 0)
    return { comprovado: false, motivo: 'ID, modelo ou custo não confere com a chamada preservada' };
  return { comprovado: true, origem: 'GET /api/v1/generation', id: d.id, modelo: d.model, custoUsd: d.total_cost,
    provedor: typeof d.provider_name === 'string' ? d.provider_name : null,
    cancelada: d.cancelled === true, fim: typeof d.finish_reason === 'string' ? d.finish_reason : null };
}

export async function consultar({ rodada, hashAnterior }) {
  if (!/^\/tmp\/greenia-candidata-[A-Za-z0-9]+\/qa-candidato-saida\/[A-Za-z0-9T-]+$/.test(rodada || '') || !/^[a-f0-9]{64}$/.test(hashAnterior || '')) throw new Error('Pasta ou hash inválido');
  const original = readFileSync(join(rodada, 'relatorio.json'));
  if (createHash('sha256').update(original).digest('hex') !== hashAnterior) throw new Error('Relatório diferente do hash esperado; nenhuma consulta iniciada');
  const relatorio = JSON.parse(original), pendentes = (relatorio.recibos || []).filter(c => c.custo == null);
  if (!pendentes.length) throw new Error('Nenhum recibo com custo pendente neste relatório');
  const raiz = resolve(rodada, '../..');
  const { DatabaseSync } = await import('node:sqlite');
  const { lerChaveMestraExistente } = await import(pathToFileURL(join(raiz, 'src/chave-recuperacao.js')).href);
  const { decifrar } = await import(pathToFileURL(join(raiz, 'src/plataforma/segredo.js')).href);
  const banco = resolve(process.env.BANCO_PLATAFORMA || '/app/dados/plataforma.sqlite');
  let db, chave = null;
  try {
    db = new DatabaseSync(banco, { readOnly: true });
    const r = db.prepare("select value from platform_settings where key = 'openrouter_chave'").get();
    if (r) {
      const mestra = lerChaveMestraExistente({ env: process.env, arquivo: join(dirname(banco), '.chave-mestra') });
      if (mestra) chave = decifrar(mestra, JSON.parse(r.value).cifrado);
    } else chave = process.env.OPENROUTER_API_KEY || null;
  } finally { db?.close(); }
  if (!chave || !/^sk-[A-Za-z0-9_-]{20,200}$/.test(chave)) throw new Error('Credencial indisponível; não cole segredos no chat');
  const consultas = [];
  try { for (const c of pendentes) consultas.push({ geracao: c.geracao || null, ...(await consultarGeracao(c, chave)) }); }
  finally { chave = null; }
  const porId = new Map(consultas.filter(c => c.comprovado).map(c => [c.id, c]));
  const custo = c => c.custo ?? porId.get(c.geracao)?.custoUsd ?? null;
  const restantes = (relatorio.recibos || []).filter(c => custo(c) === null).length;
  const auditoria = { hashRelatorioOriginal: hashAnterior, consultas, custosAindaPendentes: restantes,
    custoConfirmadoUsd: relatorio.recibos.reduce((s, c) => s + (custo(c) ?? 0), 0),
    custoTotalUsd: restantes ? null : relatorio.recibos.reduce((s, c) => s + custo(c), 0),
    novasInferencias: 0, liberacaoProducao: false,
    aviso: 'Consulta financeira não aprova entregas nem executa os casos interrompidos; relatório original preservado' };
  const destino = join(rodada, `consulta-recibos-${Date.now()}.json`);
  writeFileSync(destino, JSON.stringify(auditoria, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('CONSULTA_RECIBOS_INICIO'); console.log(JSON.stringify(auditoria, null, 2)); console.log('CONSULTA_RECIBOS_FIM');
  console.log('Auditoria separada:', destino);
  return auditoria;
}
