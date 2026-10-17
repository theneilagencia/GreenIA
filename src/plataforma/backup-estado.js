// Estado e alertas dos backups no modo multiempresa: a rodada diária copia o banco da plataforma e o de cada
// empresa; cada banco tem sucesso ou falha registrado (auditoria da plataforma + estado em platform_settings), e o
// conjunto é conferido de hora em hora: banco sem backup com menos de 26 h, rodada com falha, S3 recusado (expiração
// do bucket não conferida) ou chave-mestra divergente viram aviso no topo do console e email aos admins da
// plataforma (no máximo um por dia para o mesmo conjunto de problemas). Nunca vai conteúdo, caminho de bucket com
// credencial, nem chave: só identificador do banco, código do erro, tamanho, SHA-256 e datas.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lerAjuste, salvarAjuste } from './db.js';
import { todos } from '../db.js';
import { auditar } from './auditoria.js';
import { ATRASO_BACKUP_HORAS } from '../retencao.js';

const CHAVE = 'backup_estado';
const codigoSeguro = e => (/^[A-Z0-9_]{1,60}$/.test(String(e?.code || '')) ? e.code : 'erro');
const HORA = 3600e3;

export const lerEstado = P => lerAjuste(P.db, CHAVE, null) || { bancos: {}, rodada: null, monitor_desde: null };
const salvar = (P, e) => salvarAjuste(P.db, CHAVE, e);
const aud = (P, acao, id, depois) => { try { auditar(P, { acao, entidade: 'backup', id, depois, origem: { painel: 'backup' } }); } catch (e) { P.log('backup: auditoria falhou', e.message); } };

// Bancos esperados: o da plataforma e o de cada empresa cadastrada (não só os que estão abertos).
export function bancosEsperados(P) {
  return [{ id: 'plataforma', desde: null }, ...todos(P.db, 'select id, created_at from companies order by id').map(c => ({ id: c.id, desde: c.created_at }))];
}

export function registrarSucesso(P, id, b) {
  const e = lerEstado(P), agora = P.agora().toISOString();
  const x = e.bancos[id] || {};
  e.bancos[id] = { ...x, ultimo_local: agora, sha256: b.sha256, tamanho: b.tamanho, ...(b.remoto ? { ultimo_remoto: agora, objeto: b.envio?.objeto || null, sse: b.envio?.sse || null } : {}), falha: null };
  salvar(P, e);
  aud(P, 'backup.completed', id, { tamanho: b.tamanho, sha256: b.sha256, remoto: b.envio ? { objeto: b.envio.objeto, tamanho_cifrado: b.envio.tamanhoCifrado, sse: b.envio.sse } : null });
}

export function registrarFalha(P, id, erro) {
  const e = lerEstado(P), agora = P.agora().toISOString();
  const x = e.bancos[id] || {};
  const etapa = erro?.etapa === 's3' ? 's3' : 'local';
  const falha = { em: agora, etapa, codigo: codigoSeguro(erro), ...(erro?.ciclo ? { motivo: erro.ciclo.motivo } : {}) };
  e.bancos[id] = { ...x, ...(etapa === 's3' && erro.backup ? { ultimo_local: agora, sha256: erro.backup.sha256, tamanho: erro.backup.tamanho } : {}), falha };
  salvar(P, e);
  aud(P, 'backup.failed', id, falha);
  return falha;
}

export function registrarRodada(P, r) {
  const e = lerEstado(P), antes = e.rodada;
  // Repetição de uma rodada incompleta (src/iniciar.js rodadaDevida) soma tentativas; a rodada diária recomeça em 1.
  e.rodada = { em: P.agora().toISOString(), tentativas: r.repeticao ? (antes?.tentativas || 1) + 1 : 1, total: r.total, concluidos: r.concluidos, falhas: r.falhas, s3_bloqueados: r.s3Bloqueados || 0, s3: !!r.s3, ciclo: r.ciclo || null };
  salvar(P, e);
  aud(P, r.falhas || r.s3Bloqueados ? 'backup.run_incomplete' : 'backup.run', null, e.rodada);
}

// Backup automático mais novo de uma pasta local (pelo nome), para não depender só do estado gravado.
function maisNovoLocal(pasta) {
  if (!pasta || !existsSync(pasta)) return null;
  const m = readdirSync(pasta).map(n => /^greenia-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite\.gz$/.exec(n)).filter(Boolean)
    .map(x => Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +x[6]));
  return m.length ? Math.max(...m) : null;
}

// Conferência do conjunto. Devolve os problemas encontrados (vazio = tudo em dia).
export function conferirBackups(P, { horas = ATRASO_BACKUP_HORAS, pasta = P.backup?.pasta, s3 = !!P.backup?.s3, ativo = !!P.backup?.hora } = {}) {
  const agora = P.agora().getTime(), e = lerEstado(P);
  if (!e.monitor_desde) { e.monitor_desde = new Date(agora).toISOString(); salvar(P, e); }
  const problemas = [];
  if (!ativo) return { problemas: [{ banco: '*', tipo: 'desligado', texto: 'O backup automático está desligado (BACKUP_HORA não configurado).' }], verificado_em: new Date(agora).toISOString() };
  const desdeMonitor = Date.parse(e.monitor_desde);
  for (const b of bancosEsperados(P)) {
    const x = e.bancos[b.id] || {};
    const base = Math.max(desdeMonitor, Date.parse(b.desde) || 0);
    const local = Math.max(Date.parse(x.ultimo_local) || 0, maisNovoLocal(pasta && join(pasta, b.id)) || 0);
    if (agora - Math.max(local, base) > horas * HORA) problemas.push({ banco: b.id, tipo: 'atrasado', texto: local ? `último backup local há ${Math.round((agora - local) / HORA)} h` : 'nenhum backup local' });
    if (s3) { const rem = Date.parse(x.ultimo_remoto) || 0; if (agora - Math.max(rem, base) > horas * HORA) problemas.push({ banco: b.id, tipo: 'atrasado_s3', texto: rem ? `última cópia no S3 há ${Math.round((agora - rem) / HORA)} h` : 'nenhuma cópia no S3' }); }
    if (x.falha && agora - Date.parse(x.falha.em) <= horas * HORA) problemas.push({ banco: b.id, tipo: 'falha', texto: `falhou na etapa ${x.falha.etapa} (${x.falha.codigo})${x.falha.motivo ? `: ${x.falha.motivo}` : ''}` });
  }
  const ids = new Set(bancosEsperados(P).map(b => b.id));
  const saiu = Object.keys(e.bancos).filter(id => !ids.has(id));   // empresa excluída sai do estado
  if (saiu.length) { for (const id of saiu) delete e.bancos[id]; salvar(P, e); }
  if (P.alertaChaveMestra) problemas.push({ banco: 'plataforma', tipo: 'chave_mestra', texto: P.alertaChaveMestra.texto });
  return { problemas, verificado_em: new Date(agora).toISOString(), rodada: e.rodada };
}

// Aviso para o topo do console (admins com platform.settings.manage).
export function alertaBackup(P) {
  const c = P._conferenciaBackup;
  if (!c?.problemas?.length) return null;
  return { verificado_em: c.verificado_em, problemas: c.problemas.slice(0, 10), total: c.problemas.length };
}

// Confere, guarda para o console e, se houver problema novo (ou o mesmo há mais de 24 h), avisa por email.
export async function avisarBackups(P, op = {}) {
  const c = conferirBackups(P, op);
  P._conferenciaBackup = c;
  if (!c.problemas.length) { salvarAjuste(P.db, 'alerta_backup', null); return { ...c, avisou: false }; }
  const assinatura = createHash('sha256').update(c.problemas.map(p => `${p.banco}:${p.tipo}`).sort().join('|')).digest('hex').slice(0, 16);
  const ult = lerAjuste(P.db, 'alerta_backup', null);
  if (ult && ult.assinatura === assinatura && P.agora().getTime() - Date.parse(ult.em) < 24 * HORA) return { ...c, avisou: false };
  salvarAjuste(P.db, 'alerta_backup', { em: P.agora().toISOString(), assinatura });
  P.log(`ATENÇÃO: backups com problema (${c.problemas.length}): ${c.problemas.map(p => `${p.banco} ${p.tipo}`).join('; ')}`);
  aud(P, 'backup.alert', null, { problemas: c.problemas });
  const admins = P.adminsPlataforma();
  const texto = `A conferência dos backups da plataforma encontrou ${c.problemas.length} ${c.problemas.length === 1 ? 'problema' : 'problemas'}:\n\n`
    + c.problemas.map(p => `- ${p.banco}: ${p.texto}`).join('\n')
    + `\n\nSem backup em dia, uma falha de disco pode perder dados. Confira os logs do serviço e o procedimento em docs/operacao/backup-e-restauracao.md.`;
  await Promise.all(admins.map(para => P.email.enviar(para, `Backups com problema (${c.problemas.length})`, texto).catch(e => P.log('alerta de backup', e.message))));
  return { ...c, avisou: admins.length > 0 };
}
