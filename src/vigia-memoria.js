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
export function descendentes(raiz = process.pid) {
  const pais = new Map();
  for (const n of readdirSync('/proc')) {
    if (!/^\d+$/.test(n)) continue;
    try {
      const stat = readFileSync(`/proc/${n}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      pais.set(Number(n), ppid);
    } catch { /* processo já saiu */ }
  }
  const out = [], fila = [raiz];
  while (fila.length) { const p = fila.shift(); for (const [pid, pai] of pais) if (pai === p) { out.push(pid); fila.push(pid); } }
  return out;
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
