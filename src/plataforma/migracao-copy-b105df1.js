// Migração única (one-shot) do release de copy b105df1: troca, nas duas empresas que ainda herdam o texto do modelo
// antigo, exatamente 15 campos da landing e da marca pelo texto do modelo b105df1. Roda no boot, antes do servidor
// aceitar tráfego, e só uma vez: o marcador em platform_settings é gravado depois de tudo aplicado e validado; com ele,
// o boot segue direto. Não tem rota, não lê variável nem parâmetro externo, não toca na política nem no banco das
// empresas (só lê politica_versoes e config para provar que não mudaram). Grava só por salvarLanding e salvarMarca.
// Qualquer divergência, truncamento, campo fora da lista, auditoria inesperada ou estado parcial derruba o boot sem
// marcar a migração (o deploy falha em vez de subir em estado incerto). Os logs têm só ids técnicos, nomes de campos,
// contagens e estados: nenhum nome de empresa, email ou texto de landing.
// Temporário: sai do código no commit de limpeza depois de comprovada em produção.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as EM from './empresas.js';
import { lerAjuste, salvarAjuste } from './db.js';
import { um, todos } from '../db.js';

export const ID_MIGRACAO = 'copy-release-b105df1-landings-v1';
export const CHAVE_MIGRACAO = `migracao:${ID_MIGRACAO}`;
const E = '{{empresa}}';
// Textos herdados do modelo antigo, com o nome da empresa trocado por {{empresa}} (inventário e dry-run de 2026-09-30).
const ANTIGO = {
  'subtitulo': ['Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da ' + E + ' são aplicadas antes de cada envio.'],
  'destaques[2]': ['Conversas salvas só para você'],
  'textos.regras_titulo': ['O que pode, o que pede cuidado e o que nunca sai'],
  'textos.tarefas_sub': ['Pedidos que costumam dar bom resultado logo na primeira semana.'],
  'passos[0].texto': ['Use o email da ' + E + '. Um código de 6 dígitos chega na hora.'],
  'chamadas[2].texto': ['Procedimentos e documentos das áreas. A resposta mostra de qual documento veio a informação.'],
  'chamadas[3].texto': ['Você escolhe o tipo de trabalho, não o modelo técnico: Rápido para o dia a dia, Equilibrado para mais contexto, Avançado para análises longas.', 'Você escolhe o tipo de trabalho, não o modelo técnico: Rápido, Equilibrado ou Avançado.'],
  'regras.sigilo[2]': ['A conversa vai só para modelos homologados pela empresa, sem retenção'],
  'regras.nunca[2]': ['A GreenIA bloqueia antes do envio'],
  'marca.privacy_note': ['Suas conversas ficam salvas só para você e podem ser apagadas quando quiser. As regras de dados da empresa são conferidas antes de cada envio à IA.', 'Suas conversas ficam salvas só para você, por até 90 dias sem uso, e você pode apagá-las quando quiser.'],
};
// Limites de gravação (validarConteudoLanding e salvarMarca): o alvo tem de caber inteiro.
const LIMITE = { 'subtitulo': 300, 'destaques[2]': 60, 'chamadas[2].texto': 300, 'chamadas[3].texto': 300, 'textos.regras_titulo': 120, 'textos.tarefas_sub': 240, 'passos[0].texto': 200, 'regras.sigilo[2]': 120, 'regras.nunca[2]': 120, 'marca.privacy_note': 400 };
export const CAMPOS_MIGRACAO = [
  ['emp_dc75e06e913f476d9ab2', ['subtitulo', 'destaques[2]', 'chamadas[2].texto', 'chamadas[3].texto', 'marca.privacy_note']],
  ['emp_7137c3d7bcd64bb29f75', ['subtitulo', 'destaques[2]', 'chamadas[2].texto', 'chamadas[3].texto', 'textos.regras_titulo', 'textos.tarefas_sub', 'passos[0].texto', 'regras.sigilo[2]', 'regras.nunca[2]', 'marca.privacy_note']],
];
export const SIGILO_B105DF1 = 'Com a opção de sigilo ligada pela empresa, a conversa só usa recursos autorizados; se não houver, nada é enviado';
const ORIGEM = modo => ({ painel: 'migracao-copy-release-b105df1', migracao: ID_MIGRACAO, modo });

const partes = p => p.split(/\.|\[(\d+)\]/).filter(Boolean);
const ler = (o, p) => partes(p).reduce((a, k) => a == null ? undefined : a[k], o);
const por = (o, p, v) => { const k = partes(p); let a = o; for (let i = 0; i < k.length - 1; i++) a = a[k[i]]; a[k[k.length - 1]] = v; };
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const folhas = (o, p = '', out = {}) => { if (o !== null && typeof o === 'object') { for (const k of Object.keys(o)) folhas(o[k], Array.isArray(o) ? `${p}[${k}]` : (p ? `${p}.` : '') + k, out); } else out[p] = o; return out; };
const tabelas = db => todos(db, "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").map(t => t.name);
// Hash por conteúdo: linhas serializadas e ordenadas (vale para tabelas WITHOUT ROWID e não depende da ordem física).
const hashTabela = (db, t) => createHash('sha256').update(JSON.stringify(todos(db, `select * from "${t}"`).map(r => JSON.stringify(r)).sort())).digest('hex');
const estado = (db, so) => Object.fromEntries(tabelas(db).filter(t => !so || so.includes(t)).map(t => [t, hashTabela(db, t)]));
const resumo = h => createHash('sha256').update(JSON.stringify(h)).digest('hex').slice(0, 16);
const difTabelas = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(t => a[t] !== b[t]).sort();
class ErroMigracao extends Error {}
const falha = m => { throw new ErroMigracao(m); };
const integridade = db => todos(db, 'pragma integrity_check').map(r => Object.values(r)[0]).join(',');

// Situação de cada campo: herdado do modelo antigo (a migrar), já no alvo b105df1 (migrado) ou outro texto (divergente).
function ler_empresa(P, id, campos, teste) {
  const c = um(P.db, 'select c.name, b.display_name from companies c left join branding b on b.company_id = c.id where c.id = ?', id);
  if (!c) falha(`${id}: empresa NAO_ENCONTRADA`);
  const linha = um(P.db, 'select content from landing_pages where company_id = ?', id);
  if (!linha) falha(`${id}: landing NAO_ENCONTRADA`);
  const salvo = JSON.parse(linha.content || '{}');
  const landing = EM.lerLanding(P, id), marca = EM.lerMarca(P, id);
  const nomeModelo = marca.display_name || c.name || '';
  const novoL = EM.landingPadrao(nomeModelo), novoM = EM.marcaPadrao(nomeModelo);
  const nomes = [c.name, c.display_name].filter(Boolean).sort((a, b) => b.length - a.length);
  const tok = v => nomes.reduce((s, n) => s.split(n).join(E), norm(v));
  const alvo = campo => { const v = campo.startsWith('marca.') ? novoM.privacy_note : ler(novoL, campo); return teste?.alvo ? teste.alvo(id, campo, v) : v; };
  const situacao = {};
  for (const campo of campos) {
    const atual = campo.startsWith('marca.') ? marca.privacy_note : ler(salvo, campo);
    const a = alvo(campo);
    if (typeof a !== 'string' || !a) falha(`${id}: ${campo}: alvo ausente no modelo b105df1`);
    if (a.length > LIMITE[campo]) falha(`${id}: ${campo}: alvo com ${a.length} caracteres, limite ${LIMITE[campo]} (seria truncado)`);
    const irmao = campo.replace(/\.texto$/, '.titulo');
    const irmaoOk = irmao === campo || ler(salvo, irmao) === ler(novoL, irmao);
    if (atual == null || atual === '') situacao[campo] = 'NAO_ENCONTRADO';
    else if (atual === a && irmaoOk) situacao[campo] = 'MIGRADO';
    else if (ANTIGO[campo].includes(tok(atual)) && irmaoOk) situacao[campo] = 'HERDADO';
    else situacao[campo] = 'DIVERGENTE';
  }
  const valores = Object.values(situacao);
  const est = valores.every(v => v === 'HERDADO') ? 'pendente' : valores.every(v => v === 'MIGRADO') ? 'migrada' : 'inconsistente';
  return { id, campos, situacao, estado: est, landing, marca, novoM, alvo };
}

// Grava pelas funções oficiais e valida tudo; dentro de uma transação aberta pelo chamador.
function gravarEValidar(P, id, campos, modo, teste) {
  const h0 = estado(P.db), aud0 = um(P.db, 'select max(id) m, count(*) n from audit_log');
  const antes = ler_empresa(P, id, campos, teste);
  if (antes.estado !== 'pendente') falha(`${id}: revalidacao antes da escrita: ${Object.entries(antes.situacao).filter(([, s]) => s !== 'HERDADO').map(([k, s]) => `${k}=${s}`).join(', ')}`);
  const origem = ORIGEM(modo);
  const base = JSON.parse(JSON.stringify(antes.landing.content)), conteudo = {};
  for (const campo of campos.filter(x => !x.startsWith('marca.'))) { por(base, campo, antes.alvo(campo)); conteudo[partes(campo)[0]] = base[partes(campo)[0]]; }
  EM.salvarLanding(P, id, { content: conteudo }, null, origem);
  if (campos.includes('marca.privacy_note')) EM.salvarMarca(P, id, { privacy_note: antes.alvo('marca.privacy_note') }, null, origem);
  teste?.aposGravar?.(P, id, modo);
  // Valores realmente persistidos: inteiros (sem truncamento) e iguais ao alvo, no conteúdo exibido e no gravado.
  const depoisL = EM.lerLanding(P, id), depoisM = EM.lerMarca(P, id);
  const gravado = JSON.parse(um(P.db, 'select content from landing_pages where company_id = ?', id).content);
  const fa = folhas(antes.landing.content), fd = folhas(depoisL.content);
  for (const k of new Set([...Object.keys(fa), ...Object.keys(fd)])) {
    if (campos.includes(k)) { if (fd[k] !== antes.alvo(k) || ler(gravado, k) !== antes.alvo(k)) falha(`${id}: ${k}: alvo nao gravado inteiro (truncado ou diferente)`); }
    else if (fa[k] !== fd[k]) falha(`${id}: campo fora da lista mudou: landing.${k}`);
  }
  if (JSON.stringify(antes.landing.seo) !== JSON.stringify(depoisL.seo)) falha(`${id}: campo fora da lista mudou: seo`);
  if (antes.landing.status !== depoisL.status) falha(`${id}: campo fora da lista mudou: status`);
  for (const k of EM.CAMPOS_MARCA) {
    if (k === 'privacy_note' && campos.includes('marca.privacy_note')) { if (depoisM[k] !== antes.alvo('marca.privacy_note')) falha(`${id}: marca.privacy_note: alvo nao gravado inteiro (truncado ou diferente)`); }
    else if (antes.marca[k] !== depoisM[k]) falha(`${id}: campo fora da lista mudou: marca.${k}`);
  }
  if (JSON.stringify(antes.marca.locked) !== JSON.stringify(depoisM.locked)) falha(`${id}: campo fora da lista mudou: marca.locked`);
  if (campos.includes('regras.sigilo[2]') && ler(gravado, 'regras.sigilo[2]') !== SIGILO_B105DF1) falha(`${id}: regras.sigilo[2] diferente do texto b105df1`);
  const dif = difTabelas(h0, estado(P.db)).join(',');
  const esperadas = campos.includes('marca.privacy_note') ? 'audit_log,branding,landing_pages' : 'audit_log,landing_pages';
  if (dif !== esperadas) falha(`${id}: tabelas alteradas fora do esperado: ${dif}`);
  // Auditoria: exatamente um registro por gravação, desta empresa, sem autor, com a origem da migração.
  const novos = todos(P.db, 'select company_id, user_id, action, entity_id, after, origin from audit_log where id > ? order by id', aud0.m ?? 0);
  const acoes = ['landing_page.updated', ...(campos.includes('marca.privacy_note') ? ['branding.updated'] : [])];
  if (novos.map(a => a.action).join() !== acoes.join()) falha(`${id}: auditoria inesperada: ${novos.map(a => a.action).join() || '(nenhuma)'}`);
  for (const a of novos) if (a.company_id !== id || a.entity_id !== id || a.user_id !== null || a.origin !== JSON.stringify(origem)) falha(`${id}: auditoria com empresa, autor ou origem errados`);
  const aMarca = novos.find(a => a.action === 'branding.updated');
  if (aMarca && Object.keys(JSON.parse(aMarca.after)).join() !== 'privacy_note') falha(`${id}: auditoria da marca registra outros campos`);
  return { h0, aud0, auditoria: novos.length, dif };
}

const politicas = (db, abrir) => Object.fromEntries(todos(db, 'select id, banco from companies order by id').map(({ id, banco }) => {
  const t = abrir(banco);
  try { return [id, resumo(estado(t, ['politica_versoes', 'config']))]; } finally { t.close(); }
}));

/**
 * Executa a migração no banco da plataforma já aberto. Devolve { estado } ou lança (o boot não deve seguir).
 * estado: ja_aplicada | nao_aplicavel | aplicada_agora | marcada_apos_retomada.
 * `teste` existe só para os testes automatizados (injeção de falhas); o boot nunca o passa.
 */
export function migrarCopyB105df1(db, { log = console.log, agora = () => new Date(), abrirLeitura, teste } = {}) {
  const L = m => log(`[migracao ${ID_MIGRACAO}] ${m}`);
  const abrir = abrirLeitura || (f => new DatabaseSync(resolve(f), { readOnly: true }));
  const marcador = lerAjuste(db, CHAVE_MIGRACAO, null);
  if (marcador) { L(`ja aplicada em ${marcador.concluida_em} (${marcador.campos} campos): nada a fazer`); return { estado: 'ja_aplicada' }; }
  const P = { db, agora, aplicarAoTenant: () => {} };
  // FASE A: pre-check, sem escrita.
  const integ0 = integridade(db);
  if (integ0 !== 'ok') falha(`pre-check: integrity_check da plataforma = ${integ0}`);
  if (!EM.LIMITES_LANDING || !JSON.stringify(EM.landingPadrao('X')).includes(SIGILO_B105DF1)) falha('pre-check: modelo carregado nao e o do b105df1');
  const existem = CAMPOS_MIGRACAO.filter(([id]) => um(db, 'select 1 from companies where id = ?', id)).map(([id]) => id);
  if (!existem.length) { L('nao_aplicavel: as empresas desta migracao nao existem nesta instalacao'); return { estado: 'nao_aplicavel' }; }
  if (existem.length !== CAMPOS_MIGRACAO.length) falha(`pre-check: empresa ausente (existem: ${existem.join(', ')})`);
  L(`pre-check: integrity_check=ok, modelo b105df1 confirmado, empresas=${existem.length}`);
  const polAntes = politicas(db, abrir);
  const situacao = CAMPOS_MIGRACAO.map(([id, campos]) => ler_empresa(P, id, campos, teste));
  for (const s of situacao) L(`pre-check ${s.id}: ${s.estado} (${Object.entries(s.situacao).map(([k, v]) => `${k}=${v}`).join(', ')})`);
  if (situacao.some(s => s.estado === 'inconsistente')) falha('pre-check: campo divergente ou empresa com campos misturados; nada foi gravado');
  const migradas = situacao.filter(s => s.estado === 'migrada').map(s => s.id), pendentes = situacao.filter(s => s.estado === 'pendente').map(s => s.id);
  if (migradas.length && pendentes.length) falha(`ESTADO_PARCIAL: migradas=[${migradas.join(', ')}] pendentes=[${pendentes.join(', ')}]; nada foi gravado neste boot; rollback de codigo para b105df1 e decisao explicita antes de retomar`);
  if (!pendentes.length) {
    // Tudo já no alvo sem marcador (a marcação falhou depois dos commits): só marca se a auditoria da aplicação existir.
    for (const s of situacao) {
      const n = um(db, 'select count(*) n from audit_log where company_id = ? and origin = ?', s.id, JSON.stringify(ORIGEM('aplicar'))).n;
      const esperado = s.campos.includes('marca.privacy_note') ? 2 : 1;
      if (n !== esperado) falha(`${s.id}: campos no alvo sem a auditoria da migracao (${n} de ${esperado}); nao marcada`);
    }
    return validarEMarcar(db, P, situacao.map(s => [s.id, s.campos]), polAntes, abrir, L, agora, 'marcada_apos_retomada', teste);
  }
  // FASE B: ensaio real de cada empresa, com ROLLBACK e prova de que o banco voltou ao estado anterior.
  for (const [id, campos] of CAMPOS_MIGRACAO) {
    db.exec('begin immediate');
    try {
      db.exec('savepoint ensaio');
      const r = gravarEValidar(P, id, campos, 'ensaio', teste);
      db.exec('rollback to ensaio');
      const h1 = estado(db), aud1 = um(db, 'select max(id) m, count(*) n from audit_log');
      if (difTabelas(r.h0, h1).length || r.aud0.n !== aud1.n || r.aud0.m !== aud1.m) falha(`${id}: ensaio: rollback nao restaurou o estado (${difTabelas(r.h0, h1).join(',')})`);
      L(`ensaio ${id}: ENSAIO_OK (${campos.length} campos no alvo sem truncamento, fora da lista intacto, tabelas ${r.dif}, auditoria ${r.auditoria}, rollback ok hash ${resumo(h1)})`);
    } finally { db.exec('rollback'); }
  }
  L('ensaio: ENSAIO_APROVADO');
  // FASE C: aplicação, uma empresa por transação; qualquer falha desfaz aquela empresa e para.
  const feitas = [];
  for (const [id, campos] of CAMPOS_MIGRACAO) {
    db.exec('begin immediate');
    try {
      const r = gravarEValidar(P, id, campos, 'aplicar', teste);
      teste?.antesDoCommit?.(P, id);
      db.exec('commit');
      feitas.push(id);
      L(`aplicacao ${id}: COMMIT (${campos.length} campos, tabelas ${r.dif}, auditoria ${r.auditoria})`);
    } catch (e) {
      try { db.exec('rollback'); } catch {}
      const resto = CAMPOS_MIGRACAO.map(([x]) => x).filter(x => !feitas.includes(x));
      falha(feitas.length
        ? `ESTADO_PARCIAL: falha em ${id} (rollback desta empresa): ${e.message}; commitadas=[${feitas.join(', ')}] nao_migradas=[${resto.join(', ')}]; migracao nao marcada`
        : `aplicacao: falha em ${id} (rollback, nada gravado): ${e.message}`);
    }
  }
  return validarEMarcar(db, P, CAMPOS_MIGRACAO, polAntes, abrir, L, agora, 'aplicada_agora', teste);
}

// FASE D: releitura, auditoria, integridade e política intocada; só então o marcador.
function validarEMarcar(db, P, lista, polAntes, abrir, L, agora, resultado, teste) {
  for (const [id, campos] of lista) {
    const s = ler_empresa(P, id, campos, teste);
    if (s.estado !== 'migrada') falha(`validacao final ${id}: ${Object.entries(s.situacao).filter(([, v]) => v !== 'MIGRADO').map(([k, v]) => `${k}=${v}`).join(', ')}`);
    const salvo = JSON.parse(um(db, 'select content from landing_pages where company_id = ?', id).content);
    for (const k of campos.filter(x => !x.startsWith('marca.'))) if (ANTIGO[k].some(v => v.includes(E) ? false : norm(ler(salvo, k)) === v)) falha(`validacao final ${id}: ${k} ainda com texto antigo`);
    if (campos.includes('regras.sigilo[2]') && ler(salvo, 'regras.sigilo[2]') !== SIGILO_B105DF1) falha(`validacao final ${id}: regras.sigilo[2] diferente do texto b105df1`);
    const n = um(db, 'select count(*) n from audit_log where company_id = ? and origin = ?', id, JSON.stringify(ORIGEM('aplicar'))).n;
    const esperado = campos.includes('marca.privacy_note') ? 2 : 1;
    if (n !== esperado) falha(`validacao final ${id}: auditoria da migracao com ${n} registros, esperado ${esperado}`);
    L(`validacao final ${id}: ${campos.length} campos no alvo b105df1, textos antigos ausentes, auditoria ${n}`);
  }
  const integ = integridade(db);
  if (integ !== 'ok') falha(`validacao final: integrity_check da plataforma = ${integ}`);
  const polDepois = politicas(db, abrir);
  const mudou = Object.keys(polAntes).filter(id => polAntes[id] !== polDepois[id]);
  if (mudou.length) falha(`validacao final: politica/config do tenant mudou: ${mudou.join(', ')}`);
  teste?.antesDoMarcador?.();
  const total = lista.reduce((n, [, c]) => n + c.length, 0);
  salvarAjuste(db, CHAVE_MIGRACAO, { concluida_em: agora().toISOString(), empresas: lista.map(([id]) => id), campos: total, resultado });
  L(`validacao final: integrity_check=ok, politica/config dos tenants intactas; marcador gravado (${total} campos): ${resultado}`);
  return { estado: resultado };
}
