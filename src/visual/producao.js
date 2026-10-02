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
import { FORMATOS, limparVisual, tracos } from './contrato.js';
import { lerPlano, mensagensPlano, planejar } from './plano.js';
import { inferirEstilo, resolverIdentidade } from './marca.js';
import { produzir, produzirSemCorte } from './motor.js';
import { asset, inspecionarImagem, decodificarDataUrl, MAX_BYTES_ASSET } from './assets.js';
import { renderizavel } from './webp.js';
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

// Seções "## ..." do resultado, cada uma com o seu texto.
function secoesDoResultado(texto) {
  const ls = String(texto || '').split('\n'), out = [];
  for (const l of ls) { if (/^\s*#{1,2}\s+/.test(l)) out.push({ titulo: l.replace(/^\s*#+\s*/, ''), linhas: [] }); else if (out.length) out.at(-1).linhas.push(l); }
  return out.map(x => ({ titulo: x.titulo, texto: x.linhas.join('\n').trim() }));
}
// Seção da peça: a do entregável; quando ela não traz "Título:" (o formato pedido para o conteúdo da peça) e uma
// outra seção traz, com uma peça só, o conteúdo da peça é essa outra (a execução escreveu a peça em seção própria).
export function secaoDaPeca(texto, rotulo, nPecas = 1) {
  const propria = secaoDoResultado(texto, rotulo);
  if (propria && tituloDaSecao(propria).titulo) return propria;
  const comTitulo = secoesDoResultado(texto).filter(x => tituloDaSecao(x.texto).titulo);
  return nPecas === 1 && comTitulo.length === 1 ? comTitulo[0].texto : propria;
}

// Pedido comparativo (tipo comparação, ou o trabalho compara/confronta itens) cuja peça não traz estrutura comparativa:
// a matriz itens x critérios que o resultado tem (em outra seção) entra na peça. Comparação não fica implícita.
// Formato que a pessoa pediu (e não só o que a interpretação escolheu): fica, mesmo que a peça precise de mais área.
export const PEDE_FORMATO = /\b(16:9|4:3|1:1|4:5|9:16|1\.91:1|a4|a3|paisagem|retrato|quadrad[oa]|vertical|horizontal|stories|widescreen|tela cheia)\b/i;
export const temComparacao = conteudo => conteudo.secoes.some(s => s.itens.some(i => i.comparacao));
export function comComparacao(conteudo, { resposta, visual, espec }) {
  const comparativo = visual?.tipo === 'comparison' || /\bcompar|\bconfront|\bversus\b|\bmatriz\b/i.test(`${espec?.objetivo || ''} ${visual?.rotulo || ''}`);
  if (!comparativo || temComparacao(conteudo)) return conteudo;
  const todo = analisarConteudo(String(resposta || ''), {});
  const tabela = todo.secoes.flatMap(s => s.itens).find(i => i.comparacao);
  if (!tabela) return conteudo;
  const secoes = [...conteudo.secoes];
  const pos = secoes.length && !secoes[0].titulo ? 1 : 0;
  secoes.splice(pos, 0, { id: 'cmp', titulo: 'Comparação', pagina: null, itens: [{ ...tabela }] });
  secoes.forEach((s, k) => { const id = `s${k + 1}`; s.itens.forEach((it, j) => { it.id = `${id}.i${j + 1}`; }); s.id = id; });
  return { ...conteudo, secoes };
}

// "Título: ..." na primeira linha da seção (pedido no prompt): o título da peça.
// Aceita o "Título:" depois de cabeçalhos ("### Página 1"), antes do primeiro conteúdo.
function tituloDaSecao(texto) {
  const ls = String(texto || '').split('\n');
  let k = 0;
  while (k < ls.length && (!ls[k].trim() || /^\s*#{1,6}\s/.test(ls[k]))) k++;
  const m = k < ls.length ? /^\s*\**\s*(?:t[ií]tulo|title)\s*\**\s*:\s*\**(.+?)\**\s*$/i.exec(ls[k]) : null;
  return m ? { titulo: limpar(m[1], 90), resto: [...ls.slice(0, k), ...ls.slice(k + 1)].join('\n') } : { titulo: '', resto: texto };
}

// ---- Gerador de imagem (asset), governado ---------------------------------------------------------------------
// Só quando: a empresa ligou, a conversa não é sigilosa, a área não pede proteção reforçada, nada do pedido é dado
// que a política manda proteger, o plano não está na reserva e o provedor existe. O pedido de imagem leva só o
// tema da peça e o estilo (nunca o conteúdo, números ou nomes do material) e passa pelo filtro de dados.
export function decisaoImagem(app, cfg, governanca) {
  const g = cfg.producaoVisual?.imagens || {};
  if (!g.ativa) return { pode: false, motivo: 'nao_liberado' };
  if (typeof app.ia?.gerarImagem !== 'function' || app.ia.geraImagem === false) return { pode: false, motivo: 'sem_provedor' };
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
  const d0 = decodificarDataUrl(dataUrl);
  if (!d0 || d0.bytes.length > MAX_BYTES_ASSET) return null;
  const i0 = inspecionarImagem(d0.bytes);
  if (!i0 || i0.mime !== d0.mime) return null;
  // WEBP é guardado já como PNG (o renderizador e o PDF não leem WEBP).
  const d = i0.mime === 'image/webp' ? decodificarDataUrl(renderizavel(dataUrl)) : d0;
  if (!d || d.bytes.length > MAX_BYTES_ASSET * 4) return null;
  const info = inspecionarImagem(d.bytes);
  if (!info) return null;
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
    const secao = secaoDaPeca(resposta, rotuloEntregavel(e), visuais.length) || (op.entregaveis.length === 1 ? String(resposta || '').replace(/^\s*#{1,2}\s+.*$/m, '') : '');
    const { titulo: tituloDado, resto } = tituloDaSecao(secao);
    if (!resto.trim()) { ignorados.push({ entregavel: e.id, motivo: 'sem_conteudo' }); continue; }
    if (contemCredencial(resto)) { ignorados.push({ entregavel: e.id, motivo: 'credencial' }); continue; }
    if (visuais.length > 1) etapa(`Montando o visual: ${rotulo || tracos(visual).rotulo}…`);
    const titulo = tituloDado || rotulo || qw?.nome || '';
    const conteudo = comComparacao(analisarConteudo(resto, { titulo }), { resposta, visual, espec });
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
            const url = renderizavel(g.dataUrl);
            const info = url && decodificarDataUrl(url) && inspecionarImagem(decodificarDataUrl(url).bytes);
            if (info) {
              imagem = { ...imagem, gerada: true, provedor: 'servico_de_ia', modelo: g.modelo, motivo: null };
              assets.heroi = { ...asset({ id: 'heroi', tipo: 'imagem_gerada', origem: 'gerado', proposito: 'imagem da peça' }), dataUrl: url, w: info.w, h: info.h };
            } else imagem.motivo = 'falhou';
          } catch (err) { imagem.motivo = 'falhou'; app.log?.('imagem', erroParaLog(err)); }
        }
      }
    }
    ms.assets += Date.now() - b;
    const idioma = idiomaDe(resto);
    const exigidos = op.entregaveis.length === 1 ? (espec.invariantes?.entregaveis || []) : [];
    const opc = { data: dataDe(app, idioma), idioma, imagemPedida: imagem?.pedida === 'real' };
    let r = produzirSemCorte({ plano, conteudo, identidade, tr, assets, exigidos, textosLivres: [titulo], opcoes: opc }, { formatoPedido: !!visual.formato && PEDE_FORMATO.test(`${espec?.objetivo || ''} ${qw?.descricao || ''}`) });
    // Diagrama sem formato pedido: a orientação da página segue o desenho (fluxo longo de cima para baixo cabe melhor
    // em pé). Fica a que permite o texto maior sem falha.
    if (!visual.formato && tr.foco === 'diagrama') {
      const outro = plano.formato === 'a4_paisagem' ? 'a4' : 'a4_paisagem';
      const p2 = { ...structuredClone(plano), formato: outro, canvas: { w: FORMATOS[outro].w, h: FORMATOS[outro].h } };
      const r2 = produzir({ plano: p2, conteudo, identidade, tr: { ...tr, formato: outro, dim: FORMATOS[outro] }, assets, exigidos, textosLivres: [titulo], opcoes: opc });
      if (!r2.registro.erros.length && (r.registro.erros.length || r2.registro.escala > r.registro.escala + 0.04)) r = r2;
    }
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
