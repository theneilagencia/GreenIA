// Relatórios do tenant, em PDF e XLSX, para qualquer área que o cliente criar:
//   portfólio de oportunidades  todas as oportunidades com avaliação e situação
//   resultados dos quick wins   antes × depois, decisões e trajetória das ampliações
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { PortfolioRow } from './routes.ts';
import type { QuickWinResults } from './service.ts';
import type { QwCriteria } from './criteria.ts';
import { STAGE_LABEL } from './service.ts';

const num = (n: number | null | undefined, unit = '') => n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${unit ? ' ' + unit : ''}`;
const STATUS: Record<string, string> = { registrada: 'registrada', avaliada: 'avaliada', selecionada: 'selecionada', roadmap: 'enviada ao roadmap', arquivada: 'arquivada' };
const ORIGEM: Record<string, string> = { medido: 'medido', informado: 'informado', automatico: 'automático' };
const stage = (s: string) => STAGE_LABEL[s] ?? s;

function sheet(wb: ExcelJS.Workbook, name: string, cols: string[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(cols).font = { bold: true };
  for (const r of rows) ws.addRow(cols.map(c => (r[c] ?? '') as ExcelJS.CellValue));
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(60, Math.max(12, c.length + 2)); });
  return ws;
}

function pdf(title: string, draw: (doc: PDFKit.PDFDocument, h: (t: string) => void) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Creator: 'GreenIA' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(16).text(title);
    const h = (t: string) => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).text(t).font('Helvetica').fontSize(9.5);
    draw(doc, h);
    doc.end();
  });
}

// ---- Portfólio de oportunidades ------------------------------------------------------------------
function portfolioRows(rows: PortfolioRow[], crit: QwCriteria) {
  return rows.map(r => ({
    'Área': r.area, Oportunidade: r.titulo, Processo: r.processo, Problema: r.problema, 'Quem executa hoje': r.executorAtual, Volume: r.volume,
    'Evidência': r.evidencia === 'comprovado' ? 'comprovada' : 'hipótese',
    ...Object.fromEntries(crit.criterios.map(c => [c.label, r.notas ? num(r.notas[c.key]) : '—'])),
    Nota: num(r.nota), 'Situação': STATUS[r.status] ?? r.status, Motivo: r.motivo ?? '', 'Quick win': r.quickWin ? stage(r.quickWin.etapa) : '—', 'Último registro': r.ultimoRegistro ?? '',
  }));
}

export async function portfolioXlsx(tenant: string, rows: PortfolioRow[], crit: QwCriteria): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA';
  const cols = ['Área', 'Oportunidade', 'Processo', 'Problema', 'Quem executa hoje', 'Volume', 'Evidência', ...crit.criterios.map(c => c.label), 'Nota', 'Situação', 'Motivo', 'Quick win', 'Último registro'];
  sheet(wb, 'Portfólio', cols, portfolioRows(rows, crit));
  const c = wb.addWorksheet('Critérios');
  c.addRow([`Portfólio de oportunidades: ${tenant}`]);
  c.addRow([`Escala de ${crit.escala.min} a ${crit.escala.max}. Nota de 0 a 100, média ponderada; nos critérios em que menor é melhor, a nota é invertida.`]);
  c.addRow([]);
  c.addRow(['Critério', 'Peso', 'Sentido', 'Descrição']).font = { bold: true };
  for (const k of crit.criterios) c.addRow([k.label, k.peso, k.sentido === 'maior_melhor' ? 'maior é melhor' : 'menor é melhor', k.descricao]);
  c.getColumn(1).width = 24; c.getColumn(4).width = 70;
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

export function portfolioPdf(tenant: string, rows: PortfolioRow[], crit: QwCriteria): Promise<Buffer> {
  return pdf(`Portfólio de oportunidades: ${tenant}`, (doc, h) => {
    doc.font('Helvetica').fontSize(9).fillColor('#444444')
      .text(`${rows.length} oportunidades. Critérios: ${crit.criterios.map(c => `${c.label} (peso ${c.peso}, ${c.sentido === 'maior_melhor' ? 'maior é melhor' : 'menor é melhor'})`).join('; ')}. Escala de ${crit.escala.min} a ${crit.escala.max}.`)
      .fillColor('#000000');
    const count = (st: string) => rows.filter(r => r.status === st).length;
    doc.fillColor('#444444').text(`Registradas: ${count('registrada')} · avaliadas: ${count('avaliada')} · selecionadas: ${count('selecionada')} · no roadmap: ${count('roadmap')} · arquivadas: ${count('arquivada')}.`).fillColor('#000000');
    const byArea = new Map<string, PortfolioRow[]>();
    for (const r of rows) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
    if (!rows.length) doc.moveDown().text('Nenhuma oportunidade registrada.');
    for (const [area, list] of byArea) {
      h(area);
      for (const r of list) {
        doc.moveDown(0.3).font('Helvetica-Bold').text(`${r.titulo} — nota ${num(r.nota)} — ${STATUS[r.status] ?? r.status}${r.quickWin ? ` (quick win: ${stage(r.quickWin.etapa)})` : ''}`).font('Helvetica');
        doc.text(`Processo: ${r.processo}. Problema: ${r.problema}`);
        doc.text(`Quem executa hoje: ${r.executorAtual || '—'}. Volume: ${r.volume || '—'}. Evidência: ${r.evidencia === 'comprovado' ? 'comprovada' : 'hipótese'}${r.evidenciaNota ? ` (${r.evidenciaNota})` : ''}.`);
        if (r.notas) doc.text(crit.criterios.map(c => `${c.label}: ${num(r.notas![c.key])}`).join(' · '));
        if (r.motivo) doc.font('Helvetica-Bold').text(`Motivo (${STATUS[r.status]}): ${r.motivo}`).font('Helvetica');
        else if (r.ultimoRegistro) doc.text(`Último registro: ${r.ultimoRegistro}`);
      }
    }
  });
}

// ---- Resultados dos quick wins ------------------------------------------------------------------
const windowText = (w: { inicio: string | null; fim: string | null; dias: number | null; volume: number | null }, unit: string) =>
  w.inicio && w.fim ? `${w.inicio} a ${w.fim} (${w.dias} dias${w.volume ? `, ${num(w.volume)} ${unit || 'itens'}` : ''})` : 'sem datas';

const side = (v: { valor: number; comparavel: number | null } | null | undefined, por: string) =>
  !v ? '—' : v.comparavel !== null && v.comparavel !== v.valor ? `${num(v.valor)} (= ${num(v.comparavel)} ${por})` : num(v.valor);

function indicatorRows(r: QuickWinResults) {
  return r.indicadores.map(i => ({
    'Quick win': r.quickWin.titulo, Indicador: i.label, Unidade: i.unit, 'Comparado em': i.comparacaoPor,
    Antes: side(i.antes, i.comparacaoPor), 'Origem (antes)': i.antes ? `${ORIGEM[i.antes.origem.tipo]}: ${i.antes.origem.detalhe}` : 'sem ponto de partida',
    Depois: side(i.depois, i.comparacaoPor), 'Origem (depois)': i.depois ? `${ORIGEM[i.depois.origem.tipo]}: ${i.depois.origem.detalhe}` : 'sem medição',
    'Diferença': i.comparacao ? `${num(i.comparacao.diferenca)}${i.comparacao.percentual !== null ? ` (${num(i.comparacao.percentual)}%)` : ''}` : '—',
    'Situação': i.lacuna ?? (i.comparacao?.melhorou ? 'melhorou' : 'não melhorou'),
    'Acumulado no período': i.acumuladoNoPeriodo ? `${num(i.acumuladoNoPeriodo.valor)} h = ${i.acumuladoNoPeriodo.calculo}` : '—',
  }));
}

const trajectoryText = (r: QuickWinResults) => {
  const t = r.trajetoria;
  const up = t.origem.length ? `ampliado de: ${t.origem.map(o => `${o.titulo} (${o.areas})`).join(' → ')}` : '';
  const down = t.ampliacoes.length ? `ampliado para: ${t.ampliacoes.map(o => `${o.titulo} (${o.areas})`).join('; ')}` : '';
  return [up, down].filter(Boolean).join('. ') || '—';
};

export async function resultsXlsx(tenant: string, all: QuickWinResults[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreenIA';
  sheet(wb, 'Quick wins', ['Quick win', 'Áreas', 'Etapa', 'Responsável', 'Recursos', 'Janela do ponto de partida', 'Janela de medição', 'Avisos das janelas', 'Alterações na medição', 'Decisão', 'Justificativa', 'Ponto de partida', 'Trajetória'], all.map(r => ({
    'Quick win': r.quickWin.titulo, 'Áreas': r.quickWin.areas.join(', '), Etapa: r.quickWin.etapaNome, 'Responsável': r.quickWin.responsavel,
    Recursos: r.quickWin.recursos.map(x => `${x.tipo}: ${x.nome}`).join('; ') || '—',
    'Janela do ponto de partida': windowText(r.janelas.pontoDePartida, r.janelas.unidadeVolume), 'Janela de medição': windowText(r.janelas.medicao, r.janelas.unidadeVolume),
    'Avisos das janelas': r.janelas.avisos.join(' ') || '—',
    'Alterações na medição': r.alteracoes.length ? r.alteracoes.map(x => `${x.em.slice(0, 10)} ${x.oQue} (${x.por}): ${x.motivo}`).join(' | ') : 'nenhuma',
    'Decisão': r.quickWin.decisao?.decisao ?? '—', Justificativa: r.quickWin.decisao?.justificativa ?? '—',
    'Ponto de partida': r.semPontoDePartida ? 'sem ponto de partida' : 'registrado', 'Trajetória': trajectoryText(r),
  })));
  sheet(wb, 'Antes × depois', ['Quick win', 'Indicador', 'Unidade', 'Comparado em', 'Antes', 'Origem (antes)', 'Depois', 'Origem (depois)', 'Diferença', 'Situação', 'Acumulado no período'], all.flatMap(indicatorRows));
  sheet(wb, 'Alterações na medição', ['Quick win', 'Data', 'Etapa', 'O que mudou', 'Motivo', 'Quem'],
    all.flatMap(r => r.alteracoes.map(x => ({ 'Quick win': r.quickWin.titulo, Data: x.em.slice(0, 10), Etapa: x.etapa, 'O que mudou': x.oQue, Motivo: x.motivo, Quem: x.por }))));
  sheet(wb, 'Valores registrados', ['quickWin', 'indicator', 'phase', 'value', 'unit', 'origin', 'periodStart', 'periodEnd', 'method', 'informedBy', 'notes', 'recordedBy', 'createdAt'],
    all.flatMap(r => r.valores.map(v => ({ quickWin: r.quickWin.titulo, ...v }))));
  const c = wb.addWorksheet('Sobre');
  c.addRow([`Resultados dos quick wins: ${tenant}`]);
  c.addRow(['Sem valor "antes" (ponto de partida), não há comparação nem ganho calculado. Nada é estimado para preencher lacuna.']);
  c.getColumn(1).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

export function resultsPdf(tenant: string, all: QuickWinResults[]): Promise<Buffer> {
  return pdf(`Resultados dos quick wins: ${tenant}`, (doc, h) => {
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text(`${all.length} quick wins. Sem ponto de partida, não há comparação nem ganho calculado.`).fillColor('#000000');
    if (!all.length) doc.moveDown().text('Nenhum quick win registrado.');
    for (const r of all) {
      const q = r.quickWin;
      h(q.titulo);
      doc.text(`Áreas: ${q.areas.join(', ')} · etapa: ${q.etapaNome} · responsável: ${q.responsavel}${q.prazo ? ` · prazo: ${q.prazo}` : ''}`);
      doc.text(`Objetivo: ${q.objetivo}`);
      doc.text(`Recursos: ${q.recursos.map(x => `${x.tipo} ${x.nome}`).join('; ') || '—'}`);
      doc.text(`Janela do ponto de partida: ${windowText(r.janelas.pontoDePartida, r.janelas.unidadeVolume)} · janela de medição: ${windowText(r.janelas.medicao, r.janelas.unidadeVolume)}`);
      for (const w of r.janelas.avisos) doc.fillColor('#8C3A1B').text(`Aviso: ${w}`).fillColor('#000000');
      if (r.alteracoes.length) {
        doc.font('Helvetica-Bold').fillColor('#8C3A1B').text(`Houve alteração depois do início da medição (${r.alteracoes.length}):`).font('Helvetica');
        for (const x of r.alteracoes) doc.text(`${x.em.slice(0, 10)} · ${x.oQue} · ${x.por} · motivo: ${x.motivo}`);
        doc.fillColor('#000000');
      }
      if (r.aviso) doc.font('Helvetica-Bold').fillColor('#8C3A1B').text(r.aviso).fillColor('#000000').font('Helvetica');
      for (const i of indicatorRows(r)) {
        doc.moveDown(0.2).font('Helvetica-Bold').text(`${i.Indicador}${i.Unidade ? ` (${i.Unidade})` : ''} · comparado em ${i['Comparado em']}`).font('Helvetica');
        doc.text(`Antes: ${i.Antes} — ${i['Origem (antes)']}`).text(`Depois: ${i.Depois} — ${i['Origem (depois)']}`).text(`Diferença: ${i['Diferença']} · ${i['Situação']}`);
      }
      doc.moveDown(0.2).text(`Decisão: ${q.decisao ? `${q.decisao.decisao.toUpperCase()} — ${q.decisao.justificativa}` : 'ainda não decidido'}`);
      doc.text(`Trajetória: ${trajectoryText(r)}`);
    }
  });
}
