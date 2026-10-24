// Conferência de escrita em produção: pedidos que costumam puxar vícios de texto de IA; registra se houve
// substituição da versão ao vivo e se o texto guardado ainda tem algum vício. Uso: rodar homolog-escrita
import { viciosDeEscrita } from '../../src/escrita.js';
const PEDIDOS = [
  'Escreva um parágrafo de abertura para uma proposta comercial de consultoria em gestão de custos para uma indústria de médio porte.',
  'Explique em poucas linhas por que vale a pena revisar o processo de fechamento contábil mensal.',
  'Escreva um email curto para a equipe avisando que a reunião de kick-off mudou para quinta às 10h.',
];
export default async function (c) {
  const resultados = [];
  for (const texto of PEDIDOS) {
    const conv = (await c.api('POST', '/api/conversas', {})).dados.conversa.id;
    const r = await c.enviar(conv, { texto });
    const ao_vivo = r.linhas.filter(l => l.t === 'texto').map(l => l.v).join('');
    const sub = r.linhas.find(l => l.t === 'substituir');
    const det = (await c.api('GET', `/api/conversas/${conv}`)).dados;
    const final = (det?.mensagens || []).filter(m => m.papel === 'assistant').at(-1)?.texto || '';
    const linha = { status: r.status, vicios_ao_vivo: viciosDeEscrita(ao_vivo), substituiu: !!sub, vicios_final: viciosDeEscrita(final), igual_ao_evento: sub ? sub.v === final : null };
    resultados.push(linha);
    c.log(`  ${JSON.stringify(linha)}`);
    c.arquivo(`escrita-${resultados.length}.md`, `# Ao vivo\n\n${ao_vivo}\n\n# Final\n\n${final}\n`);
  }
  c.salvar('escrita', resultados);
}
