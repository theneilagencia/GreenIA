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
import { exec } from './db.js';
import { registrar } from './eventos.js';

const ALS = new AsyncLocalStorage();
const ESPERAS_MS = [2e3, 8e3, 30e3];   // o custo de uma geração aparece no provedor alguns segundos depois

export function comUso(app, dados, fn) {
  const ctx = { pessoa_id: null, conversa_id: null, quick_win_id: null, teste: 0, sigilosa: 0, ...dados, cobrado: 0, registrado: 0, ultimoUso: null, modelo: null, fechado: false };
  return ALS.run(ctx, async () => {
    try { return await fn(); }
    finally { fechar(app, ctx); }
  });
}
// Completa o contexto quando a conversa só é conhecida depois de conferida (dono, Quick Win, teste, sigilo).
export function anotarUso(dados) { const ctx = ALS.getStore(); if (ctx) Object.assign(ctx, dados); }

const COLUNAS = ['em', 'pessoa_id', 'conversa_id', 'quick_win_id', 'modelo_pedido', 'modelo_usado', 'fornecedor', 'custo', 'economia', 'ms', 'sigilosa', 'teste'];
// Toda gravação de uso passa por aqui: o contexto sabe quanto já foi registrado.
export function registrarUso(app, linha) {
  const v = { economia: 0, ms: null, sigilosa: 0, teste: 0, fornecedor: null, ...linha };
  const id = Number(exec(app.db, `insert into uso (${COLUNAS.join(', ')}) values (${COLUNAS.map(() => '?').join(', ')})`, ...COLUNAS.map(c => v[c] ?? null)).lastInsertRowid);
  const ctx = ALS.getStore();
  if (ctx) { ctx.registrado += Number(v.custo) || 0; ctx.ultimoUso = id; }
  return id;
}

function fechar(app, ctx) {
  ctx.fechado = true;
  const falta = ctx.cobrado - ctx.registrado;
  if (falta > 1e-9) ajustar(app, ctx, falta, 'custo_nao_registrado');
}
// Custo cobrado e não gravado: soma na última linha de uso do pedido; sem linha, grava uma (é uma tentativa paga).
function ajustar(app, ctx, custo, origem) {
  try {
    if (ctx?.ultimoUso) exec(app.db, 'update uso set custo = custo + ? where id = ?', custo, ctx.ultimoUso);
    else {
      const id = Number(exec(app.db, `insert into uso (${COLUNAS.join(', ')}) values (${COLUNAS.map(() => '?').join(', ')})`, app.agora().toISOString(), ctx?.pessoa_id ?? null, ctx?.conversa_id ?? null,
        ctx?.quick_win_id ?? null, ctx?.modelo ?? null, ctx?.modelo ?? null, null, custo, 0, null, Number(!!ctx?.sigilosa), Number(!!ctx?.teste)).lastInsertRowid);
      if (ctx) ctx.ultimoUso = id;
    }
    if (ctx) ctx.registrado += custo;
    registrar(app, 'credits.consumed', ctx?.pessoa_id ?? null, { origem, conversa: ctx?.conversa_id ?? null, quick_win: ctx?.quick_win_id ?? null, modelo_usado: ctx?.modelo ?? null, custo });
  } catch (e) { app.log?.('custo de IA', e.message); }   // banco fechado (fim de teste, desligamento): nada a fazer
}
// Custo de uma chamada que não devolveu o custo: buscado no provedor, sem segurar o pedido.
function recuperar(app, ia, geracao, ctx, modelo) {
  if (!geracao || typeof ia.custoDaGeracao !== 'function') return;
  const esperas = app.esperasCustoIaMs || ESPERAS_MS;
  let i = 0;
  const tentar = async () => {
    const custo = await ia.custoDaGeracao(geracao).catch(() => null);
    if (custo === null && i < esperas.length - 1) { i++; setTimeout(tentar, esperas[i]).unref?.(); return; }
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
  const ctx = ALS.getStore();
  let geracao = null, entregue = false;
  try {
    for await (const ev of ia.enviar(mensagens, { ...op, aoGerar: g => { geracao ??= g; } })) {
      if (ev.tipo === 'fim') {
        entregue = true;
        if (ctx) { ctx.cobrado += Number(ev.custo) || 0; ctx.modelo = ev.modelo || op.modelo || ctx.modelo; }
      }
      yield ev;
    }
  } finally {
    if (!entregue) recuperar(app, ia, geracao, ctx, op.modelo);
  }
}
async function imagemContada(app, ia, prompt, op) {
  const ctx = ALS.getStore();
  try {
    const g = await ia.gerarImagem(prompt, op);
    if (ctx) { ctx.cobrado += Number(g?.custo) || 0; ctx.modelo ??= g?.modelo || op.modelo; }
    return g;
  } catch (e) {
    // Cobrada sem imagem válida: o custo veio junto do erro; sem ele, busca pela identificação da geração.
    if (e?.custo > 0) { if (ctx && !ctx.fechado) ctx.cobrado += e.custo; else ajustar(app, ctx, e.custo, 'imagem_sem_resultado'); }
    else recuperar(app, ia, e?.geracao, ctx, op.modelo);
    throw e;
  }
}
