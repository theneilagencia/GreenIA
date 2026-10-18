// Catálogo e casos de referência do roteador: a mesma base serve à matriz de auditoria
// (scripts/matriz-roteamento.js) e aos testes de regressão (test/roteamento-matriz.test.js).
// Modelos com ids fictícios "x/..." completam o catálogo sugerido para que existam dois modelos
// por classe, com preços e janelas diferentes: só assim a preferência e a janela podem mudar a escolha.
import { abrirBanco, exec } from '../src/db.js';
import { lerConfig, salvarConfig } from '../src/config.js';
import { semearSugestao } from '../src/modelos.js';
import { analisarPedido, rotear, AUTOMATICO } from '../src/roteador.js';

// Preços em US$ por milhão de tokens (entrada, saída). Os três primeiros vêm da sugestão inicial.
export const CATALOGO = [
  { id: 'google/gemini-3.5-flash-lite', perfil: 'rapido', entrada: 0.30, saida: 2.50, contexto: 1048576, padrao: true },
  { id: 'anthropic/claude-haiku-4.5', perfil: 'equilibrado', entrada: 1, saida: 5, contexto: 200000, padrao: true },
  { id: 'anthropic/claude-sonnet-5', perfil: 'avancado', entrada: 2, saida: 10, contexto: 1000000, padrao: true },
  { id: 'x/rapido-curto', perfil: 'rapido', entrada: 0.10, saida: 0.40, contexto: 32000 },
  { id: 'x/equilibrado-longo', perfil: 'equilibrado', entrada: 1.2, saida: 6, contexto: 1000000 },
  { id: 'x/avancado-curto', perfil: 'avancado', entrada: 1.5, saida: 8, contexto: 128000 },
];

const texto = (n, frase = 'O fornecedor entregou o lote conforme o pedido e a nota foi conferida pela equipe. ') => frase.repeat(Math.ceil(n / frase.length)).slice(0, n);
const tabela = n => texto(n, 'Item 0042 | 12,50 | 3 | 37,50 | 2026-09-01\n');
const codigo = n => texto(n, 'async function salvar(fila, item) {\n  const atual = await fila.ler();\n  atual.push(item);\n  await fila.gravar(atual);\n}\n');

// Casos A a J pedidos na auditoria, mais os contrastes de capacidade (K a N).
export const CASOS = [
  { id: 'A', nome: 'Tradução curta', texto: "Traduza 'bom dia' para inglês." },
  { id: 'B', nome: 'Resumo em cinco linhas', texto: 'Resuma este texto em cinco linhas.', anexos: [{ nome: 'texto.docx', texto: texto(12000) }] },
  { id: 'C', nome: 'Contrato: riscos jurídicos', texto: 'Analise este contrato e identifique riscos jurídicos, obrigações e possíveis pontos de exposição.', anexos: [{ nome: 'contrato.pdf', texto: texto(60000) }] },
  { id: 'D', nome: 'Demonstrações financeiras', texto: 'Compare estas demonstrações financeiras e identifique inconsistências.', anexos: [{ nome: '2025.xlsx', texto: tabela(25000) }, { nome: '2026.xlsx', texto: tabela(25000) }] },
  { id: 'E', nome: 'Arquitetura', texto: 'Analise este problema de arquitetura e proponha uma solução considerando escalabilidade, segurança e custo.' },
  { id: 'F', nome: 'Função Python simples', texto: 'Escreva uma função Python simples para converter uma lista de valores.' },
  { id: 'G', nome: 'Código: concorrência e segurança', texto: 'Analise este código, encontre o problema e proponha uma correção considerando concorrência, performance e segurança.', anexos: [{ nome: 'fila.js', texto: codigo(6000) }] },
  { id: 'H', nome: 'Pedido simples, contexto enorme', texto: 'Resuma este documento em dez tópicos.', anexos: [{ nome: 'relatorio.pdf', texto: texto(900000) }] },
  { id: 'I', nome: 'Pedido complexo, pouco contexto', texto: 'Qual a melhor estratégia de precificação para entrar num mercado com dois concorrentes dominantes, considerando riscos e trade-offs?' },
  { id: 'J', nome: 'Nova tentativa', texto: 'Não resolveu o problema, a resposta anterior não funcionou.', temResposta: true, historicoChars: 4000, anterior: { classe: 'rapido', nivel: 1 } },
  { id: 'K', nome: 'Simples com precisão alta', texto: 'Extraia o valor exato de cada linha desta tabela.', anexos: [{ nome: 'itens.csv', texto: tabela(3000) }] },
  { id: 'L', nome: 'Complexa sem precisão de domínio', texto: 'Planeje uma campanha interna de integração considerando público, canais e calendário.' },
  { id: 'M', nome: 'Síntese curta', texto: 'Resuma os principais pontos desta ata.', anexos: [{ nome: 'ata.docx', texto: texto(5000) }] },
  { id: 'O', nome: 'Análise intermediária', texto: 'Compare estas duas propostas de fornecedores e aponte as diferenças.', anexos: [{ nome: 'propostas.docx', texto: texto(8000) }] },
  { id: 'P', nome: 'Correção de código colado', texto: 'Corrija o bug desta função:\n```js\nfunction soma(lista) { let t = 0; for (let i = 1; i <= lista.length; i++) t += lista[i]; return t; }\n```' },
  { id: 'N', nome: 'Análise sobre janela grande', texto: 'Analise este relatório e identifique inconsistências entre as seções.', anexos: [{ nome: 'relatorio.pdf', texto: texto(700000) }] },
];

const SISTEMA = 1800;   // tamanho típico das instruções da GreenIA, em caracteres

// Banco em memória com o catálogo; acesso liberado a todas as classes (as variações de governança vêm por parâmetro).
export function montarBanco({ preferencia = 'equilibrio', acesso = true } = {}) {
  const db = abrirBanco(':memory:');
  semearSugestao(db);
  for (const m of CATALOGO) exec(db, 'insert or replace into modelos (id, nome, fornecedor, liberado, perfil, preco_entrada, preco_saida, contexto) values (?, ?, ?, 1, ?, ?, ?, ?)',
    m.id, m.id, m.id.split('/')[0], m.perfil, m.entrada / 1e6, m.saida / 1e6, m.contexto);
  salvarConfig(db, { roteamento: { ativo: true, preferencia }, acessoPerfis: { equilibrado: { todos: acesso }, avancado: { todos: acesso } } });
  return db;
}

// Roteia uma análise já feita (usado na ablação de sinais: a mesma análise com um sinal desligado).
export function rotearAnalise(analise, { db, preferencia = 'equilibrio' } = {}) {
  const banco = db || montarBanco({ preferencia });
  const cfg = lerConfig(banco);
  cfg.roteamento = { ativo: true, preferencia };
  return rotear({ db: banco, cfg, pessoa: { grupos: [], areas: [] }, pedido: AUTOMATICO, analise });
}

export function rodarCaso(caso, { db, preferencia, sigilosa = false, reservaDoPlano = false, pessoa = { grupos: [], areas: [] }, homologados = [] } = {}) {
  const banco = db || montarBanco({ preferencia });
  for (const id of homologados) exec(banco, "update modelos set homologado = 1, homologacao = '{\"fornecedor\":\"x\",\"endpoint\":\"x\",\"retencaoZero\":true,\"semTreino\":true}' where id = ?", id);
  const cfg = lerConfig(banco);
  if (preferencia) cfg.roteamento = { ativo: true, preferencia };
  const analise = analisarPedido({ texto: caso.texto, anexos: caso.anexos || [], historicoChars: caso.historicoChars || 0, sistemaChars: SISTEMA,
    temResposta: !!caso.temResposta, anterior: caso.anterior || null });
  const rota = rotear({ db: banco, cfg, pessoa, sigilosa, reservaDoPlano, pedido: AUTOMATICO, analise });
  return { analise, rota };
}
