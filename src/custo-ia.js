import { erro as ErroAdvanced } from './http.js';
import { reservarAdvanced, liquidarAdvanced, politicaModeloAdvanced } from './advanced.js';
// Registro do custo de IA: todo custo cobrado pelo provedor vira crédito, mesmo quando a chamada não chega ao
// fim do caminho feliz. Antes, o custo só entrava em `uso` pelo que cada rota somava à mão, e escapava em: stream
// interrompido ou com erro (o custo nunca chega), chamada refeita na reavaliação de autonomia (o custo da primeira era
// sobrescrito), produção visual que falha (o que já foi gasto voltava a zero), execução que falha (a pesquisa já paga
// não era gravada) e imagem cobrada sem imagem válida. Na conferência com a conta do OpenRouter, ~4% do custo real
// não virava crédito.
//
// Como funciona: cada pedido que gasta IA (mensagem, estrutura do Quick Win, imagem) roda num contexto de uso. A
// camada em volta da IA soma ali tudo o que o provedor cobrou; `registrarUso` soma o que a rota gravou. No fim do
// pedido, a diferença entra na última linha de uso do pedido (ou numa linha nova, se nada foi gravado). Chamada que não
// devolveu o custo (interrompida ou com erro) tem o custo buscado depois no provedor, pela identificação da geração.
import { AsyncLocalStorage } from 'node:async_hooks';
import { opcoesCancelaveis } from './cancelamento-chat.js';
import { exec, um } from './db.js';
import { registrar } from './eventos.js';

const ALS = new AsyncLocalStorage();
const ESPERAS_MS = [2e3, 8e3, 30e3];   // o custo de uma geração aparece no provedor alguns segundos depois

export function comUso(app, dados, fn) {
  const pai=ALS.getStore();
  const ctx = { trabalho_id:pai?.trabalho_id??null,tentativa_id:pai?.tentativa_id??null,pessoa_id: null, conversa_id: null, quick_win_id: null, teste: 0, sigilosa: 0, ...dados, cobrado: 0, registrado: 0, ultimoUso: null, modelo: null, fechado: false };
  return ALS.run(ctx, async () => {
    try { return await fn(); }
    finally { fechar(app, ctx); }
  });
}
// Completa o contexto quando a conversa só é conhecida depois de conferida (dono, Quick Win, teste, sigilo).
export function anotarUso(dados) { const ctx = ALS.getStore(); if (ctx) Object.assign(ctx, dados); }

const COLUNAS = ['em', 'pessoa_id', 'conversa_id', 'quick_win_id', 'modelo_pedido', 'modelo_usado', 'fornecedor', 'custo', 'economia', 'ms', 'sigilosa', 'teste', 'trabalho_id','tentativa_id'];
// Toda gravação de uso passa por aqui: o contexto sabe quanto já foi registrado.
export function registrarUso(app, linha) {
  const contexto = ALS.getStore();
  const v = { trabalho_id:contexto?.trabalho_id, tentativa_id:contexto?.tentativa_id, economia: 0, ms: null, sigilosa: 0, teste: 0, fornecedor: null, ...linha };
  const id = Number(exec(app.db, `insert into uso (${COLUNAS.join(', ')}) values (${COLUNAS.map(() => '?').join(', ')})`, ...COLUNAS.map(c => v[c] ?? null)).lastInsertRowid);
  const ctx = ALS.getStore();
  if (ctx) { ctx.registrado += Number(v.custo) || 0; ctx.ultimoUso = id; }
  return id;
}

// Ação a executar quando o pedido terminar (ex.: liberar a vaga de execução reservada no fim da reserva).
export function aoFecharUso(fn) { const ctx = ALS.getStore(); if (!ctx) return false; (ctx.finais ||= []).push(fn); return true; }

function fechar(app, ctx) {
  ctx.fechado = true;
  for (const fn of ctx.finais || []) { try { fn(); } catch { /* nada a desfazer */ } }
  const falta = ctx.cobrado - ctx.registrado;
  if (falta > 1e-9) ajustar(app, ctx, falta, 'custo_nao_registrado');
}
// Custo cobrado e não gravado: soma na última linha de uso do pedido; sem linha, grava uma (é uma tentativa paga).
function ajustar(app, ctx, custo, origem) {
  try {
    if (ctx?.ultimoUso) exec(app.db, 'update uso set custo = custo + ? where id = ?', custo, ctx.ultimoUso);
    else {
      const id = Number(exec(app.db, `insert into uso (${COLUNAS.join(', ')}) values (${COLUNAS.map(() => '?').join(', ')})`, app.agora().toISOString(), ctx?.pessoa_id ?? null, ctx?.conversa_id ?? null,
        ctx?.quick_win_id ?? null, ctx?.modelo ?? null, ctx?.modelo ?? null, null, custo, 0, null, Number(!!ctx?.sigilosa), Number(!!ctx?.teste),ctx?.trabalho_id??null,ctx?.tentativa_id??null).lastInsertRowid);
      if (ctx) ctx.ultimoUso = id;
    }
    if (ctx) ctx.registrado += custo;
    registrar(app, 'credits.consumed', ctx?.pessoa_id ?? null, { origem, conversa: ctx?.conversa_id ?? null, quick_win: ctx?.quick_win_id ?? null, modelo_usado: ctx?.modelo ?? null, custo });
  } catch (e) { app.log?.('custo de IA', e.message); }   // banco fechado (fim de teste, desligamento): nada a fazer
}
// Custo de uma chamada que não devolveu o custo: buscado no provedor, sem segurar o pedido.
function recuperar(app, ia, geracao, ctx, modelo, advanced = null, chamada = null) {
  if (!geracao || typeof ia.custoDaGeracao !== 'function') return;
  const esperas = app.esperasCustoIaMs || ESPERAS_MS;
  let i = 0;
  const tentar = async () => {
    const custo = await ia.custoDaGeracao(geracao).catch(() => null);
    if (custo === null && i < esperas.length - 1) { i++; setTimeout(tentar, esperas[i]).unref?.(); return; }
    if(chamada&&um(app.db,'select estado from trabalho_chamadas where id=?',chamada)?.estado==='conciliado')return;
    if (custo !== null) { liquidarAdvanced(app, advanced, custo, geracao); if(chamada)exec(app.db,"update trabalho_chamadas set custo_conciliado=?,conciliado_em=?,estado='conciliado' where id=?",custo,app.agora().toISOString(),chamada); }
    if (!(custo > 0)) return;
    if (ctx && !ctx.fechado) { ctx.cobrado += custo; ctx.modelo ??= modelo; return; }
    if (ctx) ctx.modelo ??= modelo;
    ajustar(app, ctx || { modelo }, custo, 'chamada_interrompida');
  };
  setTimeout(tentar, esperas[0]).unref?.();
}

// Camada em volta do cliente de IA: transparente para quem chama (mesmas funções e propriedades).
export function contabilizarIA(app, ia) {
  return new Proxy(ia, {
    get(alvo, chave) {
      if (chave === 'enviar') return (mensagens, op = {}) => enviarContado(app, alvo, mensagens, op);
      if (chave === 'gerarImagem' && typeof alvo.gerarImagem === 'function') return (prompt, op = {}) => imagemContada(app, alvo, prompt, op);
      const v = Reflect.get(alvo, chave);
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
  });
}
async function* enviarContado(app, ia, mensagens, op) {
  op = opcoesCancelaveis(op);
  const ctx = ALS.getStore();
  const advanced = reservarAdvanced(app, ctx, mensagens, op);
  if (advanced) op = advanced.op;
  const chamada=Number(exec(app.db,"insert into trabalho_chamadas(tentativa_id,em,modelo,estado) values (?,?,?,'em_execucao')",ctx?.tentativa_id??null,app.agora().toISOString(),op.modelo??null).lastInsertRowid);
  let geracao = null, entregue = false;
  try {
    for await (const ev of ia.enviar(mensagens, { ...op, aoGerar: g => { geracao ??= g; exec(app.db,'update trabalho_chamadas set geracao=? where id=?',geracao,chamada); } })) {
      if (ev.tipo === 'fim') {
        exec(app.db,"update trabalho_chamadas set fim=?,geracao=?,custo_reportado=?,estado=? where id=?",app.agora().toISOString(),geracao,ev.custoConfirmado===false?null:(Number.isFinite(ev.custo)?ev.custo:null),ev.custoConfirmado===false||!Number.isFinite(ev.custo)?'pendente':'reportado',chamada);
        liquidarAdvanced(app, advanced, ev.custoConfirmado === false ? null : ev.custo, geracao);
        if(ev.custoConfirmado === false||!Number.isFinite(ev.custo)) recuperar(app,ia,geracao,ctx,op.modelo,advanced,chamada);
        entregue = true;
        if (ctx) { ctx.cobrado += Number(ev.custo) || 0; ctx.modelo = ev.modelo || op.modelo || ctx.modelo; }
      }
      yield ev;
      op.sinal?.throwIfAborted();
    }
  } finally {
    if (!entregue) {
      liquidarAdvanced(app, advanced, null, geracao);
      exec(app.db,"update trabalho_chamadas set fim=?,geracao=?,estado='pendente' where id=?",app.agora().toISOString(),geracao,chamada);
      recuperar(app, ia, geracao, ctx, op.modelo, advanced,chamada);
    }
  }
}
async function imagemContada(app, ia, prompt, op) {
  op = opcoesCancelaveis(op);
  const ctx = ALS.getStore();
  if (politicaModeloAdvanced(app.db,op.modelo)?.perfil === 'avancado') throw ErroAdvanced(409,'advanced_ferramenta','Esta rota Advanced não está aprovada para geração de imagens.');
  const chamada=Number(exec(app.db,"insert into trabalho_chamadas(tentativa_id,em,modelo,estado) values (?,?,?,'em_execucao')",ctx?.tentativa_id??null,app.agora().toISOString(),op.modelo??null).lastInsertRowid);
  try {
    const g = await ia.gerarImagem(prompt, op);
    exec(app.db,"update trabalho_chamadas set fim=?,geracao=?,custo_reportado=?,estado=? where id=?",app.agora().toISOString(),g?.geracao??null,Number.isFinite(g?.custo)?g.custo:null,Number.isFinite(g?.custo)?'reportado':'pendente',chamada);
    if (ctx) { ctx.cobrado += Number(g?.custo) || 0; ctx.modelo ??= g?.modelo || op.modelo; }
    return g;
  } catch (e) {
    exec(app.db,"update trabalho_chamadas set fim=?,geracao=?,custo_reportado=?,estado=? where id=?",app.agora().toISOString(),e?.geracao??null,Number.isFinite(e?.custo)?e.custo:null,Number.isFinite(e?.custo)?'reportado':'pendente',chamada);
    // Cobrada sem imagem válida: o custo veio junto do erro; sem ele, busca pela identificação da geração.
    if (e?.custo > 0) { if (ctx && !ctx.fechado) ctx.cobrado += e.custo; else ajustar(app, ctx, e.custo, 'imagem_sem_resultado'); }
    else recuperar(app, ia, e?.geracao, ctx, op.modelo,null,chamada);
    throw e;
  }
}
