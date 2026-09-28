// Falhas de envio de email (códigos de acesso, convites, avisos): o motivo real fica registrado para o
// admin da plataforma ver no console, sem senha, usuário de SMTP nem chave de API. A pessoa que tentou
// entrar recebe uma mensagem clara, não um erro genérico.
import { lerAjuste, salvarAjuste } from './db.js';

const MAX = 20;
// Tira credenciais de qualquer texto: usuário:senha em URLs, chaves de API conhecidas, Bearer.
export const semSegredos = t => String(t || '')
  .replace(/(\w+:\/\/)[^@\s/]+@/g, '$1***@')
  .replace(/\b(re|sk|xkeysib|SG|key)[-_][A-Za-z0-9._-]{8,}/g, '[chave]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [chave]')
  .slice(0, 300);

export function registrarFalhaEmail(P, { escopo, origem, erro }) {
  const item = { em: P.agora().toISOString(), escopo, origem, detalhe: semSegredos(erro?.message || erro) };
  const lista = [item, ...(lerAjuste(P.db, 'email_falhas', []) || [])].slice(0, MAX);
  salvarAjuste(P.db, 'email_falhas', lista);
  P.log(`[email] FALHOU (${origem}, ${escopo}): ${item.detalhe}`);
  return item;
}
export const falhasEmail = P => lerAjuste(P.db, 'email_falhas', []) || [];
// Envio que deu certo depois de falhas: registra a recuperação (o aviso do topo some).
export function registrarEnvioOk(P) {
  const ult = lerAjuste(P.db, 'email_ultimo_ok', null), falha = falhasEmail(P)[0];
  // Grava no máximo uma vez por minuto, mas sempre logo depois de uma falha (para o aviso sumir na hora).
  if (!ult || P.agora().getTime() - Date.parse(ult) > 60e3 || (falha && Date.parse(falha.em) >= Date.parse(ult))) salvarAjuste(P.db, 'email_ultimo_ok', new Date(Math.max(P.agora().getTime(), falha ? Date.parse(falha.em) + 1 : 0)).toISOString());
}
// Aviso para o topo do console: falha nas últimas 24 h sem envio bem-sucedido depois dela.
export function alertaEmail(P) {
  const f = falhasEmail(P)[0];
  if (!f || P.agora().getTime() - Date.parse(f.em) > 864e5) return null;
  const ok = lerAjuste(P.db, 'email_ultimo_ok', null);
  if (ok && Date.parse(ok) > Date.parse(f.em)) return null;
  return { em: f.em, origem: f.origem, detalhe: f.detalhe };
}
