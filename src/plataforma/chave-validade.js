// Validade e rotação da chave do OpenRouter usada pela plataforma.
// Duas fontes de prazo, nesta ordem:
//   1. Vencimento da chave: o que o OpenRouter informar (expires_at) ou, se ele não informar, a data que
//      o admin digitar no console (vale só para a chave em uso: trocar a chave apaga a data).
//   2. Rotação por idade: a chave deve ser trocada a cada N dias (padrão 90), contados de quando foi salva
//      no console ou, se vier da variável de ambiente, de quando a plataforma a viu pela primeira vez.
// O alerta aparece no topo do console, no card da chave (Uso) e por email aos admins da plataforma,
// uma vez por estágio (30, 7 e 1 dia antes, no dia, e quando a rotação atrasa). Só a máscara da chave
// é usada para identificá-la; a chave nunca sai de onde está.
import { todos } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';

export const ROTACAO_PADRAO = 90;
export const AVISO_PADRAO = 30;
const DIA = 864e5;

export function politicaChave(P) {
  const p = lerAjuste(P.db, 'openrouter_chave_politica', {}) || {};
  return { rotacaoDias: Number(p.rotacaoDias) || ROTACAO_PADRAO, avisarDias: Number(p.avisarDias) || AVISO_PADRAO, expiraEm: p.expiraEm || null, expiraMascara: p.expiraMascara || null };
}
export function salvarPoliticaChave(P, { rotacaoDias, expiraEm, mascara }) {
  const atual = politicaChave(P);
  const novo = { ...atual };
  if (rotacaoDias !== undefined) novo.rotacaoDias = rotacaoDias;
  if (expiraEm !== undefined) { novo.expiraEm = expiraEm; novo.expiraMascara = expiraEm ? mascara : null; }
  salvarAjuste(P.db, 'openrouter_chave_politica', novo);
  return novo;
}

// Desde quando a chave em uso existe para a plataforma (a máscara identifica a chave).
function desdeDaChave(P, cfg) {
  if (cfg.origem === 'console' && cfg.em) return cfg.em;
  const v = lerAjuste(P.db, 'openrouter_chave_vista', null);
  if (v?.mascara === cfg.mascara) return v.desde;
  const agora = P.agora().toISOString();
  salvarAjuste(P.db, 'openrouter_chave_vista', { mascara: cfg.mascara, desde: agora });
  return agora;
}
// Data sem hora ("2026-12-31") vence no fim daquele dia (UTC).
const instante = d => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(`${d}T23:59:59Z`) : Date.parse(d));
const diasAte = (d, agora) => Math.ceil((instante(d) - agora) / DIA);
const dataBr = d => new Date(instante(d)).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/**
 * Situação da chave em uso. `conta` é a leitura do OpenRouter (pode vir do cache); sem ela, só o que está salvo.
 * nivel: ok | info | atencao | critico | erro | sem_chave
 */
export function situacaoChave(P, cfg, conta = null) {
  if (!cfg?.mascara) return { nivel: 'sem_chave', codigo: 'sem_chave', texto: 'Nenhuma chave configurada.' };
  const agora = P.agora().getTime(), pol = politicaChave(P);
  const desde = desdeDaChave(P, cfg);
  const idadeDias = Math.floor((agora - Date.parse(desde)) / DIA);
  const daApi = conta?.chave?.expiraEm || null;
  const informada = pol.expiraMascara === cfg.mascara ? pol.expiraEm : null;
  const expiraEm = daApi || informada;
  const diasParaVencer = expiraEm ? diasAte(expiraEm, agora) : null;
  const rotacaoEm = new Date(Date.parse(desde) + pol.rotacaoDias * DIA).toISOString();
  const diasParaRotacao = diasAte(rotacaoEm, agora);
  const base = { mascara: cfg.mascara, origem: cfg.origem, desde, idadeDias, expiraEm, fonteVencimento: daApi ? 'openrouter' : informada ? 'informada' : null,
    diasParaVencer, rotacaoDias: pol.rotacaoDias, rotacaoEm, diasParaRotacao, avisarDias: pol.avisarDias };
  const d = n => `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
  if (conta?.recusada) return { ...base, nivel: 'erro', codigo: 'recusada', texto: 'O OpenRouter está recusando a chave (vencida, revogada ou desativada). A IA das empresas não responde até você informar uma chave nova.' };
  if (diasParaVencer !== null && diasParaVencer <= 0) return { ...base, nivel: 'erro', codigo: 'vencida', texto: `A chave venceu em ${dataBr(expiraEm)}. Informe uma chave nova para a IA das empresas voltar a responder.` };
  if (diasParaVencer !== null && diasParaVencer <= 7) return { ...base, nivel: 'critico', codigo: 'vence_em_breve', texto: `A chave vence em ${d(diasParaVencer)} (${dataBr(expiraEm)}). Crie uma chave nova no OpenRouter e troque aqui antes disso.` };
  if (diasParaVencer !== null && diasParaVencer <= pol.avisarDias) return { ...base, nivel: 'atencao', codigo: 'vence', texto: `A chave vence em ${d(diasParaVencer)} (${dataBr(expiraEm)}). Programe a troca.` };
  if (diasParaRotacao <= 0) return { ...base, nivel: 'atencao', codigo: 'rotacao_atrasada', texto: `A chave está em uso há ${d(idadeDias)}, acima da rotação de ${d(pol.rotacaoDias)}. Troque por uma chave nova.` };
  if (diasParaRotacao <= 14) return { ...base, nivel: 'info', codigo: 'rotacao_proxima', texto: `A troca programada da chave é em ${d(diasParaRotacao)} (rotação a cada ${d(pol.rotacaoDias)}).` };
  return { ...base, nivel: 'ok', codigo: 'ok', texto: expiraEm ? `Vence em ${dataBr(expiraEm)} (${d(diasParaVencer)}). Próxima troca programada em ${d(diasParaRotacao)}.` : `Sem data de vencimento. Próxima troca programada em ${d(diasParaRotacao)}.` };
}

// Estágio para o email: um aviso por estágio e por chave.
const estagio = s => ({ recusada: 'recusada', vencida: 'vencida', rotacao_atrasada: 'rotacao' }[s.codigo]
  || (s.codigo === 'vence_em_breve' ? (s.diasParaVencer <= 1 ? 'v1' : 'v7') : s.codigo === 'vence' ? 'v30' : null));

export async function conferirChave(P, cfg, conta) {
  const s = situacaoChave(P, cfg, conta);
  const e = estagio(s);
  if (!e) return { ...s, avisou: false };
  const reg = lerAjuste(P.db, 'openrouter_chave_avisos', null);
  const enviados = reg?.mascara === s.mascara ? reg.enviados || [] : [];
  if (enviados.includes(e)) return { ...s, avisou: false };
  const admins = todos(P.db, "select u.email from platform_members m join users u on u.id = m.user_id where u.status = 'ativo'").map(x => x.email);
  const assunto = s.codigo === 'recusada' || s.codigo === 'vencida' ? 'Chave do OpenRouter sem validade: a IA parou' : s.codigo === 'rotacao_atrasada' ? 'Hora de trocar a chave do OpenRouter' : 'A chave do OpenRouter vai vencer';
  const texto = `${s.texto}\n\nChave em uso: ${s.mascara} (${s.origem === 'console' ? 'informada no console' : 'variável OPENROUTER_API_KEY'}).\n\n`
    + 'Para trocar: crie uma chave nova em https://openrouter.ai/settings/keys, informe-a no console da plataforma, em Uso → Chave do OpenRouter, e depois desative a antiga no OpenRouter.';
  for (const para of admins) P.email.enviar(para, assunto, texto).catch(x => P.log('aviso de chave', x.message));
  salvarAjuste(P.db, 'openrouter_chave_avisos', { mascara: s.mascara, enviados: [...enviados, e] });
  return { ...s, avisou: admins.length > 0 };
}
