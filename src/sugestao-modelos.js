// Sugestão da GreenIA para os modelos da empresa: parte do USO real (tipos de tarefa das decisões de roteamento e
// dos Quick Wins, nunca conteúdo de conversa) e da POLÍTICA (sigilo ligado ou não, regras por tipo de dado,
// requisitos, autorizações e vetos da plataforma, plano). O admin leigo aceita com um clique; o fluxo técnico
// (Catálogo técnico → Aprovar para dados sigilosos) continua para quem quiser escolher outro modelo.
//
// Regras que a sugestão nunca afrouxa:
// - Só sugere para dados sigilosos o modelo que passa na camada central (sigilo.js → avaliarRecurso) DEPOIS da
//   ação proposta, com uma rota já conferida (autorização da plataforma: fornecedor, endpoint, retenção zero e
//   ausência de treino comprovados). Garantia nenhuma é presumida ou inventada.
// - Veto da plataforma, modelo gratuito/automático, modelo fora do catálogo e modelo acima do teto de consumo do
//   nível ficam de fora.
// - Aplicar grava o mesmo registro de uma aprovação manual (model.certified, com origem "sugestao") e passa pela
//   mesma regra de "pelo menos um homologado disponível para todos". O modo de governança não muda.
import { erro } from './http.js';
import { exec, json, todos, transacao, um } from './db.js';
import { lerConfig, salvarConfig, PADRAO } from './config.js';
import { registrar } from './eventos.js';
import { avaliarRecurso, politicaSigiloLigada, requisitosDe, semRotaFixa } from './sigilo.js';
import { POOLS_RECOMENDADOS, TETOS, tarefasDoModelo } from './pools-modelos.js';
import { aplicarRecomendacoes, lerModelos, mudar, paraTodos } from './modelos.js';
import { situacaoPlano } from './plano.js';

export const NIVEIS = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
// Tipos de tarefa (roteador.js → TIPOS) em palavras de quem usa.
const USO = { sintese: 'resumir', redacao: 'redigir textos', analise: 'conferir documentos', extracao: 'trabalhar com planilhas',
  classificacao: 'organizar informações', traducao: 'traduzir', programacao: 'programar', raciocinio: 'planejar e decidir', edicao: 'editar textos' };
const BOM_PARA = { sintese: 'resumir', redacao: 'redigir', analise: 'conferir documentos', extracao: 'trabalhar com planilhas',
  classificacao: 'organizar informações', traducao: 'traduzir', programacao: 'programar', raciocinio: 'planejar' };
// Tipo de trabalho de cada Quick Win (quickwin-construtor.js → ARQUETIPOS) → tipos de tarefa.
const TAREFAS_DO_QW = { analisar_documentos: ['analise', 'extracao'], organizar_informacoes: ['extracao', 'classificacao'], criar_relatorio: ['sintese', 'redacao'],
  preparar_reuniao: ['sintese'], responder_clientes: ['redacao'], comparar_documentos: ['analise'], criar_conteudo: ['redacao'] };
// Sem histórico: o uso geral de um escritório (resumir, redigir, conferir documentos e planilhas).
export const USO_GERAL = { sintese: 0.3, redacao: 0.3, analise: 0.2, extracao: 0.2 };
const MIN_DECISOES = 5;           // abaixo disso, o histórico ainda não diz nada
const PESO_QW = 3;                // um Quick Win é trabalho recorrente: pesa como algumas decisões
const BONUS_PADRAO = 0.25;        // a curadoria só troca o modelo padrão do nível quando o uso pede com clareza
const FABRICANTES = { google: 'Google', anthropic: 'Anthropic', openai: 'OpenAI', mistralai: 'Mistral', 'meta-llama': 'Meta', 'x-ai': 'xAI', deepseek: 'DeepSeek',
  qwen: 'Alibaba', amazon: 'Amazon', cohere: 'Cohere', microsoft: 'Microsoft', nvidia: 'NVIDIA' };
export const fabricanteDe = id => String(id || '').split('/')[0];
export const nomeFabricante = id => { const f = fabricanteDe(id); return FABRICANTES[f] || (f ? f[0].toUpperCase() + f.slice(1) : '—'); };
const GRUPOS_DADO = [['dados pessoais', ['cpf', 'rg', 'email', 'telefone', 'cep', 'endereco', 'pessoal_restrito']], ['dados pessoais sensíveis', ['sensivel']],
  ['dados financeiros', ['cartao', 'banco', 'pix', 'cnpj']], ['documentos confidenciais', ['confidencial']]];

const lista = itens => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

// ---------------------------------------------------------------- uso da empresa
/**
 * @param {{ decisoes: string[][], quickWins: {arquetipo?: string}[] }} uso tipos de cada decisão recente e o tipo de trabalho de cada Quick Win
 * @returns {{ origem: 'historico'|'quick_wins'|'padrao', pesos: Record<string, number>, principais: string[], frase: string, decisoes: number, quickWins: number }}
 */
export function usoDaEmpresa({ decisoes = [], quickWins = [] } = {}) {
  const doHistorico = {}, dosQws = {};
  let n = 0, qws = 0;
  for (const tipos of decisoes) {
    const validos = (tipos || []).filter(t => USO[t]);
    if (!validos.length) continue;
    n++;
    for (const t of validos) doHistorico[t] = (doHistorico[t] || 0) + 1 / validos.length;
  }
  for (const q of quickWins) {
    const tipos = TAREFAS_DO_QW[q?.arquetipo] || [];
    if (!tipos.length) continue;
    qws++;
    for (const t of tipos) dosQws[t] = (dosQws[t] || 0) + PESO_QW / tipos.length;
  }
  const temHistorico = n >= MIN_DECISOES;
  const origem = temHistorico ? 'historico' : qws ? 'quick_wins' : 'padrao';
  const base = { ...(origem === 'padrao' ? USO_GERAL : {}), ...(origem === 'quick_wins' ? dosQws : {}) };
  if (temHistorico) for (const [t, v] of [...Object.entries(doHistorico), ...Object.entries(dosQws)]) base[t] = (base[t] || 0) + v;
  const total = Object.values(base).reduce((a, b) => a + b, 0) || 1;
  const pesos = Object.fromEntries(Object.entries(base).map(([t, v]) => [t, Math.round(v / total * 1000) / 1000]).sort((a, b) => b[1] - a[1]));
  // Principais: os que somam a maior parte do uso (no máximo três), na ordem do peso.
  const principais = [];
  let acumulado = 0;
  if (origem === 'padrao') principais.push(...Object.keys(USO_GERAL));
  else for (const [t, p] of Object.entries(pesos)) { if (principais.length >= 3 || (acumulado >= 0.8 && principais.length)) break; principais.push(t); acumulado += p; }
  const frase = origem === 'padrao'
    ? `Ainda há pouco uso registrado. A sugestão considera o uso geral de um escritório: ${lista(principais.map(t => USO[t]))}.`
    : `${origem === 'historico' ? 'Sua equipe usa a IA principalmente para' : 'Pelos Quick Wins da empresa, a equipe usa a IA principalmente para'} ${lista(principais.map(t => USO[t]))}.`;
  return { origem, pesos, principais, frase, decisoes: n, quickWins: qws };
}

// ---------------------------------------------------------------- política
export function politicaDaEmpresa(cfg, { plano = null, quickWinsSigilosos = 0, areasSigilosas = 0 } = {}) {
  const ligado = politicaSigiloLigada(cfg);
  const acoes = cfg.acoesChat || {};
  const protegidos = GRUPOS_DADO.filter(([, tipos]) => tipos.some(t => acoes[t] === 'proteger')).map(([nome]) => nome);
  const reserva = !!plano && ['reserva', 'esgotado'].includes(plano.fase);
  const partes = [ligado ? 'Dados sigilosos estão ligados' : 'Dados sigilosos estão desligados'];
  if (ligado && protegidos.length) partes.push(`${lista(protegidos)} só com proteção`);
  if (cfg.protecaoDadosPessoais !== false) partes.push('dados pessoais vão só para modelos que não treinam com eles');
  const curta = [ligado ? 'dados sigilosos ligados' : 'dados sigilosos desligados', ...(ligado && protegidos.length ? [`${lista(protegidos)} só com proteção`] : [])].join('; ');
  return {
    curta, sigiloLigado: ligado, protegidos, protecaoDadosPessoais: cfg.protecaoDadosPessoais !== false, plataforma: requisitosDe(cfg).plataforma,
    quickWinsSigilosos, areasSigilosas, reserva,
    frase: `${partes.join('; ')}.${reserva ? ' Os créditos do mês acabaram: até a renovação, só o nível Rápido responde.' : ''}`,
  };
}

// ---------------------------------------------------------------- custo relativo (sem preço na tela)
// Pelo preço por token comparado aos tetos dos níveis; sem preço conhecido, pelo nível do modelo.
export function palavraDeCusto(m) {
  const e = m?.precoEntrada, s = m?.precoSaida;
  if (Number.isFinite(e) && Number.isFinite(s) && e > 0) {
    if (e <= TETOS.rapido[0] / 1e6 && s <= TETOS.rapido[1] / 1e6) return 'econômico';
    if (e <= TETOS.equilibrado[0] / 1e6 && s <= TETOS.equilibrado[1] / 1e6) return 'médio';
    return 'alto';
  }
  return { rapido: 'econômico', equilibrado: 'médio', avancado: 'alto' }[m?.perfil] || 'médio';
}
// Teto de consumo do nível (o mesmo da inclusão automática nos níveis): sem preço conhecido, não há o que barrar.
export function dentroDoTeto(m) {
  const teto = TETOS[m?.perfil];
  if (!teto) return true;
  const e = m.precoEntrada, s = m.precoSaida;
  if (!Number.isFinite(e) || !Number.isFinite(s)) return true;
  return e <= teto[0] / 1e6 && s <= teto[1] / 1e6;
}

const afinidade = (id, pesos) => tarefasDoModelo(id).reduce((t, k) => t + (pesos[k] || 0), 0);
function motivoDeUso(id, uso, perfil) {
  const bons = uso.principais.filter(t => tarefasDoModelo(id).includes(t) && BOM_PARA[t]);
  if (bons.length) return `Bom para ${lista(bons.slice(0, 2).map(t => BOM_PARA[t]))}`;
  return { rapido: 'Rápido para o dia a dia', equilibrado: 'Atende bem a maior parte das tarefas', avancado: 'Para as tarefas mais difíceis' }[perfil] || 'Atende bem a maior parte das tarefas';
}

// Rota conferida pela plataforma, nos tipos certos; sem ela, não há garantia verificável a usar.
function rotaConferida(r) {
  if (!r || typeof r !== 'object') return null;
  const txt = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const rota = { fornecedor: txt(r.fornecedor), endpoint: txt(r.endpoint), retencaoZero: r.retencaoZero === true, semTreino: r.semTreino === true, em: r.em || null };
  return rota.fornecedor && rota.endpoint && rota.retencaoZero && rota.semTreino ? rota : null;
}

// ---------------------------------------------------------------- dados sigilosos
function sugestaoSigilo({ modelos, cfg, uso, politica }) {
  const recomendado = cfg.governanca?.modo !== 'manual';
  const candidatos = [], descartados = [];
  for (const m of modelos) {
    if (!m?.id || semRotaFixa(m.id)) continue;
    const fora = motivo => descartados.push({ id: m.id, nome: m.nome, motivo });
    if (m.vetadoPlataforma) { if (m.autorizacaoPlataforma || m.homologacaoEmpresa || m.liberado) fora('proibido_pela_plataforma'); continue; }
    const aprovado = !!(m.liberado && (m.sigilo?.elegivel ?? m.homologado));
    let acao = 'nenhuma', rota = aprovado ? m.sigilo?.rota || m.homologacao || null : null, origemRota = aprovado ? m.sigilo?.origem || 'empresa' : null;
    if (!aprovado) {
      if (m.noCatalogo === false) { if (m.autorizacaoPlataforma) fora('fora_do_catalogo'); continue; }
      const plat = rotaConferida(m.autorizacaoPlataforma);
      if (!plat) { if (m.liberado || m.homologacaoEmpresa) fora('sem_rota_conferida'); continue; }
      if (!dentroDoTeto(m)) { fora('acima_do_teto_do_nivel'); continue; }
      // A ação proposta: liberar (se preciso) e homologar pela empresa com a rota conferida pela plataforma.
      // A camada central decide se, depois disso, o recurso recebe informação sigilosa.
      const depois = { ...m, liberado: true, homologacaoEmpresa: { ...plat, quem: 'sugestão', justificativa: 'Sugestão da GreenIA' } };
      const a = avaliarRecurso(depois, cfg);
      if (!a.elegivel) { fora(a.motivos[0] || 'nao_elegivel'); continue; }
      acao = 'aprovar'; rota = plat; origemRota = 'plataforma';
    }
    const todos = paraTodos(cfg, m);
    const custo = palavraDeCusto(m);
    const pontos = (aprovado ? 10 : 0) + (todos ? 2 : 0) + afinidade(m.id, uso.pesos) + ({ econômico: 0.3, médio: 0.15, alto: 0 }[custo]) + (politica.reserva && m.perfil === 'rapido' ? 1 : 0);
    candidatos.push({ m, aprovado, acao, rota, origemRota, todos, custo, pontos });
  }
  candidatos.sort((a, b) => b.pontos - a.pontos || String(a.m.nome).localeCompare(String(b.m.nome)));
  const primeiro = candidatos[0];
  const segundo = primeiro && candidatos.find(c => fabricanteDe(c.m.id) !== fabricanteDe(primeiro.m.id));
  const escolhidos = [primeiro, segundo].filter(Boolean);
  const aprovados = modelos.filter(m => m.liberado && (m.sigilo?.elegivel ?? m.homologado)).map(m => ({ id: m.id, nome: m.nome, fabricante: nomeFabricante(m.id), nivel: NIVEIS[m.perfil] || null }));
  const fabricantesAprovados = new Set(aprovados.map(a => fabricanteDe(a.id)));
  const pendentes = escolhidos.filter(c => c.acao !== 'nenhuma');
  const sugeridos = escolhidos.map(c => ({
    id: c.m.id, nome: c.m.nome, fabricante: nomeFabricante(c.m.id), nivel: NIVEIS[c.m.perfil] || null, custo: c.custo,
    motivos: [motivoDeUso(c.m.id, uso, c.m.perfil), c.todos ? 'Disponível para todas as pessoas' : `Usado por quem tem o nível ${NIVEIS[c.m.perfil] || ''}`.trim()],
    garantia: 'Não guarda nem usa seus dados para treinar',
    acao: c.acao, jaAprovado: c.aprovado,
    oQueAcontece: c.aprovado ? 'Já está aprovado para dados sigilosos.'
      : `Passa a receber conversas sigilosas${c.m.liberado ? '' : ` e fica disponível no nível ${NIVEIS[c.m.perfil] || 'dele'}`}, sempre pela rota conferida pela plataforma.`,
    detalhes: {
      fornecedor: c.rota?.fornecedor || null, endpoint: c.rota?.endpoint || null, retencaoZero: c.rota?.retencaoZero === true, semTreino: c.rota?.semTreino === true,
      origem: c.origemRota === 'plataforma' || c.origemRota === 'recomendacao_da_plataforma' ? 'Rota autorizada pela plataforma' : 'Rota aprovada pela empresa',
      conferidaEm: c.rota?.em || null,
      registro: c.aprovado ? null : 'Fica registrado quem aprovou, quando, a rota usada e a justificativa automática. A Política de Uso ganha nova versão.',
    },
  }));
  const ligado = politica.sigiloLigado;
  const doisFabricantes = new Set(escolhidos.map(c => fabricanteDe(c.m.id))).size >= 2;
  const pronto = fabricantesAprovados.size >= 2;
  let situacao;
  if (pronto) situacao = 'pronto';
  else if (pendentes.length && doisFabricantes) situacao = 'aplicar';
  else if (pendentes.length) situacao = 'parcial';
  else situacao = 'impossivel';
  const pedir = politica.plataforma ? 'Peça à equipe da GreenIA para autorizar mais um modelo, de outro fabricante.'
    : 'Peça à equipe da GreenIA (suporte) a rota conferida de mais um modelo, de outro fabricante, ou aprove um modelo conferido por você em "Escolher outro modelo".';
  const titulo = {
    pronto: `Pronto: ${aprovados.length} modelos aprovados para dados sigilosos, de fabricantes diferentes.`,
    aplicar: pendentes.length === 2 ? 'Sugerimos aprovar estes 2 modelos, de fabricantes diferentes, para dados sigilosos.' : `Sugerimos aprovar ${pendentes[0]?.m.nome} para ter dois modelos de fabricantes diferentes.`,
    parcial: `Sugerimos aprovar ${pendentes[0]?.m.nome}. Ainda não há um segundo modelo, de outro fabricante, com garantias conferidas.`,
    impossivel: aprovados.length ? 'Ainda não há outro modelo, de outro fabricante, com garantias conferidas para sugerir.' : 'Ainda não há modelo com garantias conferidas para sugerir.',
  }[situacao];
  return {
    necessario: ligado && !pronto, situacao, titulo, oQueFazer: ['parcial', 'impossivel'].includes(situacao) ? pedir : null,
    aprovados, sugeridos, pendentes: pendentes.map(c => c.m.id), descartados,
    modo: recomendado ? 'recomendado' : 'manual',
    modoTexto: recomendado ? 'A empresa continua seguindo as recomendações da GreenIA.' : 'A empresa continua no modo manual.',
    confirmacao: pendentes.length ? `${lista(pendentes.map(c => c.m.nome))} ${pendentes.length === 1 ? 'passa' : 'passam'} a receber conversas sigilosas, sempre pela rota conferida pela plataforma, que não guarda nem usa os dados para treinar. Fica tudo registrado.` : null,
  };
}

// ---------------------------------------------------------------- níveis
function sugestaoNiveis({ modelos, cfg, uso, catalogo = [], politica }) {
  const porId = new Map(modelos.map(m => [m.id, m]));
  const doCatalogo = new Map((catalogo || []).map(m => [m.id, m]));
  const itens = Object.entries(NIVEIS).map(([perfil, nome]) => {
    const opcoes = [];
    POOLS_RECOMENDADOS.filter(p => p.perfil === perfil).forEach((p, ordem) => {
      const linha = porId.get(p.id), cat = doCatalogo.get(p.id);
      const m = linha ? { ...linha, precoEntrada: linha.precoEntrada ?? cat?.precoEntrada, precoSaida: linha.precoSaida ?? cat?.precoSaida } : cat ? { ...cat, perfil, liberado: false, noCatalogo: true } : null;
      if (!m || m.noCatalogo === false || semRotaFixa(p.id)) return;
      if (!dentroDoTeto({ ...m, perfil })) return;
      const pontos = afinidade(p.id, uso.pesos) + (PADRAO.padroes[perfil] === p.id ? BONUS_PADRAO : 0);
      opcoes.push({ m, pontos, ordem });
    });
    opcoes.sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);
    const top = opcoes[0]?.m || null;
    const atual = porId.get(cfg.padroes?.[perfil]) || null;
    const segue = !top || (atual?.id === top.id && !!atual.liberado && atual.perfil === perfil);
    return {
      nivel: perfil, nome,
      sugerido: top ? { id: top.id, nome: top.nome || top.id, fabricante: nomeFabricante(top.id), custo: palavraDeCusto({ ...top, perfil }), motivo: motivoDeUso(top.id, uso, perfil) } : null,
      atual: atual ? { id: atual.id, nome: atual.nome } : null,
      segue,
      texto: !top ? `Nenhum modelo da curadoria está disponível para o nível ${nome} agora.`
        : segue ? `${top.nome || top.id}: ${motivoDeUso(top.id, uso, perfil).toLowerCase()}.`
          : `Trocar ${atual ? atual.nome : 'o modelo atual'} por ${top.nome || top.id}: ${motivoDeUso(top.id, uso, perfil).toLowerCase()}.`,
    };
  });
  const segue = itens.every(i => i.segue);
  const recomendado = cfg.governanca?.modo !== 'manual';
  return {
    segue, itens,
    frase: segue ? 'Sua configuração já segue a sugestão.' : `A sugestão ajusta o modelo preferido de ${lista(itens.filter(i => !i.segue).map(i => i.nome))} para o uso da empresa.`,
    confirmacao: segue ? null : `${itens.filter(i => !i.segue).map(i => `${i.nome}: ${i.sugerido.nome}`).join('; ')}. ${recomendado ? 'A empresa continua seguindo as recomendações da GreenIA.' : 'A empresa continua no modo manual; os outros ajustes ficam como estão.'} As regras de dados sigilosos não mudam.`,
    protecaoDadosPessoais: politica.protecaoDadosPessoais,
  };
}

/**
 * Sugestão completa (função pura: tudo entra pelos argumentos).
 * @param {{ modelos: object[], cfg: object, uso: {decisoes: string[][], quickWins: object[]}, catalogo?: object[], plano?: object|null, quickWinsSigilosos?: number, areasSigilosas?: number }} e
 */
export function calcularSugestao({ modelos, cfg, uso: dadosUso = {}, catalogo = [], plano = null, quickWinsSigilosos = 0, areasSigilosas = 0 }) {
  const uso = usoDaEmpresa(dadosUso);
  const politica = politicaDaEmpresa(cfg, { plano, quickWinsSigilosos, areasSigilosas });
  const sigilo = sugestaoSigilo({ modelos, cfg, uso, politica });
  const niveis = sugestaoNiveis({ modelos, cfg, uso, catalogo, politica });
  // Uma frase só para o cartão: o uso (o que a empresa faz) e a política (o que pode ser enviado).
  const paraQuem = { historico: 'o uso da sua equipe', quick_wins: 'os Quick Wins da empresa', padrao: 'o uso geral de um escritório' }[uso.origem];
  const porque = `Escolhidos para ${paraQuem} (${lista(uso.principais.map(t => USO[t]))}) e para a sua política de dados (${politica.curta}).`;
  return { uso, politica, modo: cfg.governanca?.modo === 'manual' ? 'manual' : 'recomendado', porque, sigilo, niveis };
}

// ---------------------------------------------------------------- dados reais da empresa
export function entradasDaEmpresa(app) {
  const db = app.db, cfg = lerConfig(db);
  const desde = new Date(app.agora().getTime() - 90 * 864e5).toISOString();
  // Só os rótulos de tipo de tarefa das decisões: nenhum conteúdo de conversa.
  const decisoes = todos(db, "select tipos from roteamento where em >= ? and coalesce(teste, 0) = 0 and modo != 'externo'", desde).map(r => json(r.tipos, []));
  const qws = todos(db, "select especificacao, sigiloso from quick_wins where excluido_em is null and status != 'descartado'");
  return {
    modelos: lerModelos(db), cfg, catalogo: app.catalogo || [], plano: situacaoPlano(app),
    uso: { decisoes, quickWins: qws.map(q => ({ arquetipo: json(q.especificacao, {})?.arquetipo || null })) },
    quickWinsSigilosos: qws.filter(q => q.sigiloso).length,
    areasSigilosas: um(db, 'select count(*) as n from areas where sigilosa = 1').n,
  };
}
export const sugestaoDaEmpresa = app => calcularSugestao(entradasDaEmpresa(app));

// ---------------------------------------------------------------- aplicar
const justificativa = (s, pessoa) => `Sugestão da GreenIA para o uso da empresa (${lista(s.uso.principais.map(t => USO[t]))}) e a política de dados; aprovado por ${pessoa?.email || 'administrador'}.`;

export function aplicarSigilo(app, pessoa, s = sugestaoDaEmpresa(app)) {
  const alvos = s.sigilo.sugeridos.filter(x => x.acao === 'aprovar');
  if (!alvos.length) return [];
  const feitos = [];
  mudar(app, pessoa, 'model.suggestion_applied', { parte: 'sigilo', modelos: alvos.map(x => x.id), origem: 'sugestao' }, () => {
    const cfg = lerConfig(app.db);
    for (const x of alvos) {
      const m = lerModelos(app.db).find(y => y.id === x.id);
      // Confere de novo dentro da transação: a rota precisa continuar conferida e o veto não pode ter chegado.
      const plat = rotaConferida(m?.autorizacaoPlataforma);
      if (!m || m.vetadoPlataforma || !plat) throw erro(409, 'sugestao_mudou', 'A sugestão mudou enquanto você decidia. Abra a tela de novo para ver a sugestão atual.');
      const registro = { quem: pessoa?.email || null, em: app.agora().toISOString(), fornecedor: plat.fornecedor, endpoint: plat.endpoint, retencaoZero: true, semTreino: true, justificativa: justificativa(s, pessoa), origem: 'sugestao' };
      if (!avaliarRecurso({ ...m, liberado: true, homologacaoEmpresa: registro }, cfg).elegivel) throw erro(409, 'sugestao_mudou', 'A sugestão mudou enquanto você decidia. Abra a tela de novo para ver a sugestão atual.');
      if (!m.liberado) {
        exec(app.db, 'update modelos set liberado = 1, perfil = coalesce(perfil, ?) where id = ?', 'rapido', m.id);
        registrar(app, 'model.changed', pessoa?.id ?? null, { modelo: m.id, liberado: true, origem: 'sugestao' });
      }
      exec(app.db, 'update modelos set homologado = 1, homologacao = ? where id = ?', JSON.stringify(registro), m.id);
      registrar(app, 'model.certified', pessoa?.id ?? null, { modelo: m.id, fornecedor: plat.fornecedor, origem: 'sugestao' });
      feitos.push(m.id);
    }
  });
  return feitos;
}

export function aplicarNiveis(app, pessoa, s = sugestaoDaEmpresa(app)) {
  const trocar = s.niveis.itens.filter(i => !i.segue && i.sugerido);
  if (!trocar.length) return [];
  const cfg = lerConfig(app.db);
  const recomendado = cfg.governanca?.modo !== 'manual';
  const igualAoPadrao = s.niveis.itens.every(i => !i.sugerido || i.sugerido.id === PADRAO.padroes[i.nivel]);
  // Modo recomendado e sugestão igual à curadoria padrão: é exatamente "seguir as recomendações".
  if (recomendado && igualAoPadrao) {
    aplicarRecomendacoes(app, pessoa);
    registrar(app, 'model.suggestion_applied', pessoa?.id ?? null, { parte: 'niveis', padroes: Object.fromEntries(trocar.map(i => [i.nivel, i.sugerido.id])), origem: 'sugestao' });
    app.aoMudarModelos?.();
    return trocar.map(i => i.nivel);
  }
  // Senão, a mudança mínima: o modelo sugerido fica liberado no nível e passa a ser o preferido dele. Nada mais muda
  // (acesso, outros modelos, homologações); o modo de governança continua o mesmo.
  const catalogo = new Map((app.catalogo || []).map(m => [m.id, m]));
  mudar(app, pessoa, 'model.suggestion_applied', { parte: 'niveis', padroes: Object.fromEntries(trocar.map(i => [i.nivel, i.sugerido.id])), origem: 'sugestao' }, () => {
    const padroes = { ...cfg.padroes };
    for (const i of trocar) {
      const id = i.sugerido.id, c = catalogo.get(id);
      if (!um(app.db, 'select 1 from modelos where id = ?', id)) {
        if (!c) throw erro(409, 'sugestao_mudou', 'A sugestão mudou enquanto você decidia. Abra a tela de novo para ver a sugestão atual.');
        exec(app.db, 'insert into modelos (id, nome, fornecedor, preco_entrada, preco_saida, contexto) values (?, ?, ?, ?, ?, ?)', id, c.nome || id, fabricanteDe(id), c.precoEntrada ?? null, c.precoSaida ?? null, c.contexto ?? null);
      }
      exec(app.db, 'update modelos set liberado = 1, perfil = ? where id = ?', i.nivel, id);
      if (i.nivel === 'rapido' && padroes.chat === padroes.rapido) padroes.chat = id;
      padroes[i.nivel] = id;
    }
    salvarConfig(app.db, { padroes });
  });
  return trocar.map(i => i.nivel);
}

export function rotasSugestao(app, r) {
  // models.manage (permissaoAdmin): a mesma permissão das outras rotas de modelos.
  r.get('/api/admin/modelos/sugestao', () => sugestaoDaEmpresa(app), { admin: true });
  r.post('/api/admin/modelos/sugestao/aplicar', ({ pessoa, corpo }) => {
    const parte = corpo?.parte;
    if (!['sigilo', 'niveis', 'tudo'].includes(parte)) throw erro(400, 'parte', 'Escolha o que aplicar: sigilo, niveis ou tudo.');
    const antes = sugestaoDaEmpresa(app);
    const aprovados = parte === 'niveis' ? [] : aplicarSigilo(app, pessoa, antes);
    const niveis = parte === 'sigilo' ? [] : aplicarNiveis(app, pessoa, parte === 'tudo' ? sugestaoDaEmpresa(app) : antes);
    return { aplicado: { aprovados, niveis }, sugestao: sugestaoDaEmpresa(app) };
  }, { admin: true });
}
