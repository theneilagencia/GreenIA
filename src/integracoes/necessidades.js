// Necessidades de integração de um Quick Win (o que o trabalho precisa fazer FORA da GreenIA). Módulo leve, sem
// banco nem rede: a operação do Quick Win guarda a lista validada; a resolução e a execução ficam em plano.js.
import { CATEGORIAS } from './riscos.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const corta = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

// ---- Necessidades ----------------------------------------------------------------------------------------------
// Leitura genérica (sem IA): só conta como ação externa quando o pedido nomeia um sistema fora da GreenIA
// ("no CRM", "no sistema", "no ERP", "na planilha online", "no <Nome Próprio>"). Sem isso, nenhuma necessidade:
// Quick Wins de texto, análise e produção visual seguem exatamente como antes.
const SISTEMA = /\b(?:no|na|do|da|ao|à|pelo|pela|via|para o|para a)\s+((?:sistema|crm|erp|portal|plataforma|planilha online|banco de dados|api|aplicativo|app|helpdesk|service desk|intranet|ferramenta|software|site)(?:\s+(?:de|do|da)\s+[\wÀ-ú-]+|\s+(?!(?:e|ou|de|do|da|com|para|sem|que|os|as|o|a|um|uma|em|no|na|depois|então)\b)[A-Za-zÀ-ú][\wÀ-ú-]{2,}(?:\s+[A-Z][\wÀ-ú-]+){0,3})?|[A-Z][\wÀ-ú-]+(?:\s+[A-Z][\wÀ-ú-]+)?)|\b(?:por|via|pelo)\s+(e-?mail|sms|whatsapp)\b/;
// Nome próprio que não é sistema externo: canais de conteúdo (a peça é produzida aqui), lugares, formatos e meses.
const NAO_SISTEMA = /^(instagram|linkedin|tiktok|youtube|facebook|twitter|x|threads|pinterest|kwai|blog|brasil|portugal|europa|america|sao paulo|rio|excel|word|powerpoint|pdf|markdown|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|greenia|quick win)\b/;
const MESMO_SISTEMA = /\b(?:no|na|do|da|ao|à|pelo|pela|via|para o|para a)\s+(?:mesmo|mesma)\s+(?:sistema|crm|erp|portal|plataforma|api|aplicativo|app|ferramenta|software)\b/i;
const VERBOS = [
  ['delete_record', /\b(apag|exclu|remov|delet)\w*/],
  ['send_message', /\b(envi|mand|dispar|notifi|respond|avis|comuniq|comunic|encaminh)\w*\b[^.]{0,60}\b(e-?mail|mensage|sms|notifica|alerta|aviso|comunicado|cliente|solicitante|chamado|ticket|gestor|responsavel|equipe|fornecedor|colaborador)/],
  ['generate_document', /\b(emit|emiss)\w*\b[^.]{0,60}\b(nota|documento|boleto|fatura|recibo|certificado|contrato|guia)/],
  ['update_record', /\b(atualiz|alter|mud|marqu|edit|mov|transfir|transfer|reabr|fech|encerr|aprov)\w*/],
  ['create_record', /\b(registr|cadastr|lanc|lanç|cri|inclu|abr|insir|inser|agend|publi)\w*/],
  ['upload_file', /\b(anex|sub[aei]|carreg|upload|salv)\w*\b[^.]{0,40}\b(arquivo|documento|pdf|planilha|contrato|comprovante|nota|relatorio|imagem|foto)/],
  ['trigger_workflow', /\b(acion|dispar|inici)\w*\b[^.]{0,40}\b(fluxo|workflow|processo|aprova)/],
  ['read_data', /\b(consult|procur|pesquis|busc|busq|pux|obtenh|obter|traga|traz|ler\b|leia|verifi|confir|levant|baix|export|extra)\w*/],
];
const VERBO_INICIO = /(?:encaminh|procur|pesquis|avis|comuniq|comunic|mov|transfir|transfer|reabr|fech|encerr|aprov|consult|busc|busq|baix|export|extra|respond|agend|publi|salv|pux|obten|obter|traga|traz|registr|cadastr|lanc|lanç|cri|inclu|abr|insir|inser|atualiz|alter|mud|marqu|edit|envi|mand|dispar|notifi|emit|apag|exclu|remov|delet|anex|sub|carreg|acion|inici|ler\b|lei|verifi|confir|levant)\w*/;
// Cláusulas: frases e conectivos ("e", "depois", "em seguida", vírgula) antes de um verbo de ação. "depois de
// <verbo>" é pré-requisito: vem antes da ação anterior ("emita a nota depois de confirmar o pagamento").
function clausulas(texto) {
  const V = VERBO_INICIO.source;
  const sep = new RegExp(`\\s*,\\s*(?:(?:e depois|depois|em seguida|então|e)\\s+)?(?=${V})|\\s+(?:e depois|depois|em seguida|então|e)\\s+(?=${V})|\\s+(?=(?:antes|depois) de\\s+${V})`, 'i');
  const out = [];
  for (const f of String(texto || '').split(/(?<=[.;!?\n])\s+/)) {
    const partes = f.split(sep).map(x => x.trim()).filter(Boolean);
    for (let k = 0; k < partes.length; k++) {
      if (/^depois de\s/i.test(partes[k]) && k > 0) { const pre = partes[k].replace(/^depois de\s+/i, ''); partes.splice(k - 1, 2, pre, partes[k - 1]); }
      else partes[k] = partes[k].replace(/^antes de\s+/i, '');
    }
    out.push(...partes);
  }
  return out;
}
export function necessidadesDoPedido(texto) {
  // Cláusulas: frases e "e"/"depois"/"em seguida" antes de um verbo de ação (duas ações na mesma frase = duas etapas).
  const frases = clausulas(texto);
  const out = [];
  for (const f of frases.slice(0, 20)) {
    const m = SISTEMA.exec(f);
    const sistema = MESMO_SISTEMA.test(f) ? out.at(-1)?.sistema : m && (m[1] || m[2]);
    if (!sistema || NAO_SISTEMA.test(norm(sistema))) continue;
    const t = norm(f);
    // O verbo que aparece primeiro na cláusula decide a categoria.
    const achados = VERBOS.map(([cat, re]) => { const x = re.exec(t); return x ? { cat, i: x.index } : null; }).filter(Boolean).sort((a, b) => a.i - b.i);
    if (!achados.length) continue;
    const categoria = achados[0].cat;
    out.push({ id: `n${out.length + 1}`, acao: corta(f, 160), categoria, sistema: corta(sistema, 60), modo: ['read_data', 'search', 'query_database', 'download_file'].includes(categoria) ? 'read' : 'write',
      depende_de: out.length ? [`n${out.length}`] : [] });
  }
  return out.slice(0, 10);
}
export function limparNecessidades(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 10).map((n, i) => ({
    id: corta(n?.id || `n${i + 1}`, 20).replace(/[^\w-]/g, '') || `n${i + 1}`, acao: corta(n?.acao, 160), categoria: CATEGORIAS.includes(n?.categoria) ? n.categoria : 'custom',
    sistema: corta(n?.sistema, 60) || null, modo: n?.modo === 'read' ? 'read' : 'write', depende_de: (Array.isArray(n?.depende_de) ? n.depende_de : []).map(x => corta(x, 20)).slice(0, 5),
    ...(Array.isArray(n?.entrada) ? { entrada: n.entrada } : {}),
  })).filter(n => n.acao);
}
