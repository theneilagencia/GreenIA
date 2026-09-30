// Configuração da instalação, feita pela tela do admin e guardada no banco.
import { exec, todos, json } from './db.js';

export const TIPOS_DADO = ['cpf', 'cnpj', 'cartao', 'banco', 'pix', 'credencial', 'rg', 'email', 'telefone', 'cep', 'endereco', 'pessoal_restrito', 'sensivel', 'confidencial'];

export const PADRAO = {
  empresa: 'Sua empresa',
  logo: '',
  corMarca: '',
  dominios: [],
  smtp: { url: '', remetente: '' },
  privacyNote: 'Nenhuma tela da GreenIA mostra o conteúdo das suas conversas a colegas ou ao admin; ele fica no banco da empresa. Conversas sem uso são apagadas no prazo de retenção da empresa, e você pode apagá-las quando quiser.',
  retencaoDias: 90,
  // Ação por tipo de dado no chat (e padrão dos quick wins). Credencial é sempre bloqueada.
  // Tratamento proporcional ao risco (filtro.js → decidir): "permitir" = processar normalmente; "proteger" =
  // só com os guardrails de informação sigilosa (e só com a política ligada); "bloquear" = não enviar. É política
  // da empresa, editável. Padrão: dado pessoal comum segue normalmente (a presença de um nome, email, telefone
  // ou CPF não torna a conversa sigilosa); dado financeiro de pagamento, dado sensível e marcação de confidencial
  // seguem só com proteção. Credencial não é configurável: nunca vai para a IA.
  acoesChat: { cpf: 'permitir', cnpj: 'permitir', cartao: 'proteger', banco: 'proteger', pix: 'proteger', credencial: 'bloquear',
    rg: 'permitir', email: 'permitir', telefone: 'permitir', cep: 'permitir', endereco: 'permitir', pessoal_restrito: 'permitir', sensivel: 'proteger', confidencial: 'proteger' },
  acoesVersao: 2,
  // Controle proporcional para dado pessoal processado normalmente: só recursos com fornecedor fixo e pedido de
  // não uso para treino. Não bloqueia nem torna a conversa sigilosa.
  protecaoDadosPessoais: true,
  // Retenção separada do processamento: tipos de dado que podem ser processados, mas não ficam guardados no
  // histórico (a mensagem, o anexo e a resposta ficam só como um registro de que houve processamento).
  naoArmazenar: [],
  // Modelos: padrões, acesso por perfil e privacidade (seção 9).
  padroes: { chat: 'google/gemini-3.5-flash-lite', rapido: 'google/gemini-3.5-flash-lite', equilibrado: 'anthropic/claude-haiku-4.5', avancado: 'anthropic/claude-sonnet-5', homologado: null },
  acessoPerfis: { equilibrado: { todos: true, grupos: [], areas: [] }, avancado: { todos: false, grupos: [], areas: [] } },
  perfisQuickWin: ['rapido', 'equilibrado', 'avancado'],
  // Quem cria quick wins: responsáveis de área (nas áreas deles) e pessoas ou
  // grupos autorizados (nas áreas de que fazem parte). "Toda a empresa" é à parte.
  criarQuickWin: { responsaveis: true, pessoas: [], grupos: [], todaEmpresa: { pessoas: [], grupos: [] } },
  exigirSemTreino: true,
  avisosPlano: {},   // controle interno dos avisos do plano (mês e etapas já avisadas)
  automatico: false,   // "Automático do OpenRouter" (openrouter/auto): fora da governança; o roteamento da GreenIA é o recomendado
  // Roteamento da GreenIA: analisa cada pedido e escolhe o modelo entre os permitidos.
  // preferencia: economia (sobe de classe só quando precisa muito), equilibrio ou qualidade.
  roteamento: { ativo: true, preferencia: 'equilibrio' },
  // Governança de modelos: "recomendado" segue as recomendações da GreenIA (a empresa não precisa saber de
  // modelos); "manual" deixa o admin ajustar. Nos dois modos valem as mesmas regras obrigatórias (sigilo,
  // homologação, vetos e autorizações da plataforma, acesso, plano, janela): o modo muda só o grau de controle.
  governanca: { modo: 'recomendado', em: null, por: null },
  // Informações sigilosas: "Permitir processamento de informações sigilosas com guardrails de proteção".
  // Desligado por padrão; só true liga (ver sigilo.js). Requisitos mínimos da plataforma, vindos dela.
  allow_sensitive_processing_with_guardrails: false,
  emailSituacao: {},   // email próprio da empresa: último envio certo e última falha (motivo explicado, sem segredo)
  requisitosSigilo: { plataforma: false, exigeAutorizacao: false, exigeRetencaoZero: true, exigeSemTreino: true },
  // Limites (0 = sem limite).
  tetoMensal: 0, tetoPessoaMensal: 0, limiteDiarioPessoa: 0,
};

export function lerConfig(db) {
  const cfg = structuredClone(PADRAO);
  const salvos = new Set();
  for (const r of todos(db, 'select chave, valor from config')) { cfg[r.chave] = json(r.valor, cfg[r.chave]); salvos.add(r.chave); }
  cfg.acoesChat = acoesAtuais(salvos.has('acoesChat') ? cfg.acoesChat : null, salvos.has('acoesVersao') ? cfg.acoesVersao : 1);
  cfg.acoesVersao = 2;
  return cfg;
}

// Regras de dados guardadas antes da classificação proporcional (versão 1) só tinham "permitir" (que então
// significava "processar com proteção") e "bloquear". O "bloquear" da empresa continua valendo; o antigo
// "permitir" passa para o padrão proporcional do tipo. Tipos novos entram com o padrão.
// Regras de um quick win: as dele, no formato atual (marcador _v: 2), sobre as da empresa.
export const acoesDoQuickWin = (dados, cfg) => {
  const d = typeof dados === 'string' ? json(dados, {}) : (dados || {});
  const { _v, ...proprias } = d;
  const conv = acoesAtuais(Object.keys(proprias).length ? proprias : null, _v || 1);
  const base = Object.keys(proprias).length ? { ...cfg.acoesChat, ...Object.fromEntries(Object.keys(proprias).filter(t => t in conv).map(t => [t, conv[t]])), credencial: 'bloquear' } : cfg.acoesChat;
  return { ...base, _v: 2 };   // idempotente: reaplicar sobre o resultado não converte de novo
};
export function acoesAtuais(salvas, versao = 2) {
  const out = { ...PADRAO.acoesChat };
  for (const [t, v] of Object.entries(salvas || {})) {
    if (!(t in out)) continue;
    out[t] = versao >= 2 ? v : v === 'bloquear' ? 'bloquear' : PADRAO.acoesChat[t];
  }
  out.credencial = 'bloquear';
  return out;
}

export function salvarConfig(db, parcial) {
  if (parcial.acoesChat !== undefined && parcial.acoesVersao === undefined) parcial = { ...parcial, acoesVersao: 2 };   // regras gravadas agora já são do formato atual
  for (const [k, v] of Object.entries(parcial)) {
    if (!(k in PADRAO)) continue;
    exec(db, 'insert into config (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor', k, JSON.stringify(v));
  }
}
