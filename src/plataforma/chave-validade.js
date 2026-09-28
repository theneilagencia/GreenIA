// Validade, rotação e monitoramento da chave do OpenRouter usada pela plataforma.
//
// Dois conceitos separados, que nunca se misturam:
//   VALIDADE EXTERNA (o que o provedor diz): o vencimento que o OpenRouter informa em GET /api/v1/key
//     (campo expires_at; null = a chave não tem vencimento definido lá), ou uma data real que o admin
//     informe por outra fonte; e a RECUSA (401: vencida, revogada, desativada ou inexistente).
//   POLÍTICA INTERNA (o que a empresa decide): troca preventiva a cada N dias (padrão 90, de 7 a 730),
//     contada da data de início da chave. Ausência de vencimento no provedor NÃO é chave inválida:
//     nesse caso existe só a data da troca preventiva.
//
// Identidade da chave: impressão digital HMAC-SHA256 (com a chave-mestra) da chave completa. Não é
// reversível, não depende da máscara (duas chaves com o mesmo final são chaves diferentes) e é a mesma
// em qualquer instância e depois de reiniciar. O estado de cada chave fica no banco da plataforma
// ('openrouter_chaves'): início, última validação, recusa, vencimento do provedor, vencimento informado.
//
// Regra de tempo (determinística): dias corridos no calendário de America/Sao_Paulo. A troca preventiva
// é devida no dia (início + N dias); "vencida" do provedor é pelo instante exato do expires_at.
import { createHmac } from 'node:crypto';
import { exec, todos } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';

export const ROTACAO_PADRAO = 90, ROTACAO_MIN = 7, ROTACAO_MAX = 730;
const FUSO = 'America/Sao_Paulo', DIA = 864e5, HISTORICO = 20, REVALIDAR_MS = 10 * 60e3;

export const impressaoChave = (mestra, chave) => createHmac('sha256', mestra).update(String(chave)).digest('hex').slice(0, 32);

// ------------------------------------------------------------------ calendário
const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dataLocal = instante => fmtData.format(new Date(instante));   // 'AAAA-MM-DD' em São Paulo
const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
export const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA);
const dataBr = data => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const plural = n => `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
// Data informada pelo admin ("2026-12-31") vale até o fim daquele dia em São Paulo (UTC−3, sem horário de verão).
const fimDoDia = data => Date.parse(`${data}T23:59:59-03:00`);

// ------------------------------------------------------------------ política interna
export function politicaChave(P) {
  const p = lerAjuste(P.db, 'openrouter_chave_politica', {}) || {};
  const n = Number(p.rotacaoDias);
  return { rotacaoDias: Number.isInteger(n) && n >= ROTACAO_MIN && n <= ROTACAO_MAX ? n : ROTACAO_PADRAO };
}
export function validarRotacao(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < ROTACAO_MIN || n > ROTACAO_MAX) return null;
  return n;
}
export const salvarRotacao = (P, rotacaoDias) => salvarAjuste(P.db, 'openrouter_chave_politica', { rotacaoDias });

// ------------------------------------------------------------------ estado persistido por chave
const lerRegistro = P => lerAjuste(P.db, 'openrouter_chaves', {}) || {};
function gravar(P, id, mudar) {
  const reg = lerRegistro(P);
  reg[id] = mudar({ ...(reg[id] || {}) });
  // Guarda só as últimas chaves (metadados, nunca a chave): a mais antiga sai primeiro.
  const ids = Object.keys(reg).sort((a, b) => String(reg[b].vistaEm || reg[b].desde).localeCompare(String(reg[a].vistaEm || reg[a].desde)));
  for (const velho of ids.slice(HISTORICO)) delete reg[velho];
  salvarAjuste(P.db, 'openrouter_chaves', reg);
  return reg[id];
}
// Chave em uso: garante o registro, com a data de início persistida (a primeira vez que é vista, ou a
// data em que foi salva no console). Reiniciar, trocar de instância ou limpar cache não mudam essa data.
export function estadoDaChave(P, cfg) {
  if (!cfg?.id) return null;
  const agora = P.agora().toISOString();
  const atual = lerRegistro(P)[cfg.id];
  if (atual?.desde && atual.origem === cfg.origem) return atual;
  return gravar(P, cfg.id, e => ({ ...e, mascara: cfg.mascara, origem: cfg.origem, desde: e.desde || (cfg.origem === 'console' && cfg.em) || agora, vistaEm: agora }));
}
// Leitura da conta no OpenRouter: atualiza validação, recusa e vencimento do provedor.
export function registrarLeitura(P, cfg, r) {
  if (!cfg?.id || !r) return;
  const agora = P.agora().toISOString();
  estadoDaChave(P, cfg);
  if (r.chave && !r.chave.erro) {
    gravar(P, cfg.id, e => ({ ...e, validadoEm: agora, recusadaEm: null,
      provedor: { consultadoEm: agora, informado: Object.hasOwn(r.chave, 'expires_at'), expiraEm: r.chave.expires_at ?? null } }));
  } else if (r.chave?.erro === 401) registrarRecusa(P, cfg, 'leitura');
}
// Recusa (401) vinda da leitura da conta ou de qualquer envio de mensagem: vale na hora.
export function registrarRecusa(P, cfg, onde = 'envio') {
  if (!cfg?.id) return null;
  const agora = P.agora().toISOString();
  estadoDaChave(P, cfg);
  return gravar(P, cfg.id, e => (e.recusadaEm ? { ...e, ultimaRecusaEm: agora } : { ...e, recusadaEm: agora, ultimaRecusaEm: agora, recusadaOnde: onde }));
}
export const informarVencimento = (P, cfg, data) => gravar(P, cfg.id, e => ({ ...e, expiraInformada: data || null }));
// Chave recusada e ainda não revalidada: novos envios param até uma leitura da conta dar certo.
export function chaveRecusada(P, cfg) {
  const e = cfg?.id ? lerRegistro(P)[cfg.id] : null;
  return !!e?.recusadaEm;
}
export const podeRevalidar = (P, cfg) => { const e = lerRegistro(P)[cfg?.id]; return !e?.revalidadoEm || P.agora().getTime() - Date.parse(e.revalidadoEm) >= REVALIDAR_MS; };
export const marcarRevalidacao = (P, cfg) => gravar(P, cfg.id, e => ({ ...e, revalidadoEm: P.agora().toISOString() }));

// ------------------------------------------------------------------ situação
const GRAU = { ok: 0, info: 1, atencao: 2, critico: 3, erro: 4 };
export const ROTULO = { ok: 'Em dia', info: 'Troca próxima', atencao: 'Atenção', critico: 'Vence em breve', vencida: 'Vencida', recusada: 'Recusada' };

/**
 * Situação da chave em uso, só com o que está persistido (não chama o OpenRouter).
 * Devolve as duas frentes separadas (provedor e troca preventiva) e o estado que prevalece.
 */
export function situacaoChave(P, cfg) {
  if (!cfg?.id) return { nivel: 'sem_chave', codigo: 'sem_chave', rotulo: 'Sem chave', texto: 'Nenhuma chave configurada.' };
  const e = estadoDaChave(P, cfg), pol = politicaChave(P), agora = P.agora().getTime(), hoje = dataLocal(agora);
  // Troca preventiva (política interna).
  const inicio = dataLocal(Date.parse(e.desde));
  const proximaTroca = somarDias(inicio, pol.rotacaoDias);
  const diasTroca = diasEntre(hoje, proximaTroca);
  const troca = { inicio, desde: e.desde, rotacaoDias: pol.rotacaoDias, proximaTroca, diasRestantes: diasTroca, emUsoDias: diasEntre(inicio, hoje),
    ...(diasTroca < 0 ? { nivel: 'atencao', codigo: 'troca_atrasada', texto: `Troca preventiva atrasada ${plural(-diasTroca)} (prevista para ${dataBr(proximaTroca)}, a cada ${plural(pol.rotacaoDias)}).` }
      : diasTroca === 0 ? { nivel: 'atencao', codigo: 'troca_hoje', texto: `Troca preventiva prevista para hoje (a cada ${plural(pol.rotacaoDias)}).` }
        : diasTroca <= 7 ? { nivel: 'atencao', codigo: 'troca_proxima', texto: `Troca preventiva em ${plural(diasTroca)} (${dataBr(proximaTroca)}).` }
          : diasTroca <= 30 ? { nivel: 'info', codigo: 'troca_em_breve', texto: `Troca preventiva em ${plural(diasTroca)} (${dataBr(proximaTroca)}).` }
            : { nivel: 'ok', codigo: 'troca_em_dia', texto: `Próxima troca preventiva em ${dataBr(proximaTroca)} (${plural(diasTroca)}).` }) };
  // Validade externa (provedor). O vencimento informado pelo OpenRouter prevalece sobre o digitado.
  const pv = e.provedor || null;
  const fonte = pv?.expiraEm ? 'openrouter' : e.expiraInformada ? 'informada' : null;
  const instante = pv?.expiraEm ? Date.parse(pv.expiraEm) : e.expiraInformada ? fimDoDia(e.expiraInformada) : null;
  const dataVenc = instante ? dataLocal(instante) : null;
  const diasVenc = instante ? diasEntre(hoje, dataVenc) : null;
  const provedor = {
    fonte, expiraEm: fonte === 'openrouter' ? pv.expiraEm : e.expiraInformada || null, data: dataVenc, diasRestantes: diasVenc,
    // Sem data: "não definido" = o OpenRouter respondeu sem vencimento; "não informado" = ainda não foi possível ler.
    semData: fonte ? null : pv?.consultadoEm ? 'nao_definido' : 'nao_informado',
    validadoEm: e.validadoEm || null, recusadaEm: e.recusadaEm || null,
  };
  let ext;
  if (e.recusadaEm) ext = { nivel: 'erro', codigo: 'recusada', texto: 'O OpenRouter está recusando esta chave (vencida, revogada, desativada ou inexistente). A IA das empresas está parada até você informar uma chave nova.' };
  else if (instante && instante <= agora) ext = { nivel: 'erro', codigo: 'vencida', texto: `A chave venceu em ${dataBr(dataVenc)}${fonte === 'informada' ? ' (data informada no console)' : ''}. Informe uma chave nova.` };
  else if (instante && diasVenc <= 7) ext = { nivel: 'critico', codigo: diasVenc === 0 ? 'vence_hoje' : 'vence_em_breve', texto: diasVenc === 0 ? 'A chave vence hoje no provedor. Troque agora.' : `A chave vence no provedor em ${plural(diasVenc)} (${dataBr(dataVenc)}). Troque antes disso.` };
  else if (instante && diasVenc <= 30) ext = { nivel: 'atencao', codigo: 'vence', texto: `A chave vence no provedor em ${plural(diasVenc)} (${dataBr(dataVenc)}). Programe a troca.` };
  else ext = { nivel: 'ok', codigo: instante ? 'vencimento_distante' : 'sem_vencimento_conhecido', texto: instante ? `Vencimento no provedor em ${dataBr(dataVenc)}.` : provedor.semData === 'nao_definido' ? 'Vencimento no provedor: não definido no OpenRouter.' : 'Vencimento no provedor: não informado.' };
  Object.assign(provedor, ext);
  // Prevalece o mais grave; empate: a validade externa (é real, não uma política).
  const vence = GRAU[provedor.nivel] >= GRAU[troca.nivel] && provedor.nivel !== 'ok' ? provedor : troca.nivel !== 'ok' ? troca : provedor.nivel !== 'ok' ? provedor : { nivel: 'ok', codigo: 'ok', texto: troca.texto };
  const rotulo = vence.codigo === 'recusada' ? ROTULO.recusada : vence.codigo === 'vencida' ? ROTULO.vencida : ROTULO[vence.nivel];
  return { nivel: vence.nivel, codigo: vence.codigo, rotulo, texto: vence.texto, id: cfg.id, mascara: cfg.mascara, origem: cfg.origem, provedor, troca };
}

// ------------------------------------------------------------------ avisos por email
// Estágio atual (um só) de cada frente. Cada estágio vira no máximo um email por chave e destinatário.
function estagios(s) {
  const l = [];
  const p = s.provedor, t = s.troca;
  if (p.codigo === 'recusada') l.push(`recusada:${p.recusadaEm.slice(0, 10)}`);   // nova recusa depois de uma recuperação avisa de novo
  else if (p.codigo === 'vencida') l.push('venc_vencida');
  else if (p.diasRestantes !== null && p.diasRestantes !== undefined) {
    const d = p.diasRestantes;
    if (d === 0) l.push('venc_hoje'); else if (d === 1) l.push('venc_1'); else if (d <= 7) l.push('venc_7'); else if (d <= 30) l.push('venc_30');
  }
  const d = t.diasRestantes;
  if (d < 0) l.push('troca_atrasada'); else if (d === 0) l.push('troca_hoje'); else if (d === 1) l.push('troca_1'); else if (d <= 7) l.push('troca_7'); else if (d <= 30) l.push('troca_30');
  return l;
}
const ASSUNTO = e => (e.startsWith('recusada') ? 'Chave do OpenRouter recusada: a IA parou' : e === 'venc_vencida' ? 'Chave do OpenRouter vencida: a IA parou'
  : e.startsWith('venc_') ? 'A chave do OpenRouter vai vencer' : e === 'troca_atrasada' ? 'Troca preventiva da chave do OpenRouter atrasada' : 'Troca preventiva da chave do OpenRouter');
const TEXTO_ESTAGIO = (e, s) => (e.startsWith('recusada') || e.startsWith('venc_') ? s.provedor.texto : s.troca.texto);

/**
 * Confere a chave e envia os avisos devidos. Idempotente: cada (chave, estágio, destinatário) é reservado
 * no banco ANTES do envio (a chave primária impede a mesma reserva em duas execuções ou instâncias);
 * envio que falha libera a reserva para a próxima execução; reserva presa (queda no meio) expira em 30 min.
 */
export async function conferirChave(P, cfg) {
  const s = situacaoChave(P, cfg);
  if (!cfg?.id) return { ...s, enviados: 0 };
  const admins = todos(P.db, "select u.email from platform_members m join users u on u.id = m.user_id where u.status = 'ativo'").map(x => x.email);
  const agora = P.agora().toISOString(), limite = new Date(P.agora().getTime() - 30 * 60e3).toISOString();
  exec(P.db, "delete from avisos_chave where estado = 'enviando' and em < ?", limite);
  let enviados = 0;
  for (const e of estagios(s)) {
    for (const para of admins) {
      const reservou = exec(P.db, "insert or ignore into avisos_chave (chave_id, estagio, destinatario, estado, em) values (?, ?, ?, 'enviando', ?)", cfg.id, e, para, agora).changes === 1;
      if (!reservou) continue;
      const texto = `${TEXTO_ESTAGIO(e, s)}\n\nChave em uso: ${s.mascara} (${s.origem === 'console' ? 'informada no console' : 'variável OPENROUTER_API_KEY'}).\n`
        + `Vencimento no provedor: ${s.provedor.data ? dataBr(s.provedor.data) : s.provedor.semData === 'nao_definido' ? 'não definido no OpenRouter' : 'não informado'}.\n`
        + `Próxima troca preventiva: ${dataBr(s.troca.proximaTroca)} (a cada ${plural(s.troca.rotacaoDias)}).\n\n`
        + 'Para trocar: crie uma chave nova em https://openrouter.ai/settings/keys, informe-a no console da plataforma, em Uso → Chave do OpenRouter, e depois desative a antiga no OpenRouter.';
      try {
        await P.email.enviar(para, ASSUNTO(e), texto);
        exec(P.db, "update avisos_chave set estado = 'enviado', em = ? where chave_id = ? and estagio = ? and destinatario = ?", P.agora().toISOString(), cfg.id, e, para);
        enviados++;
      } catch (x) {
        exec(P.db, "delete from avisos_chave where chave_id = ? and estagio = ? and destinatario = ? and estado = 'enviando'", cfg.id, e, para);
        P.log('aviso de chave', x.message);
      }
    }
  }
  return { ...s, enviados };
}
