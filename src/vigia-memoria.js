// Vigia de memória: o servidor nunca pode cair por falta de memória. O contêiner tem um limite (cgroup); quando ele
// estoura, o sistema derruba o processo inteiro e todas as empresas ficam sem atendimento. Os trabalhos pesados
// (navegador do design e da leitura de modelos, OCR) rodam em processos FILHOS. O vigia confere a memória livre do
// contêiner 4 vezes por segundo e, quando ela chega ao limiar, encerra os filhos (nunca o processo principal): o
// trabalho pesado falha com aviso e o resto continua de pé. Fora de um contêiner com limite, não faz nada.
import { readFileSync, readdirSync } from 'node:fs';

// Memória livre do contêiner (MB) pelo cgroup; null quando não há limite.
export function memoriaDoConteiner() {
  try {
    const max = readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (max !== 'max' && Number(max) > 0) {
      const atual = Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim());
      // Cache de arquivos é recuperável pelo sistema: não conta como uso (o OOM só considera o que não dá para liberar).
      let cache = 0;
      try { cache = Number(/^inactive_file (\d+)/m.exec(readFileSync('/sys/fs/cgroup/memory.stat', 'utf8'))?.[1] || 0); } catch {}
      return { limite: Number(max) / 1048576, livre: (Number(max) - atual + cache) / 1048576 };
    }
  } catch { /* sem cgroup v2 */ }
  try {
    const max = Number(readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
    const atual = Number(readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
    if (max > 0 && max < 2 ** 50) return { limite: max / 1048576, livre: (max - atual) / 1048576 };
  } catch { /* sem cgroup v1 */ }
  return null;
}

// Processos descendentes deste (filhos, netos...): o navegador e o OCR. Lido de /proc.
export function descendentes(raiz = process.pid, { proc = '/proc' } = {}) {
  // /proc pode estar montado no namespace do host, enquanto process.kill usa o PID local.
  // Monte a árvore com IDs de /proc e só então traduza os descendentes para nosso namespace.
  let proprio, coluna;
  try {
    proprio = Number(/^\d+/.exec(readFileSync(`${proc}/self/stat`, 'utf8'))?.[0]);
    const ids = /^NSpid:\s+(.+)$/m.exec(readFileSync(`${proc}/self/status`, 'utf8'))?.[1].trim().split(/\s+/).map(Number);
    coluna = ids ? (ids.at(-1) === process.pid ? ids.length - 1 : -1) : (proprio === process.pid ? 0 : -1);
    if (!proprio || coluna < 0) return [];
  } catch { return []; }
  const pais = new Map();
  try { for (const n of readdirSync(proc)) {
    if (!/^\d+$/.test(n)) continue;
    try {
      const stat = readFileSync(`${proc}/${n}/stat`, 'utf8');
      pais.set(Number(n), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    } catch { /* processo já saiu */ }
  } } catch { return []; }
  // Busca em largura finita, inclusive quando um snapshot tem relações inconsistentes.
  const filhos = inicio => {
    const out = [], fila = [inicio], vistos = new Set(fila);
    for (let i = 0; i < fila.length; i++) for (const [pid,pai] of pais) if (pai === fila[i] && !vistos.has(pid)) { vistos.add(pid); out.push(pid); fila.push(pid); }
    return out;
  };
  const local = pid => {
    if (proprio === process.pid && coluna === 0) return pid;
    try { return Number(/^NSpid:\s+(.+)$/m.exec(readFileSync(`${proc}/${pid}/status`, 'utf8'))?.[1].trim().split(/\s+/)[coluna]) || null; }
    catch { return null; }
  };
  const permitidos = filhos(proprio);
  const inicio = raiz === process.pid ? proprio : permitidos.find(pid => local(pid) === raiz);
  if (!inicio) return [];
  return filhos(inicio).map(local).filter(pid => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

export function iniciarVigia({ limiarMb = Number(process.env.MEMORIA_LIMIAR_MB || 72), intervaloMs = 250, log = console.log, ler = memoriaDoConteiner, matar = pid => process.kill(pid, 'SIGKILL'), filhos = descendentes } = {}) {
  if (!ler()) return { parar() {}, ativo: false };
  let ultimo = 0;
  const t = setInterval(() => {
    const m = ler();
    if (!m || m.livre >= limiarMb) return;
    const alvos = filhos();
    if (!alvos.length) return;
    for (const pid of alvos) { try { matar(pid); } catch { /* já saiu */ } }
    if (Date.now() - ultimo > 5000) { ultimo = Date.now(); log(`memória: ${Math.round(m.livre)} MB livres de ${Math.round(m.limite)} MB; ${alvos.length} processos auxiliares encerrados para proteger o servidor`); }
  }, intervaloMs);
  t.unref();
  return { parar: () => clearInterval(t), ativo: true };
}
