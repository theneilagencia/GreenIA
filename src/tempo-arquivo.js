// O prazo vale para o conjunto das chamadas auxiliares, inclusive as tentativas de
// correção. Uma chamada que excedeu o prazo não pode iniciar outra cobrança.
export function criarPrazoArquivo({ totalMs = 360_000, chamadaMs = 120_000, agora = Date.now } = {}) {
  let limite = null, encerrado = false;
  const conjunto = new AbortController();
  const erro = () => Object.assign(new Error('A montagem excedeu o tempo de espera.'), { codigo: 'arquivo_tempo_excedido' });
  const conferir = () => {
    if (encerrado || (limite !== null && agora() >= limite)) {
      encerrado = true; conjunto.abort(); throw erro();
    }
  };
  return {
    conferir,
    async executar(fn) {
      limite ??= agora() + totalMs;
      conferir();
      const restante = limite - agora();
      if (encerrado || restante <= 0) { encerrado = true; throw erro(); }
      const sinal = AbortSignal.any([conjunto.signal, AbortSignal.timeout(Math.max(1, Math.min(chamadaMs, restante)))]);
      try {
        const resultado = await fn(sinal);
        sinal.throwIfAborted();
        conferir();
        return resultado;
      } catch (e) {
        if (sinal.aborted) { encerrado = true; conjunto.abort(); throw erro(); }
        throw e;
      }
    },
  };
}
