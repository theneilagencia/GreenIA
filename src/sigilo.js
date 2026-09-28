// Informações sigilosas com guardrails de proteção: a camada central que decide se um recurso de IA (a rota
// real de processamento: modelo + fornecedor + endpoint + políticas de retenção e de treino + autorizações)
// pode receber informação sigilosa. Todo caminho de execução passa por aqui, direta ou indiretamente
// (catálogo → roteador → envio), e o envio confere de novo antes de chamar a IA.
//
//   informação sigilosa + política da empresa ligada + guardrails satisfeitos + recurso autorizado + rota elegível
//   → ENVIA.  Qualquer outra combinação → NÃO ENVIA.
//
// Fail closed: requisito ausente, desconhecido, inválido ou não autorizado torna o recurso NÃO elegível.
// Nunca "desconhecido → permitido".

// Política da empresa. Padrão: desligada. Ausente, null ou qualquer valor que não seja true vale como false.
export const POLITICA_SIGILO = 'allow_sensitive_processing_with_guardrails';
export const politicaSigiloLigada = cfg => cfg?.[POLITICA_SIGILO] === true;

// Requisitos mínimos da plataforma (a operadora os define; a empresa não os remove). Em instalação própria,
// sem a camada da plataforma, não há autorização da plataforma a exigir; retenção zero e ausência de treino
// continuam obrigatórias.
export const REQUISITOS_PADRAO = { plataforma: false, exigeAutorizacao: false, exigeRetencaoZero: true, exigeSemTreino: true };
export const REQUISITOS_PLATAFORMA = { plataforma: true, exigeAutorizacao: true, exigeRetencaoZero: true, exigeSemTreino: true };
export function requisitosDe(cfg) {
  const r = cfg?.requisitosSigilo;
  // Um requisito só deixa de valer se estiver explicitamente false; qualquer outra coisa conta como exigido.
  return {
    plataforma: r?.plataforma === true,
    exigeAutorizacao: r?.exigeAutorizacao !== false && r?.plataforma === true,
    exigeRetencaoZero: r?.exigeRetencaoZero !== false,
    exigeSemTreino: r?.exigeSemTreino !== false,
  };
}

// Recursos que nunca recebem informação sigilosa: sem fornecedor fixo, sem garantia verificável.
const semRotaFixa = id => /:free$/.test(id) || id === 'openrouter/free' || id === 'openrouter/auto';

// Motivos, em linguagem do admin (o registro guarda o código).
export const MOTIVOS_GUARDRAIL = {
  nao_liberado: 'não está liberado na empresa',
  sem_rota_fixa: 'não tem fornecedor fixo com garantias verificáveis (gratuito ou automático)',
  proibido_pela_plataforma: 'proibido pela plataforma para informação sigilosa',
  sem_homologacao_empresa: 'a empresa não homologou este recurso (ou não segue as recomendações da plataforma)',
  sem_autorizacao_plataforma: 'não autorizado pela plataforma para informação sigilosa',
  rota_diferente_da_autorizada: 'a empresa homologou um fornecedor diferente do autorizado pela plataforma',
  fornecedor_desconhecido: 'fornecedor não informado',
  endpoint_desconhecido: 'rota de processamento (endpoint) não informada',
  retencao_nao_comprovada: 'retenção zero não comprovada para esta rota',
  treino_nao_comprovado: 'ausência de uso para treino não comprovada para esta rota',
};

/**
 * Avalia um recurso (linha do catálogo já lida) para informação sigilosa.
 * @param {object} m  { id, liberado, homologacaoEmpresa, autorizacaoPlataforma, vetadoPlataforma }
 * @param {object} cfg configuração da empresa (modo de governança, requisitos da plataforma)
 * @returns {{ elegivel: boolean, motivos: string[], rota: object|null, origem: string|null }}
 */
export function avaliarRecurso(m, cfg) {
  const motivos = [];
  const req = requisitosDe(cfg);
  if (!m?.liberado) motivos.push('nao_liberado');
  if (!m?.id || semRotaFixa(m.id)) motivos.push('sem_rota_fixa');
  if (m?.vetadoPlataforma) motivos.push('proibido_pela_plataforma');
  const emp = valida(m?.homologacaoEmpresa), plat = valida(m?.autorizacaoPlataforma);
  // Homologação da empresa: a dela, ou a adoção das autorizações da plataforma ao seguir as recomendações.
  const adotou = !emp && plat && cfg?.governanca?.modo !== 'manual';
  if (!emp && !adotou) motivos.push('sem_homologacao_empresa');
  let rota = emp || (adotou ? plat : null);
  if (req.exigeAutorizacao) {
    if (!plat) motivos.push('sem_autorizacao_plataforma');
    else if (emp && emp.endpoint !== plat.endpoint) motivos.push('rota_diferente_da_autorizada');
    // Com autorização exigida, as garantias valem as da plataforma E as da empresa (a empresa só restringe).
    if (plat && rota) rota = { ...plat, retencaoZero: plat.retencaoZero === true && rota.retencaoZero === true, semTreino: plat.semTreino === true && rota.semTreino === true };
  }
  if (rota) {
    if (!rota.fornecedor) motivos.push('fornecedor_desconhecido');
    if (!rota.endpoint) motivos.push('endpoint_desconhecido');
    if (req.exigeRetencaoZero && rota.retencaoZero !== true) motivos.push('retencao_nao_comprovada');
    if (req.exigeSemTreino && rota.semTreino !== true) motivos.push('treino_nao_comprovado');
  }
  return { elegivel: motivos.length === 0, motivos, rota: motivos.length ? null : rota, origem: emp ? 'empresa' : adotou ? 'recomendacao_da_plataforma' : null };
}
// Registro de rota com os campos no tipo certo; qualquer outra coisa vira "desconhecido".
function valida(r) {
  if (!r || typeof r !== 'object') return null;
  const txt = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { fornecedor: txt(r.fornecedor), endpoint: txt(r.endpoint), retencaoZero: r.retencaoZero === true, semTreino: r.semTreino === true,
    em: r.em || null, quem: r.quem || r.por || null, justificativa: r.justificativa || null };
}

/**
 * evaluate_sensitive_processing: decisão para uma solicitação.
 * @returns {{ permitido: boolean, motivo: string|null, requisitos: object }}
 *   motivo: 'politica_sigilo_desligada' | 'sem_recurso_elegivel' | 'recurso_nao_elegivel' | null
 */
export function avaliarProcessamentoSigiloso({ cfg, sigilosa, recurso = undefined }) {
  const requisitos = { politicaEmpresa: politicaSigiloLigada(cfg), ...requisitosDe(cfg) };
  if (!sigilosa) return { permitido: true, motivo: null, requisitos };
  if (!requisitos.politicaEmpresa) return { permitido: false, motivo: 'politica_sigilo_desligada', requisitos };
  if (recurso === undefined) return { permitido: true, motivo: null, requisitos };   // ainda sem recurso: segue para o roteamento
  if (!recurso) return { permitido: false, motivo: 'sem_recurso_elegivel', requisitos };
  const a = avaliarRecurso(recurso, cfg);
  return a.elegivel ? { permitido: true, motivo: null, requisitos, rota: a.rota } : { permitido: false, motivo: 'recurso_nao_elegivel', requisitos, motivos: a.motivos };
}
