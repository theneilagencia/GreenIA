// K–N. Conversa depois da execução: comandos naturais na mesma conversa. Mede se o contexto fica, se o Quick Win é
// re-executado sem necessidade (etapas de conferência), se a mudança vale para o resultado certo e o histórico.
// Uso: rodar conversa [caso]   (padrão: 19, o de múltiplos entregáveis; a conversa de uso real da bateria)
const textoDe = r => r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
const COMANDOS = [
  ['resuma mais', t => ({ ok: t.length > 50 })],
  ['adicione uma tabela com os indicadores', t => ({ ok: /^\s*\|.+\|\s*$/m.test(t) })],
  ['corrija esse item: a margem foi 21%, não outro valor', t => ({ ok: /21\s?%/.test(t) })],
  ['remova a parte de riscos', t => ({ ok: !/^#+\s*riscos/im.test(t) })],
  ['refaça apenas a conclusão', t => ({ ok: t.length > 20 })],
  ['use o documento anterior para lembrar o valor das vendas', t => ({ ok: /3,4/.test(t) })],
  ['compare com a versão anterior do resumo', t => ({ ok: t.length > 50 })],
  ['continue daqui', t => ({ ok: t.length > 20 })],
];
export default async function (c, caso = '19') {
  const { resumoExec } = await import(`./bateria.mjs?v=${Date.now()}`);
  const conv = c.estado.casos[Number(caso)]?.convUso;
  if (!conv) { c.log('sem conversa de uso para o caso', caso); return; }
  const antes = (await c.api('GET', `/api/conversas/${conv}`)).dados;
  const out = { caso: Number(caso), conversa: conv, mensagens_antes: antes?.mensagens?.length ?? null, passos: [] };
  for (const [cmd, conferir] of COMANDOS) {
    const r = await c.enviar(conv, { texto: cmd });
    const t = textoDe(r), e = resumoExec(r);
    const reexecutou = e.etapas.some(x => /Conferindo|Organizando|Analisando/.test(x));
    const p = { comando: cmd, status: r.status, ms: r.ms, caracteres: t.length, reexecutou, qualidade: e.qualidade?.status || null, erro: e.erro, ...conferir(t) };
    out.passos.push(p);
    c.arquivo(`conversa-${caso}-${out.passos.length}.md`, `> ${cmd}\n\n${t}`);
    c.log(`  "${cmd}": ${p.status} ${p.ms}ms ${p.caracteres}c ok=${p.ok} reexec=${reexecutou} q=${p.qualidade || '-'} ${p.erro || ''}`);
  }
  const depois = (await c.api('GET', `/api/conversas/${conv}`)).dados;
  out.mensagens_depois = depois?.mensagens?.length ?? null;
  out.historico_ok = out.mensagens_depois === (out.mensagens_antes || 0) + COMANDOS.length * 2;
  // M. Executar de novo na mesma conversa (nova execução explícita).
  const r2 = await c.enviar(conv, { executar_quick_win: true, texto: 'Mesmo material de antes, execute de novo.' });
  out.reexecucao = resumoExec(r2);
  c.salvar(`03-conversa-${caso}`, out);
  c.log(`historico ${out.mensagens_antes}->${out.mensagens_depois} ok=${out.historico_ok} reexecucao=${out.reexecucao.qualidade?.status || out.reexecucao.erro}`);
}
