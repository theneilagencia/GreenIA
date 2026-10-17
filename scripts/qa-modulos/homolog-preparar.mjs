// Homologação em produção (Etapa 5): prepara um tenant de homologação com dados SINTÉTICOS e um marcador próprio.
// Uso na sessão: rodar homolog-preparar <A|B>. Salva só ids, status HTTP e o marcador (sem conteúdo de clientes,
// códigos, cookies ou CSRF). Idempotente o bastante para rodar de novo: reusa a área e o Quick Win pelo nome.
import { randomBytes } from 'node:crypto';

export default async function (c, letra = 'A') {
  const L = String(letra).toUpperCase().replace(/[^AB]/g, '') || 'A';
  const marca = c.estado.marca || (c.estado.marca = `MARCA-HOMOLOG-${L}-${randomBytes(3).toString('hex').toUpperCase()}`);
  const out = { tenant: L, marca, passos: {} };
  const passo = (k, r, extra = {}) => { out.passos[k] = { status: r.status, ...extra }; c.log(k, r.status, JSON.stringify(extra).slice(0, 200)); return r; };
  const b64 = s => Buffer.from(s, 'utf8').toString('base64');

  // Área restrita (o usuário comum fica fora).
  let areas = (await c.api('GET', '/api/admin/areas')).dados?.areas || [];
  let area = areas.find(a => a.nome === `Restrita ${L}`);
  if (!area) area = passo('area', await c.api('POST', '/api/admin/areas', { nome: `Restrita ${L}`, descricao: 'Área sintética de homologação' })).dados;
  out.area = area?.id;

  const antes = c.estado.homolog?.[L] || {};
  // Documento na base da área.
  if (antes.documento) out.documento = antes.documento; else {
  const d = passo('documento', await c.api('POST', '/api/bases/documentos', { area_id: area?.id, titulo: `Procedimento sintético ${L}`,
    arquivo: { nome: `procedimento-${L}.txt`, base64: b64(`Procedimento fictício de homologação. Marcador: ${marca}. Conferir pedidos sintéticos.`) } }));
  out.documento = d.dados?.id ?? d.dados?.documento?.id ?? null; }

  // Conversa com anexo contendo o marcador (uma chamada de IA, curta).
  const conv = antes.conversa ? null : (await c.api('POST', '/api/conversas', {})).dados?.conversa;
  out.conversa = antes.conversa || conv?.id;
  if (conv?.id) {
    const r = await c.enviar(conv.id, { texto: 'Responda apenas "ok" e repita o marcador do anexo.', anexos: [{ nome: `nota-${L}.txt`, base64: b64(`Nota sintética de homologação. ${marca}`) }] });
    passo('mensagem', r, { linhas: r.linhas?.length, erro: r.erro?.slice?.(0, 120) });
  }

  // Quick Win a partir de um modelo inicial, publicado duas vezes (versões 1 e 2).
  const lista = (await c.api('GET', '/api/quick-wins')).dados?.quickWins || [];
  let qw = lista.find(q => q.nome === `Resumo sintético ${L}`);
  if (!qw) qw = passo('qw_criar', await c.api('POST', '/api/quick-wins', { modelo_inicial: 0, nome: `Resumo sintético ${L}`, toda_empresa: true })).dados;
  out.quick_win = qw?.id;
  if (qw?.id) {
    passo('qw_especificar', await c.api('PUT', `/api/quick-wins/${qw.id}`, { assistente: { descricao: 'Resumir em três tópicos o material sintético enviado, destacando o próximo passo.', formato: 'texto' } }));
    passo('qw_publicar_1', await c.api('POST', `/api/quick-wins/${qw.id}/publicar`, { toda_empresa: true, para_que_serve: `Resumo sintético de homologação ${L}` }));
    passo('qw_publicar_2', await c.api('POST', `/api/quick-wins/${qw.id}/publicar`, { para_que_serve: `Resumo sintético de homologação ${L} (v2)` }));
    const v = await c.api('GET', `/api/quick-wins/${qw.id}/versoes`);
    out.versoes = (v.dados?.versoes || []).map(x => x.numero);
  }
  c.estado.homolog = { ...(c.estado.homolog || {}), [L]: out };
  c.salvar(`homolog-preparar-${L}`, out);
  c.log('PREPARADO', JSON.stringify({ area: out.area, documento: out.documento, conversa: out.conversa, quick_win: out.quick_win, versoes: out.versoes }));
}
