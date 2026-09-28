// Matriz de auditoria do roteador: roda os casos de referência no roteador real (sem servidor e sem IA)
// e escreve docs/roteamento-matriz.md. Reproduzível: node scripts/matriz-roteamento.js
import { writeFileSync } from 'node:fs';
import { CASOS, CATALOGO, montarBanco, rodarCaso, rotearAnalise } from './roteamento-casos.js';
import { exec } from '../src/db.js';
import { NOME_CLASSE, TEXTO, VERSAO_ROTEADOR } from '../src/roteador.js';

const PREFS = ['economia', 'equilibrio', 'qualidade'];
const NOME_PREF = { economia: 'Economia', equilibrio: 'Equilíbrio', qualidade: 'Qualidade' };
const classe = id => NOME_CLASSE[CATALOGO.find(m => m.id === id)?.perfil] || '—';
const pct = (v, ref) => (v == null || !ref ? '—' : `${Math.round(v / ref * 100)}%`);
const txt = c => TEXTO[c] || c;
const linhas = [];
const L = s => linhas.push(s);

L(`# Matriz de decisões do roteador (versão ${VERSAO_ROTEADOR})`);
L('');
L('Gerada por `node scripts/matriz-roteamento.js` com o roteador real, sem servidor e sem chamada a modelo. Os mesmos casos são conferidos em `test/roteamento-matriz.test.js`.');
L('');
L('## Catálogo usado');
L('');
L('| Modelo | Classe | Entrada (US$/1M) | Saída (US$/1M) | Janela | Padrão da classe |');
L('|---|---|---:|---:|---:|---|');
for (const m of CATALOGO) L(`| \`${m.id}\` | ${NOME_CLASSE[m.perfil]} | ${m.entrada} | ${m.saida} | ${m.contexto.toLocaleString('pt-BR')} | ${m.padrao ? 'sim' : ''} |`);
L('');
L('Custo relativo = custo estimado da escolha ÷ custo do mesmo pedido no Avançado padrão (`anthropic/claude-sonnet-5`).');
L('');
L('## Resumo: modelo escolhido por preferência');
L('');
L('| Caso | Pedido | Requisitos (dimensão: nível) | Janela mínima | Economia | Equilíbrio | Qualidade |');
L('|---|---|---|---:|---|---|---|');
const detalhes = [];
for (const c of CASOS) {
  const r = Object.fromEntries(PREFS.map(p => [p, rodarCaso(c, { preferencia: p })]));
  const req = r.equilibrio.rota.requisitos;
  const cel = p => { const x = r[p].rota; return `\`${x.modelo.id}\` (${classe(x.modelo.id)}, ${pct(x.custoEstimado, x.custoReferencia)})`; };
  L(`| ${c.id} | ${c.nome} | ${Object.entries(req.dimensoes).map(([d, n]) => `${d}: ${n}`).join(', ')} | ${req.janelaMinima.toLocaleString('pt-BR')} | ${cel('economia')} | ${cel('equilibrio')} | ${cel('qualidade')} |`);
  detalhes.push([c, r]);
}
L('');
L('## Detalhe de cada caso (preferência Equilíbrio)');
for (const [c, r] of detalhes) {
  const { analise: a, rota: d } = r.equilibrio;
  L('');
  L(`### ${c.id}. ${c.nome}`);
  L('');
  L(`Pedido: "${c.texto}"${c.anexos ? ` + ${c.anexos.map(x => `${x.nome} (${x.texto.length.toLocaleString('pt-BR')} caracteres)`).join(', ')}` : ''}${c.anterior ? ` (tentativa anterior na classe ${NOME_CLASSE[c.anterior.classe]})` : ''}`);
  L('');
  L(`1. **Classificação:** tipos ${a.tipos.join(', ')}; complexidade ${d.requisitos.complexidade}; domínio de precisão: ${a.precisao.join(', ') || 'nenhum'}.`);
  const s = a.sinais;
  L(`2. **Sinais:** ${s.caracteres} caracteres; ${s.anexos} anexo(s); etapas ${s.etapas}; critérios ${s.criterios}; risco ${s.risco ? 'sim' : 'não'}; "simples" explícito ${s.explicitoSimples ? 'sim' : 'não'}; código ${s.codigo ? 'sim' : 'não'}; insatisfação ${a.insatisfacao ? 'sim' : 'não'}; tokens: fixo ${a.tokens.fixo}, mensagem ${a.tokens.mensagem}, histórico ${a.tokens.historico}, reserva de saída ${a.tokens.reservaSaida} (conteúdo ${a.tokens.densidade}).`);
  L(`   **Requisitos:** ${Object.entries(d.requisitos.dimensoes).map(([k, n]) => `${k} ${n} (${txt(d.requisitos.motivos[k])})`).join('; ')} → classe **${NOME_CLASSE[d.requisitos.classe]}**; janela mínima ${d.requisitos.janelaMinima.toLocaleString('pt-BR')} tokens.`);
  const ok = d.candidatos.filter(x => x.status === 'escolhido' || x.status === 'preterido');
  L(`3. **Candidatos que atendem:** ${ok.map(x => `\`${x.id}\` (utilidade ${x.utilidade})`).join(', ')}.`);
  const fora = d.candidatos.filter(x => x.status === 'excluido' || x.status === 'insuficiente');
  L(`4. **Excluídos:** ${fora.length ? fora.map(x => `\`${x.id}\`: ${x.motivos.map(txt).join(', ')}`).join('; ') : 'nenhum'}.`);
  L(`5. **Escolhido:** \`${d.modelo.id}\` (${classe(d.modelo.id)}).`);
  L(`6. **Motivo:** ${txt(d.motivoEscolha)}. Economia escolheria \`${r.economia.rota.modelo.id}\` (${txt(r.economia.rota.motivoEscolha)}); Qualidade, \`${r.qualidade.rota.modelo.id}\` (${txt(r.qualidade.rota.motivoEscolha)}).`);
  L(`7. **Custo relativo:** ${pct(d.custoEstimado, d.custoReferencia)} do Avançado padrão.`);
  L(`8. **Governança:** ${d.politicas.length ? d.politicas.map(txt).join('; ') : 'nenhuma regra além das padrão'}${d.fallback ? `; fallback ${d.fallback.tipo}` : ''}.`);
  L(`   **Explicação exibida:** "${d.explicacao}"`);
}

// Governança: o mesmo pedido (C) sob restrições diferentes. As regras tiram candidatos; a escolha segue a mesma função.
L('');
L('## Mesmo pedido, restrições diferentes (caso C)');
L('');
L('| Situação | Escolhido | Motivo | Fallback | Explicação |');
L('|---|---|---|---|---|');
const C = CASOS.find(c => c.id === 'C');
const variar = (nome, op) => { const { rota: d } = rodarCaso(C, { preferencia: 'equilibrio', ...op }); L(`| ${nome} | ${d.modelo ? `\`${d.modelo.id}\`` : 'nenhum'} | ${txt(d.motivoEscolha || '—')} | ${d.fallback ? `${d.fallback.tipo}: ${(d.fallback.causas || [d.fallback.causa]).map(txt).join(', ')}` : '—'} | ${d.explicacao} |`); };
variar('Sem restrição', {});
const semAvancado = montarBanco(); exec(semAvancado, "update config set valor = ? where chave = 'acessoPerfis'", JSON.stringify({ equilibrado: { todos: true }, avancado: { todos: false } }));
variar('Pessoa sem acesso ao Avançado', { db: semAvancado });
variar('Conversa sigilosa, homologado só no Rápido', { sigilosa: true, homologados: ['google/gemini-3.5-flash-lite'] });
variar('Conversa sigilosa, homologados no Rápido e no Avançado', { sigilosa: true, homologados: ['google/gemini-3.5-flash-lite', 'anthropic/claude-sonnet-5'] });
variar('Créditos do mês no fim (reserva)', { reservaDoPlano: true });
const semGrande = montarBanco(); exec(semGrande, "update modelos set liberado = 0 where perfil = 'avancado'");
variar('Empresa sem modelo Avançado liberado', { db: semGrande });

// Ablação: cada sinal desligado, um de cada vez, em todos os casos e preferências. Mostra quais sinais
// de fato mudam o modelo escolhido (e em quais casos), em vez de só aparecerem no registro.
const SINAIS = {
  'tipo análise': a => ({ ...a, tipos: a.tipos.filter(t => t !== 'analise').concat(a.tipos.length === 1 && a.tipos[0] === 'analise' ? ['consulta'] : []) }),
  'tipo raciocínio': a => ({ ...a, tipos: a.tipos.filter(t => t !== 'raciocinio') }),
  'tipo programação': a => ({ ...a, tipos: a.tipos.filter(t => t !== 'programacao') }),
  'domínio de precisão': a => ({ ...a, precisao: [] }),
  'risco': a => ({ ...a, sinais: { ...a.sinais, risco: false } }),
  'critérios/etapas': a => ({ ...a, sinais: { ...a.sinais, criterios: 0, etapas: 0 } }),
  '"simples" explícito': a => ({ ...a, sinais: { ...a.sinais, explicitoSimples: false } }),
  'insatisfação': a => ({ ...a, insatisfacao: false }),
  'volume/janela': a => ({ ...a, tokens: { ...a.tokens, pedido: 500, minimo: 2000, desejado: 2000, mensagem: 200 } }),
};
L('');
L('## Ablação de sinais: quais sinais mudam a escolha');
L('');
L(`Cada linha desliga um sinal na análise e roteia de novo (${CASOS.length} casos × ${PREFS.length} preferências = ${CASOS.length * PREFS.length} decisões). "Muda" conta as decisões em que o modelo escolhido mudou.`);
L('');
L('| Sinal desligado | Decisões que mudam | Casos afetados |');
L('|---|---:|---|');
for (const [nome, desligar] of Object.entries(SINAIS)) {
  let muda = 0; const casos = new Set();
  for (const c of CASOS) for (const p of PREFS) {
    const { analise, rota } = rodarCaso(c, { preferencia: p });
    const outra = rotearAnalise(desligar(analise), { preferencia: p });
    if (outra.modelo?.id !== rota.modelo?.id) { muda++; casos.add(c.id); }
  }
  L(`| ${nome} | ${muda} | ${[...casos].join(', ') || '—'} |`);
}

writeFileSync(new URL('../docs/roteamento-matriz.md', import.meta.url), linhas.join('\n') + '\n');
console.log(`docs/roteamento-matriz.md: ${CASOS.length} casos × ${PREFS.length} preferências + 6 variações de governança.`);
