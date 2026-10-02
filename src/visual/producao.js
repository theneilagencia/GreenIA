// Capacidade de produção visual do motor de Quick Wins (lado do servidor): para cada entregável da operação que
// pede um artefato visual, a partir do conteúdo já produzido e conferido pela execução:
//   conteúdo -> plano visual (IA pela mesma rota da execução, ou o planejador determinístico) -> assets (logo da
//   empresa; imagem gerada só se a empresa liberou e a governança permite) -> composição -> conferência ->
//   correção -> artefato pronto para exportar.
// A capacidade não controla o Quick Win: ela só roda para os entregáveis que pedem visual, e um Quick Win pode ter
// zero, um ou vários. Nada aqui decide modelo, sigilo ou permissão: isso vem da execução (conversas.js).
import { createHash } from 'node:crypto';
import { exec, json, um } from '../db.js';
import { lerConfig } from '../config.js';
import { registrar } from '../eventos.js';
import { contemCredencial, detectar } from '../filtro.js';
import { erroParaLog } from '../registro-seguro.js';
import { analisarConteudo } from './conteudo.js';
import { limparVisual, tracos } from './contrato.js';
import { lerPlano, mensagensPlano, planejar } from './plano.js';
import { inferirEstilo, resolverIdentidade } from './marca.js';
import { produzir } from './motor.js';
import { asset, inspecionarImagem, decodificarDataUrl, MAX_BYTES_ASSET } from './assets.js';
import { rotuloEntregavel } from '../quickwin-operacao.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpar = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// Entregáveis visuais da operação.
export const entregaveisVisuais = op => (op?.entregaveis || []).filter(e => e.visual?.tipo);

// Texto da seção de um entregável no resultado ("## <rótulo>" até o próximo "## ").
export function secaoDoResultado(texto, rotulo) {
  const ls = String(texto || '').split('\n'), alvo = norm(rotulo).replace(/[^a-z0-9]+/g, ' ').trim();
  const i = ls.findIndex(l => /^\s*#{1,2}\s+/.test(l) && norm(l.replace(/^\s*#+\s*/, '').replace(/[*_]/g, '')).replace(/[^a-z0-9]+/g, ' ').trim().includes(alvo));
  if (i < 0) return '';
  const fim = ls.findIndex((l, j) => j > i && /^\s*#{1,2}\s+/.test(l));
  return ls.slice(i + 1, fim < 0 ? undefined : fim).join('\n').trim();
}

// "Título: ..." na primeira linha da seção (pedido no prompt): o título da peça.
function tituloDaSecao(texto) {
  const ls = String(texto || '').split('\n');
  const k = ls.findIndex(l => l.trim());
  const m = k >= 0 ? /^\s*\**\s*(?:t[ií]tulo|title)\s*\**\s*:\s*\**(.+?)\**\s*$/i.exec(ls[k]) : null;
  return m ? { titulo: limpar(m[1], 90), resto: ls.slice(k + 1).join('\n') } : { titulo: '', resto: texto };
}

// ---- Gerador de imagem (asset), governado ---------------------------------------------------------------------
// Só quando: a empresa ligou, a conversa não é sigilosa, a área não pede proteção reforçada, nada do pedido é dado
// que a política manda proteger, o plano não está na reserva e o provedor existe. O pedido de imagem leva só o
// tema da peça e o estilo (nunca o conteúdo, números ou nomes do material) e passa pelo filtro de dados.
export function decisaoImagem(app, cfg, governanca) {
  const g = cfg.producaoVisual?.imagens || {};
  if (!g.ativa) return { pode: false, motivo: 'nao_liberado' };
  if (typeof app.ia?.gerarImagem !== 'function') return { pode: false, motivo: 'sem_provedor' };
  if (governanca.sigilosa) return { pode: false, motivo: 'sigilosa' };
  if (governanca.areaReforcada) return { pode: false, motivo: 'area_reforcada' };
  if (governanca.protegidos) return { pode: false, motivo: 'dados_protegidos' };
  if (governanca.reserva) return { pode: false, motivo: 'reserva_do_plano' };
  return { pode: true, modelo: g.modelo || 'google/gemini-2.5-flash-image' };
}
export const MOTIVOS_IMAGEM = { nao_liberado: 'a geração de imagem não está liberada pela empresa', sem_provedor: 'não há gerador de imagem disponível', sigilosa: 'a conversa tem informação sigilosa',
  area_reforcada: 'a área pede proteção reforçada', dados_protegidos: 'o pedido tem dados que a política manda proteger', reserva_do_plano: 'os créditos do mês estão no modo econômico', falhou: 'o gerador de imagem falhou', pedido_inseguro: 'o tema da imagem tem dado protegido' };
export function pedidoDeImagem({ titulo, objetivo, estilo = '', tipo }) {
  const tema = limpar(`${titulo}. ${objetivo}`, 260).replace(/\d[\d.,%]*/g, '').replace(/[<>]/g, '');
  return `Crie uma imagem ${/foto|fotograf/i.test(estilo) ? 'fotográfica' : 'ilustrativa'} para ilustrar uma peça visual (${tipo}) sobre: ${tema}. ${estilo ? `Estilo: ${limpar(estilo, 120)}.` : 'Estilo limpo, profissional e contemporâneo.'} Sem nenhum texto, letra, número, logotipo ou marca d'água na imagem. Sem pessoas reais identificáveis.`;
}

export function guardarAsset(app, { conversaId, pessoaId, tipo, origem, dataUrl }) {
  const d = decodificarDataUrl(dataUrl);
  if (!d || d.bytes.length > MAX_BYTES_ASSET) return null;
  const info = inspecionarImagem(d.bytes);
  if (!info || info.mime !== d.mime) return null;
  const id = Number(exec(app.db, 'insert into visual_assets (conversa_id, pessoa_id, tipo, origem, mime, w, h, bytes, sha, criado_em) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    conversaId, pessoaId, tipo, origem, info.mime, Math.round(info.w), Math.round(info.h), d.bytes, createHash('sha256').update(d.bytes).digest('hex').slice(0, 32), app.agora().toISOString()).lastInsertRowid);
  return { id, mime: info.mime, w: info.w, h: info.h };
}
export function carregarAssets(app, conversaId, refs = {}) {
  const out = {};
  for (const [papel, id] of Object.entries(refs || {})) {
    const a = um(app.db, 'select id, tipo, origem, mime, w, h, bytes from visual_assets where id = ? and conversa_id = ?', Number(id), conversaId);
    if (a) out[papel] = { id: a.id, tipo: a.tipo, origem: a.origem, w: a.w, h: a.h, dataUrl: `data:${a.mime};base64,${Buffer.from(a.bytes).toString('base64')}` };
  }
  return out;
}

const dataDe = (app, idioma = 'pt') => app.agora().toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { timeZone: process.env.PLATAFORMA_FUSO || 'America/Sao_Paulo' });
const idiomaDe = texto => { const t = ` ${norm(texto)} `; const en = (t.match(/ (the|and|of|to|with|for|is|are|this|that) /g) || []).length, pt = (t.match(/ (de|da|do|que|com|para|os|as|uma|não|nao|e) /g) || []).length; return en > pt * 1.5 ? 'en' : 'pt'; };

// Produz os artefatos de uma execução (sem gravar: a gravação vem depois da resposta, com o id dela).
export async function produzirVisuais(app, { pessoa, conv, qw, espec, resposta, chamar, usarIA = true, governanca = {}, etapa = () => {} }) {
  const op = espec?.operacao;
  const visuais = entregaveisVisuais(op);
  if (!visuais.length) return null;
  const cfg = lerConfig(app.db);
  const t0 = Date.now();
  const custos = { plano_visual: 0, imagem: 0, render: 0 };
  const ms = { plano: 0, assets: 0, composicao: 0, conferencia: 0 };
  const artefatos = [], ignorados = [];
  for (const e of visuais) {
    const visual = limparVisual(e.visual);
    const rotulo = e.rotulo || visual.rotulo || '';
    // A seção do entregável ("## <título>"); com um entregável só e sem a seção, o resultado inteiro é o conteúdo.
    const secao = secaoDoResultado(resposta, rotuloEntregavel(e)) || (op.entregaveis.length === 1 ? String(resposta || '').replace(/^\s*#{1,2}\s+.*$/m, '') : '');
    const { titulo: tituloDado, resto } = tituloDaSecao(secao);
    if (!resto.trim()) { ignorados.push({ entregavel: e.id, motivo: 'sem_conteudo' }); continue; }
    if (contemCredencial(resto)) { ignorados.push({ entregavel: e.id, motivo: 'credencial' }); continue; }
    if (visuais.length > 1) etapa(`Montando o visual: ${rotulo || tracos(visual).rotulo}…`);
    const titulo = tituloDado || rotulo || qw?.nome || '';
    const conteudo = analisarConteudo(resto, { titulo });
    const tr = tracos(visual, { secoes: conteudo.secoes.length });
    const identidade = resolverIdentidade(cfg, { inferida: inferirEstilo(`${espec.objetivo || ''} ${visual.estilo || ''}`) });
    // Plano visual.
    let plano = null, origemPlano = 'deterministico';
    const a = Date.now();
    if (usarIA && chamar) {
      try {
        const r = await chamar(mensagensPlano({ conteudo, tr, objetivo: espec.objetivo, publico: visual.publico, identidade }));
        custos.plano_visual += r.custo || 0;
        plano = lerPlano(r.texto, conteudo, tr, { titulo });
        if (plano) origemPlano = 'ia';
      } catch (err) { app.log?.('plano visual', erroParaLog(err)); }
    }
    if (!plano) plano = planejar(conteudo, tr, { titulo });
    ms.plano += Date.now() - a;
    // Assets: a imagem da peça, quando pedida.
    const b = Date.now();
    const assets = {};
    let imagem = null;
    if (visual.imagem === 'real') {
      // Foto ou imagem que precisa ser real (produto, equipe, local): nunca gerada; espaço reservado explícito.
      const alvo = plano.paginas.find(p => p.papel === 'conteudo') || plano.paginas[0];
      alvo.blocos.unshift({ id: 'b_img', tipo: 'imagem', asset: 'heroi', refs: [], proposito: limpar(visual.imagemDescricao || 'foto real a ser fornecida', 80) });
      imagem = { pedida: 'real', gerada: false, motivo: 'precisa_ser_real' };
    } else if (visual.imagem) {
      const d = decisaoImagem(app, cfg, governanca);
      imagem = { pedida: 'conceitual', gerada: false, motivo: d.motivo || null };
      if (d.pode) {
        const pedido = pedidoDeImagem({ titulo, objetivo: espec.objetivo, estilo: visual.estilo, tipo: tr.rotulo });
        if (detectar(pedido).length || contemCredencial(pedido)) imagem.motivo = 'pedido_inseguro';
        else {
          try {
            etapa('Gerando a imagem da peça…');
            const g = await app.ia.gerarImagem(pedido, { modelo: d.modelo, sinal: AbortSignal.timeout(90_000) });
            custos.imagem += g.custo || 0;
            const info = decodificarDataUrl(g.dataUrl) && inspecionarImagem(decodificarDataUrl(g.dataUrl).bytes);
            if (info) {
              imagem = { ...imagem, gerada: true, provedor: 'servico_de_ia', modelo: g.modelo, motivo: null };
              assets.heroi = { ...asset({ id: 'heroi', tipo: 'imagem_gerada', origem: 'gerado', proposito: 'imagem da peça' }), dataUrl: g.dataUrl, w: info.w, h: info.h };
            } else imagem.motivo = 'falhou';
          } catch (err) { imagem.motivo = 'falhou'; app.log?.('imagem', erroParaLog(err)); }
        }
      }
    }
    ms.assets += Date.now() - b;
    const idioma = idiomaDe(resto);
    const exigidos = op.entregaveis.length === 1 ? (espec.invariantes?.entregaveis || []) : [];
    const r = produzir({ plano, conteudo, identidade, tr, assets, exigidos, textosLivres: [titulo], opcoes: { data: dataDe(app, idioma), idioma, imagemPedida: imagem?.pedida === 'real' } });
    ms.composicao += r.registro.ms.composicao; ms.conferencia += r.registro.ms.conferencia;
    const avisos = [...r.explicacoes];
    if (imagem?.pedida === 'conceitual' && !imagem.gerada) avisos.push(`A peça saiu sem imagem gerada (${MOTIVOS_IMAGEM[imagem.motivo] || 'indisponível'}): o visual usa tipografia, formas e cores.`);
    artefatos.push({ entregavel: e.id, rotulo: rotulo || tr.rotulo, tipo: tr.tipo, tipoRotulo: tr.rotulo, titulo, formato: plano.formato, conteudo, plano: r.plano, opcoes: r.opcoes, identidade, assets, imagem,
      registro: { ...r.registro, plano: origemPlano, imagem }, status: r.registro.status, avisos, exportacoes: r.plano.exportacoes, paginas: r.paginas.length });
  }
  return { artefatos, ignorados, custos, ms: { ...ms, total: Date.now() - t0 } };
}

// Grava os artefatos produzidos, ligados à resposta e à execução. Devolve o resumo para a tela.
export function gravarVisuais(app, producao, { pessoa, conv, qw, respId, rotaId }) {
  if (!producao?.artefatos?.length) return [];
  const agora = app.agora().toISOString();
  return producao.artefatos.map(a => {
    const assetsRefs = {};
    for (const [papel, x] of Object.entries(a.assets || {})) {
      if (!x?.dataUrl) continue;
      const g = guardarAsset(app, { conversaId: conv.id, pessoaId: pessoa.id, tipo: x.tipo || 'imagem_gerada', origem: x.origem || 'gerado', dataUrl: x.dataUrl });
      if (g) assetsRefs[papel] = g.id;
    }
    const opcoes = { ...a.opcoes, assets: assetsRefs };
    const id = Number(exec(app.db, `insert into artefatos_visuais (versao, atual, conversa_id, mensagem_id, roteamento_id, quick_win_id, quick_win_versao, pessoa_id, entregavel_id, tipo, rotulo, titulo, formato, paginas,
      conteudo, plano, opcoes, identidade, qualidade, status, exportacoes, criado_em) values (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      conv.id, respId, rotaId, conv.quick_win_id, qw?.versao ?? null, pessoa.id, a.entregavel, a.tipo, a.rotulo, a.titulo || a.rotulo, a.formato, a.paginas,
      JSON.stringify(a.conteudo), JSON.stringify(a.plano), JSON.stringify(opcoes), JSON.stringify(a.identidade), JSON.stringify({ ...a.registro, avisos: a.avisos }), a.status, JSON.stringify(a.exportacoes), agora).lastInsertRowid);
    exec(app.db, 'update artefatos_visuais set base_id = ? where id = ?', id, id);
    registrar(app, 'visual.produced', pessoa.id, { conversa: conv.id, quick_win: conv.quick_win_id, teste: !!conv.teste, roteamento: rotaId, artefato: id, tipo: a.tipo, formato: a.formato,
      paginas: a.paginas, status: a.status, correcoes: a.registro.correcoes, plano: a.registro.plano, imagem: a.imagem ? { gerada: !!a.imagem.gerada, motivo: a.imagem.motivo || null } : null,
      escala: a.registro.escala, ms: a.registro.ms?.total ?? null });
    return resumoArtefato(app, um(app.db, 'select * from artefatos_visuais where id = ?', id));
  });
}

// O que a tela recebe de um artefato (nada técnico: sem plano, sem JSON de composição).
export function resumoArtefato(app, a) {
  const q = json(a.qualidade, {});
  return { id: a.id, base_id: a.base_id, versao: a.versao, tipo: a.tipo, rotulo: a.rotulo, titulo: a.titulo, formato: a.formato, paginas: a.paginas, status: a.status,
    exportacoes: json(a.exportacoes, []), avisos: q.avisos || [], correcoes: q.correcoes || 0, criado_em: a.criado_em, mensagem_id: a.mensagem_id };
}
