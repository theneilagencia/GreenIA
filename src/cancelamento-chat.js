import { AsyncLocalStorage } from 'node:async_hooks';

const execucao = new AsyncLocalStorage();
export const comCancelamento = (sinal, fn) => execucao.run(sinal, fn);
export const sinalDaExecucao = () => execucao.getStore();
export function opcoesCancelaveis(op = {}) {
  const sinal = sinalDaExecucao();
  sinal?.throwIfAborted();
  return sinal ? { ...op, sinal: op.sinal ? AbortSignal.any([sinal, op.sinal]) : sinal } : op;
}
