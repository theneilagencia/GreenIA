// Correções pedidas no chat depois da apresentação gerada: cada pedido precisa gerar nova versão com a correção
// aplicada (e "não aplicou o meu pedido" reaplica o anterior). Uso: rodar homolog-correcao <pdf> <briefing.txt>
import { readFileSync } from 'node:fs';
import { fatosDoPedido } from '../../src/modelo-pdf.js';
const PASSOS = [
  'Mude o kick-off para 29/10 às 14h e o discovery presencial para 30/10 das 9h às 17h.',
  'voce nao aplicou o meu pedido',
  'Troque o título do slide de método para "Como vamos trabalhar juntos".',
];
export default async function (c, pdf, briefing) {
  const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
  const r0 = await c.enviar(conv, { texto: `${readFileSync(briefing, 'utf8').trim()}\n\nMonte a apresentação do novo cliente em PPTX seguindo a apresentação anexada.`, anexos: [{ nome: 'apresentacao-modelo.pdf', base64: readFileSync(pdf).toString('base64') }] });
  c.log(`  primeira: ${r0.status} arquivo=${!!r0.linhas.find(l => l.t === 'fim')?.arquivos?.length}`);
  const out = [];
  let k = 0;
  for (const texto of PASSOS) {
    const r = await c.enviar(conv, { texto });
    const a = r.linhas.find(l => l.t === 'fim')?.arquivos?.[0];
    let faltam = null;
    if (a) {
      const pv = JSON.stringify((await c.api('GET', `/api/conversas/${conv}/arquivos/${a.id}/previa`)).dados);
      faltam = fatosDoPedido(k === 1 ? PASSOS[0] : texto).filter(f => !f.presente(pv)).map(f => f.texto);
      c.arquivo(`correcao-${++k}.pptx`, (await c.binario(`/api/conversas/${conv}/arquivos/${a.id}`)).dados);
    } else k++;
    const etapas = r.linhas.filter(l => l.t === 'etapa').map(l => l.v);
    const linha = { pedido: texto, status: r.status, ms: r.ms, arquivo: !!a, edicao: etapas.some(e => /Aplicando as corre/.test(e)), faltam };
    out.push(linha); c.log(`  ${JSON.stringify(linha)}`);
  }
  c.salvar('correcao', out);
}
