// Só para detectar ferramentas/artefatos, nunca para alterar o texto enviado ao
// modelo: uma restrição como "sem capa" não é uma encomenda de capa.
const RESTRICAO = /\b(?:sem\b|(?:nao|nunca)\s+(?!(?:apenas|somente|so)\b)(?:gere|gerar|crie|criar|inclua|incluir|adicione|adicionar|produza|produzir|faca|fazer|quero|preciso|use|usar)\b|evite\b)[^.;\n]*?(?=[.;\n]|\b(?:mas|porem|gere|crie|produza|desenhe|ilustre|monte|edite|troque|substitua|transforme|ajuste)\b|$)/g;
export const pedidoAfirmativo = texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(RESTRICAO, ' ');
