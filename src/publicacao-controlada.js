// Operação normal: autenticação, vínculo da empresa e permissões continuam obrigatórios.
// A restrição temporária de homologação só deve ser ativada numa revisão específica.
export const PUBLICACAO_CONTROLADA = null;
export function validarPublicacao(controle) {
  if (!controle) return null;
  if (controle.ativa !== true || !Array.isArray(controle.empresas) || !controle.empresas.length || controle.empresas.some(x => !/^[a-z0-9-]{3,40}$/.test(x))) throw new Error('Configuração de publicação controlada inválida');
  return { ativa: true, empresas: [...new Set(controle.empresas)] };
}
export const empresaNaPublicacao = (controle, empresa) => !controle?.ativa || !!empresa && controle.empresas.includes(empresa.slug);
