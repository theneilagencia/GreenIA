// Configuração da instalação, feita pela tela do admin e guardada no banco.
import { exec, todos, json } from './db.js';

export const TIPOS_DADO = ['cpf', 'cnpj', 'cartao', 'banco', 'pix', 'credencial', 'rg', 'email', 'telefone', 'cep', 'endereco'];

export const PADRAO = {
  empresa: 'Sua empresa',
  logo: '',
  corMarca: '',
  dominios: [],
  smtp: { url: '', remetente: '' },
  privacyNote: 'Suas conversas ficam salvas só para você, por até 90 dias sem uso, e você pode apagá-las quando quiser.',
  retencaoDias: 90,
  // Ação por tipo de dado no chat (e padrão dos quick wins). Credencial é sempre bloqueada.
  acoesChat: { cpf: 'bloquear', cnpj: 'permitir', cartao: 'bloquear', banco: 'bloquear', pix: 'bloquear', credencial: 'bloquear',
    rg: 'bloquear', email: 'permitir', telefone: 'permitir', cep: 'permitir', endereco: 'permitir' },
  // Modelos: padrões, acesso por perfil e privacidade (seção 9).
  padroes: { chat: 'google/gemini-3.5-flash-lite', rapido: 'google/gemini-3.5-flash-lite', equilibrado: 'anthropic/claude-haiku-4.5', avancado: 'anthropic/claude-sonnet-5', homologado: null },
  acessoPerfis: { equilibrado: { todos: true, grupos: [], areas: [] }, avancado: { todos: false, grupos: [], areas: [] } },
  perfisQuickWin: ['rapido', 'equilibrado', 'avancado'],
  exigirSemTreino: true,
  automatico: false,
  // Limites (0 = sem limite).
  tetoMensal: 0, tetoPessoaMensal: 0, limiteDiarioPessoa: 0,
};

export function lerConfig(db) {
  const cfg = structuredClone(PADRAO);
  for (const r of todos(db, 'select chave, valor from config')) cfg[r.chave] = json(r.valor, cfg[r.chave]);
  return cfg;
}

export function salvarConfig(db, parcial) {
  for (const [k, v] of Object.entries(parcial)) {
    if (!(k in PADRAO)) continue;
    exec(db, 'insert into config (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor', k, JSON.stringify(v));
  }
}
