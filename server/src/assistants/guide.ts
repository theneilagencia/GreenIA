// Guia rápido de um assistente, gerado a partir da definição e da política
// efetiva, para o treinamento inicial: o que faz, o que enviar, o que não
// enviar, como revisar. Em PDF (para distribuir) ou Markdown.
import PDFDocument from 'pdfkit';
import core from '../../../lib/greenia-core.js';
import type { DataPolicy, SensitiveType } from '../../../lib/greenia-core.js';
import type { AssistantDefinition } from './schema.ts';
import type { UsageRules } from '../policy/usage-policy.ts';

const KIND_LABEL: Record<string, string> = {
  pdf: 'PDF', imagem: 'foto ou imagem digitalizada (JPG, PNG, TIFF, HEIC)', docx: 'Word (DOCX, DOC, ODT)', xlsx: 'Excel (XLSX, XLS, ODS)', csv: 'CSV exportado do sistema', nfe_xml: 'XML da NF-e', texto: 'texto (TXT)',
};
const FLAG_HINTS: Record<string, string> = {
  conferir: 'Cada divergência mostra os dois valores e onde estão. Confira no documento antes de aceitar ou descartar.',
  checklist: 'Itens duvidosos sempre precisam ser vistos no arquivo. Ausente quer dizer que nenhum arquivo enviado corresponde ao item.',
  extrair: 'Campos sem origem ou com origem que não confere foram marcados. A plataforma nunca completa campo vazio.',
  classificar: 'Documentos sem categoria ou sem período foram marcados. Corrija a categoria e o nome sugerido antes de aprovar.',
  consultar: 'A resposta cita documento e versão. Se a base não cobrir, a resposta diz isso e indica o key user.',
  resumir: 'Tópico sem informação no material aparece vazio ou com "Sem informação no material".',
};

export interface GuideInput { name: string; area: string | null; version: number; def: AssistantDefinition; policy: DataPolicy; rules?: UsageRules; keyUser: string }

export function guideSections(g: GuideInput) {
  const d = g.def;
  const label = (t: string) => core.SENSITIVE_LABELS[t as SensitiveType] ?? t;
  const by = (action: string) => (Object.entries(g.policy) as [string, string][]).filter(([, a]) => a === action).map(([t]) => label(t));
  const enviar: string[] = [];
  if (d.inputs.text.enabled) enviar.push(`${d.inputs.text.label}${d.inputs.text.required ? ' (obrigatório)' : ' (opcional)'}.`);
  if (d.inputs.files.enabled) enviar.push(`Arquivos: ${d.inputs.files.accept.map(k => KIND_LABEL[k]).join(', ')}. Até ${d.inputs.files.maxFiles} arquivos de ${d.inputs.files.maxFileMb} MB cada.${d.inputs.files.required ? ' Pelo menos um arquivo é obrigatório.' : ''}`);
  if (d.inputs.knowledge.enabled) enviar.push('O assistente também consulta os documentos de procedimento da área.');
  const naoEnviar = [
    `Nunca: ${[...new Set(['senha ou credencial', ...by('bloquear')])].join(', ')}.`,
    ...(g.rules?.restrictedTerms.length ? ['Informações restritas listadas na Política de Uso de IA.'] : []),
    ...(by('avisar').length ? [`Com aviso (a plataforma pede confirmação): ${by('avisar').join(', ')}.`] : []),
    ...(by('mascarar').length ? [`Mascarados antes do envio: ${by('mascarar').join(', ')}.`] : []),
    `Classes de dado aceitas: ${d.dataClasses.join(', ')}.`,
  ];
  const revisar = [
    d.review.required ? `Toda saída nasce como rascunho e precisa ser revisada por: ${d.review.reviewers.join(', ').replace('key_user', 'key user').replace('admin_cliente', 'administrador')}. Quem executou não revisa a própria saída.` : 'A revisão é recomendada; quem executou pode aprovar a própria saída.',
    ...d.review.checklist,
    ...[...new Set(d.pipeline.map(s => s.bloco))].map(b => FLAG_HINTS[b]).filter(Boolean),
    'Decisões: aprovar, aprovar com edição (a versão original fica guardada) ou rejeitar com o motivo.',
  ];
  const resultado = [
    `Formato: ${d.output.format}.`,
    ...(d.output.files.length ? [`Depois de aprovada, a saída pode ser exportada em ${d.output.files.map(f => f.toUpperCase()).join(', ')}.`] : []),
    'Se algo der errado (dado enviado sem querer, resposta errada), use "Reportar incidente".',
  ];
  return {
    titulo: g.name,
    subtitulo: `${g.area ? `Área ${g.area} · ` : ''}versão ${g.version}`,
    oQueFaz: [d.description, d.objective].filter(Boolean).join(' ') || 'Sem descrição cadastrada.',
    enviar, naoEnviar, revisar, resultado,
    contato: g.keyUser || 'o key user da sua área',
  };
}

export function guideMarkdown(g: GuideInput): string {
  const s = guideSections(g);
  const list = (xs: string[]) => xs.map(x => `- ${x}`).join('\n');
  return [`# ${s.titulo}: guia rápido`, s.subtitulo, `## O que faz\n${s.oQueFaz}`, `## O que enviar\n${list(s.enviar)}`,
    `## O que não enviar\n${list(s.naoEnviar)}`, `## Como revisar\n${list(s.revisar)}`, `## Resultado\n${list(s.resultado)}`, `Dúvidas: ${s.contato}.`].join('\n\n') + '\n';
}

export function guidePdf(g: GuideInput): Promise<Buffer> {
  const s = guideSections(g);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54, info: { Title: `${s.titulo}: guia rápido`, Creator: 'GreenIA' } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#19704A').text(s.titulo).fillColor('#000000');
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Guia rápido · ${s.subtitulo}`).fillColor('#000000');
    const section = (t: string, items: string[] | string) => {
      doc.moveDown(0.9).font('Helvetica-Bold').fontSize(12.5).text(t).moveDown(0.2).font('Helvetica').fontSize(10.5);
      if (typeof items === 'string') doc.text(items);
      else doc.list(items, { bulletRadius: 1.8, textIndent: 12, bulletIndent: 4 });
    };
    section('O que faz', s.oQueFaz);
    section('O que enviar', s.enviar);
    section('O que não enviar', s.naoEnviar);
    section('Como revisar', s.revisar);
    section('Resultado', s.resultado);
    doc.moveDown(1).font('Helvetica-Oblique').fontSize(10).text(`Dúvidas: ${s.contato}.`);
    doc.end();
  });
}
