// Roteamento de modelos: antes de cada envio, a GreenIA analisa o pedido e escolhe o modelo mais
// adequado entre os que a empresa permite. A ordem é esta, e cada etapa só usa o que a anterior produziu:
//
//   1. Análise do pedido: sinais (tipo de tarefa, etapas, critérios, riscos, domínio, insatisfação)
//      e tamanhos (mensagem, anexos, histórico, documentos das bases, instruções). Só contagens e rótulos.
//   2. Requisitos de capacidade: cada dimensão (geral, raciocínio, programação, precisão, leitura de
//      grande volume, nova tentativa) pede um nível de 1 a 3; a exigência é o maior deles. A janela de
//      contexto é um requisito à parte: volume pede janela, não classe (resumir um arquivo enorme é
//      tarefa simples com janela grande).
//   3. Candidatos: todos os modelos liberados. Cada um recebe TODOS os motivos que o impedem: capacidade
//      abaixo da exigida, regras de governança (sigilo, reserva do plano, sem treino), permissão da
//      pessoa e janela de contexto. Governança e permissão só tiram candidatos; nunca escolhem.
//   4. Seleção: entre os que atendem e são permitidos, a maior utilidade. A utilidade pesa custo,
//      margem de capacidade, modelo padrão da classe (curado pela empresa) e janela para o histórico,
//      com pesos da preferência da empresa (Economia, Equilíbrio, Qualidade).
//   5. Fallbacks explícitos: sem modelo suficiente permitido, o mais capaz permitido, com as causas;
//      classe escolhida pela pessoa que não comporta o conteúdo, a menor com janela suficiente; reserva
//      de execução só quando passa pelas mesmas regras. Todos ficam registrados.
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
  extracao: { nome: 'extração de informações', nivel: 1, saida: 600, re: /\b(extrai|extrair|liste (os|as|todos|todas)|localize|encontre (os|as|todos|todas)|quais (sao|foram) (os|as)|retire os dados|monte uma tabela|preencha)/ },
  sintese: { nome: 'síntese', nivel: 1, saida: 600, re: /\b(resum|sintetiz|principais pontos|pontos principais|em (\d+|tres|cinco|dez) (pontos|topicos|linhas)|tl;?dr)/ },
  redacao: { nome: 'geração de texto', nivel: 1, saida: 900, re: /\b(escrev|redij|redigir|rascunh|crie um (texto|email|e-mail|post|comunicado)|reescrev|melhore (o|este) texto|mais curto|mais formal|outro tom)/ },
  analise: { nome: 'análise', nivel: 2, saida: 1200, re: /\b(analis|compar|diferen[cç]a|confira|conferir|revis[ae]|audit|inconsist|diverg|identifique (os )?riscos|pontos fracos|encontre o (problema|erro))/ },
  programacao: { nome: 'programação', nivel: 1, saida: 1500, re: /(```|\b(codigo|funcao|script|sql|python|javascript|typescript|java|regex|expressao regular|api|endpoint|bug|stack ?trace|debug|refator|compil|query)\b)/ },
  raciocinio: { nome: 'raciocínio', nivel: 1, saida: 1500, re: /\b(por que|porque .*\?|justifiqu|pondere|estrateg|planej|decid|recomend|pr[oó]s e contras|cenario|hipotes|calcul|projet|estim|otimiz|passo a passo|diagnostic|causa raiz|trade-?off|propo(r|nha|nham)\b|proposta de solucao|solucao|arquitetura|melhor (forma|estrategia|abordagem|caminho)|como (devemos|deveriamos))/ },
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
const INSATISFACAO = /\b(nao (esta|ficou) (certo|correto|bom)|errad|incorret|refa[cç]a|tente de novo|nao era isso|nao entendeu|melhore a resposta|esta faltando|nao (resolveu|funcionou|ajudou|serviu|atendeu)|continua (dando )?(erro|errado|falhando)|ainda (nao|da erro|esta errado)|piorou)/;

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * 1. Análise do pedido: só sinais e tamanhos.
 * @param {object} p texto, anexos [{texto}], historicoChars, contextoChars (bases), sistemaChars,
 *   temResposta, anterior ({ nivel, classe } da decisão anterior da conversa), feedback ('nao_serviu'...).
 */
export function analisarPedido({ texto = '', anexos = [], historicoChars = 0, contextoChars = 0, sistemaChars = 0, temResposta = false, anterior = null, feedback = null }) {
  const t = normal(texto);
  const tipos = Object.entries(TIPOS).filter(([, v]) => v.re.test(t)).map(([k]) => k);
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
  const insatisfacao = temResposta && (INSATISFACAO.test(t) || feedback === 'nao_serviu');

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
      risco: RISCO.test(t), explicitoSimples: SIMPLES.test(t), feedbackAnterior: feedback || null },
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
 * 2. Requisitos de capacidade: um nível (1 a 3) por dimensão; a exigência é o maior. A preferência
 *    da empresa não mexe aqui: o mínimo que a tarefa pede não depende de orçamento.
 * @returns {{ nivel, classe, dimensoes: object, motivos: object, determinantes: string[], complexidade, janelaMinima, janelaDesejada }}
 */
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
    // Leitura de grande volume: analisar ou extrair de muito conteúdo pede mais capacidade; resumir não.
    if (a.tipos.some(k => ['analise', 'extracao', 'raciocinio'].includes(k)) && a.tokens.pedido > 30000) pedir('volume', a.tokens.pedido > 150000 ? 3 : 2, 'analise_de_grande_volume');
  }
  // Quick win que deixa trocar: a classe dele é o piso (o responsável conhece a tarefa; o roteador só vê a mensagem).
  if (piso?.nivel) pedir('quick_win', piso.nivel, 'piso_do_quick_win');
  const base = Math.max(...Object.values(dim));
  // Nova tentativa: um nível acima do que foi usado da última vez (ou do que a tarefa pede, se for maior).
  if (a.insatisfacao) {
    const antes = a.anterior?.nivel || base;
    pedir('nova_tentativa', Math.min(3, Math.max(base, antes + 1)), antes >= 3 ? 'resposta_anterior_nao_resolveu_sem_classe_acima' : 'resposta_anterior_nao_resolveu');
  }
  const nivel = Math.max(...Object.values(dim));
  const determinantes = Object.keys(dim).filter(d => dim[d] === nivel && (nivel > 1 || d === 'geral')).map(d => motivo[d]);
  const nucleo = Math.max(dim.geral || 1, dim.raciocinio || 0, dim.programacao || 0, dim.precisao || 0);
  return {
    nivel, classe: CLASSE_DO_NIVEL[nivel], dimensoes: dim, motivos: motivo, determinantes,
    complexidade: nucleo >= 3 ? 'complexa' : nucleo === 2 ? 'intermediaria' : 'simples',
    janelaMinima: a.tokens.minimo, janelaDesejada: a.tokens.desejado,
  };
}
// Compatível com a versão anterior: { nivel, classe, motivos[] }.
export const nivelNecessario = a => { const r = requisitosDe(a); return { nivel: r.nivel, classe: r.classe, motivos: r.determinantes }; };

// Pesos da utilidade por preferência. C: custo (log da razão sobre o mais barato que atende);
// Q: margem de uma classe acima do mínimo; D: modelo padrão da classe (curado pela empresa);
// H: janela que comporta todo o histórico (sem cortar mensagens antigas).
export const PESOS = {
  economia: { C: 1, Q: 0, D: 0, H: 0.3 },
  equilibrio: { C: 1, Q: 0.2, D: 0.7, H: 0.5 },
  qualidade: { C: 0.6, Q: 1.6, D: 0.5, H: 0.8 },
};
const custoDe = (m, entrada, saida) => (m.precoEntrada != null && m.precoSaida != null ? m.precoEntrada * entrada + m.precoSaida * saida : null);
const cabe = (m, t) => !m.contexto || t <= m.contexto * MARGEM_JANELA;
// Margem de capacidade (Qualidade) só vale para tarefa que não é simples: comprar classe acima para
// traduzir, resumir ou classificar é gasto sem ganho. E só uma classe: duas acima é penalizado.
const podeMargem = req => req.complexidade !== 'simples' || !!req.dimensoes.precisao || !!req.dimensoes.nova_tentativa;
const termoMargem = excesso => (excesso === 1 ? 1 : excesso >= 2 ? -1 : 0);
const GOVERNANCA = ['nao_homologado', 'plano_na_reserva', 'gratuito_treina_com_dados', 'sem_acesso_a_classe', 'contexto_insuficiente'];

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

  // Candidatos: capacidade primeiro, depois governança, permissão e janela. Todos os motivos ficam.
  const candidatos = lista.map(m => {
    const nivel = NIVEL[m.perfil] || 1;
    const motivos = [];
    if (nivel < req.nivel) motivos.push('capacidade_insuficiente');
    if (sigilosa && !m.homologado) motivos.push('nao_homologado');
    if (reservaDoPlano && nivel > 1) motivos.push('plano_na_reserva');
    if (cfg.exigirSemTreino && ehGratuito(m.id)) motivos.push('gratuito_treina_com_dados');
    if (!perfis.has(m.perfil) && !(qw && m.perfil === classeQw)) motivos.push('sem_acesso_a_classe');
    if (!cabe(m, req.janelaMinima)) motivos.push('contexto_insuficiente');
    return { id: m.id, classe: m.perfil, nivel, contexto: m.contexto, custo: custoDe(m, a.tokens.custoEntrada, a.tokens.saida), cabeTudo: cabe(m, req.janelaDesejada), padrao: cfg.padroes[m.perfil] === m.id, motivos, m };
  });
  const permitido = c => !c.motivos.some(x => GOVERNANCA.includes(x));
  const elegiveis = candidatos.filter(permitido);
  const suficientes = elegiveis.filter(c => c.nivel >= req.nivel);

  // Utilidade: comparável só dentro de um conjunto (o custo é relativo ao mais barato dele).
  const pontuar = (conjunto, { margem = podeMargem(req) } = {}) => {
    const conhecidos = conjunto.map(c => c.custo).filter(v => v != null && v > 0);
    const min = conhecidos.length ? Math.min(...conhecidos) : 1, max = conhecidos.length ? Math.max(...conhecidos) : 1;
    for (const c of conjunto) {
      const rel = (c.custo != null && c.custo > 0 ? c.custo : max * 1.5) / min;   // sem preço: tratado como mais caro
      c.utilidade = Math.round((-P.C * Math.log(rel) + (margem ? P.Q * termoMargem(c.nivel - req.nivel) : 0) + P.D * Number(c.padrao) + P.H * Number(c.cabeTudo)) * 1000) / 1000;
    }
    return conjunto.slice().sort((x, y) => y.utilidade - x.utilidade || (x.custo ?? Infinity) - (y.custo ?? Infinity) || x.id.localeCompare(y.id));
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
    const bloqueio = escolhido.motivos.filter(x => GOVERNANCA.includes(x) && x !== 'sem_acesso_a_classe');
    if (bloqueio.includes('contexto_insuficiente') && bloqueio.length === 1) {
      const maiores = pontuar(elegiveis.filter(c => c.nivel >= escolhido.nivel), { margem: false });
      if (!maiores.length) return semModelo('contexto_insuficiente');
      fallback = { tipo: 'trocado_por_falta_de_contexto', de: escolhido.id, classePedida: escolhido.classe };
      escolhido = maiores[0];
    } else if (bloqueio.length) return semModelo(bloqueio[0]);
    motivoEscolha = modo === 'quick_win' ? 'definido_pelo_quick_win' : modo === 'padrao' ? 'padrao_da_empresa' : 'escolha_da_pessoa';
    if (escolhido.nivel < req.nivel) fallback = fallback || { tipo: 'abaixo_do_necessario_por_escolha', classeNecessaria: req.classe, classeUsada: escolhido.classe };
  } else if (suficientes.length) {
    const ordem = pontuar(suficientes);
    escolhido = ordem[0];
    const maisBarato = suficientes.slice().sort((x, y) => (x.custo ?? Infinity) - (y.custo ?? Infinity))[0];
    motivoEscolha = suficientes.length === 1 ? 'unico_que_atende'
      : escolhido.nivel > req.nivel ? 'margem_de_capacidade'
        : escolhido === maisBarato ? 'menor_custo'
          : escolhido.padrao ? 'padrao_da_classe' : escolhido.cabeTudo && !maisBarato.cabeTudo ? 'janela_para_o_historico' : 'melhor_utilidade';
  } else if (elegiveis.length) {
    // Nenhum permitido atende: o mais capaz permitido. As causas são os motivos que tiraram os capazes.
    const topo = Math.max(...elegiveis.map(c => c.nivel));
    escolhido = pontuar(elegiveis.filter(c => c.nivel === topo), { margem: false })[0];
    const capazes = candidatos.filter(c => c.nivel >= req.nivel);
    const causas = [...new Set(capazes.flatMap(c => c.motivos.filter(x => GOVERNANCA.includes(x))))];
    fallback = { tipo: 'abaixo_do_necessario', classeNecessaria: req.classe, classeUsada: escolhido.classe, causas: capazes.length ? causas : ['nenhum_modelo_liberado_com_esta_capacidade'] };
    motivoEscolha = 'mais_capaz_permitido';
  } else return semModelo(null);

  // Reserva de execução (outro modelo, se o escolhido falhar no fornecedor): só se passar pelas mesmas regras.
  let reserva = null, reservaDescartada = null;
  const idReserva = escolhido.m?.reserva;
  if (idReserva && modo !== 'openrouter_auto') {
    const r = candidatos.find(c => c.id === idReserva);
    const bloqueio = !r ? ['reserva_nao_liberada'] : r.motivos.filter(x => GOVERNANCA.includes(x) && !(x === 'sem_acesso_a_classe' && r.classe === escolhido.classe));
    if (sigilosa) reservaDescartada = 'sigilosa_sem_reserva';
    else if (bloqueio.length) reservaDescartada = bloqueio[0];
    else if (r.nivel < escolhido.nivel) reservaDescartada = 'reserva_de_classe_inferior';
    else reserva = r.id;
  }

  const ref = candidatos.find(c => c.id === cfg.padroes.avancado) || candidatos.filter(c => c.nivel === 3)[0];
  const decisao = {
    modelo: escolhido.m, modo, preferencia, requisitos: req, necessario: { nivel: req.nivel, classe: req.classe, motivos: req.determinantes },
    politicas, motivoEscolha, fallback, reserva, reservaDescartada,
    candidatos: candidatos.map(c => ({ id: c.id, classe: c.classe, custo: c.custo === null ? null : Math.round(c.custo * 1e6) / 1e6, utilidade: c.utilidade ?? null,
      status: c === escolhido ? 'escolhido' : c.motivos.some(x => GOVERNANCA.includes(x)) ? 'excluido' : c.motivos.length ? 'insuficiente' : 'preterido', motivos: c.motivos })),
    elegiveisQueAtendem: suficientes.length,
    custoEstimado: modo === 'openrouter_auto' ? null : escolhido.custo ?? null, custoReferencia: modo === 'openrouter_auto' ? null : ref?.custo ?? null,
  };
  decisao.explicacao = explicar(a, decisao);
  return decisao;

  function semModelo(causa) {
    const capazes = candidatos.filter(c => c.nivel >= req.nivel);
    const d = { modelo: null, modo, preferencia, requisitos: req, necessario: { nivel: req.nivel, classe: req.classe, motivos: req.determinantes }, politicas, motivoEscolha: null,
      fallback: { tipo: 'sem_modelo', causa, causas: [...new Set(candidatos.flatMap(c => c.motivos.filter(x => GOVERNANCA.includes(x))))] }, reserva: null, reservaDescartada: null,
      candidatos: candidatos.map(c => ({ id: c.id, classe: c.classe, custo: c.custo === null ? null : Math.round(c.custo * 1e6) / 1e6, utilidade: null, status: c.motivos.some(x => GOVERNANCA.includes(x)) ? 'excluido' : 'insuficiente', motivos: c.motivos })),
      elegiveisQueAtendem: 0, custoEstimado: null, custoReferencia: null, capazes: capazes.length };
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
  tipo_consulta: 'consulta simples', tipo_analise: 'análise', tipo_programacao: 'programação', tipo_raciocinio: 'raciocínio',
  varias_etapas_ou_criterios: 'várias etapas ou critérios', raciocinio: 'raciocínio', raciocinio_multicriterio: 'raciocínio com vários critérios',
  programacao: 'programação', programacao_simples: 'programação simples', programacao_com_risco_ou_analise: 'código com análise ou riscos (segurança, concorrência, desempenho)',
  precisao_baixa: 'assunto sensível em pedido curto', precisao_de_dominio: 'assunto que pede precisão', precisao_alta: 'assunto que pede precisão, com riscos ou inconsistências a apontar',
  exatidao_exigida: 'exatidão pedida item a item', analise_de_grande_volume: 'análise sobre grande volume de conteúdo',
  resposta_anterior_nao_resolveu: 'a resposta anterior não resolveu', resposta_anterior_nao_resolveu_sem_classe_acima: 'a resposta anterior não resolveu (já estava na classe mais alta)',
  analise_indisponivel: 'a análise automática não foi possível; usada a exigência padrão',
  unico_que_atende: 'o único modelo permitido que atende', menor_custo: 'o de menor consumo entre os que atendem', padrao_da_classe: 'o modelo padrão da classe, com consumo próximo do menor',
  margem_de_capacidade: 'uma classe acima do mínimo, pela preferência da empresa', janela_para_o_historico: 'o que comporta todo o histórico da conversa', melhor_utilidade: 'o melhor equilíbrio entre consumo e capacidade',
  mais_capaz_permitido: 'o mais capaz entre os permitidos',
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
