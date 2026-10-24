// Fechar a conexão não significa concluir o trabalho. Só o evento final confirma
// a entrega; a última linha também é lida quando chega sem quebra de linha.
export async function* eventosDaResposta(body, { sinal } = {}) {
  const leitor = body.getReader(), dec = new TextDecoder();
  const cancelar = () => { leitor.cancel().catch(() => {}); };
  sinal?.addEventListener('abort', cancelar, { once: true });
  let resto = '', terminou = false;
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      sinal?.throwIfAborted();
      resto += done ? dec.decode() : dec.decode(value, { stream: true });
      const linhas = resto.split('\n');
      resto = linhas.pop();
      if (done && resto.trim()) { linhas.push(resto); resto = ''; }
      for (const l of linhas.filter(l => l.trim())) {
        const ev = JSON.parse(l);
        if (ev.t === 'fim' || ev.t === 'erro' || ev.t === 'interrompido') terminou = true;
        yield ev;
      }
      if (done) break;
    }
    if (!terminou) throw new Error('resposta_interrompida');
  } finally { sinal?.removeEventListener('abort', cancelar); leitor.releaseLock(); }
}
