// Isolamento de rede do processo (ensaio de restauração e ENSAIO_ISOLADO=1).
import net from 'node:net';

// Toda conexão TCP do processo (fetch, http, https, SMTP, conectores) que não seja para o próprio computador é
// recusada e contada. Conexões por socket local (caminho) continuam.
const LOCAIS = new Set(['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']);
export function bloquearRedeExterna() {
  const original = net.Socket.prototype.connect;
  const tentativas = [];
  // O fetch pode reutilizar conexões ou usar um transporte por proxy/socket local.
  // Valide também o destino lógico, antes de delegar ao transporte.
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async function (entrada, opcoes) {
    const url = new URL(entrada instanceof URL ? entrada.href : typeof entrada === 'string' ? entrada : entrada.url);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!LOCAIS.has(host)) {
      tentativas.push({ host: host.slice(0, 120), em: new Date().toISOString() });
      throw Object.assign(new Error('ensaio isolado: destino externo bloqueado'), { code: 'ENSAIO_REDE_BLOQUEADA' });
    }
    return fetchOriginal.call(this, entrada, { ...opcoes, redirect: opcoes?.redirect === 'manual' ? 'manual' : 'error' });
  };
  net.Socket.prototype.connect = function (...args) {
    let o = args[0];
    if (Array.isArray(o)) o = o[0];
    let host = null, caminho = null;
    if (o && typeof o === 'object') { host = o.host ?? 'localhost'; caminho = o.path ?? null; }
    else if (typeof o === 'number' || /^\d+$/.test(String(o))) host = typeof args[1] === 'string' ? args[1] : 'localhost';
    else if (typeof o === 'string') caminho = o;
    if (!caminho && !LOCAIS.has(String(host).toLowerCase())) {
      tentativas.push({ host: String(host).slice(0, 120), em: new Date().toISOString() });
      process.nextTick(() => this.destroy(Object.assign(new Error('ensaio isolado: conexão externa bloqueada'), { code: 'ENSAIO_REDE_BLOQUEADA' })));
      return this;
    }
    return original.apply(this, args);
  };
  return { tentativas, desfazer: () => { net.Socket.prototype.connect = original; globalThis.fetch = fetchOriginal; } };
}

