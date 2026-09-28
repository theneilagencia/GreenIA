// Roteamento de modelos: antes de cada envio, a GreenIA analisa o pedido e escolhe o modelo mais
// adequado entre os que a empresa permite. A ordem é esta, e cada etapa só usa o que a anterior produziu:
//
//   1. Análise do pedido: sinais (tipo de tarefa, etapas, critérios, riscos, domínio, insatisfação)
//      e tamanhos (mensagem, anexos, histórico, documentos das bases, instruções). Só contagens e rótulos.
//   2. Requisitos de capacidade: cada dimensão (geral, raciocínio, programação, precisão, leitura de
//      grande volume, nova tentativa) pede um nível de 1 a 3; a exigência é o maior deles. A janela de
//      contexto é um requisito à parte: volume pede janela, não classe (resumir um arquivo enorme é
//      tarefa simples com janela grande).
//   3. Candidatos e RESTRIÇÕES (hard constraints, lista RESTRICOES): capacidade exigida (dimensão a
//      dimensão, contra as capacidades do modelo: as da classe, ou as informadas pelo admin), classe
//      mínima (quick win, nova tentativa), sigilo, reserva do plano, sem treino, permissão da pessoa e
//      janela de contexto. Cada modelo recebe TODOS os motivos que o impedem. Nenhuma preferência passa
//      por cima de uma restrição.
//   4. PREFERÊNCIAS (soft, PESOS): entre os que passaram, primeiro sai quem é dominado (outro modelo é
//      mais capaz e custa o mesmo ou menos); depois a utilidade pesa custo, margem de capacidade relevante,
//      modelo padrão da classe e janela para o histórico, com pesos da preferência da empresa.
//   5. Fallbacks explícitos: sem modelo suficiente permitido, o mais próximo do exigido, com as causas;
//      classe que não comporta o conteúdo, troca por janela (quick win fixo: só dentro da classe dele);
//      reserva de execução só quando passa pelas mesmas restrições. Todos ficam registrados.
//
// A classe continua sendo o que a empresa governa (acesso, plano, quick win, seletor, faixa de custo);
// ela só serve de capacidade quando o admin não informou capacidades para o modelo.
//
// A explicação mostrada à pessoa é montada a partir dos códigos da decisão (nunca de texto livre),
// e o registro de auditoria guarda os mesmos códigos, sem nenhum trecho do pedido.
import { lerModelos, perfisDe, ehGratuito, AUTO, AUTOMATICO } from './modelos.js';
export { AUTOMATICO };

export const VERSAO_ROTEADOR = '2.0';
export const NIVEL = { rapido: 1, equilibrado: 2, avancado: 3 };
const CLASSE_DO_NIVEL = { 1: 'rapido', 2: 'equilibrado', 3: 'avancado' };
export const NOME_CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };

// Tokens a partir de caracteres. Duas razões: a de custo (média do português) e a segura, usada para
// saber se cabe na janela (conteúdo com muitos números, código ou tabela gasta mais tokens por caractere).
const RAZAO = { prosa: { media: 3.6, segura: 3.0 }, denso: { media: 2.8, segura: 2.2 } };
export const MARGEM_JANELA = 0.9;   // usa no máximo 90% da janela do modelo
const densidade = s => { const a = String(s || '').slice(0, 20000); if (!a) return 'prosa'; const outros = (a.match(/[^\p{L}\s]/gu) || []).length; return outros / a.length > 0.25 ? 'denso' : 'prosa'; };
export function estimarTokens(texto, tipo = densidade(texto)) {
  const n = String(texto || '').length;
  return { media: Math.ceil(n / RAZAO[tipo].media), segura: Math.ceil(n / RAZAO[tipo].segura), tipo };
}
const tokensDe = (chars, tipo = 'prosa') => ({ media: Math.ceil(chars / RAZAO[tipo].media), segura: Math.ceil(chars / RAZAO[tipo].segura) });

// Tipos de tarefa. "nivel" é a exigência geral do tipo; raciocínio e programação têm dimensão própria.
export const TIPOS = {
  classificacao: { nome: 'classificação', nivel: 1, saida: 200, re: /\b(classifi|categoriz|rotul|separe por|triagem|qual (a )?categoria|e (positivo|negativo) ou|sim ou nao)/ },
  traducao: { nome: 'tradução', nivel: 1, saida: 700, re: /\b(traduz|tradu[cç]ao|translate|para o (ingles|espanhol|frances)|(para|em) (ingles|espanhol|frances)\b)/ },
  extracao: { nome: 'extração de informações', nivel: 1, saida: 600, re: /\b(extrai|extrair|liste (os|as|todos|todas)|localize|encontre (os|as|todos|todas)|quais (sao|foram) (os|as)|retire os dados|monte uma tabela|preencha|onde (esta|fica|aparece)|qual (e|foi) (o|a) (prazo|valor|data|numero|nome|total)|o que (o|a) \w+ diz)/ },
  edicao: { nome: 'edição e formatação', nivel: 1, saida: 700, re: /\b(tire|remova|apague|ordene|coloque|mova|renomeie|separe|organize|agrupe|deixe (mais|menos|em)|troque|substitua|formate|converta para)\b/ },
  sintese: { nome: 'síntese', nivel: 1, saida: 600, re: /\b(resum|sintetiz|principais pontos|pontos principais|em (\d+|tres|cinco|dez) (pontos|topicos|linhas)|tl;?dr)/ },
  redacao: { nome: 'geração de texto', nivel: 1, saida: 900, re: /\b(escrev|redij|redigir|rascunh|crie um (texto|email|e-mail|post|comunicado)|reescrev|melhore (o|este) texto|mais curto|mais formal|outro tom)/ },
  analise: { nome: 'análise', nivel: 2, saida: 1200, re: /\b(analis|compar|diferen[cç]a|confira|conferir|revis[ae]|audit|inconsist|diverg|identifique (os )?riscos|pontos fracos|encontre o (problema|erro))/ },
  programacao: { nome: 'programação', nivel: 1, saida: 1500, re: /(```|\b(codigo|funcao|script|sql|python|javascript|typescript|java|regex|expressao regular|api|endpoint|bug|stack ?trace|debug|refator|compil|query)\b)/ },
  raciocinio: { nome: 'raciocínio', nivel: 1, saida: 1500, re: /\b(por que|porque .*\?|justifiqu|pondere|estrateg|planej|decid|recomend|pr[oó]s e contras|cenario|hipotes|calcul|projet|estim|otimiz|passo a passo|diagnostic|causa raiz|trade-?off|propo(r|nha|nham)\b|proposta de solucao|solucao|arquitetura|melhor (forma|estrategia|abordagem|caminho|opcao)|como (devemos|deveriamos)|vale a pena|compensa|impacto|o que muda|quem (ganha|perde)|por onde comecar|devo |deveria(mos)? )/ },
};
const PRECISAO = {
  juridico: /\b(contrat|clausul|juridic|lei |legisla|parecer|processo judicial|lgpd|regulament|compliance)/,
  tributario: /\b(tribut|imposto|icms|iss\b|pis|cofins|danfe|sped|irpj)/,
  financeiro: /\b(financeir|balan[cç]o|fluxo de caixa|dre\b|demonstra[cç](ao|oes) (contab|financ)|or[cç]amento|margem|juros|investiment|valuation)/,
  saude: /\b(diagnostico medico|medicament|dosagem|laudo|paciente|clinic)/,
  exatidao: /\b(sem erros?|exat[ao]|precis[ao] (total|absoluta)|cada (item|linha|valor)|nao pode errar|confira todos)/,
};
// Consequência alta de erro (riscos, inconsistência, segurança, concorrência): sobe a exigência junto com domínio ou código.
const RISCO = /\b(riscos?|exposi[cç]|inconsist|obriga[cç]|vulnerab|seguranca|concorrencia|race condition|deadlock|fraude|conformidade)/;
const SIMPLES = /\b(simples|basic[ao]|curt[ao]|rapidinh[ao]|so (uma|um)|apenas (uma|um))\b/;
const CRITERIOS = /\b(considerando|levando em (conta|consideracao)|em termos de|avaliando|quanto a)\s+(?<lista>[^.?!;:]+)/;
// Falha explícita da resposta anterior. Só conta quando a frase abre a mensagem ou se refere à resposta
// ("sua resposta", "o código que você mandou"): "o login não funcionou para o cliente" é assunto, não falha.
// Frases soltas como "errado" ou "está faltando" são ambíguas: ficam registradas, mas não sobem a exigência.
const FALHA = '(nao (resolveu|funcionou|ajudou|serviu|atendeu|era isso|e isso)|continua (dando )?(erro|errado|falhando|com (o mesmo )?(erro|problema))|(esta|ficou|veio) (errad|incorret|incomplet)|refa[cç]a|tente de novo|tenta de novo|voce errou|voce nao entendeu)';
const FALHA_NO_INICIO = new RegExp(`^\\W*((ainda|mas|olha|hmm|nao|ok|bom),?\\s+)?${FALHA}`);
const FALHA_COM_REFERENCIA = new RegExp(`(sua resposta|a resposta( anterior)?|o que voce (mandou|sugeriu|escreveu|fez)|(esse|este|o|a) (codigo|texto|resultado|tabela|lista) que voce)[^.?!]{0,40}${FALHA}|${FALHA}[^.?!]{0,40}(sua resposta|a resposta( anterior)?|o que voce (mandou|sugeriu|escreveu|fez))`);
const FALHA_AMBIGUA = /\b(errad|incorret|esta faltando|ainda nao|melhore|piorou|nao entendeu|nao funcionou)/;

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Um tipo mencionado só para ser dispensado ("não precisa analisar", "sem análise profunda", "não quero
// um resumo") não conta; vale se aparecer de novo depois, sem a negação.
const NEGACAO = /(nao precisa( de)?|sem|nao quero( um| uma)?|dispensa|nada de)\s*$/;
function presente(re, t) {
  let resto = t, desloc = 0;
  for (let i = 0; i < 5; i++) {
    const m = re.exec(resto);
    if (!m) return false;
    if (!NEGACAO.test(t.slice(Math.max(0, desloc + m.index - 25), desloc + m.index))) return true;
    desloc += m.index + Math.max(1, m[0].length); resto = t.slice(desloc);
  }
  return false;
}

/**
 * 1. Análise do pedido: só sinais e tamanhos.
 * @param {object} p texto, anexos [{texto}], historicoChars, contextoChars (bases), sistemaChars,
 *   temResposta, anterior ({ nivel, classe } da decisão anterior da conversa), feedback ('nao_serviu'...).
 */
export function analisarPedido({ texto = '', anexos = [], historicoChars = 0, contextoChars = 0, sistemaChars = 0, temResposta = false, anterior = null, feedback = null }) {
  const t = normal(texto);
  const tipos = Object.entries(TIPOS).filter(([, v]) => presente(v.re, t)).map(([k]) => k);
  const anexoChars = anexos.reduce((s, a) => s + String(a.texto || '').length, 0);
  if (!tipos.length) tipos.push(anexos.length ? 'analise' : 'consulta');
  const perguntas = (texto.match(/\?/g) || []).length;
  const itens = (texto.match(/^\s*(\d+[.)]|[-*•])\s+/gm) || []).length;
  const crit = CRITERIOS.exec(t);
  const criterios = crit ? crit.groups.lista.split(/,|\s+e\s+/).map(x => x.trim()).filter(x => x.length > 2).length : 0;
  const codigoAnexo = anexos.some(a => /```|\b(function|def |class |import |const |return )/.test(String(a.texto || '').slice(0, 20000)));
  const codigo = /```|\b(function|def |class |select |const |=>)/.test(texto) || codigoAnexo;
  if (codigo && !tipos.includes('programacao')) tipos.push('programacao');   // código colado ou anexado é tarefa de programação
  const precisao = Object.entries(PRECISAO).filter(([, re]) => re.test(t)).map(([k]) => k);
  // Nova tentativa: falha explícita no texto (mensagem curta, sem anexo novo) ou "não serviu" marcado na
  // resposta anterior. O chamador só repassa o feedback se ele se refere à última resposta.
  const falhaTexto = temResposta && texto.length <= 400 && !anexos.length && (FALHA_NO_INICIO.test(t) || FALHA_COM_REFERENCIA.test(t));
  const insatisfacao = temResposta && (falhaTexto || feedback === 'nao_serviu');
  const insatisfacaoFonte = !insatisfacao ? null : falhaTexto ? 'texto' : 'feedback';

  // Tamanhos. O que é fixo (instruções, documentos das bases, mensagem e anexos atuais) precisa caber;
  // o histórico pode ser cortado (as mais antigas saem primeiro), então só é "desejável".
  const tipoMsg = densidade(texto + (anexos[0]?.texto || '').slice(0, 20000));
  const fixo = tokensDe(sistemaChars + contextoChars);
  const mensagem = tokensDe(texto.length + anexoChars, tipoMsg);
  const hist = tokensDe(historicoChars, tipoMsg);
  const saida = Math.max(...tipos.map(k => TIPOS[k]?.saida ?? 500));
  const reservaSaida = Math.max(1000, Math.round(saida * 1.5));
  const tokens = {
    fixo: fixo.segura, mensagem: mensagem.segura, historico: hist.segura, saida, reservaSaida,
    minimo: fixo.segura + mensagem.segura + reservaSaida,
    desejado: fixo.segura + mensagem.segura + hist.segura + reservaSaida,
    pedido: mensagem.media + Math.round(contextoChars / RAZAO.prosa.media),   // o que precisa ser lido e trabalhado agora
    custoEntrada: fixo.media + mensagem.media + hist.media,
    razaoSegura: RAZAO[tipoMsg].segura, densidade: tipoMsg,
  };
  const principal = tipos.slice().sort((a, b) => (TIPOS[b]?.nivel ?? 1) - (TIPOS[a]?.nivel ?? 1))[0];
  return {
    tipos, principal, precisao, insatisfacao, anterior, tokens,
    // compatibilidade com o registro: tokens de entrada (estimativa de custo) e de saída
    tokensEntrada: tokens.custoEntrada, tokensSaida: saida,
    sinais: { caracteres: texto.length, anexos: anexos.length, anexoChars, historicoChars, contextoChars, perguntas, itens, etapas: perguntas + itens, criterios, codigo,
      risco: RISCO.test(t), explicitoSimples: SIMPLES.test(t), feedbackAnterior: feedback || null, insatisfacaoFonte,
      insatisfacaoAmbigua: temResposta && !insatisfacao && FALHA_AMBIGUA.test(t) },
  };
}

// Análise que não pode falhar: usada quando a análise do texto quebra. Exigência padrão Equilibrado,
// tamanhos pelo que se sabe; a governança continua valendo por inteiro.
export function analiseIndisponivel({ texto = '', anexos = [], historicoChars = 0, contextoChars = 0, sistemaChars = 0 } = {}) {
  const chars = String(texto || '').length + anexos.reduce((s, a) => s + String(a?.texto || '').length, 0);
  const fixo = tokensDe(sistemaChars + contextoChars, 'denso'), msg = tokensDe(chars, 'denso'), hist = tokensDe(historicoChars, 'denso');
  const tokens = { fixo: fixo.segura, mensagem: msg.segura, historico: hist.segura, saida: 1200, reservaSaida: 1800, minimo: fixo.segura + msg.segura + 1800,
    desejado: fixo.segura + msg.segura + hist.segura + 1800, pedido: msg.media, custoEntrada: fixo.media + msg.media + hist.media, razaoSegura: RAZAO.denso.segura, densidade: 'denso' };
  return { falhou: true, tipos: ['indeterminado'], principal: 'indeterminado', precisao: [], insatisfacao: false, anterior: null, tokens, tokensEntrada: tokens.custoEntrada, tokensSaida: 1200,
    sinais: { caracteres: String(texto || '').length, anexos: anexos.length, etapas: 0, criterios: 0, codigo: false, risco: false, explicitoSimples: false } };
}

/**
 * 2. Requisitos. Dois tipos, tratados de forma diferente na seleção:
 *    - de capacidade (geral, raciocinio, programacao, precisao, leitura_longa): comparados com as
 *      capacidades de cada modelo, dimensão a dimensão;
 *    - de classe (quick_win, nova_tentativa): classe mínima, porque são decisões de governança
 *      (o quick win define a classe) ou de escalonamento (tentar uma classe acima).
 *    A preferência da empresa não mexe aqui: o mínimo que a tarefa pede não depende de orçamento.
 */
export const DIM_CAPACIDADE = ['geral', 'raciocinio', 'programacao', 'precisao', 'leitura_longa'];
const DIM_CLASSE = ['quick_win', 'nova_tentativa'];
export function requisitosDe(a, { piso = null } = {}) {
  const dim = {}, motivo = {};
  const pedir = (d, n, m) => { if (n > (dim[d] || 0)) { dim[d] = n; motivo[d] = m; } };
  const s = a.sinais, tem = k => a.tipos.includes(k);
  if (a.falhou) {
    pedir('geral', 2, 'analise_indisponivel');
  } else {
    const geral = Math.max(...a.tipos.map(k => TIPOS[k]?.nivel ?? 1));
    pedir('geral', geral, `tipo_${a.tipos.find(k => (TIPOS[k]?.nivel ?? 1) === geral) || a.principal}`);
    if ((s.etapas >= 3 || s.criterios >= 3) && geral < 3) pedir('geral', geral + 1, 'varias_etapas_ou_criterios');
    if (tem('raciocinio')) pedir('raciocinio', s.criterios >= 2 || s.etapas >= 3 ? 3 : 2, s.criterios >= 2 || s.etapas >= 3 ? 'raciocinio_multicriterio' : 'raciocinio');
    if (tem('programacao')) {
      const dificil = s.risco || tem('raciocinio') || (tem('analise') && a.tokens.mensagem > 1500);
      const simples = !dificil && s.explicitoSimples && !s.anexos;
      pedir('programacao', dificil ? 3 : simples ? 1 : 2, dificil ? 'programacao_com_risco_ou_analise' : simples ? 'programacao_simples' : 'programacao');
    }
    const dominios = a.precisao.filter(p => p !== 'exatidao');
    if (dominios.length) {
      const trabalha = a.tipos.some(k => ['analise', 'raciocinio', 'extracao'].includes(k));
      const n = trabalha && (s.risco || dominios.length >= 2) ? 3 : a.tipos.every(k => ['consulta', 'classificacao'].includes(k)) && s.caracteres < 200 ? 1 : 2;
      pedir('precisao', n, n === 3 ? 'precisao_alta' : n === 2 ? 'precisao_de_dominio' : 'precisao_baixa');
    }
    if (a.precisao.includes('exatidao') && a.tipos.some(k => ['extracao', 'analise'].includes(k))) pedir('precisao', 2, 'exatidao_exigida');
    // Leitura de grande volume: analisar ou extrair de muito conteúdo pede capacidade de leitura longa; resumir não.
    if (a.tipos.some(k => ['analise', 'extracao', 'raciocinio'].includes(k)) && a.tokens.pedido > 30000) pedir('leitura_longa', a.tokens.pedido > 150000 ? 3 : 2, 'analise_de_grande_volume');
  }
  // Quick win que deixa trocar: a classe dele é o piso (o responsável conhece a tarefa; o roteador só vê a mensagem).
  if (piso?.nivel) pedir('quick_win', piso.nivel, 'piso_do_quick_win');
  const base = Math.max(...Object.values(dim));
  // Nova tentativa: só com falha explícita (ver analisarPedido). Conservadora e limitada: sobe no máximo
  // uma classe acima do que a TAREFA pede (sem cadeia: falhas seguidas não sobem sem fim), e nunca fica
  // abaixo da classe que acabou de falhar.
  if (a.insatisfacao) {
    const antes = a.anterior?.nivel || base;
    const alvo = antes >= base ? Math.min(3, Math.max(antes, base + 1)) : base;   // nunca abaixo do que acabou de falhar
    const cod = antes >= 3 || base >= 3 ? 'resposta_anterior_nao_resolveu_sem_classe_acima' : antes > base ? 'resposta_anterior_nao_resolveu_limite' : 'resposta_anterior_nao_resolveu';
    if (alvo > (dim.nova_tentativa || 0)) { dim.nova_tentativa = alvo; motivo.nova_tentativa = cod; }
  }
  const nivel = Math.max(...Object.values(dim));
  const determinantes = Object.keys(dim).filter(d => dim[d] === nivel && (nivel > 1 || d === 'geral')).map(d => motivo[d]);
  const nucleo = Math.max(dim.geral || 1, dim.raciocinio || 0, dim.programacao || 0, dim.precisao || 0);
  const capacidade = Object.fromEntries(DIM_CAPACIDADE.filter(d => dim[d]).map(d => [d, dim[d]]));
  const classeMinima = Math.max(0, ...DIM_CLASSE.map(d => dim[d] || 0));
  return {
    nivel, classe: CLASSE_DO_NIVEL[nivel], dimensoes: dim, motivos: motivo, determinantes, capacidade, classeMinima,
    complexidade: nucleo >= 3 ? 'complexa' : nucleo === 2 ? 'intermediaria' : 'simples',
    janelaMinima: a.tokens.minimo, janelaDesejada: a.tokens.desejado,
  };
}
// Compatível com a versão anterior: { nivel, classe, motivos[] }.
export const nivelNecessario = a => { const r = requisitosDe(a); return { nivel: r.nivel, classe: r.classe, motivos: r.determinantes }; };

// Capacidades do modelo: por padrão, o nível da classe em todas as dimensões (a classe é o perfil
// declarado pela empresa). O admin pode informar capacidades explícitas quando um modelo foge do
// perfil da classe (ex.: um Equilibrado forte em programação). Só as dimensões informadas mudam.
export function capacidadesDe(m) {
  const base = NIVEL[m.perfil] || 1, exp = m.capacidades || {};
  return Object.fromEntries(DIM_CAPACIDADE.map(d => [d, [1, 2, 3].includes(exp[d]) ? exp[d] : base]));
}

// ---------------------------------------------------------------------------------------------
// RESTRIÇÕES (hard constraints): tiram o modelo da lista. Nenhuma preferência passa por cima delas.
// Cada uma devolve o código do motivo quando o modelo viola a regra.
export const RESTRICOES = [
  ['capacidade_insuficiente', (c, x) => DIM_CAPACIDADE.some(d => (x.req.capacidade[d] || 0) > c.cap[d]) || c.nivel < x.req.classeMinima],
  ['nao_homologado', (c, x) => x.sigilosa && !c.m.homologado],
  ['plano_na_reserva', (c, x) => x.reservaDoPlano && c.nivel > 1],
  ['gratuito_treina_com_dados', (c, x) => x.cfg.exigirSemTreino && ehGratuito(c.id)],
  ['sem_acesso_a_classe', (c, x) => !x.perfis.has(c.classe) && !(x.qw && c.classe === x.classeQw)],
  ['contexto_insuficiente', (c, x) => !cabe(c.m, x.req.janelaMinima)],
];
const GOVERNANCA = ['nao_homologado', 'plano_na_reserva', 'gratuito_treina_com_dados', 'sem_acesso_a_classe', 'contexto_insuficiente'];

// PREFERÊNCIAS (soft): só ordenam os modelos que passaram por todas as restrições.
// C: custo (log da razão sobre o mais barato do conjunto); Q: margem de capacidade relevante;
// D: modelo padrão da classe (curado pela empresa), só como desempate DENTRO da classe;
// H: janela que comporta todo o histórico (sem cortar mensagens antigas). Latência: só observada.
export const PESOS = {
  economia: { C: 1, Q: 0, D: 0, H: 0.3 },
  equilibrio: { C: 1, Q: 0.2, D: 0.7, H: 0.5 },
  qualidade: { C: 0.6, Q: 1.6, D: 0.5, H: 0.8 },
};
const custoDe = (m, entrada, saida) => (m.precoEntrada != null && m.precoSaida != null ? m.precoEntrada * entrada + m.precoSaida * saida : null);
const cabe = (m, t) => !m.contexto || t <= m.contexto * MARGEM_JANELA;
// Margem: só para tarefa que não é simples. Mede a capacidade RELEVANTE (as dimensões que definiram a
// exigência), não a classe: um modelo da mesma classe mais forte na dimensão exigida ganha margem; um de
// classe acima e igual naquela dimensão, não. Duas classes acima do mínimo é penalizado (gasto sem ganho).
const podeMargem = req => req.complexidade !== 'simples' || !!req.dimensoes.precisao || !!req.dimensoes.nova_tentativa;
function relevantes(req) {
  const caps = Object.entries(req.capacidade);
  const topo = Math.max(0, ...caps.map(([, n]) => n));
  const l = caps.filter(([, n]) => n === topo).map(([d]) => d);
  return l.length ? l : ['geral'];
}
function margemDe(c, req) {
  if (c.nivel - req.nivel >= 2) return -1;
  const alvo = Math.max(req.nivel, req.classeMinima);
  return Math.min(...relevantes(req).map(d => c.cap[d] - Math.max(req.capacidade[d] || 1, alvo))) >= 1 ? 1 : 0;
}
// Dominância: um modelo mais capaz (em todas as dimensões e na classe, e estritamente em alguma),
// que custa o mesmo ou menos e comporta o histórico pelo menos igual, elimina o outro. Evita que um
// desempate (como o padrão da classe) escolha um modelo pior e mais caro.
function domina(o, c) {
  if (o === c || o.custo == null || c.custo == null || o.custo > c.custo || o.nivel < c.nivel || Number(o.cabeTudo) < Number(c.cabeTudo)) return false;
  if (DIM_CAPACIDADE.some(d => o.cap[d] < c.cap[d])) return false;
  return o.nivel > c.nivel || DIM_CAPACIDADE.some(d => o.cap[d] > c.cap[d]);
}
const deficit = (c, req) => DIM_CAPACIDADE.reduce((s, d) => s + Math.max(0, (req.capacidade[d] || 0) - c.cap[d]), 0) + Math.max(0, req.classeMinima - c.nivel);

/**
 * 3 a 5. Candidatos, seleção e fallbacks.
 * @param {object} ctx { db, cfg, pessoa, qw, sigilosa, reservaDoPlano, pedido, analise, modeloManual, origem }
 *   origem: 'auto' | 'pessoa' | 'quick_win' | 'padrao' (de onde veio o pedido de classe)
 */
export function rotear({ db, cfg, pessoa, qw = null, sigilosa = false, reservaDoPlano = false, pedido, analise, modeloManual = null, origem = null }) {
  const a = analise, perfis = perfisDe(cfg, pessoa);
  const lista = lerModelos(db).filter(m => m.liberado && m.id !== AUTO);
  const classeQw = qwClasse(qw, lista);
  const qwFixo = qw && !qw.pode_trocar;
  const req = requisitosDe(a, { piso: qw && !qwFixo && !modeloManual && classeQw ? { nivel: NIVEL[classeQw] } : null });
  const preferencia = PESOS[cfg.roteamento?.preferencia] ? cfg.roteamento.preferencia : 'equilibrio';
  const P = PESOS[preferencia];
  const politicas = [];
  if (sigilosa) politicas.push('sigilosa_so_homologado');
  if (reservaDoPlano) politicas.push('plano_na_reserva_so_rapido');
  if (cfg.exigirSemTreino) politicas.push('fornecedor_sem_treino');
  if (qwFixo) politicas.push('quick_win_define_o_modelo');

  // Candidatos: todas as restrições avaliadas em todos os modelos; todos os motivos ficam registrados.
  const x = { req, sigilosa, reservaDoPlano, cfg, perfis, qw, classeQw };
  const candidatos = lista.map(m => {
    const c = { id: m.id, classe: m.perfil, nivel: NIVEL[m.perfil] || 1, cap: capacidadesDe(m), explicitas: !!m.capacidades, contexto: m.contexto,
      custo: custoDe(m, a.tokens.custoEntrada, a.tokens.saida), cabeTudo: cabe(m, req.janelaDesejada), padrao: cfg.padroes[m.perfil] === m.id, m };
    c.motivos = RESTRICOES.filter(([, viola]) => viola(c, x)).map(([cod]) => cod);
    return c;
  });
  const permitido = c => !c.motivos.some(y => GOVERNANCA.includes(y));
  const elegiveis = candidatos.filter(permitido);
  const suficientes = elegiveis.filter(c => !c.motivos.includes('capacidade_insuficiente'));

  // Preferências: dominância primeiro (tira quem é menos capaz e mais caro que outro), depois a utilidade.
  // Com a dominância, o bônus do padrão da classe não consegue escolher um modelo pior e mais caro.
  const pontuar = (conjunto, { margem = podeMargem(req) } = {}) => {
    const vivos = conjunto.filter(c => !conjunto.some(o => domina(o, c)));
    for (const c of conjunto) if (!vivos.includes(c)) { c.dominadoPor = conjunto.find(o => domina(o, c)).id; c.utilidade = null; }
    const conhecidos = vivos.map(c => c.custo).filter(v => v != null && v > 0);
    const min = conhecidos.length ? Math.min(...conhecidos) : 1, max = conhecidos.length ? Math.max(...conhecidos) : 1;
    for (const c of vivos) {
      const rel = (c.custo != null && c.custo > 0 ? c.custo : max * 1.5) / min;   // sem preço: tratado como mais caro
      c.utilidade = Math.round((-P.C * Math.log(rel) + (margem ? P.Q * margemDe(c, req) : 0) + P.D * Number(c.padrao) + P.H * Number(c.cabeTudo)) * 1000) / 1000;
    }
    return vivos.slice().sort((p, q) => q.utilidade - p.utilidade || (p.custo ?? Infinity) - (q.custo ?? Infinity) || p.id.localeCompare(q.id));
  };

  let escolhido = null, modo = 'automatico', motivoEscolha = null, fallback = null;
  if (modeloManual?.id === AUTO) {
    // Automático do OpenRouter: fora da governança da GreenIA. Só registrado.
    modo = 'openrouter_auto'; motivoEscolha = 'openrouter_decide';
    escolhido = { id: AUTO, classe: null, nivel: 0, custo: null, motivos: [], m: modeloManual };
  } else if (modeloManual) {
    modo = origem === 'quick_win' || qwFixo ? 'quick_win' : origem === 'padrao' ? 'padrao' : 'manual';
    escolhido = candidatos.find(c => c.id === modeloManual.id);
    if (!escolhido) return semModelo('modelo_pedido_fora_da_lista');
    // A classe pedida já passou pela validação de acesso; aqui decidem janela e regras.
    const bloqueio = escolhido.motivos.filter(y => GOVERNANCA.includes(y) && y !== 'sem_acesso_a_classe');
    if (bloqueio.includes('contexto_insuficiente') && bloqueio.length === 1) {
      // Troca por janela: quick win fixo só dentro da classe dele (e nunca se fixou um modelo técnico);
      // escolha da pessoa, para a mesma classe ou maior.
      const fixoPorModelo = qwFixo && !String(qw.modelo || '').startsWith('classe:');
      const opcoes = fixoPorModelo ? [] : elegiveis.filter(c => (qwFixo ? c.classe === escolhido.classe : c.nivel >= escolhido.nivel));
      const maiores = pontuar(opcoes, { margem: false });
      if (!maiores.length) return semModelo('contexto_insuficiente');
      fallback = { tipo: 'trocado_por_falta_de_contexto', de: escolhido.id, classePedida: escolhido.classe };
      escolhido = maiores[0];
    } else if (bloqueio.length) return semModelo(bloqueio[0]);
    motivoEscolha = modo === 'quick_win' ? 'definido_pelo_quick_win' : modo === 'padrao' ? 'padrao_da_empresa' : 'escolha_da_pessoa';
    if (escolhido.motivos.includes('capacidade_insuficiente')) fallback = fallback || { tipo: 'abaixo_do_necessario_por_escolha', classeNecessaria: req.classe, classeUsada: escolhido.classe };
  } else if (suficientes.length) {
    const ordem = pontuar(suficientes);
    escolhido = ordem[0];
    const maisBarato = suficientes.slice().sort((p, q) => (p.custo ?? Infinity) - (q.custo ?? Infinity))[0];
    motivoEscolha = suficientes.length === 1 ? 'unico_que_atende'
      : margemDe(escolhido, req) === 1 && podeMargem(req) && P.Q > 0 && escolhido !== maisBarato ? 'margem_de_capacidade'
        : escolhido === maisBarato ? 'menor_custo'
          : maisBarato.dominadoPor ? 'menor_custo_entre_os_nao_dominados'
            : escolhido.padrao ? 'padrao_da_classe' : escolhido.cabeTudo && !maisBarato.cabeTudo ? 'janela_para_o_historico' : 'melhor_utilidade';
  } else if (elegiveis.length) {
    // Nenhum permitido atende: o mais próximo do exigido (menor falta de capacidade), depois a utilidade.
    const menorFalta = Math.min(...elegiveis.map(c => deficit(c, req)));
    escolhido = pontuar(elegiveis.filter(c => deficit(c, req) === menorFalta), { margem: false })[0];
    // Causas: por que cada modelo MAIS capaz que o usado ficou de fora (regras, permissão, janela).
    const melhores = candidatos.filter(c => deficit(c, req) < menorFalta);
    const causas = [...new Set(melhores.flatMap(c => c.motivos.filter(y => GOVERNANCA.includes(y))))];
    if (!candidatos.some(c => deficit(c, req) === 0)) causas.push('nenhum_modelo_liberado_com_esta_capacidade');
    fallback = { tipo: 'abaixo_do_necessario', classeNecessaria: req.classe, classeUsada: escolhido.classe, causas: [...new Set(causas)] };
    motivoEscolha = 'mais_capaz_permitido';
  } else return semModelo(null);

  // Reserva de execução (outro modelo, se o escolhido falhar no fornecedor): só se passar pelas mesmas regras.
  let reserva = null, reservaDescartada = null;
  const idReserva = escolhido.m?.reserva;
  if (idReserva && modo !== 'openrouter_auto') {
    const r = candidatos.find(c => c.id === idReserva);
    const bloqueio = !r ? ['reserva_nao_liberada'] : r.motivos.filter(y => GOVERNANCA.includes(y) && !(y === 'sem_acesso_a_classe' && r.classe === escolhido.classe));
    if (sigilosa) reservaDescartada = 'sigilosa_sem_reserva';
    else if (bloqueio.length) reservaDescartada = bloqueio[0];
    else if (r.nivel < escolhido.nivel || DIM_CAPACIDADE.some(d => r.cap[d] < Math.min(escolhido.cap[d], req.capacidade[d] || 0))) reservaDescartada = 'reserva_de_classe_inferior';
    else if (qwFixo && r.classe !== escolhido.classe) reservaDescartada = 'reserva_fora_da_classe_do_quick_win';
    else reserva = r.id;
  }

  const ref = candidatos.find(c => c.id === cfg.padroes.avancado) || candidatos.filter(c => c.nivel === 3)[0];
  const decisao = {
    modelo: escolhido.m, modo, preferencia, requisitos: req, necessario: { nivel: req.nivel, classe: req.classe, motivos: req.determinantes },
    politicas, motivoEscolha, fallback, reserva, reservaDescartada,
    candidatos: candidatos.map(saida),
    elegiveisQueAtendem: suficientes.length,
    custoEstimado: modo === 'openrouter_auto' ? null : escolhido.custo ?? null, custoReferencia: modo === 'openrouter_auto' ? null : ref?.custo ?? null,
  };
  decisao.explicacao = explicar(a, decisao);
  return decisao;

  // Candidato no registro: o suficiente para reconstruir a decisão (capacidades, janela, custo, utilidade).
  function saida(c) {
    return { id: c.id, classe: c.classe, capacidades: c.explicitas ? c.cap : undefined, custo: c.custo === null ? null : Math.round(c.custo * 1e6) / 1e6, cabeTudo: c.cabeTudo,
      utilidade: c.utilidade ?? null, dominadoPor: c.dominadoPor || undefined,
      status: c === escolhido ? 'escolhido' : c.motivos.some(y => GOVERNANCA.includes(y)) ? 'excluido' : c.motivos.length ? 'insuficiente' : 'preterido', motivos: c.motivos };
  }
  function semModelo(causa) {
    const d = { modelo: null, modo, preferencia, requisitos: req, necessario: { nivel: req.nivel, classe: req.classe, motivos: req.determinantes }, politicas, motivoEscolha: null,
      fallback: { tipo: 'sem_modelo', causa, causas: [...new Set(candidatos.flatMap(c => c.motivos.filter(y => GOVERNANCA.includes(y))))] }, reserva: null, reservaDescartada: null,
      candidatos: candidatos.map(saida), elegiveisQueAtendem: 0, custoEstimado: null, custoReferencia: null };
    d.explicacao = explicar(a, d);
    return d;
  }
}
const qwClasse = (qw, lista) => (qw?.modelo?.startsWith('classe:') ? qw.modelo.slice(7) : lista.find(m => m.id === qw?.modelo)?.perfil);

// Orçamento, em caracteres, para o histórico enviado ao modelo escolhido: a mesma conta da seleção
// (janela × margem − instruções − documentos − reserva de saída), com a razão segura de caracteres por token.
export function orcamentoHistorico(analise, modelo) {
  const t = analise.tokens, janela = (modelo?.contexto || 32000) * MARGEM_JANELA;
  return Math.max(0, Math.floor((janela - t.fixo - t.reservaSaida) * t.razaoSegura));
}

// Textos da explicação: um por código. A explicação só usa códigos presentes na decisão.
export const TEXTO = {
  tipo_classificacao: 'classificação', tipo_traducao: 'tradução', tipo_extracao: 'extração de informações', tipo_sintese: 'síntese', tipo_redacao: 'geração de texto',
  tipo_consulta: 'consulta simples', tipo_edicao: 'edição e formatação', tipo_analise: 'análise', tipo_programacao: 'programação', tipo_raciocinio: 'raciocínio',
  varias_etapas_ou_criterios: 'várias etapas ou critérios', raciocinio: 'raciocínio', raciocinio_multicriterio: 'raciocínio com vários critérios',
  programacao: 'programação', programacao_simples: 'programação simples', programacao_com_risco_ou_analise: 'código com análise ou riscos (segurança, concorrência, desempenho)',
  precisao_baixa: 'assunto sensível em pedido curto', precisao_de_dominio: 'assunto que pede precisão', precisao_alta: 'assunto que pede precisão, com riscos ou inconsistências a apontar',
  exatidao_exigida: 'exatidão pedida item a item', analise_de_grande_volume: 'análise sobre grande volume de conteúdo',
  resposta_anterior_nao_resolveu: 'a resposta anterior não resolveu', resposta_anterior_nao_resolveu_limite: 'a resposta anterior não resolveu (subida limitada a uma classe acima do que a tarefa pede)',
  menor_custo_entre_os_nao_dominados: 'o de menor consumo entre os que não são superados por outro mais capaz e mais barato', resposta_anterior_nao_resolveu_sem_classe_acima: 'a resposta anterior não resolveu (já estava na classe mais alta)',
  analise_indisponivel: 'a análise automática não foi possível; usada a exigência padrão',
  unico_que_atende: 'o único modelo permitido que atende', menor_custo: 'o de menor consumo entre os que atendem', padrao_da_classe: 'o modelo padrão da classe, com consumo próximo do menor',
  margem_de_capacidade: 'uma classe acima do mínimo, pela preferência da empresa', janela_para_o_historico: 'o que comporta todo o histórico da conversa', melhor_utilidade: 'o melhor equilíbrio entre consumo e capacidade',
  mais_capaz_permitido: 'o mais capaz entre os permitidos', reserva_fora_da_classe_do_quick_win: 'a reserva é de outra classe e o quick win fixa a classe',
  nao_homologado: 'conversa sigilosa (só homologados)', plano_na_reserva: 'créditos do mês no fim (só Rápido)', gratuito_treina_com_dados: 'modelos gratuitos treinam com os dados',
  sem_acesso_a_classe: 'a pessoa não tem acesso à classe', contexto_insuficiente: 'janela de contexto pequena para este conteúdo', nenhum_modelo_liberado_com_esta_capacidade: 'a empresa não liberou modelo desta classe',
  sigilosa_so_homologado: 'conversa sigilosa: só modelos homologados', plano_na_reserva_so_rapido: 'créditos do mês no fim: só a classe Rápido',
  quick_win_define_o_modelo: 'o quick win define o modelo', piso_do_quick_win: 'classe mínima definida pelo quick win',
};
const PREF_NOME = { economia: 'Economia', equilibrio: 'Equilíbrio', qualidade: 'Qualidade' };
const nomeTipo = k => TIPOS[k]?.nome || (k === 'consulta' ? 'consulta' : k === 'indeterminado' ? 'pedido não analisado' : k);

// Explicação em linguagem simples, derivada só dos códigos da decisão.
export function explicar(a, d) {
  const req = d.requisitos, partes = [];
  const classe = d.modelo ? NOME_CLASSE[d.modelo.perfil] || d.modelo.perfil : null;
  if (d.modo === 'openrouter_auto') return 'Automático do OpenRouter, escolhido pela pessoa: fora da governança da GreenIA. O OpenRouter decide o modelo; a GreenIA só registra qual respondeu.';
  if (!d.modelo) partes.push('Nenhum modelo permitido pôde atender');
  else if (d.modo === 'automatico') partes.push(`Classe ${classe}, escolhida automaticamente pela GreenIA`);
  else if (d.modo === 'quick_win') partes.push(`Classe ${classe}, definida pelo quick win`);
  else if (d.modo === 'padrao') partes.push(`Classe ${classe}, padrão da empresa (roteamento automático desligado)`);
  else partes.push(`Classe ${classe}, escolhida pela pessoa`);
  const extras = [a.sinais.anexos ? `${a.sinais.anexos} ${a.sinais.anexos === 1 ? 'anexo' : 'anexos'}` : null].filter(Boolean);
  partes.push(`O pedido (${a.tipos.map(nomeTipo).join(', ')}${extras.length ? `; ${extras.join(', ')}` : ''}) exige a classe ${NOME_CLASSE[req.classe]}: ${req.determinantes.map(c => TEXTO[c] || c).join('; ')}`);
  const excluidosPorJanela = d.candidatos.filter(c => c.motivos.includes('contexto_insuficiente')).length;
  if (excluidosPorJanela) partes.push(`${excluidosPorJanela} ${excluidosPorJanela === 1 ? 'modelo ficou' : 'modelos ficaram'} de fora por janela de contexto pequena (cerca de ${Math.round(req.janelaMinima / 1000) || 1} mil tokens necessários)`);
  if (d.modo === 'automatico' && d.motivoEscolha && d.modelo && d.motivoEscolha !== 'mais_capaz_permitido') partes.push(`Escolhido ${TEXTO[d.motivoEscolha] || d.motivoEscolha}${d.motivoEscolha === 'margem_de_capacidade' || d.motivoEscolha === 'padrao_da_classe' ? ` (preferência ${PREF_NOME[d.preferencia]})` : ''}`);
  const f = d.fallback;
  if (f?.tipo === 'abaixo_do_necessario') partes.push(`A tarefa pedia a classe ${NOME_CLASSE[f.classeNecessaria]}, mas ${f.causas.map(c => TEXTO[c] || c).join('; ')}: usado o mais capaz permitido`);
  if (f?.tipo === 'abaixo_do_necessario_por_escolha') partes.push(`Atenção: pelo pedido, a classe indicada seria ${NOME_CLASSE[f.classeNecessaria]}`);
  if (f?.tipo === 'trocado_por_falta_de_contexto') partes.push(`O conteúdo não cabia na classe ${NOME_CLASSE[f.classePedida] || f.classePedida}; usado um modelo com janela maior`);
  if (f?.tipo === 'sem_modelo') partes.push(`Motivo: ${(f.causa ? [f.causa] : f.causas).map(c => TEXTO[c] || c).join('; ')}`);
  const pol = d.politicas.filter(p => p !== 'fornecedor_sem_treino').map(p => TEXTO[p]).filter(Boolean);
  return `${partes.join('. ')}.${pol.length ? ` Regras aplicadas: ${pol.join('; ')}.` : ''}`;
}
