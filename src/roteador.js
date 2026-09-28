// Roteamento de modelos: antes de cada envio, a GreenIA analisa o pedido e escolhe o modelo mais
// adequado entre os que a empresa permite. São três etapas, nesta ordem:
//
//   1. Análise do pedido: tipo de tarefa, complexidade, volume de contexto e exigência de precisão.
//      Só sinais (contagens e rótulos); o texto não é guardado nem sai daqui.
//   2. Governança: quais modelos podem ser usados agora (liberados, acesso da pessoa, quick win,
//      homologado em conversa sigilosa, reserva do plano, sem treino, janela de contexto).
//   3. Seleção: entre os permitidos, o de menor custo estimado que tenha a capacidade necessária
//      e comporte o contexto. Sem capacidade suficiente permitida, o mais capaz disponível, com registro.
//
// Cada decisão vira um registro auditável (tabela roteamento) com os critérios, as políticas aplicadas,
// os candidatos e o motivo de exclusão de cada um, e uma explicação em linguagem simples.
import { lerModelos, perfisDe, ehGratuito, AUTO, AUTOMATICO } from './modelos.js';
export { AUTOMATICO };

export const VERSAO_ROTEADOR = '1.0';
export const NIVEL = { rapido: 1, equilibrado: 2, avancado: 3 };
const CLASSE_DO_NIVEL = { 1: 'rapido', 2: 'equilibrado', 3: 'avancado' };
export const NOME_CLASSE = { rapido: 'Rápido', equilibrado: 'Equilibrado', avancado: 'Avançado' };
const CHARS_POR_TOKEN = 3.6;   // português, aproximado

// Tipos de tarefa: peso base de complexidade e tamanho típico da resposta (tokens).
export const TIPOS = {
  classificacao: { nome: 'classificação', peso: 1, saida: 200, re: /\b(classifi|categoriz|rotul|separe por|triagem|qual (a )?categoria|e (positivo|negativo) ou|sim ou nao)/ },
  traducao: { nome: 'tradução', peso: 1, saida: 700, re: /\b(traduz|tradu[cç]ao|translate|para o (ingles|espanhol|frances)|em (ingles|espanhol|frances)\b)/ },
  extracao: { nome: 'extração de informações', peso: 1.5, saida: 600, re: /\b(extrai|extrair|liste (os|as|todos|todas)|localize|encontre (os|as|o|a)|quais (sao|foram) (os|as)|retire os dados|monte uma tabela|preencha)/ },
  sintese: { nome: 'síntese', peso: 1.5, saida: 600, re: /\b(resum|sintetiz|principais pontos|pontos principais|em (\d+|tres|cinco|dez) (pontos|topicos|linhas)|tl;?dr)/ },
  redacao: { nome: 'geração de texto', peso: 1.5, saida: 900, re: /\b(escrev|redij|redigir|rascunh|crie um (texto|email|e-mail|post|comunicado)|reescrev|melhore (o|este) texto|mais curto|mais formal|outro tom)/ },
  analise: { nome: 'análise', peso: 3, saida: 1200, re: /\b(analis|compar|diferen[cç]a|confira|conferir|revis[ae]|audit|inconsist|diverg|identifique (os )?riscos|pontos fracos)/ },
  programacao: { nome: 'programação', peso: 3.5, saida: 1500, re: /(```|\b(codigo|c[oó]digo fonte|funcao|script|sql|python|javascript|typescript|java|regex|express[aã]o regular|api|endpoint|bug|stack ?trace|debug|refator|compil|query)\b)/ },
  raciocinio: { nome: 'raciocínio', peso: 4, saida: 1500, re: /\b(por que|porque .*\?|justifiqu|pondere|estrateg|planej|decid|recomend|pr[oó]s e contras|cenario|hipotes|calcul|projet|estim|otimiz|passo a passo|diagnostic|causa raiz|trade-?off)/ },
};
// Assuntos em que errar custa caro: pedem mais capacidade para reduzir erro.
const PRECISAO = {
  juridico: /\b(contrat|clausul|jur[ií]dic|lei |legisla|parecer|processo judicial|lgpd|regulament|compliance)/,
  tributario: /\b(tribut|imposto|icms|iss\b|pis|cofins|danfe|sped|irpj)/,
  financeiro: /\b(financeir|balan[cç]o|fluxo de caixa|dre\b|or[cç]amento|margem|juros|investiment|valuation)/,
  saude: /\b(diagn[oó]stico m[eé]dico|medicament|dosagem|laudo|paciente|cl[ií]nic)/,
  exatidao: /\b(sem erros?|exat[ao]|precis[ao] (total|absoluta)|cada (item|linha|valor)|n[aã]o pode errar|confira todos)/,
};
const INSATISFACAO = /\b(n[aã]o (est[aá]|ficou) (certo|correto|bom)|errad|incorret|refa[cç]a|tente de novo|n[aã]o era isso|n[aã]o entendeu|melhore a resposta|est[aá] faltando)/;

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * 1. Análise do pedido. Recebe o texto e os tamanhos; devolve só sinais, sem conteúdo.
 * @returns {{ tipos: string[], principal: string, complexidade: 'simples'|'intermediaria'|'complexa', pontuacao: number,
 *   precisao: string[], insatisfacao: boolean, tokensEntrada: number, tokensSaida: number, sinais: object }}
 */
export function analisarPedido({ texto = '', anexos = [], historicoChars = 0, contextoChars = 0, sistemaChars = 0, temResposta = false, preferencia = 'equilibrio' }) {
  const t = normal(texto);
  const tipos = Object.entries(TIPOS).filter(([, v]) => v.re.test(t)).map(([k]) => k);
  const anexoChars = anexos.reduce((s, a) => s + String(a.texto || '').length, 0);
  if (!tipos.length) tipos.push(anexos.length ? 'analise' : 'consulta');
  const perguntas = (texto.match(/\?/g) || []).length;
  const itens = (texto.match(/^\s*(\d+[.)]|[-*•])\s+/gm) || []).length;
  const codigo = /```|\b(function|def |class |select |const |=>)/.test(texto);
  const precisao = Object.entries(PRECISAO).filter(([, re]) => re.test(t)).map(([k]) => k);
  const insatisfacao = temResposta && INSATISFACAO.test(t);
  const tokensEntrada = Math.ceil((texto.length + anexoChars + historicoChars + contextoChars + sistemaChars) / CHARS_POR_TOKEN);

  // Pontuação de complexidade: o tipo mais exigente pesa; volume, estrutura e precisão somam.
  const base = Math.max(...tipos.map(k => TIPOS[k]?.peso ?? 1));
  const pontos = [['tipo', base]];
  const somar = (motivo, v) => { if (v) pontos.push([motivo, v]); };
  const tokensPedido = (texto.length + anexoChars) / CHARS_POR_TOKEN;
  somar('volume', tokensPedido > 100000 ? 3 : tokensPedido > 30000 ? 2 : tokensPedido > 8000 ? 1 : 0);
  somar('varios_anexos', anexos.length >= 2 ? 1 : 0);
  somar('varias_etapas', perguntas + itens >= 3 ? 1 : 0);
  somar('varios_tipos', tipos.length >= 3 ? 1 : 0);
  somar('codigo', codigo && texto.length > 800 ? 1 : 0);
  somar('precisao', precisao.length ? 1.5 : 0);
  somar('insatisfacao', insatisfacao ? 1.5 : 0);
  somar('pedido_curto', !anexos.length && texto.length < 80 && tipos.every(k => (TIPOS[k]?.peso ?? 1) < 3) ? -0.5 : 0);
  const pontuacao = Math.round(pontos.reduce((s, [, v]) => s + v, 0) * 10) / 10;
  // A preferência da empresa desloca os limites: economia exige mais para subir; qualidade, menos.
  const desloca = preferencia === 'economia' ? 0.75 : preferencia === 'qualidade' ? -0.75 : 0;
  const complexidade = pontuacao < 2.5 + desloca ? 'simples' : pontuacao < 4.5 + desloca ? 'intermediaria' : 'complexa';
  const principal = tipos.slice().sort((a, b) => (TIPOS[b]?.peso ?? 1) - (TIPOS[a]?.peso ?? 1))[0];
  const saidaBase = Math.max(...tipos.map(k => TIPOS[k]?.saida ?? 500));
  const tokensSaida = Math.round(saidaBase * (complexidade === 'complexa' ? 1.5 : complexidade === 'simples' ? 0.7 : 1));
  return {
    tipos, principal, complexidade, pontuacao, precisao, insatisfacao, tokensEntrada, tokensSaida,
    sinais: { caracteres: texto.length, anexos: anexos.length, anexoChars, historicoChars, contextoChars, perguntas, itens, codigo, pontos: Object.fromEntries(pontos) },
  };
}

// Capacidade mínima para o pedido: a complexidade define; precisão e programação têm piso.
export function nivelNecessario(a) {
  let n = a.complexidade === 'complexa' ? 3 : a.complexidade === 'intermediaria' ? 2 : 1;
  const motivos = [`complexidade_${a.complexidade}`];
  if (a.precisao.some(p => p !== 'exatidao') && a.tipos.some(k => ['analise', 'raciocinio', 'extracao'].includes(k)) && n < 2) { n = 2; motivos.push('precisao_exige_equilibrado'); }
  if (a.tipos.includes('programacao') && a.complexidade !== 'simples' && n < 3 && a.tipos.includes('raciocinio')) { n = 3; motivos.push('programacao_com_raciocinio'); }
  if (a.insatisfacao && n < 3) { n += 1; motivos.push('resposta_anterior_insatisfatoria'); }
  return { nivel: n, classe: CLASSE_DO_NIVEL[n], motivos };
}

const custoDe = (m, entrada, saida) => (m.precoEntrada != null && m.precoSaida != null ? m.precoEntrada * entrada + m.precoSaida * saida : null);
const cabe = (m, a) => !m.contexto || a.tokensEntrada + a.tokensSaida * 1.2 <= m.contexto * 0.9;

/**
 * 2 e 3. Governança e seleção.
 * @param {object} ctx { db, cfg, pessoa, qw, sigilosa, reservaDoPlano, pedido, analise }
 * pedido: AUTOMATICO, uma classe ("classe:x") ou um modelo; o quick win sem troca fixa o modelo dele.
 * @returns {{ modelo, modo, necessario, candidatos, politicas, explicacao, custoEstimado, custoReferencia }}
 */
export function rotear({ db, cfg, pessoa, qw = null, sigilosa = false, reservaDoPlano = false, pedido, analise, modeloManual = null }) {
  const a = analise, perfis = perfisDe(cfg, pessoa);
  const necessario = nivelNecessario(a);
  const politicas = [];
  if (sigilosa) politicas.push('sigilosa_so_homologado');
  if (reservaDoPlano) politicas.push('plano_na_reserva_so_rapido');
  if (cfg.exigirSemTreino) politicas.push('fornecedor_sem_treino');
  const qwFixo = qw && !qw.pode_trocar;
  if (qwFixo) politicas.push('quick_win_define_o_modelo');

  // Candidatos: todos os modelos liberados, cada um com o motivo de ficar de fora (ou nenhum).
  const lista = lerModelos(db).filter(m => m.liberado && m.id !== AUTO);
  const candidatos = lista.map(m => {
    const nivel = NIVEL[m.perfil] || 1;
    const doQw = !!qw && modeloManual?.id === m.id;
    let fora = null;
    if (sigilosa && !m.homologado) fora = 'nao_homologado';
    else if (reservaDoPlano && nivel > 1) fora = 'plano_na_reserva';
    else if (cfg.exigirSemTreino && ehGratuito(m.id)) fora = 'gratuito_treina_com_dados';
    else if (!perfis.has(m.perfil) && !doQw && !(qw?.pode_trocar && m.perfil === qwClasse(qw, lista))) fora = 'sem_acesso_a_classe';
    else if (!cabe(m, a)) fora = 'contexto_insuficiente';
    return { id: m.id, nome: m.nome, classe: m.perfil, nivel, homologado: m.homologado, contexto: m.contexto, custo: custoDe(m, a.tokensEntrada, a.tokensSaida), fora, m };
  });
  const elegiveis = candidatos.filter(c => !c.fora);
  const padraoDaClasse = c => cfg.padroes[c.classe] === c.id;
  const maisBarato = l => l.slice().sort((x, y) => (x.custo ?? Infinity) - (y.custo ?? Infinity) || Number(padraoDaClasse(y)) - Number(padraoDaClasse(x)))[0];

  let escolhido = null, modo = 'automatico';
  if (modeloManual) {
    // Classe escolhida pela pessoa ou modelo do quick win: respeita a escolha, mas não deixa estourar o contexto.
    modo = qwFixo ? 'quick_win' : qw && pedido === qw.modelo ? 'quick_win' : 'manual';
    escolhido = candidatos.find(c => c.id === modeloManual.id)
      || { id: modeloManual.id, classe: modeloManual.perfil, nivel: NIVEL[modeloManual.perfil] || 1, custo: null, fora: null, m: modeloManual };   // Automático do OpenRouter
    if (escolhido.fora === 'contexto_insuficiente') {
      const maior = maisBarato(elegiveis.filter(c => c.nivel >= escolhido.nivel));
      if (maior) { politicas.push('trocado_por_falta_de_contexto'); escolhido = maior; }
    } else if (escolhido.fora && escolhido.fora !== 'sem_acesso_a_classe') escolhido = null;   // o acesso já foi validado antes; aqui decidem contexto e regras
  } else {
    // Automático: o de menor custo com capacidade suficiente; sem ele, o mais capaz permitido.
    const suficientes = elegiveis.filter(c => c.nivel >= necessario.nivel);
    escolhido = maisBarato(suficientes) || null;
    if (!escolhido && elegiveis.length) {
      const topo = Math.max(...elegiveis.map(c => c.nivel));
      escolhido = maisBarato(elegiveis.filter(c => c.nivel === topo));
      politicas.push('capacidade_limitada_pelas_permissoes');
    }
  }
  // Referência: quanto custaria no modelo avançado padrão (mostra a economia do roteamento).
  const ref = candidatos.find(c => c.id === cfg.padroes.avancado) || candidatos.filter(c => c.nivel === 3)[0];
  const decisao = {
    modelo: escolhido?.m || null, modo, necessario, politicas,
    candidatos: candidatos.map(c => ({ id: c.id, classe: c.classe, custo: c.custo === null ? null : Math.round(c.custo * 1e6) / 1e6, status: c === escolhido ? 'escolhido' : c.fora || (c.nivel < necessario.nivel ? 'capacidade_insuficiente' : 'elegivel_mais_caro') })),
    custoEstimado: escolhido?.custo ?? null, custoReferencia: ref?.custo ?? null,
  };
  decisao.explicacao = explicar(a, decisao);
  return decisao;
}
const qwClasse = (qw, lista) => (qw?.modelo?.startsWith('classe:') ? qw.modelo.slice(7) : lista.find(m => m.id === qw?.modelo)?.perfil);

const TEXTO_POLITICA = {
  sigilosa_so_homologado: 'conversa sigilosa: só modelos homologados', plano_na_reserva_so_rapido: 'créditos do mês no fim: só a classe Rápido',
  fornecedor_sem_treino: 'só fornecedores que não treinam com os dados', quick_win_define_o_modelo: 'o quick win define o modelo',
  trocado_por_falta_de_contexto: 'o conteúdo não cabia no modelo pedido; usado um com janela maior',
  capacidade_limitada_pelas_permissoes: 'a tarefa pedia mais capacidade do que as classes liberadas para esta pessoa',
};
// Explicação em linguagem simples, montada só com rótulos e contagens.
export function explicar(a, d) {
  const partes = [];
  const classe = d.modelo ? NOME_CLASSE[d.modelo.perfil] || d.modelo.perfil : 'nenhum modelo';
  if (d.modo === 'automatico') partes.push(`Classe ${classe}, escolhida automaticamente`);
  else if (d.modo === 'quick_win') partes.push(`Classe ${classe}, definida pelo quick win`);
  else partes.push(`Classe ${classe}, escolhida pela pessoa`);
  const tipos = a.tipos.map(k => TIPOS[k]?.nome || (k === 'consulta' ? 'consulta' : k)).join(', ');
  partes.push(`pedido de ${tipos}, complexidade ${a.complexidade === 'intermediaria' ? 'intermediária' : a.complexidade}`);
  if (a.sinais.anexos) partes.push(`${a.sinais.anexos} ${a.sinais.anexos === 1 ? 'anexo' : 'anexos'}`);
  if (a.tokensEntrada > 8000) partes.push(`contexto de cerca de ${Math.round(a.tokensEntrada / 1000)} mil tokens`);
  if (a.precisao.length) partes.push(`assunto que pede precisão (${a.precisao.join(', ')})`);
  if (a.insatisfacao) partes.push('a resposta anterior não atendeu');
  const pol = d.politicas.filter(p => p !== 'fornecedor_sem_treino').map(p => TEXTO_POLITICA[p]).filter(Boolean);
  return `${partes.join('; ')}.${pol.length ? ` Regras aplicadas: ${pol.join('; ')}.` : ''}`;
}
