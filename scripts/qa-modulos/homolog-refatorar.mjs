// Pedido de ajuste depois da primeira versão: PDF + briefing, primeira apresentação e, na mesma conversa, um pedido
// de refatoração com datas e horários. Confere se cada data/horário do pedido está no arquivo e o dia da semana.
// Uso: rodar homolog-refatorar <pdf> <briefing.txt>
import { readFileSync } from 'node:fs';
import { fatosDoPedido } from '../../src/modelo-pdf.js';
const AJUSTE = 'Refatore a apresentacao, considerando o kick-off (duraçao de 1h) no 22/10 as 9h, e o discovery local começando tambem no dia 22/10 logo apos o kick-off. O discovery termina no dia 22/10 as 17h. O segundo dia de discovery acontecer no dia 23/10 de 9h a 12h.';
export default async function (c, pdf, briefing) {
  const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
  const r1 = await c.enviar(conv, { texto: `${readFileSync(briefing, 'utf8').trim()}\n\nMonte a apresentação do novo cliente em PPTX seguindo a apresentação anexada.`, anexos: [{ nome: 'apresentacao-modelo.pdf', base64: readFileSync(pdf).toString('base64') }] });
  c.log(`  primeira: ${r1.status} arquivo=${!!r1.linhas.find(l => l.t === 'fim')?.arquivos?.length}`);
  const r = await c.enviar(conv, { texto: AJUSTE });
  const a = r.linhas.find(l => l.t === 'fim')?.arquivos?.[0];
  const det = (await c.api('GET', `/api/conversas/${conv}`)).dados;
  const avisos = (det?.mensagens || []).filter(m => m.papel === 'aviso').map(m => m.texto);
  c.log(`  ajuste: ${r.status} ${r.ms}ms arquivo=${JSON.stringify(a || null)} avisos=${JSON.stringify(avisos)}`);
  if (a) {
    const pv = (await c.api('GET', `/api/conversas/${conv}/arquivos/${a.id}/previa`)).dados;
    const texto = JSON.stringify(pv);
    const faltam = fatosDoPedido(AJUSTE).filter(f => !f.presente(texto)).map(f => f.texto);
    c.log(`  dados do pedido que faltam no arquivo: ${JSON.stringify(faltam)}; "segunda-feira, 22": ${/segunda-feira,?\s*22/i.test(texto)}; "quinta-feira, 22": ${/quinta-feira,?\s*22/i.test(texto)}`);
    c.arquivo('refatorado.pptx', (await c.binario(`/api/conversas/${conv}/arquivos/${a.id}`)).dados);
  }
  c.salvar('refatorar', { status: r.status, arquivo: a || null, avisos });
}
