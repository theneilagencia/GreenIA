// Imagem pedida na conversa livre ("gere uma imagem…", "troque a roupa da personagem anexada", "agora uma versão
// quadrada"): a GreenIA gera ou edita a imagem com o gerador governado (mesma decisão das peças visuais:
// liberado pela empresa, nada sigiloso, nada que a política manda proteger, fora da reserva do plano) e entrega o
// arquivo na própria resposta, com prévia e download. Edição usa a imagem anexada ou a última gerada na conversa.
import { um } from './db.js';
import { pedidoAfirmativo } from './pedido-afirmativo.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Peças compostas (texto + layout) seguem pela produção visual, não por aqui.
const PECA = /\b(apresenta\w*|slides?|deck|one[- ]?page|infografic\w*|carross\w*|cartaz|poster|banner|post|posts|postagem|stories|anuncios?|campanha|folder|panfleto|flyer|convite|cardapio|dashboard|pecas?)\b/;
const OBJETO = /\b(imagem|imagens|foto|fotos|fotografia|ilustracao|ilustracoes|retrato|desenho|arte|personagem|avatar|mockup|render)\b/;
const CRIAR = /\b(gere|gerar|gera|crie|criar|cria|produza|produzir|faca|fazer|quero|preciso|desenhe|desenhar|ilustre|ilustrar|monte|montar|elabore|nova|outra|uma versao|versao)\b/;
const EDITAR = /\b(troque|trocar|substitua|substituir|mude|mudar|altere|alterar|edite|editar|mantenha|manter|remova|remover|tire|coloque|colocar|deixe|deixar|transforme|ajuste|ajustar|acrescente|adicione|aumente|diminua|clareie|escureca|vista|use a imagem|utilize a imagem|versao (quadrada|horizontal|vertical|1:1|16:9|4:5|9:16))\b/;
const ASSUNTO_IMG = /\b(roupa|cabelo|rosto|fundo|iluminacao|luz|cores?|cena|composicao|pessoa|personagem|expressao|enquadramento|proporcao|quadrad\w*|horizontal|vertical|fotorrealist\w*|estilo|cenario|1:1|16:9|4:5|9:16)\b/;
// Restrições não são pedidos de geração: "gere uma planilha, sem gráficos ou imagens".
// Preserva a próxima instrução afirmativa, inclusive "sem texto e gere uma imagem".

export function proporcaoDoPedido(texto) {
  const t = norm(texto);
  const m = /\b(1:1|16:9|9:16|4:5|5:4|3:2|2:3|4:3|3:4|21:9)\b/.exec(t);
  if (m) return m[1];
  if (/\bquadrad\w*\b/.test(t)) return '1:1';
  if (/\b(stories|story|reels)\b/.test(t)) return '9:16';
  if (/\b(horizontal|paisagem|widescreen|banner)\b/.test(t)) return '16:9';
  if (/\b(vertical|retrato em pe)\b/.test(t)) return '4:5';
  return null;
}

const tipoImagem = b64 => {
  const b = Buffer.from(String(b64 || '').slice(0, 24), 'base64');
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

// Última imagem gerada nesta conversa (base de uma continuação: "mantenha a mesma pessoa e troque a roupa").
export function ultimaImagemDaConversa(app, conversaId) {
  const r = um(app.db, "select id, mime, dados, detalhes from arquivos_gerados where conversa_id = ? and mime like 'image/%' order by id desc limit 1", conversaId);
  if (!r) return null;
  let d = {};
  try { d = JSON.parse(r.detalhes || '{}'); } catch { d = {}; }
  return { id: r.id, dataUrl: `data:${r.mime};base64,${Buffer.from(r.dados).toString('base64')}`, proporcao: d.proporcao || null };
}

/**
 * Decide se a mensagem pede uma imagem (nova ou edição). Devolve null ou { modo, base?, proporcao }.
 * brutos: base64 dos anexos desta mensagem; ultima: a última imagem gerada na conversa (ou null).
 */
export function pedidoDeImagem(texto, { brutos = [], ultima = null, ultimaFoiImagem = false } = {}) {
  const t = pedidoAfirmativo(texto);
  if (!t.trim() || /\?\s*$/.test(t) && !CRIAR.test(t)) return null;
  const anexada = brutos.map(b => ({ b, mime: tipoImagem(b) })).find(x => x.mime);
  const proporcao = proporcaoDoPedido(texto);
  // Imagem anexada e pedido de mudança nela ("substitua a roupa", "use a imagem anexada e…").
  if (anexada && (EDITAR.test(t) || (CRIAR.test(t) && OBJETO.test(t))) && !PECA.test(t)) return { modo: 'editar', base: `data:${anexada.mime};base64,${anexada.b}`, proporcao };
  // Nova imagem pedida com todas as letras.
  if (CRIAR.test(t) && OBJETO.test(t) && !PECA.test(t) && !/\b(descreva|analise|o que (tem|ha) na)\b/.test(t)) {
    // "Mantenha a mesma pessoa..." logo depois de uma imagem: continua a partir dela.
    if (ultima && ultimaFoiImagem && (EDITAR.test(t) || /\bmesm[ao]\b/.test(t))) return { modo: 'editar', base: ultima.dataUrl, proporcao: proporcao || ultima.proporcao };
    return { modo: 'nova', proporcao };
  }
  // Continuação logo depois de uma imagem gerada: "troque a roupa", "deixe a luz mais quente", "versão quadrada".
  if (ultima && ultimaFoiImagem && (EDITAR.test(t) || /\bversao\b/.test(t)) && (ASSUNTO_IMG.test(t) || OBJETO.test(t)) && !PECA.test(t))
    return { modo: 'editar', base: ultima.dataUrl, proporcao: proporcao || ultima.proporcao };
  return null;
}

// Pedido enviado ao gerador: o que a pessoa escreveu (já passou pelo filtro de dados), com as regras de qualidade.
export function promptDaImagem(texto, { modo, proporcao }) {
  const pedido = String(texto || '').trim().slice(0, 1500);
  const formato = proporcao ? ` Formato da imagem: ${proporcao}.` : '';
  if (modo === 'editar') return `Edite a imagem fornecida conforme o pedido abaixo. Mantenha exatamente tudo o que o pedido não manda mudar: a mesma pessoa (rosto, traços, cabelo, proporções, expressão), o mesmo estilo, a mesma composição e a mesma qualidade.${formato} Não escreva texto na imagem, a menos que o pedido peça.\n\nPedido: ${pedido}`;
  return `Gere a imagem descrita abaixo com qualidade profissional, seguindo cada detalhe do pedido (assunto, idade, ambiente, iluminação, enquadramento e espaço livre pedidos).${formato} Não escreva texto, letras, logotipos ou marca d'água na imagem, a menos que o pedido peça. Não retrate pessoas reais identificáveis.\n\nPedido: ${pedido}`;
}

export const NOTA_IMAGEM = modo => `\nA plataforma vai ${modo === 'editar' ? 'editar a imagem' : 'gerar a imagem'} pedida logo depois desta resposta, com o gerador de imagens da GreenIA, e mostrar o arquivo abaixo da resposta para ver e baixar. Nesta resposta: diga em uma frase o que entendeu e o que vai ${modo === 'editar' ? 'mudar (e o que fica igual)' : 'gerar'}, e descreva em poucas linhas a composição. Não diga que não consegue gerar ou editar imagens, não escreva prompt técnico e não use a seção "O que foi feito".`;
