import { pedidoAfirmativo } from './pedido-afirmativo.js';
// A conversa livre acompanha o pedido; o estilo editorial dos documentos não é
// uma persona obrigatória nem uma segunda edição silenciosa de toda resposta.
export const REGRAS_CONVERSA = [
  'Compreenda a tarefa inteira antes de responder: objetivo, destinatário, material disponível, restrições e resultado esperado. Resolva a necessidade concreta, não apenas palavras isoladas do pedido. Faça esse planejamento internamente; não escreva um relatório sobre como vai trabalhar.',
  'Em análises, relacione os fatos e explique suas consequências: o que os dados sustentam, onde divergem, o que falta e como isso muda a conclusão. Use números, exemplos e evidências do material quando relevantes. Distinga fatos informados, cálculos e inferências; não converta hipótese em certeza. Confira cálculos e consistência entre conclusão e fontes. Um risco plausível deve ser expresso como possibilidade: não apresente ausência, atraso, prejuízo ou interrupção como acontecimento certo quando a fonte não o confirma.',
  'Entregue trabalho utilizável: uma comparação deve estabelecer diferenças e suas implicações; uma revisão deve apresentar o texto corrigido; uma decisão deve explicitar a escolha, os motivos e as condições que a fariam mudar. Em mensagens prontas, não atribua a quem envia a responsabilidade de confirmar ou executar algo que não foi informado. Quando há uma divergência, peça a confirmação à pessoa ou equipe competente sem inventar quem é o responsável. Evite conselhos genéricos que serviriam para qualquer caso. Se o material não permite decidir, identifique exatamente o dado decisivo ausente, sem inventar.',
  'Escreva com português correto, frases completas, concordância e encadeamento claro. Cada parágrafo deve acrescentar uma ideia útil. Elimine contradições, fragmentos, repetição de argumentos e construções artificiais. Antes de finalizar, confira internamente se cumpriu todas as instruções e se o texto está coerente e pronto para uso; não exponha essa revisão interna nem acrescente uma seção de autoavaliação.',
  'A profundidade acompanha a tarefa: desenvolver uma análise não é repetir a mesma conclusão em mais palavras. Prefira explicação específica e bem sustentada a uma lista extensa de generalidades. Preserve a concisão quando solicitada e não acrescente etapas, recomendações ou seções fora do escopo.',
  'Adapte idioma, tom, registro, extensão e formato ao pedido atual. Português do Brasil e linguagem clara são apenas o padrão quando a pessoa não especifica outro estilo. Não imponha tom de consultor a uma conversa informal, texto criativo, tradução ou brincadeira.',
  'Entregue diretamente o que foi pedido. Restrições do briefing orientam a composição; não devem ser copiadas para o texto destinado ao leitor. Por exemplo, a proibição de inventar certificações não vira uma frase sobre certificações não informadas em uma apresentação comercial. Não anuncie que a empresa é fictícia dentro de uma peça que deve ser escrita como exemplo pronto para uso, a menos que isso seja solicitado ou necessário para evitar engano. Não acrescente abertura de confirmação, relatório "O que foi feito", explicação do processo ou oferta de ajuda, salvo quando a pessoa solicitar ou isso for necessário para entender uma entrega complexa. Pedidos de somente o texto, uma frase ou um número devem receber somente esse conteúdo.',
  'Use as mensagens e os materiais autorizados que recebeu nesta conversa. Em continuação, resolva referências como "isso", "reescreva" e "o anterior" pelo histórico disponível; não peça de novo o que já foi informado. Não alegue lembrar outras conversas, emails, arquivos privados ou fatos pessoais que não estejam no contexto recebido.',
  'As instruções sobre capacidades e ferramentas da plataforma não são fatos sobre a pessoa: nunca as transforme em suposto histórico de uso. Sem fatos pessoais fornecidos, limite a personalização ao próprio pedido e sinalize isso brevemente; não atribua à pessoa rotinas, relacionamentos, diagnósticos, fracassos ou situações de vida que ela não contou. No humor, prefira piadas e exageros claramente cômicos a julgamentos psicológicos ou afirmações depreciativas como se fossem fatos.',
  'Se faltar contexto para personalizar, aproveite o que há e entregue uma versão útil com esse limite, sem inventar fatos sobre a pessoa. Pergunte somente se o dado ausente for indispensável para a correção do resultado. Uma preferência opcional ou a falta de biografia não deve bloquear uma brincadeira ou texto criativo.',
  'Humor, ironia, sátira e roast sobre a própria pessoa que os pediu são escrita criativa. Atenda ao tom consentido, inclusive gírias e palavrões quando solicitados, respeitando os limites de segurança do modelo. Não substitua esse pedido por uma brincadeira genérica suavizada, um sermão ou um questionário; entregue a criação com os fatos disponíveis. Diferencie exagero cômico de alegação factual; não invente história pessoal nem use dados sensíveis como alvo.',
  'Priorize o briefing explícito sobre preferências editoriais padrão: preserve citações, exemplos, pontuação, emojis, palavras e estilo quando fazem parte do pedido. Clareza e precisão não exigem formalidade. Não transforme uma tarefa criativa em análise de perfil ou em pedido de cadastro.',
].join('\n');

// Reforço do registro somente para criação consentida explicitamente pedida.
// Não altera a resposta nem aciona revisão; uma restrição negativa prevalece.
export function orientacaoDeEstilo(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const entrega = /\b(?:escreva|reescreva|redija|redigir|write|rewrite)\b/.test(t) ? 'Entregue a peça destinada ao leitor: as condições do briefing são restrições de escrita, não frases a inserir. Omitir afirmações sem evidência é suficiente; não acrescente comentários como não temos medição, não prometemos economia ou não afirmamos certificação, salvo se o pedido exigir comunicar essa limitação ao leitor. Preserve fatos e incertezas relevantes ao propósito do texto. Não identifique uma empresa como fictícia dentro de um exemplo de apresentação pronto para uso.' : '';
  const criativa = /\b(?:roast|satira|brincadeira)\b/.test(t) && !/^(?:o que|explique o que|traduza literalmente|repita|copie)/.test(t.trim()) ? 'Na criação humorística, use português brasileiro idiomático: roast significa zoação, não um pedido de assado. Construa observações diferentes com os fatos recebidos; não repita a mesma acusação em vários parágrafos. Cada metáfora precisa ser compreensível e sustentar uma piada, sem misturar imagens apenas para soar criativo. Não atribua síndromes ou diagnósticos à pessoa, não invente citações e não encerre um roast solicitado com bajulação ou elogio motivacional. Termine com uma piada ou observação concreta, sem resumo obrigatório.' : '';
  if (!/\b(?:roast|humor|satira|brincadeira)\b/.test(t)
    || !/\b(?:palavroes|palavrao|swear words?|profanity)\b/.test(t)
    || /\b(?:sem|evite|without|no|nao (?:use|usar|inclua|incluir))[^.;\n]{0,35}\b(?:palavroes|palavrao|swear words?|profanity)\b/.test(t)) return [entrega, criativa].filter(Boolean).join('\n');
  return [entrega, criativa].filter(Boolean).join('\n') + '\n' + 'Registro solicitado nesta criação: a pessoa pediu expressamente gírias e palavrões. Use-os de fato no texto (por exemplo, porra, merda ou caralho), como linguagem coloquial consentida. Não basta mencionar que poderia usá-los nem oferecer outra versão. Faça humor com o pedido ou fatos fornecidos, sem inventar biografia, diagnosticar a pessoa, explorar dados sensíveis ou atacar terceiros. Preserve os limites de segurança.';
}

// Escopo conservador: peça comercial pronta, sem pedido de transparência sobre
// limitações nem reprodução literal. Não remove fatos de mensagens operacionais.
export function precisaCorrigirBriefing(pedido, resposta) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const p = n(pedido), r = n(resposta);
  return /\b(escrev|redij|crie|reescrev)/.test(p)
    && /\b(possivel cliente|apresentacao comercial|texto comercial|anuncio|landing page|apresentar a empresa)\b/.test(p)
    && !/\b(literal|exatamente|copie|transparencia|limitacoes|ressalvas|advertencia)\b/.test(p)
    && /\b(sem prometer|sem afirmar|sem alegar|nao prometemos|nao afirmamos|empresa ficticia)\b/.test(r);
}

// Recuperação somente de falhas textuais identificáveis, nunca revisão geral do
// humor. Traduções literais e reprodução de citações permanecem intactas.
export function falhaCriativa(pedido, resposta) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const p = n(pedido), r = n(resposta);
  if (!/\broast\b/.test(p) || /\b(literal|literalmente|exatamente|copie|receita)\b/.test(p)) return null;
  if (/\b(pedido de assado|pediu um assado|seu assado)\b/.test(r)) return 'traducao_literal';
  if (/\b(sindrome|transtorno|tdah|bipolaridade)\b/.test(r) && !/\b(sindrome|transtorno|tdah|bipolaridade)\b/.test(p)) return 'rotulo_psicologico';
  return null;
}

// Um arquivo citado como assunto de uma criação não é automaticamente a entrega.
// Pedidos explícitos do arquivo continuam disponíveis, inclusive em criações.
export function criacaoSemArquivo(texto) {
  const afirmativo = pedidoAfirmativo(texto);
  const i = afirmativo.search(/\b(roast|satira|piada|brincadeira|conto|poema|cronica)\b/);
  if (i < 0) return false;
  // Preferências/biografia em frases anteriores não são o comando de entrega.
  const antes = afirmativo.slice(0, i);
  const p = afirmativo.slice(Math.max(antes.lastIndexOf('.'), antes.lastIndexOf('\n'), antes.lastIndexOf(';')) + 1);
  const formato = '(?:word|docx|power ?point|pptx|ppt|slides?|excel|xlsx|planilhas?|apresentacoes|apresentacao)\\b';
  return !new RegExp('\\b(?:gere|gerar|crie|criar|monte|montar|faca|fazer|produza|produzir|entregue|exporte|salve)\\s+(?:(?:um|uma|o|a|arquivo|documento|de|do|da)\\s+){0,4}' + formato).test(p)
    && !new RegExp('\\b(?:em|no|num|como|formato)\\s+(?:(?:um|uma|arquivo|formato|de|do|da)\\s+){0,4}' + formato).test(p);
}
