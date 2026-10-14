// Inventário e retirada controlada das Conexões fictícias antigas (criadas pelas missões de QA).
//
// Uso (no Shell do serviço, com o servidor no ar; nada é apagado fisicamente):
//   node scripts/conexoes-qa.mjs inventario [--dados dados]            → lista, classifica e mostra dependências (só leitura)
//   node scripts/conexoes-qa.mjs revogar --db <arquivo.sqlite> --ids id1,id2 --por <email> --confirmar
//
// Classificação (o nome sozinho nunca basta):
//   - qa_comprovado: endereço base numa API pública de teste usada pelos scripts de QA (jsonplaceholder.typicode.com,
//     httpbin.org) E marca de QA no nome/sistema ("QA - …", "Sandbox …"). Só estes podem ser revogados por este script.
//   - revisar: só uma das duas marcas. Decisão humana; o script não age.
//   - legitimo: nenhuma marca.
// "revogar" usa a mesma função do produto (status REVOKED, capabilities revogadas, aprovações pendentes invalidadas,
// credencial apagada, evento CONNECTOR_REVOKED na atividade da empresa). Não existe exclusão física de conexão no
// produto; o histórico (versões, execuções, auditoria) é preservado.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const HOSTS_QA = new Set(['jsonplaceholder.typicode.com', 'httpbin.org']);
const MARCA_NOME = /^(QA\s*[-–—]\s*|Sandbox\b)/i;

export function classificar(c) {
  let host = '';
  try { host = new URL(c.base_url).hostname.toLowerCase(); } catch { /* sem URL válida */ }
  const hostQa = HOSTS_QA.has(host);
  const nomeQa = MARCA_NOME.test(c.nome || '') || MARCA_NOME.test(c.sistema || '');
  return { classe: hostQa && nomeQa ? 'qa_comprovado' : hostQa || nomeQa ? 'revisar' : 'legitimo', host, hostQa, nomeQa };
}

const tabela = (db, t) => !!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(t);
const contar = (db, sql, ...a) => db.prepare(sql).get(...a)?.n ?? 0;

export function inventariar(db) {
  if (!tabela(db, 'connectors')) return [];
  return db.prepare('select id, tenant_id, nome, sistema, base_url, status, origem, versao, criado_por, criado_em, atualizado_em, secret_ref from connectors order by criado_em').all().map(c => {
    const k = classificar(c);
    const dep = {
      capabilitiesAtivas: tabela(db, 'capabilities') ? contar(db, "select count(*) n from capabilities where connector_id = ? and status != 'revogada'", c.id) : 0,
      aprovacoesPendentes: tabela(db, 'integration_approvals') ? contar(db, "select count(*) n from integration_approvals where connector_id = ? and status = 'pendente'", c.id) : 0,
      execucoes: tabela(db, 'connector_runs') ? contar(db, 'select count(*) n from connector_runs where connector_id = ?', c.id) : 0,
      ultimaExecucao: tabela(db, 'connector_runs') ? db.prepare('select max(criado_em) m from connector_runs where connector_id = ?').get(c.id)?.m || null : null,
      quickWinsQueExecutaram: tabela(db, 'connector_runs') ? db.prepare('select distinct quick_win_id q from connector_runs where connector_id = ? and quick_win_id is not null').all(c.id).map(r => r.q) : [],
      webhooksAtivos: tabela(db, 'webhook_configs') ? contar(db, 'select count(*) n from webhook_configs where connector_id = ? and ativo = 1', c.id) : 0,
    };
    // Programações ativas dos Quick Wins que usaram a conexão (para avisar antes de retirar).
    dep.programacoesAtivas = tabela(db, 'qw_programacoes') && dep.quickWinsQueExecutaram.length
      ? contar(db, `select count(*) n from qw_programacoes where ativa = 1 and quick_win_id in (${dep.quickWinsQueExecutaram.map(() => '?').join(',')})`, ...dep.quickWinsQueExecutaram) : 0;
    return { id: c.id, tenant: c.tenant_id, nome: c.nome, sistema: c.sistema, host: k.host, status: c.status, criadoEm: c.criado_em, classe: k.classe, temCredencial: !!c.secret_ref, dependencias: dep };
  });
}

function bancos(dados) {
  if (!existsSync(dados)) return [];
  const out = [];
  for (const n of readdirSync(dados)) {
    const p = join(dados, n);
    if (/^emp_[\w-]+\.sqlite$/.test(n)) out.push(p);
    else if (/^emp_[\w-]+$/.test(n) && existsSync(join(p, 'greenia.sqlite'))) out.push(join(p, 'greenia.sqlite'));
  }
  if (existsSync(join(dados, 'greenia.sqlite'))) out.push(join(dados, 'greenia.sqlite'));
  return out;
}

async function principal(argv) {
  const [cmd, ...resto] = argv;
  const opc = {}; for (let i = 0; i < resto.length; i++) if (resto[i].startsWith('--')) opc[resto[i].slice(2)] = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true;
  if (cmd === 'inventario') {
    const arquivos = opc.db ? [opc.db] : bancos(opc.dados || 'dados');
    const saida = [];
    for (const f of arquivos) {
      const db = new DatabaseSync(f, { readOnly: true });
      try { for (const c of inventariar(db)) saida.push({ banco: f, ...c }); } finally { db.close(); }
    }
    console.log(JSON.stringify({ geradoEm: new Date().toISOString(), bancos: arquivos.length, conexoes: saida,
      resumo: Object.fromEntries(['qa_comprovado', 'revisar', 'legitimo'].map(k => [k, saida.filter(x => x.classe === k).length])) }, null, 2));
    return;
  }
  if (cmd === 'revogar') {
    if (!opc.db || !opc.ids || !opc.por) throw new Error('Informe --db, --ids e --por.');
    const ids = String(opc.ids).split(',').map(s => s.trim()).filter(Boolean);
    const db = new DatabaseSync(opc.db);
    try {
      const inv = new Map(inventariar(db).map(c => [c.id, c]));
      const plano = ids.map(id => {
        const c = inv.get(id);
        if (!c) return { id, acao: 'ignorar', motivo: 'não encontrada neste banco' };
        if (c.classe !== 'qa_comprovado') return { id, acao: 'ignorar', motivo: `classe ${c.classe}: exige decisão humana` };
        if (c.status === 'REVOKED') return { id, acao: 'nada', motivo: 'já revogada' };
        return { id, acao: 'revogar', tenant: c.tenant, dependencias: c.dependencias };
      });
      if (!opc.confirmar) { console.log(JSON.stringify({ simulacao: true, plano }, null, 2)); return; }
      const { revogar } = await import('../src/integracoes/ciclo.js');
      const resultado = [];
      for (const p of plano) {
        if (p.acao !== 'revogar') { resultado.push(p); continue; }
        const app = { db, tenantId: p.tenant, agora: () => new Date(), log: () => {} };
        const r = revogar(app, { id: null, email: String(opc.por) }, p.id);
        resultado.push({ id: p.id, acao: 'revogada', status: r.status });
      }
      console.log(JSON.stringify({ aplicado: true, por: String(opc.por), resultado }, null, 2));
    } finally { db.close(); }
    return;
  }
  console.log('Uso: node scripts/conexoes-qa.mjs inventario [--dados dados | --db arquivo] | revogar --db arquivo --ids a,b --por email [--confirmar]');
}

if (import.meta.url === `file://${process.argv[1]}`) principal(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
