// Motor da produção visual (sem rede, sem banco): plano + conteúdo + identidade -> páginas compostas e conferidas.
// Ordem: ajuste de escala (composição) -> conferência -> correção automática (no máximo MAX_CORRECOES_VISUAIS
// rodadas) -> estado final. Cada rodada fica registrada: o que falhou e o que foi feito. Nada aqui inventa
// conteúdo: as correções mexem em escala, colunas, paginação, cor de texto (contraste) e na recomposição de itens
// que ficaram de fora.
import { FORMATOS } from './contrato.js';
import { compor } from './layout.js';
import { conferirVisual, CODIGOS } from './qualidade.js';
import { ajustarContraste } from './marca.js';
import { itensPorId } from './conteudo.js';

export const MAX_CORRECOES_VISUAIS = 4;
const ESCALA_MAX = { secao: 1.2, impacto: 1.15, painel: 1.45 };
const GEOMETRIA = new Set(['transbordo', 'corte', 'sobreposicao', 'densidade', 'paginas', 'texto_cortado', 'quebra']);

const cabe = (r, plano, tr) => {
  const c = conferirVisual({ paginas: r.paginas, plano, conteudo: r.conteudo, tr });
  // Página faltando porque o conteúdo tem menos seções não é questão de espaço.
  return !c.erros.some(e => GEOMETRIA.has(e.codigo) && !(e.codigo === 'paginas' && e.obtido < e.esperado));
};

// Correções de cor guardadas (deterministas): reaplicadas sempre que a peça é recomposta.
function aplicarCores(paginas, ajustes = []) {
  for (const a of ajustes) for (const pg of paginas) for (const p of pg.prims) if (p.t === 'text' && p.cor === a.de && (!a.pagina || pg.numero === a.pagina) && (!a.papel || p.papel === a.papel)) p.cor = a.para;
  return paginas;
}

export function montar({ plano, conteudo, identidade, assets = {}, opcoes = {} }) {
  const r = compor({ plano, conteudo, identidade, assets, opcoes });
  aplicarCores(r.paginas, opcoes.ajustesCor);
  return { ...r, conteudo };
}

export function produzir({ plano: planoInicial, conteudo, identidade, tr, assets = {}, opcoes: op0 = {}, exigidos = [], textosLivres = [] }) {
  const t0 = Date.now();
  let plano = structuredClone(planoInicial);
  const opcoes = { escala: 1, ...op0 };
  const continuo = plano.paginas.some(p => p.layout === 'continuo');
  const minEscala = Math.ceil(Math.max(0.55, FORMATOS[plano.formato].minimo / FORMATOS[plano.formato].corpo) * 100) / 100;
  const tentativas = [];
  // 1. Ajuste de escala (composição, não correção): o maior tamanho de texto em que tudo cabe, até o teto do tipo.
  if (!continuo && !op0.escala) {
    const teto = plano.impacto ? ESCALA_MAX.impacto : plano.multipagina ? ESCALA_MAX.secao : ESCALA_MAX.painel;
    for (let e = teto; e >= 1 - 1e-9; e -= 0.05) {
      const r = montar({ plano, conteudo, identidade, assets, opcoes: { ...opcoes, escala: e } });
      if (cabe(r, plano, tr)) { opcoes.escala = Math.round(e * 100) / 100; break; }
    }
  }
  const ms = { composicao: 0, conferencia: 0 };
  const rodar = () => {
    const a = Date.now();
    const r = montar({ plano, conteudo, identidade, assets, opcoes });
    ms.composicao += Date.now() - a;
    const b = Date.now();
    const c = conferirVisual({ paginas: r.paginas, plano, conteudo, tr, identidade, exigidos, opcoes: { textosLivres: [...textosLivres, opcoes.data || ''] } });
    ms.conferencia += Date.now() - b;
    return { r, c };
  };
  let { r, c } = rodar();
  tentativas.push({ n: 0, erros: [...new Set(c.erros.map(e => e.codigo))], acao: 'primeira_composicao', escala: opcoes.escala });
  let correcoes = 0;
  // Estratégias, em ordem. Cada uma devolve o nome da ação quando mudou algo; a que não se aplica (ou não muda nada)
  // passa a vez à seguinte. Uma rodada = uma ação, sempre registrada.
  const estrategias = [
    codigos => {
      if (!codigos.has('conteudo_faltando')) return null;
      // Recompor: o item que não está em bloco nenhum entra como bloco padrão na página da seção dele.
      const faltam = new Set(c.erros.find(e => e.codigo === 'conteudo_faltando').itens || []);
      const itens = itensPorId(conteudo);
      let mudou = false;
      for (const id of faltam) {
        const it = itens.get(id);
        if (!it || plano.paginas.some(p => p.blocos.some(b => b.refs?.includes(id)))) continue;
        const alvo = plano.paginas.find(p => p.blocos.some(b => b.secao === it.secao)) || plano.paginas.filter(p => p.papel !== 'capa').at(-1) || plano.paginas.at(-1);
        const tipo = { tabela: 'tabela', lista: it.checklist ? 'checklist' : 'lista', indicadores: 'indicadores', fluxo: 'diagrama', citacao: 'citacao', subtitulo: 'subtitulo' }[it.tipo] || 'texto';
        alvo.blocos.push({ id: `b_r${id.replace(/\W/g, '')}`, tipo, refs: [id], secao: it.secao, ...(tipo === 'diagrama' ? { diagrama: { tipo: 'fluxo' } } : {}) });
        mudou = true;
      }
      // Item que está num bloco mas não aparece inteiro (gráfico que não mostra uma coluna): ganha a tabela.
      if (!mudou) for (const id of faltam) {
        const it = itens.get(id);
        if (it?.tipo !== 'tabela' || plano.paginas.some(p => p.blocos.some(b => b.tipo === 'tabela' && b.refs?.includes(id)))) continue;
        const pg = plano.paginas.find(p => p.blocos.some(b => b.refs?.includes(id)));
        const i = pg.blocos.findIndex(b => b.refs?.includes(id));
        pg.blocos.splice(i + 1, 0, { id: `b_t${id.replace(/\W/g, '')}`, tipo: 'tabela', refs: [id], secao: it.secao });
        mudou = true;
      }
      return mudou ? 'recompor_conteudo' : null;
    },
    codigos => {
      if (!codigos.has('dados_incorretos')) return null;
      // Número fora do conteúdo só pode ter vindo de um título escrito no plano: volta ao título da seção.
      const titulos = new Map(conteudo.secoes.map(s => [s.id, s.titulo || '']));
      let mudou = false;
      for (const p of plano.paginas) {
        if (p.papel === 'capa') continue;
        const secao = p.secao || p.blocos[0]?.secao;
        const novo = secao && titulos.has(secao) ? titulos.get(secao) : p.titulo;
        if (p.subtitulo || novo !== p.titulo) { p.subtitulo = ''; p.titulo = novo; mudou = true; }
      }
      return mudou ? 'titulos_do_conteudo' : null;
    },
    codigos => {
      if (![...codigos].some(k => GEOMETRIA.has(k)) || (codigos.size === 1 && codigos.has('paginas') && c.erros.find(e => e.codigo === 'paginas').obtido < c.erros.find(e => e.codigo === 'paginas').esperado)) return null;
      // Transbordo: primeiro a escala (até o mínimo legível), depois as colunas, o layout denso e a paginação.
      if (opcoes.escala > minEscala + 1e-9) {
        let e = Math.max(minEscala, opcoes.escala - 0.05);
        for (; e > minEscala - 1e-9; e -= 0.04) {
          const t = montar({ plano, conteudo, identidade, assets, opcoes: { ...opcoes, escala: e } });
          if (cabe(t, plano, tr)) break;
        }
        opcoes.escala = Math.round(Math.max(minEscala, e) * 100) / 100;
        return 'reduzir_escala';
      }
      if (!plano.multipagina && !opcoes.colunasTentadas) {
        opcoes.colunasTentadas = true;
        for (const k of [1, 2, 3].filter(x => x !== (opcoes.colunas || null))) {
          const t = montar({ plano, conteudo, identidade, assets, opcoes: { ...opcoes, colunas: k } });
          if (cabe(t, plano, tr)) { opcoes.colunas = k; return 'reorganizar_colunas'; }
        }
      }
      if (plano.impacto && !plano.multipagina) { plano.impacto = false; plano.paginas.forEach(p => { if (p.layout === 'destaque') p.layout = 'painel'; }); opcoes.escala = 1; return 'layout_denso'; }
      // Paginação: a página que transborda continua na seguinte (listas e tabelas partidas, título repetido).
      const estouradas = new Set(c.erros.filter(e => e.codigo === 'transbordo' || e.codigo === 'corte').map(e => r.paginas.find(p => p.numero === e.pagina)?.origem).filter(Boolean));
      let mudou = false;
      for (const p of plano.paginas) if ((estouradas.has(p.id) || !estouradas.size) && p.layout !== 'continuo' && p.papel !== 'capa') { p.layout = 'continuo'; p.repetirTitulo = true; mudou = true; }
      if (!mudou) return null;
      if (!plano.multipagina) { plano.multipagina = true; plano.continuacao = true; }
      return 'paginar';
    },
    codigos => {
      if (!codigos.has('contraste')) return null;
      opcoes.ajustesCor = [...(opcoes.ajustesCor || [])];
      const antes = opcoes.ajustesCor.length;
      for (const e of c.erros.filter(x => x.codigo === 'contraste' && x.fundo)) {
        const pg = r.paginas.find(p => p.numero === e.pagina), p = pg?.prims[e.prim];
        if (p) opcoes.ajustesCor.push({ de: p.cor, para: ajustarContraste(p.cor, e.fundo, e.minimo + 0.2), pagina: e.pagina, papel: p.papel });
      }
      return opcoes.ajustesCor.length > antes ? 'ajustar_contraste' : null;
    },
    codigos => {
      if (!codigos.has('legibilidade') || opcoes.escala >= 1) return null;
      opcoes.escala = Math.min(1, opcoes.escala + 0.1);
      return 'aumentar_escala';
    },
  ];
  while (c.erros.length && correcoes < MAX_CORRECOES_VISUAIS) {
    const codigos = new Set(c.erros.map(e => e.codigo));
    let acao = null;
    for (const estrategia of estrategias) { acao = estrategia(codigos); if (acao) break; }
    if (!acao) break;   // nada a fazer pelo layout (ex.: o pedido exige algo que o conteúdo não tem)
    correcoes++;
    ({ r, c } = rodar());
    tentativas.push({ n: correcoes, erros: [...new Set(c.erros.map(e => e.codigo))], acao, escala: opcoes.escala });
  }
  const restantes = [...new Set(c.erros.map(e => e.codigo))];
  const soPaginas = restantes.length && restantes.every(k => k === 'paginas' || k === 'objetivo');
  const imagemPedida = op0.imagemPedida && r.paginas.some(p => p.blocos.some(b => b.placeholder));
  const status = !restantes.length ? (plano.continuacao || imagemPedida ? 'parcial' : correcoes ? 'corrigido' : 'aprovado') : soPaginas ? 'parcial' : 'inconsistente';
  const explicacoes = [
    ...restantes.map(k => CODIGOS[k] + (k === 'paginas' ? ` (${c.erros.find(e => e.codigo === 'paginas').detalhe})` : k === 'objetivo' ? ` (${c.erros.find(e => e.codigo === 'objetivo').detalhe})` : '')),
    ...(plano.continuacao ? ['O conteúdo não coube em uma página: a peça ganhou página de continuação.'] : []),
    ...(imagemPedida ? ['A imagem da peça não foi gerada nem fornecida: há um espaço reservado para ela.'] : []),
  ];
  return {
    paginas: r.paginas, plano, opcoes,
    registro: { status, correcoes, tentativas, erros: restantes, avisos: [...new Set(c.avisos.map(a => a.codigo))], escala: opcoes.escala, paginas: r.paginas.length,
      ms: { ...ms, total: Date.now() - t0 } },
    explicacoes, conferencia: c,
  };
}
