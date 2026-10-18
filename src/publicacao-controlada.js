// Remover a restrição exige uma nova revisão publicada; não concede privilégios a ninguém.
export const PUBLICACAO_CONTROLADA = Object.freeze({ ativa: true, empresas: Object.freeze(['homologacao-a']) });
export function validarPublicacao(controle) {
  if (!controle) return null;
  if (controle.ativa !== true || !Array.isArray(controle.empresas) || !controle.empresas.length || controle.empresas.some(x => !/^[a-z0-9-]{3,40}$/.test(x))) throw new Error('Configuração de publicação controlada inválida');
  return { ativa: true, empresas: [...new Set(controle.empresas)] };
}
export const empresaNaPublicacao = (controle, empresa) => !controle?.ativa || !!empresa && controle.empresas.includes(empresa.slug);
