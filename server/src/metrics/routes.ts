// Painel de resultados por assistente, registro de valores (antes e depois,
// sempre com origem), decisão (manter, descartar, ampliar) e relatório formal
// em PDF e XLSX. Key user da área e admin do cliente registram; quem lê a
// auditoria da área também consulta.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { withTenant, type Tx } from '../db/pool.ts';
import { requireAuth, tenantCtx, type AuthContext } from '../auth/session.ts';
import { can } from '../auth/rbac.ts';
import { audit } from '../audit.ts';
import { assistantDefinitionSchema } from '../assistants/schema.ts';
import { autoMetrics, decisions, indicatorResults, loadValues, monthly, type Period } from './metrics.ts';

const periodSchema = z.object({ de: z.iso.date().optional(), ate: z.iso.date().optional() });

const valueSchema = z.object({
  indicador: z.string().regex(/^[a-z0-9_]{1,60}$/),
  fase: z.enum(['antes', 'depois']),
  valor: z.number().finite(),
  unidade: z.string().max(30).optional(),
  origem: z.enum(['medido', 'informado']),
  periodoInicio: z.iso.date().optional(),
  periodoFim: z.iso.date().optional(),
  metodo: z.string().trim().max(1000).optional(),
  informadoPor: z.string().trim().max(200).optional(),
  observacao: z.string().trim().max(1000).optional(),
}).superRefine((v, ctx) => {
  if (v.origem === 'medido') {
    if (!v.periodoInicio || !v.periodoFim) ctx.addIssue({ code: 'custom', path: ['periodoInicio'], message: 'valor medido precisa do período' });
    else if (v.periodoFim < v.periodoInicio) ctx.addIssue({ code: 'custom', path: ['periodoFim'], message: 'fim antes do início' });
    if (!v.metodo) ctx.addIssue({ code: 'custom', path: ['metodo'], message: 'valor medido precisa do método' });
  }
  if (v.origem === 'informado' && !v.informadoPor) ctx.addIssue({ code: 'custom', path: ['informadoPor'], message: 'valor informado precisa de quem informou' });
});

const decisionSchema = z.object({
  decisao: z.enum(['manter', 'descartar', 'ampliar']),
  data: z.iso.date(),
  responsavel: z.string().trim().min(3).max(200),
  justificativa: z.string().trim().min(10).max(4000),
});

// Período padrão: do primeiro dia do mês, 3 meses atrás, até hoje.
function period(q: { de?: string; ate?: string }): Period {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 3, 1);
  return { de: q.de ?? d.toISOString().slice(0, 10), ate: q.ate ?? today };
}

async function loadAssistant(tx: Tx, slug: string) {
  return (await tx.query(
    `select a.id, a.slug, a.name, a.status, a.area_id, ar.name as area, a.current_version, v.definition
     from assistants a join assistant_versions v on v.assistant_id = a.id and v.version = a.current_version
     left join areas ar on ar.id = a.area_id where a.slug = $1`, [slug])).rows[0];
}

const canWrite = (a: AuthContext, areaId: string | null) => can(a, 'kb.manage', areaId);
const canRead = (a: AuthContext, areaId: string | null) => canWrite(a, areaId) || can(a, 'audit.read', areaId);

export async function buildResults(tx: Tx, slug: string, p: Period) {
  const row = await loadAssistant(tx, slug);
  if (!row) return null;
  const def = assistantDefinitionSchema.parse(row.definition);
  const values = await loadValues(tx, row.id);
  const auto = await autoMetrics(tx, row.id, p);
  const indicadores = indicatorResults(def, values, auto, p);
  const semPontoDePartida = !indicadores.length || indicadores.every(i => !i.antes);
  return {
    row,
    body: {
      assistente: { slug: row.slug, nome: row.name, area: row.area, status: row.status, versaoAtual: row.current_version, dono: def.owner ?? null },
      periodo: p,
      semPontoDePartida,
      aviso: semPontoDePartida
        ? (indicadores.length ? 'Sem ponto de partida: nenhum indicador tem valor "antes" registrado. Não há comparação nem ganho calculado.' : 'Sem ponto de partida: o assistente não tem indicadores definidos.')
        : null,
      indicadores,
      execucoes: auto,
      mensal: await monthly(tx, row.id, p),
      valores: values,
      decisoes: await decisions(tx, row.id),
    },
  };
}
type Results = NonNullable<Awaited<ReturnType<typeof buildResults>>>['body'];

const num = (n: number | null | undefined, unit = '') => n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${unit ? ' ' + unit : ''}`;

function indicatorRows(r: Results) {
  return r.indicadores.map(i => ({
    Indicador: i.label, Unidade: i.unit,
    Antes: num(i.antes?.valor), 'Origem (antes)': i.antes ? `${i.antes.origem.tipo}: ${i.antes.origem.detalhe}` : 'sem ponto de partida',
    Depois: num(i.depois?.valor), 'Origem (depois)': i.depois ? `${i.depois.origem.tipo}: ${i.depois.origem.detalhe}` : 'sem medição',
    'Diferença': i.comparacao ? `${num(i.comparacao.diferenca)}${i.comparacao.percentual !== null ? ` (${num(i.comparacao.percentual)}%)` : ''}` : '—',
    'Situação': i.lacuna ?? (i.comparacao?.melhorou ? 'melhorou' : 'não melhorou'),
    'Acumulado no período': i.acumuladoNoPeriodo ? `${num(i.acumuladoNoPeriodo.valor)} h = ${i.acumuladoNoPeriodo.calculo}` : '—',
  }));
}

function autoRows(r: Results) {
  const e = r.execucoes;
  return [
    ['Execuções', e.execucoes], ['Concluídas', e.concluidas], ['Com erro', e.erros], ['Pessoas que usaram', e.usuariosAtivos],
    ['Tempo médio de processamento (s)', num(e.tempoProcessamentoS)], ['Tempo médio até a revisão (min)', num(e.tempoAteRevisaoMin)],
    ['Aprovadas sem edição', e.revisao.aprovadas], ['Aprovadas com edição', e.revisao.aprovadasComEdicao], ['Rejeitadas', e.revisao.rejeitadas], ['Aguardando revisão', e.revisao.aguardando],
    ['Taxa de aprovação sem edição (%)', num(e.aprovacaoSemEdicaoPct)],
    ['Divergências encontradas (total)', e.divergenciasTotal], ['Pendências encontradas (total)', e.pendenciasTotal],
    ['Páginas processadas', e.consumo.paginas], ['Consumo de IA (R$)', num(e.consumo.custoBrl)], ['Versões do assistente usadas', e.versoes.join(', ') || '—'],
  ] as [string, string | number][];
}

async function reportXlsx(r: Results): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA';
  const s = wb.addWorksheet('Resumo');
  [[`Resultados: ${r.assistente.nome}`], [`Área: ${r.assistente.area ?? 'geral'}; status: ${r.assistente.status}; versão atual: ${r.assistente.versaoAtual}`],
    [`Período: ${r.periodo.de} a ${r.periodo.ate}`], [r.aviso ?? 'Ponto de partida registrado.'], []].forEach(x => s.addRow(x));
  for (const [k, v] of autoRows(r)) s.addRow([k, v]);
  s.getColumn(1).width = 42; s.getColumn(2).width = 20;
  const add = (name: string, rows: Record<string, unknown>[], cols: string[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(cols).font = { bold: true };
    rows.forEach(x => ws.addRow(cols.map(c => x[c] as ExcelJS.CellValue)));
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(70, Math.max(14, c.length + 2)); });
  };
  const ind = indicatorRows(r);
  add('Antes × depois', ind, ['Indicador', 'Unidade', 'Antes', 'Origem (antes)', 'Depois', 'Origem (depois)', 'Diferença', 'Situação', 'Acumulado no período']);
  add('Mensal', r.mensal, ['mes', 'execucoes', 'usuarios', 'aprovadas', 'aprovadas_com_edicao', 'rejeitadas', 'custo_brl']);
  add('Valores registrados', r.valores.map(v => ({ ...v })), ['indicator', 'phase', 'value', 'unit', 'origin', 'periodStart', 'periodEnd', 'method', 'informedBy', 'notes', 'recordedBy', 'createdAt']);
  add('Decisões', r.decisoes, ['decisao', 'data', 'responsavel', 'justificativa', 'registradoPor', 'registradoEm']);
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

function reportPdf(r: Results): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Resultados: ${r.assistente.nome}`, Creator: 'GreenIA' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const h = (t: string) => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).text(t).font('Helvetica').fontSize(9.5);
    doc.font('Helvetica-Bold').fontSize(16).text(`Resultados: ${r.assistente.nome}`);
    doc.font('Helvetica').fontSize(9).fillColor('#444444')
      .text(`Área: ${r.assistente.area ?? 'geral'} · status: ${r.assistente.status} · versão atual: ${r.assistente.versaoAtual}`)
      .text(`Período: ${r.periodo.de} a ${r.periodo.ate}`).fillColor('#000000');
    if (r.aviso) doc.moveDown(0.6).font('Helvetica-Bold').fillColor('#8C3A1B').text(r.aviso).fillColor('#000000').font('Helvetica');
    h('Antes × depois');
    const ind = indicatorRows(r);
    if (!ind.length) doc.text('Nenhum indicador definido.');
    for (const i of ind) {
      doc.moveDown(0.4).font('Helvetica-Bold').text(`${i.Indicador}${i.Unidade ? ` (${i.Unidade})` : ''}`).font('Helvetica');
      doc.text(`Antes: ${i.Antes} — ${i['Origem (antes)']}`);
      doc.text(`Depois: ${i.Depois} — ${i['Origem (depois)']}`);
      doc.text(`Diferença: ${i['Diferença']} · situação: ${i['Situação']}`);
      if (i['Acumulado no período'] !== '—') doc.text(`Acumulado no período: ${i['Acumulado no período']}`);
    }
    h('Medições automáticas das execuções');
    for (const [k, v] of autoRows(r)) doc.text(`${k}: ${v}`);
    h('Por mês');
    if (!r.mensal.length) doc.text('Sem execuções no período.');
    for (const m of r.mensal) doc.text(`${m.mes}: ${m.execucoes} execuções, ${m.usuarios} pessoas, ${m.aprovadas} aprovadas, ${m.aprovadas_com_edicao} com edição, ${m.rejeitadas} rejeitadas, R$ ${num(Math.round(m.custo_brl * 100) / 100)}`);
    h('Decisões');
    if (!r.decisoes.length) doc.text('Nenhuma decisão registrada.');
    for (const d of r.decisoes) doc.moveDown(0.3).text(`${d.data}: ${d.decisao.toUpperCase()} — ${d.responsavel}. ${d.justificativa}`);
    doc.end();
  });
}

export async function metricsRoutes(app: FastifyInstance) {
  app.get('/api/metrics/assistants/:slug', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = periodSchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const out = await withTenant(app.deps.db, tenantCtx(a), tx => buildResults(tx, (req.params as { slug: string }).slug, period(q.data)));
    if (!out) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    if (!canRead(a, out.row.area_id)) return reply.code(403).send({ error: 'sem_permissao' });
    return out.body;
  });

  app.post('/api/metrics/assistants/:slug/values', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = valueSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const v = p.data;
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const row = await loadAssistant(tx, (req.params as { slug: string }).slug);
      if (!row) return { status: 404, body: { error: 'assistente_nao_encontrado' } };
      if (!canWrite(a, row.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      const def = assistantDefinitionSchema.parse(row.definition);
      const ind = def.metrics.indicators.find(i => i.key === v.indicador);
      if (!ind) return { status: 400, body: { error: 'indicador_nao_definido', indicadores: def.metrics.indicators.map(i => i.key) } };
      const id = (await tx.query(
        `insert into metric_values (tenant_id, assistant_id, indicator, phase, value, unit, origin, period_start, period_end, method, informed_by, notes, recorded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [a.tenantId, row.id, v.indicador, v.fase, v.valor, v.unidade ?? ind.unit, v.origem, v.periodoInicio ?? null, v.periodoFim ?? null,
          v.metodo ?? null, v.informadoPor ?? null, v.observacao ?? null, a.userId])).rows[0].id;
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'medicao_registrada', target: `assistente:${row.slug}`,
        details: { indicador: v.indicador, fase: v.fase, valor: v.valor, origem: v.origem } });
      return { status: 201, body: { id } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.post('/api/metrics/assistants/:slug/decisions', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const p = decisionSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: 'dados_invalidos', detalhes: p.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) });
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const row = await loadAssistant(tx, (req.params as { slug: string }).slug);
      if (!row) return { status: 404, body: { error: 'assistente_nao_encontrado' } };
      if (!canWrite(a, row.area_id)) return { status: 403, body: { error: 'sem_permissao' } };
      await tx.query(
        `insert into assistant_decisions (tenant_id, assistant_id, decision, decided_on, responsible, justification, recorded_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        [a.tenantId, row.id, p.data.decisao, p.data.data, p.data.responsavel, p.data.justificativa, a.userId]);
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'decisao_registrada', target: `assistente:${row.slug}`,
        details: { decisao: p.data.decisao, data: p.data.data, responsavel: p.data.responsavel } });
      return { status: 201, body: { ok: true } };
    });
    return reply.code(out.status).send(out.body);
  });

  app.get('/api/metrics/assistants/:slug/report', async (req, reply) => {
    const a = requireAuth(req, reply);
    if (!a) return;
    const q = periodSchema.extend({ format: z.enum(['pdf', 'xlsx']) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'dados_invalidos' });
    const slug = (req.params as { slug: string }).slug;
    const out = await withTenant(app.deps.db, tenantCtx(a), async tx => {
      const r = await buildResults(tx, slug, period(q.data));
      if (!r || !canRead(a, r.row.area_id)) return r ? 'forbidden' : null;
      await audit(tx, { tenantId: a.tenantId, actorUserId: a.userId, action: 'relatorio_resultados_exportado', target: `assistente:${slug}`, details: { formato: q.data.format, ...r.body.periodo } });
      return r.body;
    });
    if (!out) return reply.code(404).send({ error: 'assistente_nao_encontrado' });
    if (out === 'forbidden') return reply.code(403).send({ error: 'sem_permissao' });
    const name = `resultados-${slug}-${out.periodo.de}-a-${out.periodo.ate}.${q.data.format}`;
    const body = q.data.format === 'xlsx' ? await reportXlsx(out) : await reportPdf(out);
    return reply.type(q.data.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
      .header('content-disposition', `attachment; filename="${name}"`).send(body);
  });
}
