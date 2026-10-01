// Política de retenção das cópias (docs/politica-retencao.md). Responde, por camada, por quanto tempo um dado
// apagado no ambiente ativo ainda pode existir em cópias, e elimina o que passou do prazo.
//
// - Backups automáticos (dados/backups/**/greenia-AAAAMMDD-HHMMSS.sqlite.gz): até 7 dias de idade.
// - Backups manuais (pasta com backup.json em dados/backups): até 30 dias desde a criação.
// - Cópia de empresa excluída (dados/excluidas): até 30 dias desde a exclusão.
// - Cópia anterior a uma restauração (*.antes-da-restauracao, com manifesto): até 30 dias.
// - Hold (HOLD.json na pasta, ou <arquivo>.hold.json): preservado, com motivo e responsável, fora da limpeza.
// - O que não tem classificação (pasta manual sem backup.json, arquivo desconhecido) nunca é apagado: vira alerta.
//
// Segurança: só age dentro de dados/backups, dados/excluidas e nas cópias *.antes-da-restauracao; nunca toca
// bancos em uso, -wal, -shm nem a chave-mestra; ignora links simbólicos; o plano é só leitura (dry-run) e a
// execução apaga só o que o plano marcou, conferindo de novo cada item. Logs e auditoria: metadados, nunca conteúdo.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const DIA = 864e5;
export const PRAZOS_PADRAO = { automaticoDias: 7, manualDias: 30, excluidasDias: 30 };
export const ATRASO_BACKUP_HORAS = 26;   // backup automático mais novo de um banco com mais do que isso vira alerta

export function prazosDe(env = {}) {
  const n = (v, p) => { const x = Number(v); return Number.isFinite(x) && x >= 1 && x <= 3650 ? x : p; };
  return { automaticoDias: n(env.RETENCAO_AUTOMATICO_DIAS, PRAZOS_PADRAO.automaticoDias), manualDias: n(env.RETENCAO_MANUAL_DIAS, PRAZOS_PADRAO.manualDias),
    excluidasDias: n(env.RETENCAO_EXCLUIDAS_DIAS, PRAZOS_PADRAO.excluidasDias) };
}

const AUTOMATICO = /^greenia-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite\.gz$/;
const dataDoNome = nome => { const m = AUTOMATICO.exec(nome); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
const lerJson = arq => { try { return JSON.parse(readFileSync(arq, 'utf8')); } catch { return null; } };
const ehLink = p => { try { return lstatSync(p).isSymbolicLink(); } catch { return true; } };
const tamanho = p => { try { const s = lstatSync(p); if (s.isFile()) return s.size; if (!s.isDirectory()) return 0; return readdirSync(p).reduce((t, n) => t + tamanho(join(p, n)), 0); } catch { return 0; } };
const dataIso = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

// Hold válido: motivo (10+ caracteres), responsável e data. Hold inválido não libera a limpeza: vira alerta.
export function lerHold(arquivo) {
  if (!existsSync(arquivo)) return null;
  const h = lerJson(arquivo);
  const valido = !!(h && String(h.motivo || '').trim().length >= 10 && String(h.por || '').trim() && dataIso(h.desde));
  return { valido, motivo: h?.motivo || null, por: h?.por || null, desde: h?.desde || null, revisar_em: h?.revisar_em || null };
}

// Plano de limpeza (só leitura). `dados`: pasta raiz dos dados; `bancosAtivos`: caminhos dos bancos em uso.
export function planejar({ dados = 'dados', agora = new Date(), prazos = PRAZOS_PADRAO, bancosAtivos = [] } = {}) {
  const raiz = resolve(dados);
  const t0 = agora.getTime();
  const protegidos = new Set(bancosAtivos.filter(b => b && b !== ':memory:').flatMap(b => ['', '-wal', '-shm'].map(s => resolve(b) + s)));
  protegidos.add(join(raiz, '.chave-mestra'));
  const itens = [];
  const mostra = p => { const r = relative(process.cwd(), p); return r && !r.startsWith('..') ? r : p; };
  const add = (caminho, extra) => itens.push({ caminho: mostra(caminho), absoluto: caminho, tamanho: tamanho(caminho), ...extra });
  const idade = ms => (ms == null ? null : Math.round(((t0 - ms) / DIA) * 10) / 10);
  const decidir = (criado, dias) => (criado == null ? null : t0 - criado > dias * DIA ? 'apagar' : 'manter');

  // 1) dados/backups: automáticos por idade; pastas manuais por manifesto; o resto vira alerta.
  const backups = join(raiz, 'backups');
  const ultimoAutomatico = new Map();   // pasta → criação do automático mais novo
  const percorrer = (pasta, nivel) => {
    for (const nome of existsSync(pasta) ? readdirSync(pasta).sort() : []) {
      const p = join(pasta, nome);
      if (ehLink(p)) { add(p, { camada: 'desconhecido', acao: 'alerta', motivo: 'link simbólico ignorado' }); continue; }
      const st = lstatSync(p);
      if (st.isDirectory()) {
        const manifesto = join(p, 'backup.json'), hold = lerHold(join(p, 'HOLD.json'));
        const ehManual = existsSync(manifesto) || hold || /^(pre-|manual-|pos-|migracao-)/.test(nome);
        if (ehManual) {
          const m = lerJson(manifesto);
          const criado = dataIso(m?.criado_em);
          if (hold?.valido) add(p, { camada: 'manual', criado_em: m?.criado_em || null, idade_dias: idade(criado), acao: 'manter', motivo: `hold: ${hold.motivo}`, hold });
          else if (hold) add(p, { camada: 'manual', acao: 'alerta', motivo: 'HOLD.json inválido (precisa de motivo, por e desde): não é apagado' });
          else if (criado == null) add(p, { camada: 'manual', acao: 'alerta', motivo: 'backup manual sem classificação (sem backup.json): não é apagado' });
          else add(p, { camada: 'manual', criado_em: m.criado_em, idade_dias: idade(criado), expira_em: new Date(criado + prazos.manualDias * DIA).toISOString(),
            acao: decidir(criado, prazos.manualDias), motivo: `manual: ${prazos.manualDias} dias`, tipo: m.tipo || 'manual' });
        } else if (nivel < 3) percorrer(p, nivel + 1);
        else add(p, { camada: 'desconhecido', acao: 'alerta', motivo: 'pasta fora do padrão: não é apagada' });
        continue;
      }
      const criado = dataDoNome(nome);
      if (criado != null) {
        const hold = lerHold(`${p}.hold.json`);
        if (hold?.valido) { add(p, { camada: 'automatico', criado_em: new Date(criado).toISOString(), idade_dias: idade(criado), acao: 'manter', motivo: `hold: ${hold.motivo}`, hold }); continue; }
        ultimoAutomatico.set(pasta, Math.max(ultimoAutomatico.get(pasta) || 0, criado));
        add(p, { camada: 'automatico', criado_em: new Date(criado).toISOString(), idade_dias: idade(criado), expira_em: new Date(criado + prazos.automaticoDias * DIA).toISOString(),
          acao: decidir(criado, prazos.automaticoDias), motivo: `automático: ${prazos.automaticoDias} dias` });
      } else if (!/\.hold\.json$/.test(nome) && !/^\..*\.tmp$/.test(nome)) add(p, { camada: 'desconhecido', acao: 'alerta', motivo: 'arquivo fora do padrão: não é apagado' });
    }
  };
  percorrer(backups, 0);
  for (const [pasta, ultimo] of ultimoAutomatico) {
    if (t0 - ultimo > ATRASO_BACKUP_HORAS * 3600e3 && relative(backups, pasta) !== '') itens.push({ caminho: mostra(pasta), absoluto: pasta, tamanho: 0, camada: 'automatico', acao: 'alerta', motivo: `backup automático mais novo tem ${idade(ultimo)} dias` });
  }

  // 2) dados/excluidas: cópia da empresa excluída, com manifesto <arquivo>.json (ou data do arquivo, se faltar).
  const excluidas = join(raiz, 'excluidas');
  for (const nome of existsSync(excluidas) ? readdirSync(excluidas).sort() : []) {
    if (/\.(hold\.)?json$/.test(nome)) continue;
    const p = join(excluidas, nome);
    if (ehLink(p) || !lstatSync(p).isFile()) { add(p, { camada: 'excluidas', acao: 'alerta', motivo: 'item fora do padrão: não é apagado' }); continue; }
    const m = lerJson(`${p}.json`);
    const criado = dataIso(m?.excluida_em) ?? lstatSync(p).mtimeMs;
    const hold = lerHold(`${p}.hold.json`);
    if (hold?.valido) add(p, { camada: 'excluidas', criado_em: new Date(criado).toISOString(), idade_dias: idade(criado), acao: 'manter', motivo: `hold: ${hold.motivo}`, hold });
    else if (hold) add(p, { camada: 'excluidas', acao: 'alerta', motivo: 'hold inválido: não é apagado' });
    else add(p, { camada: 'excluidas', criado_em: new Date(criado).toISOString(), idade_dias: idade(criado), expira_em: new Date(criado + prazos.excluidasDias * DIA).toISOString(),
      acao: decidir(criado, prazos.excluidasDias), motivo: `empresa excluída: ${prazos.excluidasDias} dias${m ? '' : ' (data do arquivo)'}`, extras: [`${p}.json`] });
  }

  // 3) Cópias anteriores a uma restauração, ao lado dos bancos (raiz e uma subpasta, ex.: dados/empresas).
  const restos = [raiz, ...(existsSync(raiz) ? readdirSync(raiz).map(n => join(raiz, n)).filter(p => !ehLink(p) && lstatSync(p).isDirectory() && ![backups, excluidas].includes(p)) : [])];
  for (const pasta of restos) for (const nome of readdirSync(pasta).filter(n => n.endsWith('.antes-da-restauracao'))) {
    const p = join(pasta, nome);
    if (protegidos.has(p) || ehLink(p)) continue;
    const m = lerJson(`${p}.json`), criado = dataIso(m?.criado_em), hold = lerHold(`${p}.hold.json`);
    if (hold?.valido) add(p, { camada: 'restauracao', acao: 'manter', motivo: `hold: ${hold.motivo}`, hold });
    else if (criado == null) add(p, { camada: 'restauracao', acao: 'alerta', motivo: 'cópia de restauração sem manifesto: não é apagada' });
    else add(p, { camada: 'restauracao', criado_em: m.criado_em, idade_dias: idade(criado), expira_em: new Date(criado + prazos.manualDias * DIA).toISOString(),
      acao: decidir(criado, prazos.manualDias), motivo: `restauração: ${prazos.manualDias} dias`, extras: [`${p}.json`] });
  }

  // Nada protegido pode ter caído no plano como "apagar".
  for (const i of itens) if (i.acao === 'apagar' && (protegidos.has(i.absoluto) || !dentro(raiz, i.absoluto))) { i.acao = 'alerta'; i.motivo = 'protegido: não é apagado'; }
  const resumo = { apagar: itens.filter(i => i.acao === 'apagar').length, manter: itens.filter(i => i.acao === 'manter').length, alertas: itens.filter(i => i.acao === 'alerta').length,
    bytesApagar: itens.filter(i => i.acao === 'apagar').reduce((t, i) => t + i.tamanho, 0) };
  return { em: agora.toISOString(), raiz, prazos, itens, resumo };
}

const dentro = (raiz, p) => { const r = relative(raiz, p); return !!r && !r.startsWith('..') && !r.startsWith(sep) && r !== '.'; };

// Executa um plano. Sem `aplicar`, só devolve o que faria (dry-run). Cada item é conferido de novo antes de apagar.
export function executar(plano, { aplicar = false, log = () => {}, auditar = () => {} } = {}) {
  const feitos = [];
  for (const i of plano.itens.filter(x => x.acao === 'apagar')) {
    const meta = { caminho: i.caminho, camada: i.camada, tamanho: i.tamanho, criado_em: i.criado_em, idade_dias: i.idade_dias, motivo: i.motivo };
    if (!aplicar) { feitos.push({ ...meta, resultado: 'dry-run' }); continue; }
    if (!existsSync(i.absoluto) || ehLink(i.absoluto) || !dentro(plano.raiz, realpathSync(i.absoluto)) || lerHold(join(i.absoluto, 'HOLD.json'))?.valido || lerHold(`${i.absoluto}.hold.json`)?.valido) {
      feitos.push({ ...meta, resultado: 'ignorado (mudou desde o plano)' }); continue;
    }
    try {
      rmSync(i.absoluto, { recursive: true, force: true });
      for (const x of i.extras || []) rmSync(x, { force: true });
      feitos.push({ ...meta, resultado: 'apagado' });
      auditar('retention.deleted', meta);
    } catch (e) { feitos.push({ ...meta, resultado: `falhou: ${e.message}` }); }
  }
  const apagados = feitos.filter(f => f.resultado === 'apagado').length;
  log(`retenção${aplicar ? '' : ' (dry-run)'}: ${aplicar ? apagados : plano.resumo.apagar} a apagar, ${plano.resumo.manter} mantidos, ${plano.resumo.alertas} alertas`);
  for (const a of plano.itens.filter(x => x.acao === 'alerta')) log(`retenção alerta: ${a.caminho}: ${a.motivo}`);
  if (aplicar) auditar('retention.run', { apagados, mantidos: plano.resumo.manter, alertas: plano.resumo.alertas, prazos: plano.prazos });
  return { aplicado: aplicar, feitos };
}

// Hold e classificação: só dentro de dados/backups e dados/excluidas (ou cópia de restauração), com motivo.
function alvoPermitido(dados, alvo) {
  const raiz = resolve(dados), p = resolve(alvo);
  if (!existsSync(p) || ehLink(p)) throw new Error(`Não encontrado (ou link simbólico): ${alvo}`);
  const ok = dentro(join(raiz, 'backups'), p) || dentro(join(raiz, 'excluidas'), p) || (p.endsWith('.antes-da-restauracao') && dentro(raiz, p));
  if (!ok) throw new Error('Hold e classificação valem só para backups, cópias de empresas excluídas e cópias de restauração.');
  return p;
}
const arquivoHold = p => (lstatSync(p).isDirectory() ? join(p, 'HOLD.json') : `${p}.hold.json`);

export function marcarHold(dados, alvo, { motivo, por, revisar_em = null, agora = new Date() }) {
  const p = alvoPermitido(dados, alvo);
  if (String(motivo || '').trim().length < 10) throw new Error('O hold precisa de um motivo (pelo menos 10 caracteres).');
  if (!String(por || '').trim()) throw new Error('O hold precisa de um responsável (--por).');
  const h = { motivo: String(motivo).trim(), por: String(por).trim(), desde: agora.toISOString(), revisar_em };
  writeFileSync(arquivoHold(p), JSON.stringify(h, null, 2) + '\n');
  return h;
}
export function liberarHold(dados, alvo) {
  const p = alvoPermitido(dados, alvo);
  const a = arquivoHold(p);
  if (!existsSync(a)) throw new Error('Este item não está em hold.');
  rmSync(a);
  return true;
}
// Classifica um backup manual antigo (sem backup.json): a data de criação passa a valer para o prazo.
export function classificarManual(dados, alvo, { criado_em, tipo = 'manual', motivo }) {
  const p = alvoPermitido(dados, alvo);
  if (!lstatSync(p).isDirectory()) throw new Error('Classificação de backup manual vale para pastas em dados/backups.');
  if (dataIso(criado_em) == null) throw new Error('Informe a data de criação (ISO, ex.: 2026-09-30T16:46:09Z).');
  if (existsSync(join(p, 'backup.json'))) throw new Error('Esta pasta já tem backup.json.');
  const m = { tipo, criado_em: new Date(dataIso(criado_em)).toISOString(), motivo: String(motivo || '').trim() || null, classificado_em: new Date().toISOString() };
  writeFileSync(join(p, 'backup.json'), JSON.stringify(m, null, 2) + '\n');
  return m;
}

// Backup manual (antes de deploy, migração ou intervenção): cópia consistente de cada banco, com manifesto.
export function backupManual({ dados = 'dados', bancos, tipo = 'pre-deploy', motivo, agora = new Date() }) {
  if (String(motivo || '').trim().length < 10) throw new Error('Informe o motivo do backup manual (pelo menos 10 caracteres).');
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const pasta = join(resolve(dados), 'backups', `${tipo}-${carimbo}`);
  mkdirSync(pasta, { recursive: true });
  const arquivos = [];
  for (const [nome, banco] of Object.entries(bancos)) {
    const temp = join(tmpdir(), `greenia-manual-${randomUUID()}.sqlite`);
    const db = new DatabaseSync(banco, { readOnly: true });
    try { db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`); } finally { db.close(); }
    try { writeFileSync(join(pasta, `${nome}.sqlite.gz`), gzipSync(readFileSync(temp), { level: 9 })); } finally { rmSync(temp, { force: true }); }
    arquivos.push(`${nome}.sqlite.gz`);
  }
  const m = { tipo, criado_em: agora.toISOString(), motivo: String(motivo).trim(), arquivos };
  writeFileSync(join(pasta, 'backup.json'), JSON.stringify(m, null, 2) + '\n');
  return { pasta, ...m };
}

// Manifesto das cópias geradas pelo sistema (empresa excluída, restauração).
export function gravarManifesto(arquivo, dados) { writeFileSync(`${arquivo}.json`, JSON.stringify(dados, null, 2) + '\n'); }

// Rodada periódica: consolida o WAL de cada banco e aplica (ou só simula) a limpeza. Aplicar exige
// RETENCAO_APLICAR=1; sem ela, a rodada só registra o que faria (dry-run), para revisão antes de ligar.
export function rodadaRetencao({ dados, bancos, prazos, aplicar, log, auditar, agora = new Date(), consolidar }) {
  for (const db of bancos.dbs) { const r = consolidar(db); if (!r.ok) log(`retenção: WAL não consolidado agora (${r.erro || 'em uso'}); fica para a próxima rodada`); }
  const plano = planejar({ dados, agora, prazos, bancosAtivos: bancos.arquivos });
  return { plano, ...executar(plano, { aplicar, log, auditar }) };
}
