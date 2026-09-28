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
// Regra de tempo: o cálculo usa só instantes UTC e durações. Início = instante em que a chave passou a
// valer para a plataforma; próxima troca = início + N × 24 h; vencimento do provedor = instante do
// expires_at. Estados e estágios saem da duração restante (30 dias, 7 dias, 48 h, 24 h, 0). Nenhum
// calendário ou fuso entra na conta. O fuso da plataforma (PLATAFORMA_FUSO) serve só para EXIBIR
// datas e para converter, uma vez, a data que o admin digita ("vence em 31/12") em instante UTC.
import { createHmac } from 'node:crypto';
import { exec, todos } from '../db.js';
import { lerAjuste, salvarAjuste } from './db.js';

export const ROTACAO_PADRAO = 90, ROTACAO_MIN = 7, ROTACAO_MAX = 730, FUSO_PADRAO = 'America/Sao_Paulo';
const H = 3600e3, DIA = 24 * H, HISTORICO = 20, REVALIDAR_MS = 10 * 60e3;

export const impressaoChave = (mestra, chave) => createHmac('sha256', mestra).update(String(chave)).digest('hex').slice(0, 32);

// ------------------------------------------------------------------ tempo: cálculo em UTC, exibição no fuso
export function fusoValido(f) { try { new Intl.DateTimeFormat('pt-BR', { timeZone: f }); return !!f; } catch { return false; } }
export const fusoDe = P => (fusoValido(P.fuso) ? P.fuso : FUSO_PADRAO);
const iso = ms => new Date(ms).toISOString();
// Dias inteiros de 24 h: para frente, os que ainda cabem; para trás, os que já passaram (negativo).
export const diasDe = ms => (ms > 0 ? Math.floor(ms / DIA) : -Math.floor(-ms / DIA));
export const formatarInstante = (ms, fuso) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
const plural = n => `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
// Duração legível: dias a partir de 48 h; abaixo disso, horas.
export function duracaoTxt(ms) {
  const a = Math.abs(ms);
  if (a >= 2 * DIA) return plural(Math.floor(a / DIA));
  const h = Math.max(1, Math.floor(a / H));
  return `${h} ${h === 1 ? 'hora' : 'horas'}`;
}
// Quanto o fuso está à frente de UTC num instante (considera horário de verão, se o fuso tiver).
function deslocamento(ms, fuso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// Data digitada pelo admin ("AAAA-MM-DD") → último segundo daquele dia no fuso da plataforma, em UTC.
export function fimDoDiaNoFuso(data, fuso) {
  const [y, m, d] = data.split('-').map(Number), local = Date.UTC(y, m - 1, d, 23, 59, 59);
  let ms = local - deslocamento(local, fuso);
  ms = local - deslocamento(ms, fuso);
  return ms;
}

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
// Vencimento informado: convertido já na entrada para instante UTC (com o fuso da plataforma daquele
// momento); a data digitada fica só para mostrar de volta no formulário.
export const informarVencimento = (P, cfg, data) => gravar(P, cfg.id, e => ({ ...e, expiraInformada: data || null,
  expiraInformadaEm: data ? iso(fimDoDiaNoFuso(data, fusoDe(P))) : null, expiraInformadaFuso: data ? fusoDe(P) : null }));
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
  const e = estadoDaChave(P, cfg), pol = politicaChave(P), agora = P.agora().getTime(), fuso = fusoDe(P);
  const quando = ms => formatarInstante(ms, fuso);
  // Troca preventiva (política interna): início + N × 24 h.
  const inicioMs = Date.parse(e.desde), trocaMs = inicioMs + pol.rotacaoDias * DIA, rt = trocaMs - agora;
  const troca = { inicio: e.desde, proximaTroca: iso(trocaMs), restanteMs: rt, diasRestantes: diasDe(rt), emUsoDias: diasDe(agora - inicioMs), rotacaoDias: pol.rotacaoDias,
    ...(rt <= 0 ? { nivel: 'atencao', codigo: 'troca_atrasada', texto: `Troca preventiva atrasada há ${duracaoTxt(rt)} (prevista para ${quando(trocaMs)}, a cada ${plural(pol.rotacaoDias)}).` }
      : rt <= DIA ? { nivel: 'atencao', codigo: 'troca_24h', texto: `Troca preventiva prevista para daqui a ${duracaoTxt(rt)} (${quando(trocaMs)}).` }
        : rt <= 7 * DIA ? { nivel: 'atencao', codigo: 'troca_proxima', texto: `Troca preventiva em ${duracaoTxt(rt)} (${quando(trocaMs)}).` }
          : rt <= 30 * DIA ? { nivel: 'info', codigo: 'troca_em_breve', texto: `Troca preventiva em ${duracaoTxt(rt)} (${quando(trocaMs)}).` }
            : { nivel: 'ok', codigo: 'troca_em_dia', texto: `Próxima troca preventiva em ${quando(trocaMs)} (${duracaoTxt(rt)}).` }) };
  // Validade externa (provedor). O vencimento informado pelo OpenRouter prevalece sobre o digitado.
  const pv = e.provedor || null;
  const informadaMs = e.expiraInformadaEm ? Date.parse(e.expiraInformadaEm) : e.expiraInformada ? fimDoDiaNoFuso(e.expiraInformada, fuso) : null;   // registros antigos: só a data
  const fonte = pv?.expiraEm ? 'openrouter' : informadaMs ? 'informada' : null;
  const vencMs = pv?.expiraEm ? Date.parse(pv.expiraEm) : informadaMs;
  const rv = vencMs ? vencMs - agora : null;
  const provedor = {
    fonte, expiraEm: vencMs ? iso(vencMs) : null, restanteMs: rv, diasRestantes: rv === null ? null : diasDe(rv), dataInformada: e.expiraInformada || null,
    // Sem data: "não definido" = o OpenRouter respondeu sem vencimento; "não informado" = ainda não foi possível ler.
    semData: fonte ? null : pv?.consultadoEm ? 'nao_definido' : 'nao_informado',
    validadoEm: e.validadoEm || null, recusadaEm: e.recusadaEm || null,
  };
  const origemData = fonte === 'informada' ? ' (data informada no console)' : '';
  let ext;
  if (e.recusadaEm) ext = { nivel: 'erro', codigo: 'recusada', texto: 'O OpenRouter está recusando esta chave (vencida, revogada, desativada ou inexistente). A IA das empresas está parada até você informar uma chave nova.' };
  else if (vencMs && rv <= 0) ext = { nivel: 'erro', codigo: 'vencida', texto: `A chave venceu em ${quando(vencMs)}${origemData}. Informe uma chave nova.` };
  else if (vencMs && rv <= DIA) ext = { nivel: 'critico', codigo: 'vence_24h', texto: `A chave vence no provedor em ${duracaoTxt(rv)} (${quando(vencMs)})${origemData}. Troque agora.` };
  else if (vencMs && rv <= 7 * DIA) ext = { nivel: 'critico', codigo: 'vence_em_breve', texto: `A chave vence no provedor em ${duracaoTxt(rv)} (${quando(vencMs)})${origemData}. Troque antes disso.` };
  else if (vencMs && rv <= 30 * DIA) ext = { nivel: 'atencao', codigo: 'vence', texto: `A chave vence no provedor em ${duracaoTxt(rv)} (${quando(vencMs)})${origemData}. Programe a troca.` };
  else ext = { nivel: 'ok', codigo: vencMs ? 'vencimento_distante' : 'sem_vencimento_conhecido', texto: vencMs ? `Vencimento no provedor em ${quando(vencMs)}${origemData}.` : provedor.semData === 'nao_definido' ? 'Vencimento no provedor: não definido no OpenRouter.' : 'Vencimento no provedor: não informado.' };
  Object.assign(provedor, ext);
  // Prevalece o mais grave; empate: a validade externa (é real, não uma política).
  const vence = GRAU[provedor.nivel] >= GRAU[troca.nivel] && provedor.nivel !== 'ok' ? provedor : troca.nivel !== 'ok' ? troca : provedor.nivel !== 'ok' ? provedor : { nivel: 'ok', codigo: 'ok', texto: troca.texto };
  const rotulo = vence.codigo === 'recusada' ? ROTULO.recusada : vence.codigo === 'vencida' ? ROTULO.vencida : ROTULO[vence.nivel];
  return { nivel: vence.nivel, codigo: vence.codigo, rotulo, texto: vence.texto, id: cfg.id, mascara: cfg.mascara, origem: cfg.origem, fuso, agora: iso(agora), provedor, troca };
}

// ------------------------------------------------------------------ avisos por email
// Estágio atual (um só) de cada frente. Cada estágio vira no máximo um email por chave e destinatário.
// Por duração restante: 30 dias, 7 dias, 48 h ("1 dia antes"), 24 h ("no dia") e vencido/atrasado.
function estagios(s) {
  const l = [], p = s.provedor, t = s.troca;
  const faixa = ms => (ms <= 0 ? 'fim' : ms <= DIA ? '24h' : ms <= 2 * DIA ? '48h' : ms <= 7 * DIA ? '7d' : ms <= 30 * DIA ? '30d' : null);
  if (p.codigo === 'recusada') l.push(`recusada:${p.recusadaEm}`);   // nova recusa depois de uma recuperação avisa de novo
  else if (p.restanteMs !== null && p.restanteMs !== undefined) { const f = faixa(p.restanteMs); if (f) l.push(f === 'fim' ? 'venc_vencida' : `venc_${f}`); }
  const f = faixa(t.restanteMs);
  if (f) l.push(f === 'fim' ? 'troca_atrasada' : `troca_${f}`);
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
        + `Vencimento no provedor: ${s.provedor.expiraEm ? formatarInstante(Date.parse(s.provedor.expiraEm), s.fuso) : s.provedor.semData === 'nao_definido' ? 'não definido no OpenRouter' : 'não informado'}.\n`
        + `Próxima troca preventiva: ${formatarInstante(Date.parse(s.troca.proximaTroca), s.fuso)} (a cada ${plural(s.troca.rotacaoDias)}).\n`
        + `Horários no fuso da plataforma (${s.fuso}).\n\n`
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
