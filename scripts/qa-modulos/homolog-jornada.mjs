// Jornada real do modelo de apresentação em produção: primeiro "analise o material" com o PDF e o briefing; depois o
// pedido escrito de formas diferentes (com e sem a palavra "apresentação"). Cada forma precisa terminar com o arquivo
// no layout do PDF. Uso: rodar homolog-jornada <pdf> <briefing.txt>
import { readFileSync } from 'node:fs';
const PEDIDOS = [
  'Agora escreva o conteúdo completo para o novo cliente, slide a slide.',
  'Adapte a apresentação para o novo cliente.',
  'Faça a versão do novo cliente.',
];
export default async function (c, pdf, briefing) {
  const out = [];
  for (const pedido of PEDIDOS) {
    const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
    const r1 = await c.enviar(conv, { texto: `analise o material\n\n${readFileSync(briefing, 'utf8').trim()}`, anexos: [{ nome: 'apresentacao-modelo.pdf', base64: readFileSync(pdf).toString('base64') }] });
    const r = await c.enviar(conv, { texto: pedido });
    const fim = r.linhas.find(l => l.t === 'fim');
    const a = fim?.arquivos?.[0] || null;
    const linha = { pedido, analise: r1.status, status: r.status, ms: r.ms, arquivo: a ? { nome: a.nome, modelo: a.modelo, slides: a.slides, sem_adaptacao: a.sem_adaptacao } : null };
    out.push(linha); c.log(`  ${JSON.stringify(linha)}`);
    if (a) c.arquivo(`jornada-${out.length}.pptx`, (await c.binario(`/api/conversas/${conv}/arquivos/${a.id}`)).dados);
  }
  c.salvar('jornada', out);
}
