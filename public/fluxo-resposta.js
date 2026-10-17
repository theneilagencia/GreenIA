// Fechar a conexão não significa concluir o trabalho. Só o evento final confirma
// a entrega; a última linha também é lida quando chega sem quebra de linha.
export async function* eventosDaResposta(body) {
  const leitor = body.getReader(), dec = new TextDecoder();
  let resto = '', terminou = false;
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      resto += done ? dec.decode() : dec.decode(value, { stream: true });
      const linhas = resto.split('\n');
      resto = linhas.pop();
      if (done && resto.trim()) { linhas.push(resto); resto = ''; }
      for (const l of linhas.filter(l => l.trim())) {
        const ev = JSON.parse(l);
        if (ev.t === 'fim' || ev.t === 'erro') terminou = true;
        yield ev;
      }
      if (done) break;
    }
    if (!terminou) throw new Error('resposta_interrompida');
  } finally { leitor.releaseLock(); }
}
