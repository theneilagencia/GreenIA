// Medição da classificação por regras (item "consulta"), antes de qualquer classificador por IA.
// Dois conjuntos: (1) as 30 sugestões de pedido dos modelos de quick win do produto (texto real do
// produto, sem gabarito); (2) sondas de paráfrase, negação e outro idioma, com a classe mínima que
// um revisor humano indicaria (gabarito deste arquivo, julgamento da auditoria, não dado de produção).
// node scripts/medir-classificacao.js  → docs/roteamento-classificacao.md
import { readFileSync, writeFileSync } from 'node:fs';
import { analisarPedido, requisitosDe, NOME_CLASSE } from '../src/roteador.js';

const doc = n => [{ nome: 'doc.txt', texto: 'O fornecedor entregou o lote conforme o pedido e a nota foi conferida. '.repeat(Math.ceil(n / 72)).slice(0, n) }];
const codigo = [{ nome: 'app.js', texto: 'async function salvar(fila, item) {\n  const atual = await fila.ler();\n  atual.push(item);\n  await fila.gravar(atual);\n}\n'.repeat(20) }];
const CLASSE = { 1: 'rapido', 2: 'equilibrado', 3: 'avancado' };

// Sugestões dos modelos de quick win: os pedidos que a própria interface oferece às pessoas.
const produto = JSON.parse(readFileSync(new URL('../modelos-quick-win.json', import.meta.url), 'utf8'))
  .flatMap(q => q.sugestoes.map(t => ({ texto: t, quickWin: q.nome, anexos: /documento|contrato|cotaç|texto|anotaç|caso/i.test(q.para_que_serve + t) ? doc(6000) : [] })));

// Sondas: [texto, anexos, classe mínima esperada, o que testa]
const SONDAS = [
  ['Vale a pena trocar de fornecedor agora ou esperar o fim do contrato?', [], 3, 'decisão sem palavra-chave de raciocínio'],
  ['Me ajuda a entender por onde começar a reorganizar o estoque.', [], 2, 'pedido aberto sem tipo'],
  ['Esses números fecham?', doc(4000), 2, 'conferência sem o verbo "conferir"'],
  ['O que muda para nós com a nova regra de férias?', [], 2, 'interpretação de regra'],
  ['Isso aqui tem algum problema?', codigo, 2, 'código em anexo, pergunta vaga'],
  ['Tem como deixar isso mais rápido?', codigo, 2, 'otimização implícita'],
  ['Quem ganha e quem perde se mudarmos o horário do turno?', [], 3, 'análise de impacto sem palavra-chave'],
  ['Qual seria o impacto de dobrar o preço do frete?', [], 2, 'impacto'],
  ['Não precisa analisar, só traduza para o inglês: bom dia a todos.', [], 1, 'negação de análise'],
  ['Sem análise profunda: diga em uma frase o que é um aditivo contratual.', [], 1, 'negação + domínio'],
  ['Não quero um resumo; compare os dois contratos cláusula por cláusula e aponte riscos.', doc(20000), 3, 'negação de síntese'],
  ['Summarize this document in five bullet points.', doc(8000), 1, 'inglês, simples'],
  ['Review this contract and flag the legal risks.', doc(20000), 3, 'inglês, complexo'],
  ['Qual é o horário de atendimento do RH?', [], 1, 'consulta simples (correta)'],
  ['Como faço para pedir reembolso?', [], 1, 'consulta simples (correta)'],
  ['Onde fica o formulário de férias?', [], 1, 'consulta simples (correta)'],
  ['Resuma em três linhas.', doc(5000), 1, 'síntese'],
  ['Traduza para o espanhol.', doc(2000), 1, 'tradução com anexo'],
  ['Analise este contrato e identifique riscos jurídicos.', doc(20000), 3, 'complexo com palavra-chave'],
  ['Proponha um plano de migração considerando prazo, custo e risco.', [], 3, 'raciocínio multicritério'],
];

const linhas = [], L = s => linhas.push(s);
const req = (texto, anexos) => { const a = analisarPedido({ texto, anexos, sistemaChars: 1800 }); return { a, r: requisitosDe(a) }; };

L('# Medição da classificação por regras');
L('');
L('Gerado por `node scripts/medir-classificacao.js`. Sem dados de produção nesta instalação: os números abaixo vêm do texto do produto e de sondas escritas pela auditoria. Em produção, a mesma medição sai da tela Modelos → Roteamento (tabela "Classificação dos pedidos"), a partir do registro de decisões.');
L('');
// (1) Sugestões do produto
const p = produto.map(x => ({ ...x, ...req(x.texto, x.anexos) }));
const consultaP = p.filter(x => x.a.tipos.includes('consulta'));
const decidiuP = consultaP.filter(x => x.r.determinantes.includes('tipo_consulta'));
L('## 1. Sugestões de pedido do produto (30)');
L('');
L(`- Classificados em algum tipo: **${p.length - consultaP.length} de ${p.length}** (${Math.round((p.length - consultaP.length) / p.length * 100)}%).`);
L(`- Em "consulta": **${consultaP.length}** (${Math.round(consultaP.length / p.length * 100)}%); em ${decidiuP.length} deles a "consulta" definiu a exigência (Rápido).`);
L('');
L('| Pedido | Quick win | Tipos | Exigência |');
L('|---|---|---|---|');
for (const x of p) L(`| ${x.texto} | ${x.quickWin} | ${x.a.tipos.join(', ')} | ${NOME_CLASSE[x.r.classe]} |`);
// (2) Sondas
const s = SONDAS.map(([texto, anexos, esperado, oque]) => ({ texto, oque, esperado, ...req(texto, anexos) }));
const abaixo = s.filter(x => x.r.nivel < x.esperado), acima = s.filter(x => x.r.nivel > x.esperado), certo = s.filter(x => x.r.nivel === x.esperado);
L('');
L(`## 2. Sondas de paráfrase, negação e idioma (${s.length}, com gabarito da auditoria)`);
L('');
L(`- Exigência igual ao gabarito: **${certo.length}**; abaixo (risco de resposta fraca): **${abaixo.length}**; acima (consumo a mais): **${acima.length}**.`);
L(`- Das que ficaram abaixo, ${abaixo.filter(x => x.a.tipos.includes('consulta')).length} caíram em "consulta".`);
L('');
L('| Pedido | O que testa | Tipos | Exigência | Gabarito | Resultado |');
L('|---|---|---|---|---|---|');
for (const x of s) L(`| ${x.texto} | ${x.oque} | ${x.a.tipos.join(', ')} | ${NOME_CLASSE[x.r.classe]} | ${NOME_CLASSE[CLASSE[x.esperado]]} | ${x.r.nivel === x.esperado ? 'igual' : x.r.nivel < x.esperado ? '**abaixo**' : 'acima'} |`);
writeFileSync(new URL('../docs/roteamento-classificacao.md', import.meta.url), linhas.join('\n') + '\n');
console.log(`produto: ${consultaP.length}/${p.length} em consulta; sondas: ${certo.length} iguais, ${abaixo.length} abaixo, ${acima.length} acima`);
