// Apresentação no layout de um PDF modelo, em produção: conversa nova, PDF anexado com o briefing do novo projeto,
// pedido de PPTX; registra as etapas, o arquivo gerado e a prévia. Uso: rodar homolog-modelo <pdf> <briefing.txt>
import { readFileSync } from 'node:fs';
export default async function (c, pdf, briefing) {
  const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
  const texto = `${readFileSync(briefing, 'utf8').trim()}\n\nMonte a apresentação da RAFISA em PPTX, com o cenário do projeto dela, seguindo a apresentação da Repet anexada.`;
  const r = await c.enviar(conv, { texto, anexos: [{ nome: 'Apresentacao-Kickoff-Repet.pdf', base64: readFileSync(pdf).toString('base64') }] });
  const etapas = r.linhas.filter(l => l.t === 'etapa').map(l => `${l.ms}ms ${l.v}`);
  const fim = r.linhas.find(l => l.t === 'fim'), erro = r.linhas.find(l => l.t === 'erro');
  c.log(`  status ${r.status} ${r.ms}ms erro=${erro?.mensagem || r.erro || '-'}`);
  for (const e of etapas) c.log(`   ${e}`);
  c.arquivo('resposta.md', r.linhas.filter(l => l.t === 'texto').map(l => l.v).join(''));
  const det = (await c.api('GET', `/api/conversas/${conv}`)).dados;
  const avisos = det.mensagens.filter(m => m.papel === 'aviso').map(m => m.texto);
  c.log(`  avisos: ${JSON.stringify(avisos)}`);
  const a = fim?.arquivos?.[0];
  c.log(`  arquivo: ${JSON.stringify(a || null)}`);
  if (a) {
    const b = await c.binario(`/api/conversas/${conv}/arquivos/${a.id}`);
    c.arquivo('gerado.pptx', b.dados);
    const pv = await c.api('GET', `/api/conversas/${conv}/arquivos/${a.id}/previa`);
    c.log(`  download ${b.status} ${b.dados.length}B; prévia ${pv.status} ${pv.dados?.slides?.length} slides`);
  }
  c.salvar('modelo', { conversa: conv, status: r.status, ms: r.ms, etapas, avisos, arquivo: a || null });
}
