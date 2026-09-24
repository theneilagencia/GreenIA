// Normalização de texto em português para comparar e buscar: sem acento, em
// minúsculas e com espaços simples. Fica num lugar só porque o escape da faixa
// de acentos já foi corrompido várias vezes ao editar arquivos (ver o teste
// tests/source-escapes.test.mjs na raiz).
export const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normPt = (s: string) => stripAccents(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
