// Capabilities: categorias, efeitos declarados, classe da operação e risco. Nada aqui conhece um sistema específico:
// o risco sai dos efeitos (leitura/escrita, dados pessoais, financeiro, comunicação, irreversível, privilégio...).

export const CATEGORIAS = ['read_data', 'write_data', 'search', 'create_record', 'update_record', 'delete_record', 'send_message', 'generate_document',
  'upload_file', 'download_file', 'trigger_workflow', 'query_database', 'execute_action', 'custom'];
export const NIVEIS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const CLASSES = ['SAFE_READ', 'SIDE_EFFECT', 'DESTRUCTIVE'];
export const TIPOS_CONECTOR = ['REST', 'GraphQL', 'Webhook', 'SFTP', 'Email', 'Database', 'BrowserAutomation', 'Custom'];
// Tipos com runtime nesta versão; os outros ficam no modelo (cadastro, política, aprovação) e não executam.
export const TIPOS_EXECUTAVEIS = ['REST', 'GraphQL', 'Webhook'];

const EFEITOS = ['read', 'write', 'external_side_effect', 'irreversible', 'financial', 'personal_data', 'privileged', 'communication', 'bulk'];
export function limparEfeitos(e = {}) {
  return Object.fromEntries(EFEITOS.map(k => [k, e[k] === true]));
}

// Classe da operação: pelo método, com sobrescrita explícita na metadata (x-greenia-classe na especificação ou
// definida pelo admin). GET/HEAD leem; POST/PUT/PATCH mudam estado; DELETE destrói.
export function classeDaOperacao(metodo, sobrescrita = null) {
  if (CLASSES.includes(sobrescrita)) return sobrescrita;
  const m = String(metodo || '').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return 'SAFE_READ';
  if (m === 'DELETE') return 'DESTRUCTIVE';
  return 'SIDE_EFFECT';
}

// Efeitos padrão de uma operação a partir da classe e da categoria (a declaração explícita sempre vale mais).
export function efeitosPadrao({ classe, categoria, declarados = {} }) {
  const base = {
    read: classe === 'SAFE_READ' || ['read_data', 'search', 'query_database', 'download_file'].includes(categoria),
    write: classe !== 'SAFE_READ',
    external_side_effect: classe !== 'SAFE_READ',
    irreversible: classe === 'DESTRUCTIVE',
    communication: categoria === 'send_message',
  };
  return limparEfeitos({ ...base, ...Object.fromEntries(Object.entries(declarados).filter(([, v]) => typeof v === 'boolean')) });
}

// Risco: soma de fatores; destrutivo/irreversível com dado financeiro ou privilégio é crítico.
export function classificarRisco({ efeitos = {}, classe = 'SAFE_READ', volume = 1, sistemaSensivel = false, tipoConector = 'REST' } = {}) {
  const e = limparEfeitos(efeitos);
  let p = 0;
  if (e.write || classe !== 'SAFE_READ') p += 2;
  if (e.external_side_effect) p += 1;
  if (e.communication) p += 2;
  if (e.personal_data) p += 2;
  if (e.financial) p += 3;
  if (e.privileged) p += 3;
  if (e.irreversible || classe === 'DESTRUCTIVE') p += 4;
  if (e.bulk || volume > 100) p += 1;
  if (sistemaSensivel) p += 2;
  if (tipoConector === 'BrowserAutomation') p = Math.max(p, 5);   // fallback frágil: alto por padrão
  if ((e.irreversible || classe === 'DESTRUCTIVE') && (e.financial || e.privileged)) return 'CRITICAL';
  return p >= 8 ? 'CRITICAL' : p >= 5 ? 'HIGH' : p >= 2 ? 'MEDIUM' : 'LOW';
}

// Frase simples do que a capability faz (tela de aprovação: "Esta integração poderá ...").
export function fraseDaCapability(c) {
  const alvo = c.nome || c.operation_id || 'operação';
  return c.modo === 'read' ? `ler: ${alvo}` : c.classe === 'DESTRUCTIVE' ? `apagar: ${alvo}` : `alterar ou criar: ${alvo}`;
}
