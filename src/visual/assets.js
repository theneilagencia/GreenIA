// Assets da produção visual: logo, foto, ilustração, ícone, gráfico, diagrama, textura ou imagem gerada.
//
// asset = { id, tipo, origem, proposito, restricoes, gerado, referencia, mime, w, h }
//   tipo: logo | foto | ilustracao | icone | grafico | diagrama | textura | imagem_gerada
//   origem: empresa (logo e imagens da marca) | enviado (anexo da pessoa) | gerado (provedor de imagem) |
//           sistema (ícones e formas da GreenIA) | placeholder (falta o material: aparece como espaço reservado)
//   referencia: id do binário em visual_assets (nunca o conteúdo no registro de auditoria)
// Nenhum provedor é obrigatório: sem gerador, a peça usa formas, tipografia, gráficos, ícones e o que a empresa
// forneceu. Asset que precisaria ser real (logo, foto real, dado real) e não existe nunca é inventado: vira um
// placeholder explícito.

const MIMES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', 'svg+xml': 'image/svg+xml' };
export const MIMES_ACEITOS = Object.values(MIMES);
export const MAX_BYTES_ASSET = 5 * 1024 * 1024;

export function decodificarDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  return m ? { mime: m[1], bytes: Buffer.from(m[2], 'base64') } : null;
}
export const paraDataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

// Tipo e tamanho natural de uma imagem, pelos bytes (o MIME declarado não basta: um arquivo .png pode ser outra
// coisa). Devolve null para o que não é imagem reconhecida.
export function inspecionarImagem(bytes) {
  const b = Buffer.from(bytes || []);
  if (b.length < 16) return null;
  if (b.readUInt32BE(0) === 0x89504e47 && b.toString('latin1', 12, 16) === 'IHDR') return { mime: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { mime: 'image/jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (b.toString('latin1', 0, 6) === 'GIF87a' || b.toString('latin1', 0, 6) === 'GIF89a') return { mime: 'image/gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const k = b.toString('latin1', 12, 16);
    if (k === 'VP8X') return { mime: 'image/webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (k === 'VP8 ') return { mime: 'image/webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return { mime: 'image/webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  const t = b.toString('utf8', 0, Math.min(b.length, 4096));
  if (/<svg[\s>]/i.test(t)) {
    const tag = /<svg\b[^>]*>/i.exec(t)?.[0] || '';
    // SVG com script, objeto estrangeiro ou referência externa não entra (nada enviado é executado).
    if (/<script|foreignObject|javascript:|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(b.toString('utf8'))) return null;
    const num = n => { const m = new RegExp(`\\s${n}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(tag); return m ? Number(m[1]) : null; };
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
    const w = num('width') || (vb && Number(vb[1])), h = num('height') || (vb && Number(vb[2]));
    return w && h ? { mime: 'image/svg+xml', w, h } : null;
  }
  return null;
}
export function dadosDaImagem(dataUrl) {
  const d = decodificarDataUrl(dataUrl);
  if (!d) return null;
  const i = inspecionarImagem(d.bytes);
  return i ? { ...i, bytes: d.bytes } : null;
}

export const TIPOS_ASSET = ['logo', 'foto', 'ilustracao', 'icone', 'grafico', 'diagrama', 'textura', 'imagem_gerada'];
export const ORIGENS_ASSET = ['empresa', 'enviado', 'gerado', 'sistema', 'placeholder'];
export function asset({ id, tipo, origem, proposito = '', restricoes = [], referencia = null, mime = null, w = null, h = null }) {
  return { id, tipo: TIPOS_ASSET.includes(tipo) ? tipo : 'ilustracao', origem: ORIGENS_ASSET.includes(origem) ? origem : 'placeholder',
    proposito: String(proposito).slice(0, 160), restricoes: restricoes.slice(0, 5), gerado: origem === 'gerado', referencia, mime, w, h };
}

// Ícones do sistema (traço simples, 24x24): desenhados pela composição, sem arquivo externo.
export const ICONES = {
  check: 'M5 12.5l4.2 4.2L19 7',
  alerta: 'M12 3.5L2.8 19.5h18.4L12 3.5zM12 10v4.5M12 17.2v.3',
  relogio: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5V12l3.2 2',
  seta: 'M4 12h15M14 6.5l5.5 5.5L14 17.5',
  alvo: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 11.2a.8.8 0 1 0 0 1.6a.8.8 0 1 0 0-1.6z',
  pessoa: 'M12 4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2zM4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6',
  documento: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6',
  grafico: 'M4 20h16M6.5 16.5v-5M11 16.5V7M15.5 16.5v-7M20 4v.1',
  escudo: 'M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5c-4-1.8-7-5.2-7-9.5V6z',
  bandeira: 'M6 21V4M6 4.5h11l-2.5 4l2.5 4H6',
  engrenagem: 'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  estrela: 'M12 3.5l2.6 5.6l6 .7l-4.5 4.1l1.2 6l-5.3-3l-5.3 3l1.2-6l-4.5-4.1l6-.7z',
  dinheiro: 'M3.5 6.5h17v11h-17zM12 9.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6zM6.5 9.5v.1M17.5 14.5v.1',
  calendario: 'M4 6h16v14H4zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  lampada: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
};
// Ícone para um texto (rótulo de seção ou cartão), pela palavra: só decoração, nunca informação.
const PISTAS = [[/risc|alert|aten|perig|problem|amea|falh/, 'alerta'], [/prazo|data|cronogr|agend|calend|quando/, 'calendario'], [/temp|hora|duraç|duracao/, 'relogio'],
  [/pass|açõ|aco|próxim|proxim|etapa|plano/, 'seta'], [/objetiv|meta|alvo|foco/, 'alvo'], [/pesso|equip|time|cliente|públic|public|respons/, 'pessoa'],
  [/custo|preç|prec|valor|financ|receit|orçam|orcam|r\$/, 'dinheiro'], [/resultad|indicad|número|numero|dado|kpi|métric|metric/, 'grafico'], [/segur|conform|complian|obriga|regra|norma/, 'escudo'],
  [/decis|conclus|recomend|marco/, 'bandeira'], [/process|operaç|operac|como|funcion/, 'engrenagem'], [/destaq|diferenc|benef|vantag/, 'estrela'], [/ideia|dica|oportun|insight/, 'lampada'],
  [/document|contrat|cláusul|clausul|anex/, 'documento']];
export function iconePara(texto) {
  const t = String(texto || '').toLowerCase();
  return PISTAS.find(([re]) => re.test(t))?.[1] || null;
}
