// O que pode ir para log, evento, banco ou monitoramento a partir de um erro: nunca o conteúdo de quem usa.
// Erros de provedor e exceções podem repetir o pedido na mensagem (payload ecoado, trecho do prompt, valor que
// falhou na validação); por isso a mensagem é tratada como dado de fora e reduzida antes de sair daqui.
import { detectar } from './filtro.js';

// Log de exceção: tipo, código e onde aconteceu (pilha), sem a mensagem.
export function erroParaLog(e) {
  if (!(e instanceof Error)) return `erro (${typeof e})`;
  const pilha = String(e.stack || '').split('\n').filter(l => /^\s+at /.test(l)).slice(0, 8).join('\n');
  return `${e.name || 'Error'}${e.status ? ` status ${e.status}` : ''}${e.codigo ? ` (${e.codigo})` : ''}${pilha ? `\n${pilha}` : ''}`;
}

const TRECHO = 16;   // um trecho do pedido com 16 caracteres ou mais, repetido no erro, é conteúdo

/**
 * Resumo de erro do provedor para o registro de diagnóstico. Com retenção desligada (guardar = não): só o
 * status. Nos demais casos, a mensagem sem nenhum trecho do pedido (texto, anexos, histórico) e sem dado
 * classificado, curta.
 */
export function erroDoProvedor(e, { guardar = true, conteudo = '' } = {}) {
  const status = `status ${e?.status ?? 'desconhecido'}`;
  if (!guardar) return status;
  let msg = String(e?.message ?? '').replace(/\s+/g, ' ').slice(0, 300);
  const c = String(conteudo).replace(/\s+/g, ' ');
  if (c.length >= TRECHO) {
    const eco = Array(msg.length).fill(false);
    for (let i = 0; i + TRECHO <= msg.length; i++) if (c.includes(msg.slice(i, i + TRECHO))) eco.fill(true, i, i + TRECHO);
    msg = msg.replace(/[^]/g, (ch, i) => eco[i] ? '\0' : ch).replace(/\0+/g, '[trecho do pedido omitido]');
  }
  // Um dado classificado que sobrou (ecoado em pedaços menores): a mensagem inteira sai.
  if (detectar(msg).length) return `${status} [mensagem do provedor omitida]`;
  return `${status}: ${msg.slice(0, 200)}`;
}
