// DANFE em PDF: a GreenIA não extrai os campos da nota do texto impresso. Ela
// acha a chave de acesso (44 dígitos) e procura, na mesma execução, o XML com
// essa chave. Sem o XML, a nota fica como "pedir o XML ao fornecedor".
//
// Chave de acesso (NT 2005 e Manual de Orientação do Contribuinte):
//   cUF(2) AAMM(4) CNPJ/CPF(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
// O dígito verificador é o módulo 11 com pesos de 2 a 9, da direita para a esquerda.

const UF_CODES = new Set(['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53']);

export function accessKeyDv(first43: string): string {
  let sum = 0, w = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return String(r < 2 ? 0 : 11 - r);
}

export function isAccessKey(k: string): boolean {
  if (!/^\d{44}$/.test(k)) return false;
  const month = Number(k.slice(4, 6));
  return UF_CODES.has(k.slice(0, 2)) && month >= 1 && month <= 12 && ['55', '65'].includes(k.slice(20, 22)) && accessKeyDv(k.slice(0, 43)) === k[43];
}

// Texto parece um DANFE (evita confundir com código de barras de boleto, que também tem 44 dígitos).
const DANFE_WORDS = /\bDANFE\b|documento auxiliar da nota fiscal|\bNF-?e\b|nota fiscal eletr/i;

// Chave de acesso no texto de um PDF (impressa em grupos de 4, com espaço ou ponto).
export function findAccessKey(text: string): string | null {
  if (!DANFE_WORDS.test(text)) return null;
  // Junta os grupos na mesma linha; numa sequência maior (outro número colado), testa cada janela de 44.
  const compact = text.replace(/(\d)(?:[^\S\n]|\.)+(?=\d)/g, '$1');
  for (const m of compact.matchAll(/\d{44,}/g)) {
    for (let i = 0; i + 44 <= m[0].length; i++) if (isAccessKey(m[0].slice(i, i + 44))) return m[0].slice(i, i + 44);
  }
  return null;
}

export const DANFE_SEM_XML = 'pedir o XML ao fornecedor';
