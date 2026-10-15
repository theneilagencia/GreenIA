// Regras de escrita para tudo o que a IA escreve para a pessoa (respostas, apresentações, documentos): texto de
// profissional experiente, sem os vícios típicos de texto gerado por IA. Vale para a conversa, para a adaptação de
// modelos e para os entregáveis. A lista de vícios também serve para conferir (testes e conferência de qualidade).
export const REGRAS_DE_ESCRITA = [
  'Escreva como um consultor sênior escreveria para um cliente: frases diretas, concretas, com os fatos, números e nomes do material.',
  'Proibido (vícios de texto de IA): abrir com elogio ao pedido ou com "Claro!", "Ótima pergunta", "Com certeza"; fechar oferecendo mais ajuda ("Se quiser, posso…", "Espero ter ajudado", "Fico à disposição"); "Em resumo"/"Em suma" para repetir o que já foi dito; "É importante ressaltar/destacar/notar que"; "Vale ressaltar"; "No cenário atual", "Em um mundo cada vez mais…"; "Não é apenas X, é Y"; "Mais do que X, Y"; perguntas retóricas; listas de três adjetivos; travessão (—) para efeito dramático; emojis; negrito espalhado em palavras soltas.',
  'Evite palavras de efeito vazias: robusto, alavancar, potencializar, sinergia, jornada, ecossistema, holístico, disruptivo, desbloquear, transformador, crucial, fundamental, essencial, primordial, navegar (no sentido figurado), mergulhar, impulsionar, otimizar sem dizer o quê.',
  'Nunca escreva letras separadas por espaço (como "C O N T E X T O"): isso é efeito visual de um arquivo, não texto.',
  'Cada frase precisa dizer algo específico do caso. Se uma frase serviria para qualquer empresa, troque por um fato do material ou corte.',
  'Siga o briefing da pessoa à risca: o que ela pediu (estrutura, escopo, tom, o que incluir e o que não incluir) vale mais do que qualquer padrão.',
].join('\n');

// Vícios detectáveis por padrão de texto (sem IA): [rótulo, expressão].
export const VICIOS = [
  ['abertura servil', /^(claro|com certeza|ótima pergunta|excelente pergunta|perfeito)[!,.]/im],
  ['oferta de ajuda no fim', /(se (quiser|preferir|desejar),? (eu )?posso|espero ter ajudado|fico à disposição|estou à disposição|posso ajudar (em|com) mais)/i],
  ['"em resumo"', /\b(em resumo|em suma|resumindo),/i],
  ['"é importante ressaltar"', /(?<!\p{L})(é importante|vale) (ressaltar|destacar|notar|lembrar|mencionar)/iu],
  ['clichê de cenário', /\b(no cenário atual|em um mundo cada vez mais|nos dias de hoje|no mundo atual)/i],
  ['"não é apenas X, é Y"', /(?<!\p{L})não (é|se trata) (apenas|só|somente)( de)? [^.]{0,80}[,;—-]\s*(é|mas)(?=\s)/iu],
  ['palavra de efeito', /\b(alavanc\w+|potencializ\w+|sinergia\w*|holístic\w+|disruptiv\w+|ecossistema|jornada (de|do|da)|desbloque\w+|robust[oa]s?)\b/i],
  ['travessão dramático', /\s—\s/],
  ['emoji', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u],
];
export function viciosDeEscrita(texto) {
  const t = String(texto || '');
  return VICIOS.filter(([, re]) => re.test(t)).map(([r]) => r);
}

// Remoção segura do que é só moldura (não muda conteúdo): a frase final que oferece mais ajuda.
export function semFechoServil(texto) {
  return String(texto || '').replace(/\n+\s*(se (quiser|preferir|desejar),? (eu )?posso[^\n]*|espero ter ajudado[^\n]*|fico à disposição[^\n]*|estou à disposição[^\n]*)\s*$/i, '').trimEnd();
}
